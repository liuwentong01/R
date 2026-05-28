# Runnable 与 LCEL

Runnable 是 LangChain 中统一的可调用抽象。Prompt、Model、Parser 和组合后的 Chain 都可以使用 invoke、batch、stream 等方法。

LCEL 使用管道把多个 Runnable 连接起来。典型链路是 prompt.pipe(model).pipe(parser)，表示先把变量渲染成消息，再调用模型，最后解析输出。

固定流程 Chain 适合步骤明确、成本可控、易测试的任务。如果任务路径不固定，再考虑 Agent。
