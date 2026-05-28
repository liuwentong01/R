# 05 - 学习路线与练手项目

## 学习目标

学完 LangGraph 入门阶段后，应该能做到：

- 用 StateGraph 搭建基本流程。
- 理解 State、Node、Edge、Reducer 的关系。
- 能写条件路由和循环。
- 能配置 checkpointer，并用 thread_id 恢复状态。
- 能实现一个人工审批节点。
- 能判断 LangChain Agent 和 LangGraph 分别适合放在哪里。
- 能设计一个简单多 Agent 工作流。

## 第 1 阶段：跑通最小图

目标：理解 LangGraph 代码骨架。

需要掌握：

- `StateGraph`
- `START`
- `END`
- `add_node`
- `add_edge`
- `compile`
- `invoke`

练习：

1. 写一个 `question → answer` 的单节点图。
2. 写一个 `input → process → output` 的两节点图。
3. 打印每个节点收到的 state。

完成标准：

- 能解释节点为什么返回“部分 state 更新”。
- 能画出代码对应的流程图。

## 第 2 阶段：状态和 reducer

目标：理解状态如何传递和合并。

需要掌握：

- TypedDict State
- 覆盖式更新
- `Annotated`
- reducer
- `add_messages`

练习：

1. 做一个多节点日志累积流程。
2. 对比有 reducer 和没有 reducer 的区别。
3. 用 messages state 保存对话历史。

完成标准：

- 能说明哪些字段应该覆盖，哪些字段应该累积。
- 能解释为什么 messages 不应简单用列表追加。

## 第 3 阶段：条件边和循环

目标：让流程从线性变成动态。

需要掌握：

- `add_conditional_edges`
- route function
- 循环
- 最大迭代次数
- 结束条件

练习：

1. 写一个审核流程：通过则结束，不通过则修改。
2. 写一个检索流程：资料不足则继续检索。
3. 给循环加最大次数。

完成标准：

- 能把 if/else 从节点内部抽到条件边。
- 能避免无限循环。

## 第 4 阶段：持久化

目标：让工作流可以恢复。

需要掌握：

- checkpointer
- thread_id
- checkpoint
- `get_state`
- super-step

练习：

1. 给图加 `InMemorySaver`。
2. 用相同 `thread_id` 多次调用。
3. 查看当前 state。
4. 理解节点失败或恢复时哪些代码会重新执行。

完成标准：

- 能解释 thread 和 checkpoint 的关系。
- 知道生产环境不能依赖内存 checkpointer。

## 第 5 阶段：Human-in-the-loop

目标：实现人工审批和恢复执行。

需要掌握：

- `interrupt`
- `Command(resume=...)`
- `interrupt_before`
- `interrupt_after`
- 人工修改 state

练习：

1. 写一个计划生成节点。
2. 在执行前 interrupt，让用户批准。
3. 用户拒绝则回到修改节点。
4. 用户批准则继续执行。

完成标准：

- 能解释为什么 interrupt 需要 checkpointer。
- 能处理 interrupt 节点重新执行的问题。

## 第 6 阶段：Agent 工作流

目标：把 LangChain 组件放入 LangGraph。

需要掌握：

- 模型节点
- Retriever 节点
- Tool 节点
- Agent 节点
- Validator 节点
- 子图

练习：

1. 做一个 RAG 图：retrieve → generate。
2. 加 judge 节点：资料不足则回到 retrieve。
3. 把 LangChain Agent 放到一个节点中。
4. 给 Agent 输出加 validator。
5. 设计一个 planner → researcher → writer → reviewer 流程。

完成标准：

- 能说清楚哪些部分交给 Agent 自主决策，哪些部分由图控制。
- 能把高风险工具调用拆成显式节点。

## 推荐练手项目

### 项目 1：审批型写作助手

流程：

```
输入主题 → 生成大纲 → 人工审批 → 写正文 → 人工修改 → 输出终稿
```

学习点：

- interrupt
- state 修改
- checkpointer

### 项目 2：可循环 RAG 助手

流程：

```
用户问题 → 检索 → 判断资料是否足够 → 不足则改写 query 继续检索 → 生成答案
```

学习点：

- conditional edge
- 循环
- 最大迭代次数
- 检索质量判断

### 项目 3：多 Agent 技术方案助手

流程：

```
需求输入 → Planner 拆任务 → Researcher 查资料 → Architect 写方案 → Reviewer 审查 → 输出
```

学习点：

- 多 Agent
- pipeline 模式
- reviewer 节点
- 状态契约

### 项目 4：高风险工具执行助手

流程：

```
用户指令 → 解析工具参数 → 人工确认 → 执行工具 → 记录结果
```

学习点：

- tool node
- human confirmation
- 幂等性
- 审计日志

## 常见误区

### 误区 1：把所有逻辑都塞进一个节点

这样只是换了个地方写函数，失去了图的可观察性和可恢复性。

### 误区 2：没有状态设计就开始写图

LangGraph 的核心是 State。先设计 State，再设计节点。

### 误区 3：循环不设上限

模型判断不稳定时，循环可能失控。生产流程必须有最大轮数或超时。

### 误区 4：interrupt 前做副作用

恢复时节点可能重执行，副作用可能重复发生。副作用应放在确认之后或保证幂等。

### 误区 5：多 Agent 过度设计

多 Agent 增加成本和复杂度。只有职责真的不同、结果需要互相校验时才拆。

## 学习顺序建议

如果你已经学过 LangChain：

1. 先写最小 StateGraph。
2. 学 reducer，尤其是 messages。
3. 学 conditional edge 和循环。
4. 学 checkpointer 和 thread_id。
5. 学 interrupt 和 resume。
6. 最后做多 Agent 工作流。

如果你还没学 LangChain：

1. 先学模型调用和 Prompt。
2. 再学 RAG。
3. 再学 Tool 和 Agent。
4. 最后用 LangGraph 编排复杂流程。

## 判断是否掌握

看到一个复杂 Agent 需求时，你应该能快速回答：

- 这个流程的 State 有哪些字段？
- 哪些步骤应该是节点？
- 哪些跳转应该是条件边？
- 哪些字段需要 reducer？
- 哪些节点需要 checkpoint 后恢复？
- 哪些地方需要人工介入？
- 哪些动作有副作用，如何保证幂等？

能回答这些问题，就说明你已经从 API 学习进入了工作流设计阶段。
