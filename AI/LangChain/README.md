# LangChain 从 0 到 1 入门

> 目标：把 LangChain 理解成“构建 LLM 应用的组件库和编排框架”，而不是只把它当成一个调用大模型的 SDK。
> 最近整理：2026-05-28

## 一句话理解

LangChain 是一个用于构建 LLM 应用和 AI Agent 的框架。它把模型调用、提示词、结构化输出、工具调用、检索增强、记忆、Agent 循环、运行时观测等能力拆成可组合的组件，让开发者可以更快搭建聊天机器人、知识库问答、自动化助手、研究助手、数据分析助手等应用。

## 适合解决什么问题

- **统一模型调用**：用相近的接口接入 OpenAI、Anthropic、本地模型、云厂商模型等。
- **组织提示词和输出格式**：把 Prompt、Messages、JSON Schema、Pydantic 结构化输出组合起来。
- **RAG 知识库问答**：加载文档、切分、向量化、检索，再把相关上下文交给模型回答。
- **工具调用和 Agent**：让模型在循环中选择工具，调用 API、查数据库、搜索网页、执行代码，直到任务完成。
- **上下文工程**：控制模型能看到什么、工具能访问什么、每一步如何记录、压缩和观察。
- **生产化支撑**：通过 LangSmith 等工具做 tracing、评测、调试和监控。

## 学习顺序

| 文件 | 内容 | 建议阶段 |
| --- | --- | --- |
| [01-overview.md](./01-overview.md) | LangChain 的定位、架构和适用边界 | 入门 |
| [02-core-components.md](./02-core-components.md) | Models、Prompts、Messages、Output Parsers、LCEL、Runnable | 核心 |
| [03-rag.md](./03-rag.md) | RAG 完整链路：加载、切分、向量库、检索、生成 | 实战 |
| [04-agents-and-tools.md](./04-agents-and-tools.md) | Tool、Agent、Middleware、记忆和上下文工程 | 进阶 |
| [05-learning-roadmap.md](./05-learning-roadmap.md) | 从 0 到 1 学习路线、练手项目和常见坑 | 路线图 |

## 最小心智模型

```
用户输入
  │
  ▼
Prompt / Messages 组织上下文
  │
  ├── 可选：Retriever 检索外部知识
  │
  ├── 可选：Tools 暴露外部动作能力
  │
  ▼
Chat Model 推理或生成
  │
  ├── 普通 Chain：按固定流程执行
  └── Agent：模型决定下一步调用哪个工具
  │
  ▼
结构化输出 / 文本回复 / 工具结果
```

## LangChain 和 LangGraph 的关系

LangChain 更像“LLM 应用组件库 + Agent 高层入口”，适合快速搭建模型调用、RAG、工具调用和常规 Agent。

LangGraph 更像“有状态 Agent 工作流引擎”，适合需要循环、分支、持久化、人工审批、多 Agent 协作、长任务恢复的复杂场景。

一个实用判断：

- 只是模型调用、RAG、工具调用：先用 LangChain。
- 需要明确控制流程、可恢复状态、人工介入、多节点协作：用 LangGraph。

## 官方资料入口

- LangChain Python 文档：https://docs.langchain.com/oss/python/langchain/
- LangChain JS 文档：https://docs.langchain.com/oss/javascript/langchain/
- LangSmith 文档：https://docs.smith.langchain.com/
