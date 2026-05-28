# 02 - StateGraph 基础

## StateGraph 是什么

`StateGraph` 是 LangGraph 最常用的图类型。它围绕一个共享 State 工作：

- 每个节点读取当前 State。
- 每个节点返回 State 的部分更新。
- LangGraph 按 reducer 规则把更新合并回 State。
- 边决定下一个要执行的节点。

可以把它理解成“围绕共享状态运转的有向图”。

## State

State 是工作流的共享数据结构。它定义了整个图中会流动什么信息。

```python
from typing_extensions import TypedDict

class State(TypedDict):
    question: str
    documents: list[str]
    answer: str
```

一个好的 State 应该：

- 字段清晰，避免塞一个巨大 `data`。
- 区分输入、中间结果、最终输出。
- 只放跨节点需要共享的数据。
- 对消息列表、日志列表等累积字段定义 reducer。

## Node

Node 是节点函数。它接收当前 State，返回一个 dict 作为状态更新。

```python
def retrieve_node(state: State):
    docs = retriever.invoke(state["question"])
    return {"documents": [doc.page_content for doc in docs]}
```

节点设计原则：

- 一个节点只做一类事情。
- 输入从 state 读取。
- 输出只返回需要更新的字段。
- 有副作用的操作要考虑幂等性。
- 节点内不要隐藏复杂跳转逻辑，跳转交给边。

## Edge

Edge 表示固定流转关系。

```python
from langgraph.graph import START, END

builder.add_edge(START, "retrieve")
builder.add_edge("retrieve", "generate")
builder.add_edge("generate", END)
```

这表示：

```
START → retrieve → generate → END
```

## Conditional Edge

Conditional Edge 根据当前 State 决定下一步去哪里。

```python
def route_after_review(state: State):
    if state["approved"]:
        return "execute"
    return "revise"

builder.add_conditional_edges(
    "review",
    route_after_review,
    {
        "execute": "execute",
        "revise": "revise",
    },
)
```

适合表达：

- 检索结果够不够。
- 人工是否通过。
- 工具是否成功。
- 是否需要重试。
- 是否结束循环。

## 循环

LangGraph 可以自然表达循环，这是它区别于普通线性 Chain 的关键能力。

```
retrieve → judge
   ▲        │
   │        ├── not_enough
   └────────┘
            └── enough → answer
```

示例：

```python
def route_judge(state: State):
    if state["is_enough"]:
        return "answer"
    return "retrieve"

builder.add_conditional_edges(
    "judge",
    route_judge,
    {
        "answer": "answer",
        "retrieve": "retrieve",
    },
)
```

循环要设置清晰的退出条件，必要时记录迭代次数，避免无限循环。

## Reducer

默认情况下，节点返回的字段会覆盖 State 中同名字段。

但有些字段需要“累积”，例如 messages、logs、documents。此时需要 reducer。

```python
import operator
from typing import Annotated
from typing_extensions import TypedDict

class State(TypedDict):
    logs: Annotated[list[str], operator.add]
```

这样每个节点返回：

```python
return {"logs": ["retrieve done"]}
```

会追加到原列表，而不是覆盖。

## messages 的特殊 reducer

对聊天消息列表，通常不要简单用 `operator.add`。因为人工修改或工具消息更新时，可能需要按 message id 覆盖已有消息。

LangGraph 提供了 `add_messages` 这类适合消息场景的 reducer。

```python
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages

class State(TypedDict):
    messages: Annotated[list, add_messages]
```

理解 reducer 很重要，因为它决定状态是“覆盖”还是“合并”。

## 一个完整的 RAG 图

```python
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class RagState(TypedDict):
    question: str
    documents: list[str]
    answer: str

def retrieve(state: RagState):
    docs = retriever.invoke(state["question"])
    return {"documents": [doc.page_content for doc in docs]}

def generate(state: RagState):
    context = "\n\n".join(state["documents"])
    answer = model.invoke(f"基于上下文回答：\n{context}\n\n问题：{state['question']}")
    return {"answer": answer.content}

builder = StateGraph(RagState)
builder.add_node("retrieve", retrieve)
builder.add_node("generate", generate)
builder.add_edge(START, "retrieve")
builder.add_edge("retrieve", "generate")
builder.add_edge("generate", END)

graph = builder.compile()
```

这个图是固定流程，暂时没有展示 LangGraph 的复杂能力。但它是理解后续分支、循环、人机协同的基础。

## 并行执行

图中如果某个 super-step 有多个节点可以执行，LangGraph 可以在同一步中调度它们。并行节点都返回状态更新，再通过 reducer 合并。

这对以下场景有用：

- 同时查询多个知识源。
- 同时让多个 Agent 给方案。
- 同时跑多个检查器。

并行时一定要设计好 reducer，否则多个节点更新同一字段可能产生冲突。

## 节点命名建议

节点名尽量用动词或职责名：

- `plan`
- `retrieve`
- `rank`
- `generate`
- `review`
- `execute`
- `summarize`

避免：

- `node1`
- `process`
- `handler`
- `agent`

图的可读性很大程度来自节点命名。

## 常见设计错误

### 1. State 太散或太大

字段太散会难维护，字段太大又会变成黑盒。保持字段表达业务阶段。

### 2. 节点职责太重

一个节点里做规划、检索、生成、审核，就失去了图的意义。

### 3. 条件路由写在节点内部

节点负责计算，边负责路由。这样图结构更清晰。

### 4. 忘记 reducer

列表字段如果希望追加却没有 reducer，会被后续节点覆盖。

### 5. 循环没有退出条件

所有循环都应该有明确结束条件和最大次数保护。
