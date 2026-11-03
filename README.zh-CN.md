# dsh-superagent

[English](README.md) | **简体中文**

> **研究原型，仅供参考，并非 DeepSeek 官方产品。** 这段代码来自我们团队的日常开发工作，其中大量工程由编码智能体完成。请把它当作研究代码，而不是可直接用于生产的软件。它可能仍存在缺陷，编码风格与工程实践也可能不够统一。在你自己的环境中使用前，请先审查并调整。
>
> 我们为公开发布做了适配，因此它既不同于我们的内部版本，也不同于 *Exploring Super-agent Design: Towards a More Autonomous Agent System* 一文所描述的实现。文中讨论的部分设计属于未来发展方向，尚未在本原型中实现。

dsh-superagent 是一个面向单个 GitHub 仓库的主动式编码智能体，以 [DeepSeek Harness](https://www.deepseek.com/en/harness/) 插件包的形式提供。它会监听 GitHub，也可选择监听飞书。当获得许可的人向该智能体提出工作请求时，它会创建一个工作项，在独立的智能体会话与目录中处理，并在原对话中答复，例如提交一个 Pull Request。Web 面板会显示哪些事项需要人来处理。

它也是一种与智能体协作的方式：**尽可能少地占用人的注意力，尽可能多地创造价值。** 一个能为整个团队行动的智能体，也可能浪费整个团队的注意力，因此它只在被请求、或团队写下的规则允许时才行动，并且只在有人必须行动或结果能被使用时才发声。[docs/000-philosophy.md](docs/000-philosophy.md) 阐述了这一原则以及它对运维者的要求。

## 安装配置

安装步骤较多，因此由智能体与你一同完成。请对你的编码智能体说：

> 阅读本仓库中的 SETUP.md，和我一起安装配置 dsh-superagent。

它每次只问一个简短的问题，先展示完整计划，然后安装并配置好一切。它遵循的就是 [SETUP.md](SETUP.md)。

## 文档

按顺序阅读编号文档；每篇只依赖它前面的内容。以下文档目前均为英文。

- [000 理念](docs/000-philosophy.md)
- [001 领域模型](docs/001-domain.md)
- [002 授权](docs/002-authorization.md)
- [003 执行](docs/003-execution.md)
- [004 提示词](docs/004-prompts.md)
- [005 面板](docs/005-panel.md)
- [006 部署](docs/006-deployment.md)：手动安装、配置、升级与故障排查
- [007 架构](docs/007-architecture.md)
- [008 实践手册](docs/008-cookbook.md)：新增一个来源（Source）

## 开发

`pnpm check` 会运行类型检查、测试和构建。

## 许可证

[MIT](LICENSE)
