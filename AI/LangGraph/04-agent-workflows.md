# 04 - Agent 工作流与多 Agent

## LangGraph 中的 Agent

LangGraph 不要求每个节点都是 Agent。一个节点可以是：

- 普通 Python 函数
- 模型调用
- 检索调用
- 工具调用
- LangChain Agent
- 子图
- 人工审批节点

这意味着你可以把“模型自主决策”和“工程显式控制”结合起来。

## 三种常见模式

### 1. Graph 包住 Agent

把 LangChain Agent 放在某个节点里，外层用 LangGraph 控制阶段。

```
prepare_context → agent_execute → validate_result → END
```

适合：

- Agent 只负责某个阶段。
- 外层流程需要审批、重试、结果校验。
- 需要记录每个阶段状态。

### 2. Agent 调用 Graph

把某个 LangGraph 工作流包装成工具，让 Agent 在需要时调用。

```
Agent
  ├── search_docs tool
  ├── calculate tool
  └── run_report_workflow tool
```

适合：

- Agent 是入口。
- 某些复杂动作需要固定流程完成。

### 3. Graph 编排多个 Agent

每个 Agent 负责一种角色，由 LangGraph 控制它们如何协作。

```
planner_agent
  │
  ├── researcher_agent
  │
  ├── coder_agent
  │
  └── reviewer_agent
        │
        ▼
      final_writer
```

适合：

- 任务天然有角色分工。
- 需要多个视角互相检查。
- 需要把不确定性限制在局部节点中。

## 单 Agent 工作流示例

一个研究助手可以拆成：

```
START
  │
  ▼
plan
  │
  ▼
research_agent
  │
  ▼
judge_enough
  │
  ├── not_enough → research_agent
  └── enough → write_report
                  │
                  ▼
                 END
```

这里 `research_agent` 可以自己调用搜索、网页读取、文档检索工具；但是否继续研究，由图中的 `judge_enough` 节点控制。

这种方式比让 Agent 完全自由更可控。

## 多 Agent 角色拆分

多 Agent 不是越多越好。拆分应基于真实职责：

| 角色 | 职责 |
| --- | --- |
| Planner | 拆解任务，制定步骤 |
| Researcher | 搜索、检索、收集资料 |
| Executor | 执行业务动作或代码生成 |
| Reviewer | 检查结果、指出问题 |
| Summarizer | 汇总输出 |

不要为了“多 Agent”而多 Agent。每个 Agent 都会增加 token、延迟和协调成本。

## Supervisor 模式

Supervisor 是多 Agent 编排中常见模式：

```
supervisor
  ├── route to researcher
  ├── route to coder
  ├── route to reviewer
  └── finish
```

Supervisor 负责根据 state 判断下一步交给哪个 Agent。

适合：

- 任务路径不固定。
- 多个 Agent 能力互补。
- 需要集中决策。

风险：

- Supervisor 也可能判断错误。
- 角色描述不清会互相推诿。
- 循环容易失控。

建议加：

- 最大轮数
- 明确完成条件
- 每个 Agent 的输入输出 schema
- Reviewer 或 Validator 节点

## Pipeline 模式

Pipeline 是更稳定的多 Agent 模式：

```
planner → researcher → writer → reviewer → final
```

优点：

- 流程清晰
- 容易调试
- 成本可控
- 适合生产化

缺点：

- 灵活性比 Supervisor 低
- 不适合路径高度动态的任务

如果任务流程基本明确，优先选 Pipeline。

## Debate / Review 模式

多个 Agent 独立给出方案，再由 Reviewer 或 Judge 汇总。

```
           ┌── agent_a ──┐
START ────┼── agent_b ──┼── judge → final
           └── agent_c ──┘
```

适合：

- 方案评审
- 代码审查
- 风险识别
- 多角度分析

注意：

- 并行结果要有 reducer 合并。
- Judge 的评价标准要明确。
- 不要让 debate 无限来回。

## Tool Node

LangGraph 可以把工具调用也作为节点。这样工具调用变成可观察、可恢复、可审批的一步。

```
prepare_tool_args → human_confirm → tool_node → parse_result
```

比 Agent 内部直接调工具更适合高风险动作。

## 子图

复杂流程可以拆成子图。子图像一个节点一样嵌入父图，但内部有自己的节点和边。

适合：

- 复用固定流程。
- 降低主图复杂度。
- 把团队职责拆开维护。

例如：

```
main_graph
  ├── requirement_analysis_subgraph
  ├── implementation_subgraph
  └── review_subgraph
```

## 什么时候把 Agent 放进节点

适合放进节点：

- 该阶段需要自主选择工具。
- 该阶段的内部步骤不固定。
- 结果可以用 schema 或 validator 校验。

不适合：

- 该阶段需要严格顺序和审批。
- 每一步都必须可恢复。
- 工具调用有强副作用。

强副作用动作建议拆成显式节点并加人工确认。

## 工作流可靠性设计

### 1. 明确状态契约

每个节点输入依赖哪些字段、输出哪些字段，要在 State 中表达清楚。

### 2. 控制循环

所有循环都要有最大次数或明确停止条件。

### 3. 校验 Agent 输出

Agent 输出不应直接进入高风险操作。中间加 validator。

### 4. 高风险动作显式化

把发邮件、写数据库、删除、付款等动作放到单独节点，方便审批、重试和审计。

### 5. 使用 checkpoint

多 Agent 和长任务默认就应该配置 checkpointer。

## 示例：代码修改助手工作流

```
START
  │
  ▼
understand_request
  │
  ▼
inspect_code
  │
  ▼
plan_changes
  │
  ▼
human_review_plan
  │
  ├── reject → plan_changes
  └── approve
        │
        ▼
     implement
        │
        ▼
     run_tests
        │
        ├── fail → implement
        └── pass → summarize
                    │
                    ▼
                   END
```

这个流程里：

- `inspect_code` 可以是检索/读取节点。
- `implement` 可以是一个 coding agent。
- `run_tests` 是普通命令节点。
- `human_review_plan` 是 interrupt 节点。
- 测试失败后回到 implement，形成受控循环。

这就是 LangGraph 的典型价值：让 Agent 能力嵌入明确工程流程。
