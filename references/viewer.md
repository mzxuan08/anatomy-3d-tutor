# 可执行播放器

脚本仅需Python标准库，pdf子命令额外需pypdf；优先通过load_workspace_dependencies定位bundled runtime。

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
- 当前支持显隐、整块高亮、选择、聚焦、相机、并排比较、分步讲解和无标签测验；没有骨面任意局部涂色、真实断层、器官变形或关节活动模拟。

build生成离线资源完整的index.html、viewer.js、lesson.json、中文术语状态、选定几何与许可/来源文件。explore使用同一播放器生成全清单浏览页，可用--system限定展示分组（不是教材系统分类）。骨学展示会排除牙龈/牙列并另列口腔参考，原始分组仍保留。输出目录必须新建或已有同类学习页，不覆盖其他项目。

## 核验

搜索支持已确认的常用名（如肾脏→肾）和第3/第三的等价编号。点击结构可查看术语状态、派生规则、教材章节及中英参考的PDF页和条目号。待核对名称不会成为标签。audit --sex male/female/all生成按展示分组的覆盖和缺口样本；all遇到缺少女性清单时如实跳过，不把缺失当成零覆盖。

搜索审阅英文名、侧别和中文对应；运行build/validate检查IDs、显隐与缓冲区/索引/有限坐标；浏览器确认真实模型出现、相机与并排切换、点击辨认、测验不漏名称、答案主动展开。程序检查不是解剖学审定；画面细节不足时修订题目并改用课件图。
