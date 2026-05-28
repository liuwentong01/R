# 01 - LangGraph 总览

## LangGraph 是什么

LangGraph 是一个用图结构构建有状态 AI 应用的框架。

它把一个复杂任务拆成多个节点，每个节点读取共享状态、执行一段逻辑、返回状态更新；边决定节点之间如何流转；checkpoint 负责保存每一步状态，让工作流可以暂停、恢复、回放和调试。

```
State + Nodes + Edges + Checkpoints = 可控、可恢复的 Agent 工作流
```

## 它解决了什么问题

在简单场景中，LangChain Chain 或 Agent 已经够用。但复杂 Agent 常遇到这些问题：

- 执行流程不透明，不知道模型下一步会做什么。
- 需要循环，但普通 Chain 是线性的。
- 需要分支，但 if/else 散落在业务代码里难维护。
- 需要暂停等待人工审批。
- 长任务中断后要恢复。
- 多 Agent 协作需要明确交接状态。
- 需要查看某一步的状态和输出。

LangGraph 把这些问题显式建模成“图 + 状态”。

## 核心概念

| 概念 | 说明 |
| --- | --- |
| State | 工作流共享状态，通常用 TypedDict 或 Pydantic 定义 |
| Node | 节点函数，接收 state，返回部分 state 更新 |
| Edge | 边，决定下一个执行节点 |
| Conditional Edge | 条件边，根据 state 动态路由 |
| Reducer | 状态合并函数，决定多个更新如何合并 |
| Checkpointer | 状态持久化层，每个 super-step 保存快照 |
| Thread | 一条独立执行上下文，用 `thread_id` 区分 |
| Interrupt | 暂停执行，等待外部输入后恢复 |
| Command | 用于 resume、goto、update 等控制操作 |

## LangGraph 和普通工作流引擎的区别

LangGraph 很像工作流引擎，但它特别面向 LLM/Agent 场景：

- State 可以包含消息历史、工具结果、检索文档、中间计划。
- Node 可以是模型调用、工具调用、Agent 调用或普通业务函数。
- Edge 可以根据模型输出做条件路由。
- Checkpointer 支持人机协同、时间旅行调试、会话记忆。
- 可以自然表达循环，比如“检索 → 判断是否足够 → 不足则继续检索”。

## LangGraph 和 LangChain Agent 的区别

| 对比项 | LangChain Agent | LangGraph |
| --- | --- | --- |
| 核心抽象 | 模型驱动工具调用循环 | 显式状态图 |
| 控制流 | 主要由模型决定 | 由图结构和条件边决定 |
| 状态 | Agent 内部状态 | 开发者显式定义 State |
| 持久化 | 可配置 | 是核心能力之一 |
| 人工介入 | 可做，但不如图清晰 | 一等能力 |
| 多 Agent | 可以组合 | 更适合建模协作流程 |
| 适用场景 | 通用工具调用助手 | 生产级复杂 Agent 工作流 |

## 什么时候用 LangGraph

推荐使用：

- 任务有明确阶段，例如规划、检索、执行、审核、总结。
- 需要循环或条件分支。
- 需要人工审批、人工修改中间结果。
- 需要跨请求恢复执行。
- 需要长期运行的 Agent。
- 需要多 Agent 协作。
- 需要可观察、可调试、可回放。

暂时不需要：

- 只是调用一次模型。
- 简单 Prompt 链路。
- 简单文档问答。
- 固定两三步流程且没有状态恢复需求。

## 最小工作流结构

```python
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    question: str
    answer: str

def answer_node(state: State):
    return {"answer": f"你问的是：{state['question']}"}

builder = StateGraph(State)
builder.add_node("answer", answer_node)
builder.add_edge(START, "answer")
builder.add_edge("answer", END)

graph = builder.compile()

result = graph.invoke({"question": "什么是 LangGraph？"})
print(result["answer"])
```

这个例子没有模型调用，但展示了 LangGraph 的基本形状：

1. 定义 State。
2. 定义 Node。
3. 添加 Edge。
4. compile 成可运行 graph。
5. invoke 输入初始状态。

## Graph 运行时的基本过程

```
1. 接收初始 State
2. 从 START 找到入口节点
3. 执行节点函数
4. 节点返回 State 更新
5. Reducer 合并更新
6. Edge 决定下一批节点
7. 重复执行，直到 END
8. 返回最终 State
```

如果配置了 checkpointer，每个 super-step 边界都会保存状态快照。

## 入门理解重点

学习 LangGraph 不要只记 API，要抓住四个问题：

1. 状态长什么样？
2. 每个节点只负责什么？
3. 节点之间如何流转？
4. 中断、恢复、失败时状态在哪里？

这四个问题想清楚，LangGraph 的代码就会自然很多。
