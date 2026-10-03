# 可执行播放器

基础脚本仅需Python标准库，pdf子命令额外需pypdf，构建课件选页图额外需PyMuPDF；优先通过load_workspace_dependencies定位bundled runtime。

在技能目录运行（其他目录用脚本绝对路径）：

```powershell
python scripts/atlas_tutor.py search --query 'cervical vertebra' --limit 10
python scripts/atlas_tutor.py search --query '颈椎' --sex male
python scripts/atlas_tutor.py search --query 'kidney' --sex female
python scripts/atlas_tutor.py audit --out 'OUTPUTS/atlas-audit.json'
python scripts/atlas_tutor.py explore --lesson 'WORK/explore.json' --out 'OUTPUTS/atlas-viewer'
python scripts/atlas_tutor.py explore --sex female --lesson 'WORK/female.json' --out 'OUTPUTS/female-viewer'
python scripts/atlas_tutor.py pdf --path 'COURSE.pdf' --pages 9,10,11,12,13 --out 'WORK/course.json'
python scripts/atlas_tutor.py build --lesson 'WORK/lesson.json' --out 'OUTPUTS/my-lesson'
python scripts/atlas_tutor.py validate --site 'OUTPUTS/my-lesson'
python scripts/atlas_tutor.py serve --site 'OUTPUTS/my-lesson' --port 8765
```

`--atlas`可指定包含public/models的项目目录；也可设置环境变量`HUMAN_ATLAS_DIR`。首次使用必须配置其中之一；本技能不会记录或预设个人路径。`audit`和`search`读取全清单，build只打包本次所需真实几何。不会克隆仓库或修改旧项目。

将http://127.0.0.1:8765/用open_in_codex打开。Windows后台启动用Start-Process -WindowStyle Hidden，日志放work；先核查端口，结束时仅停止本次已知PID。serve只绑定本机回环，不发布。

## Lesson JSON

```json
{
  "title":"本次学习主题", "sex":"male", "intro":"具体目标",
  "sources":[{"title":"课件","path":"COURSE.pdf","pages":[9]}],
  "labels":{"REAL_ID":"经核对中文名"},
  "label_sources":{"REAL_ID":"指定课件PDF第9页，英文概念对应已核对"},
  "steps":[{
    "title":"观察整体", "body":"观察什么和为什么",
    "show":["REAL_ID"], "highlight":[],
    "view":"front", "layout":"native",
    "source":"课件PDF第9页",
    "prompt":"一个短问题", "answer":"答案和依据", "quiz":false
  }]
}
```

- show非空，使用真实mesh/concept ID，concept解析为网格；highlight必须包含于本步显示集合。
- 一个lesson使用一个性别清单，不混两套IDs。手工labels应先按出处核对，label_sources为每个标注提供具体定位；缺少出处时构建会拒绝该标注。
- view：front/back/left/right/top/bottom/oblique。源模型Y向上、+Z前、+X人体左；预设按人体方向命名，自由转动后注明自由视角。
- layout：native保留原位，compare同尺度横向平移并标明，不用于判断原位邻接。
- quiz:true关闭名称、列表名称、点击信息；题面不能泄露待辨认名称，答案主动展开。点击正确还需口述依据。
- 文件内文字按纯文本渲染，不支持HTML注入。保留来源页，不复制整份课件。
- 当前支持显隐、整块高亮、经核对的局部观察着色、选择、聚焦、相机、并排比较、分步讲解和无标签测验；没有任意局部组织分割、真实断层、器官变形或关节活动模拟。

build生成离线资源完整的index.html、viewer.js、lesson.json、中文术语状态、选定几何与许可/来源文件。explore使用同一播放器生成全清单浏览页，可用--system限定展示分组（不是教材系统分类）。骨学展示会排除牙龈/牙列并另列口腔参考，原始分组仍保留。输出目录必须新建或已有同类学习页，不覆盖其他项目。

## 课件页与易混点卡

构建输入可增加以下字段（ID 换成当前模型中经核对的真实网格 ID）：

```json
{
  "courseware": [{
    "id": "course", "title": "课程课件", "short_title": "课件",
    "source_path": "COURSE.pdf", "pages": [9, 10]
  }],
  "comparisons": [{
    "title": "两个结构如何区分", "ids": ["REAL_A", "REAL_B"], "steps": [0],
    "items": [{
      "label": "观察形态", "cue": "经来源核对的观察提示",
      "ids": ["REAL_A", "REAL_B"], "support": "limited", "view": "oblique"
    }],
    "source": {"title": "指定教材", "locator": "相关章/节"}
  }]
}
```

在相应 steps 对象中加 `"course_pages": [{"document":"course","page":9}]`。页码按 PDF 文件页序，从1开始；卡片 steps 从0开始。source_path 相对 lesson JSON 目录解析，也可用绝对路径。仅渲染明确选择的页；输出路径换成站内 PNG，记录 PDF 与图片 SHA256，不复制原 PDF。构建后的 lesson 是播放器数据，重新构建需使用保留本地 source_path 的输入 lesson。

support 必须为 visible（模型可见）、limited（细节需课件）、course-only（仅课件支持）。source 必须提供标题及 pages 或 locator，可选 url 为 HTTPS 参考链接。卡片只在对应课程步骤或包含相关结构的自选对比显示；无标签辨认时隐藏。

课件面板默认收起；开启后可自动跟随步骤，也可取消跟随、手动翻页、跳到对应步骤或放大图。手机将模型与课件上下排列。切换辨认会移除课件图的 src，并关闭已打开的课件弹窗。

逐个结构和模型分组可切换显隐；至少保留一个结构。选中结构可保持清晰并淡化周围结构，透明度10%–50%。切换步骤或开始辨认会重置显隐与淡化。动态方位采用模型 +X人体左、+Y上、+Z前；相机旋转改变屏幕投影，不改变人体方向。

仓库示例不带课程 PDF 或课件图片；不要将本地生成的课件目录直接提交到开源仓库。程序校验出处字段、模型 ID 和资源完整性，不能证明讲解内容已经教师审定。

## 核验

### 局部观察点

可选 `landmarks` 是观察点列表，每个对象包含：`id`（唯一安全ID）、`part`（真实网格ID）、`label`、`cue`、`point`（原模型坐标三元组）、`triangle`（从0开始的三角面编号）、`radius`（原单位的局部观察半径）、`view`、`steps`（从0开始）、`source`（具体来源定位）、`review`（本次人工表面核对说明）、`geometry_sha256`（该网格位置及索引原字节的SHA256）。可选 `course_page` 与步骤课件引用格式相同。

先对原几何和来源图核对位置，再选择三角面，将其三个顶点的平均坐标存为point；不要按包围盒比例自动猜解剖位置。脚本 `geometry_fingerprint(part,data)` 可取得指纹；build/validate核对版本、范围、三角面及观察点一致性。半径仅用于按三角面中心距离选择一小块实际表面，不是分割出来的组织。更换模型或重新简化后重新核对。播放器目前一次显示一个标志，清除、隐名、换步骤或辨认时移除；相机转动或并排平移会更新位置。

可选 `related_lessons` 为站内独立补充页链接，格式 `{"title":"补充观察","url":"related/topic/","scope":"真实来源及与主模型关系"}`。只接受该站内路径格式，不接受外部地址或路径逃逸。父页面与子页分别打包和validate，不能混用两套几何或ID。该能力提供跳转，不自动生成子课。

搜索支持已确认的常用名（如肾脏→肾）和第3/第三的等价编号。点击结构可查看术语状态、派生规则、教材章节及中英参考的PDF页和条目号。待核对名称不会成为标签。audit --sex male/female/all生成按展示分组的覆盖和缺口样本；all遇到缺少女性清单时如实跳过，不把缺失当成零覆盖。

搜索审阅英文名、侧别和中文对应；运行build/validate检查IDs、显隐与缓冲区/索引/有限坐标；浏览器确认真实模型出现、相机与并排切换、点击辨认、测验不漏名称、答案主动展开。程序检查不是解剖学审定；画面细节不足时修订题目并改用课件图。

## 界面操作

### 课程观察演示、提示与练习（0.8）

在已有step中可选配置以下字段；具体内容仍需按课件和模型人工核对：

```json
{
  "source": "具体教材章节或课件页序",
  "guide": [
    {"cue": "从前面观察本步骨性参照", "view": "front"},
    {"cue": "聚焦本步真实结构，淡化周围排除遮挡", "view": "oblique", "focus": "真实网格ID", "dim": true},
    {"cue": "定位本步已核对的观察点", "view": "top", "landmark": "已有landmark的id"}
  ],
  "prompt": "请说明你观察到的形态依据。",
  "answer": "有依据的解释与模型限制。",
  "hints": ["先换一个观察方向", "再比较可见特征"],
  "exercise": {"kind": "explain", "criteria": ["描述实际可见特征", "说明还需核对的细节"]}
}
```

`guide`最多12段，只用于非quiz步骤；每段有cue/view。focus只能是本步show内ID，dim须为布尔值且依赖focus；landmark须已配置并绑定当前步骤。自动播放每4.5秒前进一段，可暂停或回退；拖动、方向按钮/快捷键、切步骤、隐藏名称和切换页面时暂停。结束演示恢复本步排列与显示。减少动态效果时视角直接切换。

`hints`最多3条，需prompt及本步source。验证器不能理解文字是否泄题，quiz提示必须另做人工审查。`exercise.kind`支持point/explain/compare/relation，均需prompt、answer及1–6条criteria；point另需target且只能引用本步完整网格，不能用于孔/沟等局部标志的自动核验。relation要求native排列；学生改为并排时显示返回原位提醒。解释不自动评分，先收原回答，再展开答案与自查要点。

普通本步原回答跨步骤在页面内暂存，刷新清空；目前未纳入“学习记录”的保存、备份与导入。不要把浏览器草稿当成长久学习记录。“我卡在这里”输出可编辑复制的求助上下文，不请求外部服务；无标签练习只输出不含模型目标名/ID的通用观察信息。

顶部切换深色模式或专注模型；手机先展示模型，向下可查看讲解。搜索位于学习面板顶部，点击匹配项进入包含它的步骤并显示独立详情面板。详情展示术语状态、具体出处和派生规则；缺少来源时保留英文。关闭详情会退出单独观察并恢复本步整体。

步骤进度仅表示当前所在步骤，不表示学习完成度。无标签辨认模式隐藏搜索、列表名、模型标签和所选结构名称，答案不会自动展开。侧边结构列表和资料来源可折叠。

快捷键：`/` 查找；`1–6` 前、后、左、右、上、斜面观；`H` 显隐名称；`R` 重置视角；`←/→` 切换步骤；`Esc` 退出专注或关闭详情。编辑输入框、选择步骤或打开帮助弹窗时不触发模型快捷键。开启系统减少动态效果后，预设视角直接切换，加载动画停用。

## 自选学习工具

选中结构后可放大所选（保留本步周围结构）、加入对比夹或待复习。对比夹最多4个真实网格、至少2个开始比较，支持跨步骤；保持原始比例，只平移位置。切回原位仍只显示这些选中结构，未显示者可能位于两者之间，因此不能单凭画面判断毗邻。返回课程恢复当前步骤及所有平移。

待复习按随机顺序单个显示，隐藏课程题面、清单名称和来源。学生先写名称、适用侧别与可见形态依据，再主动核对名称/出处，最后选择“还需再练”或“能说出依据”。同一清单重练时更换起始视角。没有自动医学评分或掌握度估计；模型欠清晰时结合课件图核验。

清单、回答和自评默认在当前页面内存中，未保存的更改刷新清空。“学习记录”中主动保存到本机才写入浏览器 localStorage；重新打开同一地址后点击“继续上次”。保存包括课程步骤、对比与复习清单、完成的回答及自评，不恢复已揭示答案的辨认画面。未完成本轮辨认时保存与导入按钮禁用。

“备份记录”导出 JSON，可在同一课程导入；适合端口改变、浏览器更换或本机存储不可用。课程名称、模型性别、结构ID及步骤匹配后才接受记录，拒绝不兼容记录且不改当前清单。可含个人回答，默认不上传、不写全局记忆。保存覆盖当前课程上一次本机记录。

“导出复习卡”下载可阅读的Markdown；未回答或中途退出的项目标为未测，不能用于导入恢复。主题偏好仍可保存在本机。

可选浏览器回归检查：准备Playwright，启动仓库的椎骨示例后运行 `node tests/browser-study.cjs`。默认地址 `http://127.0.0.1:8765/`，可用 `ATLAS_TEST_URL` 指定地址；`BROWSER_EXECUTABLE` 指定浏览器路径，`PLAYWRIGHT_MODULE` 指定已安装模块路径。检查放大、等比例对比后的原位恢复、无标签遮名、自评/导出、错项重练及手机布局；临时结果目录在执行后显示。
