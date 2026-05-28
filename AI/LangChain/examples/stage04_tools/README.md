# 第 4 阶段：Tools

## 目标

让模型能够访问外部能力，并理解工具名称、描述、参数 schema、工具结果和错误处理如何影响 Agent 行为。

需要掌握：

- `tool()`
- 工具名称和描述
- 参数 schema
- 工具结果设计
- 错误处理

## Demo 列表

| 文件 | 重点 |
| --- | --- |
| [01_calculator_tool.ts](./01_calculator_tool.ts) | 计算器工具 |
| [02_weather_tool.ts](./02_weather_tool.ts) | 查询天气的 mock 工具 |
| [03_local_doc_search_tool.ts](./03_local_doc_search_tool.ts) | 搜索本地文档的工具 |
| [04_error_handling_tool.ts](./04_error_handling_tool.ts) | 工具失败后的安全错误消息 |

## 运行

```bash
npm run stage04

# 或逐个运行
npm run stage04:01
npm run stage04:02
npm run stage04:03
npm run stage04:04
```

## 工具描述为什么影响调用质量

模型选择工具时主要依赖工具名、描述和参数 schema。描述太宽泛，模型就难判断什么时候该调用；参数太模糊，模型就容易构造错误入参。

好的工具描述应该说明：

- 工具解决什么问题。
- 什么时候应该调用。
- 输入字段分别代表什么。
- 工具不能做什么。

## 工具结果和原始接口返回值的区别

工具返回给模型看的内容应该短、清晰、可直接推理。真实业务接口可能返回很大的 JSON，其中包含模型不需要的字段、内部 ID、调试信息甚至敏感信息。

建议：

- 原始接口返回值先在工具内部清洗。
- 只把关键字段摘要返回给模型。
- 保留必要来源和状态。
- 错误时返回可行动的错误信息，而不是让模型猜。
