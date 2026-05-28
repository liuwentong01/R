# 第 5 阶段：Agent

## 目标

理解 Agent 是模型驱动的工具调用循环，并学习如何控制工具边界、记录工具调用、限制最大调用次数和处理高风险操作。

需要掌握：

- `createAgent`
- Agent Loop
- State
- Runtime Context
- Middleware
- 最大迭代次数

## Demo 列表

| 文件 | 重点 |
| --- | --- |
| [01_calculator_and_search_agent.ts](./01_calculator_and_search_agent.ts) | Agent 调用计算器和本地文档搜索工具 |
| [02_agentic_retrieval_decision.ts](./02_agentic_retrieval_decision.ts) | Agent 根据问题决定是否检索文档 |
| [03_tool_call_limit_and_logging.ts](./03_tool_call_limit_and_logging.ts) | 工具调用日志和最大工具调用次数 |
| [04_high_risk_confirmation.ts](./04_high_risk_confirmation.ts) | 给高风险工具加确认参数 |

## 运行

```bash
npm run stage05

# 或逐个运行
npm run stage05:01
npm run stage05:02
npm run stage05:03
npm run stage05:04
```

## Agent Loop

```text
用户消息
  │
  ▼
模型判断是否需要工具
  │
  ├── 不需要：直接输出最终回复
  │
  └── 需要：生成 tool call
          │
          ▼
       执行工具
          │
          ▼
       工具结果写回 messages/state
          │
          ▼
       模型继续判断下一步
```

## Chain 和 Agent 的区别

Chain 是开发者提前写好的固定流程，适合分类、摘要、格式转换、稳定 RAG 等步骤明确的任务。

Agent 是模型在循环中动态选择工具，适合路径不固定、需要探索和多步决策的任务。

经验法则：能用 Chain 稳定解决，就先不要上 Agent；Agent 带来灵活性，也带来成本、延迟和不确定性。

## Agent 的不确定性来自哪里

- 模型可能选错工具。
- 工具描述不清导致误调用。
- 参数 schema 太宽松导致入参错误。
- 工具结果太长或噪声太多。
- 循环没有调用次数限制。
- 高风险工具缺少确认和权限校验。

## 清晰工具集的设计原则

- 每个工具只做一件事。
- 名称表达能力边界。
- 描述说明调用时机。
- 参数 schema 尽量具体。
- 工具结果短、清晰、可追溯。
- 高风险动作必须显式确认。
