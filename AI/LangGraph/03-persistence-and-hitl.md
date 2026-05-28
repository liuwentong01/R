# 03 - 持久化与 Human-in-the-loop

## 为什么持久化重要

复杂 Agent 经常不是一次请求内完成的：

- 任务可能跑很久。
- 中间需要人工审批。
- 服务可能重启。
- 工具可能失败，需要恢复。
- 用户可能稍后继续同一个任务。
- 需要查看历史状态做调试。

LangGraph 的持久化层通过 checkpointer 保存每一步状态，让图具备恢复、回放和人工介入能力。

## Checkpointer

Checkpointer 是 LangGraph 的状态持久化组件。

当 graph 使用 checkpointer 编译后，LangGraph 会在每个 super-step 边界保存 checkpoint。

```python
from langgraph.checkpoint.memory import InMemorySaver

checkpointer = InMemorySaver()
graph = builder.compile(checkpointer=checkpointer)
```

生产环境通常不应使用内存 checkpointer，而应使用数据库持久化方案，例如 Postgres。

## Thread

Thread 是一条独立执行上下文。调用 graph 时，需要通过 config 指定 `thread_id`。

```python
config = {
    "configurable": {
        "thread_id": "user-123-task-456"
    }
}

graph.invoke({"question": "分析这份需求"}, config=config)
```

同一个 `thread_id` 下，graph 可以读取和恢复历史 checkpoint。

可以把 `thread_id` 理解成“会话 ID / 任务 ID”。

## Checkpoint

Checkpoint 是某个 thread 在某个时刻的状态快照。

它通常包含：

- 当前 state
- 下一步待执行节点
- 执行元数据
- checkpoint id
- parent checkpoint

有了 checkpoint，就能：

- 查看当前状态
- 从某一步恢复
- 做 time travel 调试
- 支持人工审批后继续执行

## Super-step

LangGraph 在 super-step 边界保存 checkpoint。

一个 super-step 可以理解成图的一次“tick”：当前被调度的一批节点执行完后，状态合并，再进入下一步。

重要细节：checkpoint 不保存在节点函数中间，而是在 super-step 边界保存。如果节点中途 interrupt 或恢复，节点函数可能会从头再执行。

## Interrupt

Interrupt 用于暂停图执行，等待外部输入。

典型场景：

- 人工审批计划。
- 人工修改模型生成的内容。
- 高风险工具调用前确认。
- 请求用户补充信息。

示例：

```python
from langgraph.types import interrupt

def human_review(state):
    decision = interrupt({
        "question": "是否批准执行该计划？",
        "plan": state["plan"],
    })
    return {"approved": decision["approved"]}
```

第一次执行到 `interrupt()` 时，图会暂停并把 interrupt 值暴露给外部。外部拿到人工输入后，再 resume。

## Resume

恢复执行通常使用 `Command(resume=...)`，并使用相同的 `thread_id`。

```python
from langgraph.types import Command

graph.invoke(
    Command(resume={"approved": True}),
    config={"configurable": {"thread_id": "user-123-task-456"}},
)
```

恢复时要特别注意：包含 `interrupt()` 的节点会从头执行。interrupt 之前的代码也可能再次运行。

## 节点重执行的影响

因为节点恢复时可能从头执行，所以节点中 interrupt 之前的逻辑要避免不可重复副作用。

风险写法：

```python
def approve_and_charge(state):
    create_payment_order(state["order_id"])  # interrupt 前发生副作用
    approved = interrupt("是否扣款？")
    if approved:
        charge(state["order_id"])
```

更好的做法：

- 把副作用放到人工确认之后。
- 使用幂等 key。
- 把“准备数据”和“执行副作用”拆成不同节点。
- 在 state 中记录是否已执行。

## interrupt_before / interrupt_after

除了在节点内部调用 `interrupt()`，也可以在编译图时指定在某些节点前后暂停。

```python
graph = builder.compile(
    checkpointer=checkpointer,
    interrupt_before=["execute"],
)
```

适合：

- 在执行高风险节点前统一暂停。
- 调试时每一步停下来观察。
- 不想把 interrupt 逻辑写进节点函数。

## Human-in-the-loop 常见模式

### 1. 审批后执行

```
plan → human_review → execute
```

用户批准后继续执行，拒绝则返回 revise。

### 2. 人工修改状态

模型生成初稿后，人工修改 plan 或 answer，再继续后续节点。

```
draft → interrupt → revise_state → publish
```

### 3. 高风险工具确认

工具调用前暂停，让人确认参数。

```
prepare_tool_call → human_confirm → execute_tool
```

### 4. 用户补充信息

当 state 中缺少必要字段时，暂停并询问用户。

```
validate_input → ask_user → continue
```

## 持久化设计建议

### 1. thread_id 要稳定

同一个任务必须使用同一个 `thread_id`，否则无法恢复。

### 2. 生产环境用持久化 checkpointer

内存 checkpointer 只适合本地实验。生产环境应使用可靠存储。

### 3. State 不要塞过大对象

大文件、图片、长文档应存外部存储，State 中保留引用 ID 或摘要。

### 4. 副作用节点要幂等

任何发请求、写数据库、发消息、扣款、删除数据的节点都要考虑重试和恢复。

### 5. 记录关键决策

人工审批、模型路由、工具调用参数都应写入 state 或外部日志，方便追溯。

## 调试能力

有 checkpointer 后，可以：

- `get_state(config)` 查看当前 thread 最新状态。
- 查看 checkpoint 历史。
- 从某个 checkpoint 恢复。
- 对比不同路径下 state 的变化。

这也是 LangGraph 比普通 Agent 更适合生产排障的原因。

## 入门练习

1. 给简单图加 `InMemorySaver`。
2. 用同一个 `thread_id` 连续调用，观察状态如何保留。
3. 写一个 `interrupt()` 节点，让用户审批后继续。
4. 故意在 interrupt 前放日志，观察 resume 时节点重执行。
5. 把高风险副作用拆到审批之后。
