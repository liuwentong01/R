# 第 2 阶段：固定流程 Chain

## 目标

理解 LangChain 中的 Runnable 和 LCEL，掌握如何把 Prompt、Model、Output Parser 组合成稳定、可测试的固定流程。

需要掌握：

- Runnable
- LCEL 管道
- Output Parser
- `batch`
- `stream`

## Demo 列表

| 文件 | 重点 |
| --- | --- |
| [01_title_summary_chain.ts](./01_title_summary_chain.ts) | 输入主题，先生成标题，再生成摘要 |
| [02_sentiment_json.ts](./02_sentiment_json.ts) | 输入文本，判断情绪，并用 JSON Parser 输出对象 |
| [03_structured_output.ts](./03_structured_output.ts) | 使用 StructuredOutputParser 约束结构化输出 |
| [04_batch_and_stream.ts](./04_batch_and_stream.ts) | 使用同一个 Runnable chain 执行 batch 和 stream |

## 运行

在 `AI/LangChain` 目录下执行：

```bash
npm run stage02

# 或逐个运行
npm run stage02:01
npm run stage02:02
npm run stage02:03
npm run stage02:04
```

## 什么是 Runnable

Runnable 是 LangChain 中统一的“可调用单元”。Prompt、Model、Parser、由多个组件组合出来的 Chain，都可以被当成 Runnable。

常见调用方式：

- `invoke`：单次调用。
- `batch`：批量调用多个输入。
- `stream`：流式消费输出。

因此你可以把一个复杂流程看成多个 Runnable 的组合，而不是一堆互相嵌套的函数调用。

## 什么是 LCEL

LCEL 是 LangChain Expression Language。最常见的写法是管道：

```ts
const chain = prompt.pipe(model).pipe(parser);
```

这条链路可以读成：

```text
输入变量
  │
  ▼
Prompt 把变量组装成 messages
  │
  ▼
Model 接收 messages 并生成回复
  │
  ▼
Parser 把模型回复转换成目标格式
```

也就是完成标准里的 `prompt | model | parser`。

## 固定流程什么时候比 Agent 更合适

固定流程适合：

- 步骤明确，例如“分类 → JSON 输出”。
- 每一步都能提前设计好。
- 不需要模型自主决定下一步。
- 需要稳定、低成本、低延迟。
- 需要更容易测试和复现。

Agent 更适合：

- 任务路径不固定。
- 需要模型自己决定是否调用工具。
- 需要多步探索和动态决策。

经验法则：能用固定流程解决的问题，先不要上 Agent。固定流程更容易控制，也更适合学习 LangChain 的基础抽象。
