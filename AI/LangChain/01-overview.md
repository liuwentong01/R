# 01 - LangChain 总览

## 为什么需要 LangChain

直接调用大模型 API 可以完成简单问答，但真实应用通常还需要处理这些问题：

- 模型输入不是单个字符串，而是系统指令、历史消息、用户输入、检索上下文、工具定义的组合。
- 模型输出不总是纯文本，可能需要 JSON、函数参数、表格、代码或可验证的数据结构。
- 模型不知道私有知识，需要连接文档、数据库、搜索引擎、业务 API。
- 模型可能需要采取行动，比如查询订单、创建工单、调用内部服务。
- 应用需要调试、评测、重试、限流、成本控制和运行时观测。

LangChain 的价值是把这些重复问题抽象成稳定组件，并提供统一的组合方式。

## LangChain 是什么

LangChain 可以从三层理解：

| 层级 | 作用 | 常见组件 |
| --- | --- | --- |
| 模型接入层 | 统一调用不同模型 | Chat Models、LLMs、Embeddings |
| 应用组件层 | 组织上下文和外部知识 | Prompt Templates、Messages、Retrievers、Vector Stores、Output Parsers |
| 编排层 | 把多个步骤组成应用 | Runnable、LCEL、Chains、Agents、Middleware |

早期 LangChain 常被理解为“Chain 框架”，把多个固定步骤串起来。现在更推荐把它理解为“LLM 应用组件体系”：简单流程用 Runnable/LCEL 组合，复杂不确定流程用 Agent，强状态工作流交给 LangGraph。

## 核心架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Application                          │
│       Chatbot / RAG / Agent / Workflow / Automation          │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                     Orchestration Layer                      │
│       Runnable / LCEL / Chain / Agent / Middleware           │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌───────────────┬──────────────▼──────────────┬───────────────┐
│ Prompt        │ Retrieval                   │ Tools         │
│ Messages      │ Loader / Splitter           │ APIs / DB     │
│ Output Parser │ Embedding / Vector Store    │ Functions     │
└───────────────┴──────────────┬──────────────┴───────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                         Models                              │
│             Chat Model / LLM / Embedding Model              │
└─────────────────────────────────────────────────────────────┘
```

## 典型应用类型

### 1. 普通聊天应用

特点是流程简单：用户输入、拼提示词、调用模型、返回结果。

适合用：

- `ChatModel`
- `PromptTemplate`
- `Messages`
- `OutputParser`

### 2. RAG 知识库问答

特点是模型需要基于外部知识回答，而不是只依赖训练语料。

适合用：

- `DocumentLoader`
- `TextSplitter`
- `EmbeddingModel`
- `VectorStore`
- `Retriever`
- `ChatModel`

### 3. 工具调用 Agent

特点是模型需要自己决定调用什么工具，以及调用几次。

适合用：

- `@tool`
- `create_agent`
- `Middleware`
- `State`
- `Runtime Context`

### 4. 复杂有状态工作流

特点是需要显式流程控制、分支、循环、人工审批、持久化恢复。

适合迁移到 LangGraph：

- `StateGraph`
- `Node`
- `Edge`
- `Checkpointer`
- `Interrupt`

## Chain 和 Agent 的区别

| 对比项 | Chain | Agent |
| --- | --- | --- |
| 执行流程 | 开发者预先固定 | 模型根据任务动态决定 |
| 适合任务 | 稳定、线性、可预测 | 开放、不确定、需要多步探索 |
| 工具调用 | 通常固定位置调用 | 模型决定是否调用、调用哪个、调用几次 |
| 可控性 | 高 | 中，需要约束和观测 |
| 典型场景 | 摘要、分类、固定 RAG | 研究助手、数据分析、自动操作 |

经验法则：能用固定流程解决的，不要过早上 Agent。Agent 强在弹性，但也带来成本、延迟和不可预测性。

## LangChain 的边界

LangChain 不会自动解决所有 LLM 应用问题：

- 它不能替你设计好提示词，只提供组织提示词的工具。
- 它不能保证 Agent 一定可靠，工具设计和上下文工程仍然关键。
- 它不能消除模型幻觉，RAG 还需要检索质量、引用约束和评测。
- 它不是唯一运行时，复杂工作流应结合 LangGraph。

## 入门建议

先用 LangChain 做三个小项目：

1. 一个简单聊天机器人：理解 Chat Model、Messages、Prompt。
2. 一个文档问答机器人：理解 Loader、Splitter、Embedding、Vector Store、Retriever。
3. 一个带工具的助手：理解 Tool、Agent Loop、Runtime Context。

完成这三个项目后，再学习 LangGraph 的状态图和持久化工作流。
