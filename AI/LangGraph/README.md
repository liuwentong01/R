# LangGraph 从 0 到 1 入门

> 目标：把 LangGraph 理解成“有状态 AI Agent 工作流引擎”，而不是把它简单看成 LangChain 的另一个 Chain 写法。
> 最近整理：2026-05-28

## 一句话理解

LangGraph 是 LangChain 生态中的有状态工作流框架。它用图结构描述 AI 应用：节点负责执行逻辑，边负责控制流转，状态负责在节点之间传递和累积数据。它特别适合构建需要循环、分支、持久化、人工介入、多 Agent 协作和长任务恢复的生产级 Agent。

## 为什么需要 LangGraph

普通 Chain 适合线性流程，普通 Agent 适合让模型自己决定下一步。但真实复杂任务经常需要：

- 明确控制每一步执行顺序。
- 根据状态进行条件分支。
- 失败后从中间步骤恢复。
- 在关键节点暂停，等待人工审批。
- 多个 Agent 分工协作。
- 长任务跨进程、跨请求、跨时间继续执行。
- 查看历史 checkpoint，调试和回放执行过程。

LangGraph 用图和状态机制解决这些问题。

## 文档索引

| 文件 | 内容 | 建议阶段 |
| --- | --- | --- |
| [01-overview.md](./01-overview.md) | LangGraph 的定位、适用场景和核心心智模型 | 入门 |
| [02-stategraph-basics.md](./02-stategraph-basics.md) | State、Node、Edge、Reducer、条件路由 | 核心 |
| [03-persistence-and-hitl.md](./03-persistence-and-hitl.md) | Checkpointer、Thread、Interrupt、人机协同 | 核心 |
| [04-agent-workflows.md](./04-agent-workflows.md) | Agent 工作流、多 Agent、和 LangChain Agent 的关系 | 进阶 |
| [05-learning-roadmap.md](./05-learning-roadmap.md) | 从 0 到 1 学习路线、练手项目和常见坑 | 路线图 |

## 最小心智模型

```
StateGraph
  │
  ├── State：所有节点共享的状态结构
  ├── Node：接收 State，执行逻辑，返回 State 更新
  ├── Edge：决定下一个执行哪个 Node
  ├── Reducer：定义多个更新如何合并到 State
  └── Checkpointer：保存每一步状态，支持恢复和人机协同
```

## 最小示意图

```
START
  │
  ▼
planner
  │
  ▼
researcher ── 条件：资料不足 ──┐
  │                            │
  ▼                            │
writer ◄───────────────────────┘
  │
  ▼
human_review
  │
  ▼
END
```

## LangChain 和 LangGraph 怎么配合

LangChain 提供模型、工具、检索器、Agent 等组件；LangGraph 负责把这些组件编排成可控、可恢复、有状态的流程。

常见组合方式：

- LangChain Chat Model 作为 LangGraph 节点中的模型调用。
- LangChain Retriever 作为 LangGraph 检索节点。
- LangChain Tool 作为 LangGraph 工具节点。
- LangChain Agent 作为 LangGraph 中的一个节点。
- LangGraph 作为整个复杂 Agent 系统的外层控制流。

## 官方资料入口

- LangGraph Python 文档：https://docs.langchain.com/oss/python/langgraph/
- LangGraph JS 文档：https://docs.langchain.com/oss/javascript/langgraph/
- LangSmith 文档：https://docs.smith.langchain.com/
