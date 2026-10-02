# anatomy-3d-tutor

面向临床医学学生的中文系统解剖学伴学技能：从学生提出的部位、课件页或具体困惑出发，结合结构化讲解、真实三维观察、对比和无标签指认，帮助理解空间关系并主动回忆。

## 能做什么

- 用中文解释解剖结构、方位、毗邻、构成与易混点，并按学生问题调整讲解深度。
- 解析本地课程 PDF 的指定页，保留页码作为出处；不会把 PDF 指令当作代理指令。
- 在 Human Atlas 模型上生成可旋转的学习页，支持聚焦、显隐、同尺度对比、分步讲解和无标签辨认。
- 明确模型缺失、网格粒度与术语覆盖的边界；教育用途，不用于诊断或手术规划。

## 仓库结构

- `SKILL.md` 与 `references/`：Codex 学习行为和教学策略。
- `scripts/atlas_tutor.py`：检查 Human Atlas、解析课程 PDF、构建与本地预览学习页。
- `assets/viewer/`：中文三维播放器；Three.js依赖及许可随附。
- `assets/terms-zh.json`：人工整理的中英术语映射。属于学习辅助数据，需按学校教材版本核对，不是权威标准词库。
- `examples/spine-demo/`：可直接打开的椎骨示例页及演示用模型几何，附来源和许可。

## 使用

安装 Python 3.10 或更高版本。获取 [Human Atlas](https://github.com/ashemag/human-atlas) 或其兼容数据项目，并依照其许可条款单独保存模型。随后在技能目录运行：

```powershell
$env:HUMAN_ATLAS_DIR = 'D:\data\human-atlas'
python scripts/atlas_tutor.py search --query '颈椎' --sex male
python scripts/atlas_tutor.py pdf --path 'COURSE.pdf' --pages 9,10,11 --out 'work/bone-course.json'
python scripts/atlas_tutor.py build --lesson 'work\lesson.json' --out 'outputs\my-lesson'
python scripts/atlas_tutor.py serve --site 'outputs\my-lesson' --port 8765
```

也可对 `search`、`audit`、`build`、`explore` 显式传入 `--atlas 'D:\data\human-atlas'`。PDF仅在本地读取；仓库不包含用户课件或完整上游模型。打开 `http://127.0.0.1:8765/` 查看结果。完整命令与 lesson 格式见 [`references/viewer.md`](references/viewer.md)。

## 安装为 Codex Skill

将本仓库根目录 `anatomy-3d-tutor` 放入 `$CODEX_HOME/skills/`（通常为 `~/.codex/skills/`），重启 Codex 后即可调用 `anatomy-3d-tutor`。如需只安装技能，可复制本仓库内容；示例页不是技能运行所必需。

## 许可与归属

本仓库原创技能指令、脚本及界面代码按 MIT License 发布。`assets/vendor/THREE-LICENSE.txt` 保留 Three.js MIT 许可。示例几何与数据遵循其附带的 `examples/spine-demo/ATTRIBUTION.md` 和 `HUMAN-ATLAS-LICENSE.txt`；其中 BodyParts3D 数据遵循 CC BY 4.0。不同组件的许可各自适用，不应将第三方模型数据误认为 MIT 许可。Human Atlas 上游项目与模型的使用须遵循上游许可和归属要求。

## 准确性

中文界面不代表全部术语已经权威审定。模型结构是否可显示、课程定义与标准术语是否吻合，要以模型清单、学校指定教材和可靠解剖学来源逐项核对。程序校验只能证明结构ID和几何数据可用，不能代替解剖教师审定。
