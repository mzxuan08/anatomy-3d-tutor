# 配置本机资料

本技能不包含 Human Atlas 模型数据或课程课件。请在本机单独获取 Human Atlas，并遵守其许可；不要将教材、课程PDF或私人学习资料提交到公开仓库。

运行时通过 `--atlas` 指定 Human Atlas 项目目录（包含 `public/models` 或 `models` 的目录），或设置环境变量 `HUMAN_ATLAS_DIR`。空配置不会暴露任何开发机路径。Three.js运行依赖随技能附带，并保留其MIT许可。

课件PDF只在本地由 `pdf` 子命令读取，学习页可保留课件标题与PDF页序；避免在公开分享时包含个人绝对路径。
