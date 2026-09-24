# 📖 阅读进度

《深入理解 AI Agent》个人阅读进度与笔记。正文源码在 [`book/`](../book/)，本目录只记录**我读到哪了、想到了什么**，不改动原书内容。

| 文件 | 用途 |
| --- | --- |
| [README.md](README.md) | 本页：阅读进度看板 + 笔记模板 + 阅读路线 |
| [项目结构.md](项目结构.md) | 全仓 11,256 个文件的结构全景（XMind 大纲，含每个文件/目录的作用） |

## 进度看板

状态：`⬜ 未开始` · `🔄 精读中` · `⏸️ 暂停` · `✅ 已读完`

| # | 章节 | 核心 | 状态 | 开始 | 完成 |
| :--: | --- | --- | :--: | :--: | :--: |
| 0 | [引言](../book/introduction.md) | 全书地图：Agent = LLM + 上下文 + 工具 | ⬜ | — | — |
| 1 | [AI Agent 入门](../book/chapter1.md) | Harness 工程才是竞争力 | ⬜ | — | — |
| 2 | [上下文工程](../book/chapter2.md) | 上下文决定能力上限：KV Cache、Agent Skills、上下文压缩 | ⬜ | — | — |
| 3 | [用户记忆和知识库](../book/chapter3.md) | 跨会话记住用户、接入外部知识：RAG、知识图谱 | ⬜ | — | — |
| 4 | [工具](../book/chapter4.md) | Agent 的双手：MCP 协议、感知/执行/协作工具 | ⬜ | — | — |
| 5 | [Coding Agent 与通用 Agent](../book/chapter5.md) | 代码是「能创造新工具的工具」 | ⬜ | — | — |
| 6 | [交互：观察与动作空间的扩展](../book/chapter6.md) | 异步与事件驱动、语音交互、Computer Use | ⬜ | — | — |
| 7 | [Agent 的评估](../book/chapter7.md) | 把表现变成可比较信号：指标、显著性、评估驱动选型 | ⬜ | — | — |
| 8 | [模型后训练](../book/chapter8.md) | 预训练/SFT/RL：何时选 SFT、何时选 RL | ⬜ | — | — |
| 9 | [Agent 的持续进化](../book/chapter9.md) | 从运行轨迹获得学习信号，更新知识/指令/程序/参数 | ⬜ | — | — |
| 10 | [多 Agent 协作](../book/chapter10.md) | 群体智能高于个体：协作框架、上下文共享与隔离 | ⬜ | — | — |
| — | [后记](../book/afterword.md) | 收尾与展望 | ⬜ | — | — |

> 每章正文末尾附「深度思考」题，参考答案见 [`book/reference-answers.md`](../book/reference-answers.md)。

## 笔记

每章一份笔记，放在 [`notes/`](notes/)，命名 `chN.md`（引言用 `ch0.md`，后记用 `afterword.md`）。

单章笔记建议模板：

```markdown
# 第 N 章 · <章节名>

- **读完日期**：YYYY-MM-DD
- **投入时长**：

## 核心结论
<!-- 用自己的话复述，不要抄原文 -->

## 关键概念
<!-- 名词 → 我理解的一句话 -->

## 疑问与待查

## 与我的工作/项目的关联
```

## 阅读路线（可选）

原书《[学习建议](../docs/zh-CN/LEARNING.md)》给出的路径：

- **快速通读**：引言 → 第 1 章 → 第 2 章 → 第 4 章 → 第 7 章 → 第 10 章
- **完整精读**：按 0 → 10 顺序，每章读完做配套实验（各章目录下的 `README.md`，如 [`chapter1/`](../chapter1/)）

## 配套资源

| 用途 | 位置 |
| --- | --- |
| 离线阅读（排版最佳） | [PDF / EPUB 下载](https://github.com/bojieli/ai-agent-book#-电子书) |
| 在线阅读（可折叠/高亮/笔记） | [在线版](https://bojieli.github.io/ai-agent-book/astro/) |
| 动手实验 | [`chapter1/`](../chapter1/) ~ [`chapter10/`](../chapter10/) |
| 本地编译 PDF | [`book/build_pdf.sh`](../book/build_pdf.sh)（Windows 需先改字体，见下） |

### Windows 本地编译备注

`book/build_pdf.sh` 的排版样式（[`book/preamble.tex`](../book/preamble.tex)）按 macOS 字体编写，且配图为 SVG，需要：

1. **字体**：Windows 上用自带的 Noto Sans SC / Noto Serif SC / DejaVu Sans Mono 替换 macOS 的 Songti SC / Heiti SC / Menlo
2. **SVG 转 PDF**：需要 `rsvg-convert`（librsvg），或用 Chrome/Edge 无头模式批量转换
