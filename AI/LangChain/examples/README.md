# LangChain TypeScript Examples

这里存放 LangChain 从 0 到 1 的 TypeScript 分阶段练习代码。每个 demo 都尽量保持可单独运行，并且只聚焦一个核心概念。

## 环境准备

```bash
cd AI/LangChain
npm install
```

默认使用 `mock` provider，不需要 API Key，适合先跑通学习流程。

如果要使用真实 DeepSeek 模型：

```bash
cp .env.example .env
```

然后在 `.env` 中配置：

```bash
LANGCHAIN_DEMO_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
LANGCHAIN_DEMO_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

## 阶段索引

| 阶段 | 目录 | 目标 |
| --- | --- | --- |
| 第 1 阶段 | [stage01_model_calling](./stage01_model_calling) | 跑通 Chat Model、消息、Prompt Template 和 stream |
| 第 2 阶段 | [stage02_fixed_chain](./stage02_fixed_chain) | 理解 Runnable、LCEL、Output Parser、batch 和 stream |
| 第 3 阶段 | [stage03_rag](./stage03_rag) | 做出第一个知识库问答，理解 RAG 离线和在线链路 |
| 第 4 阶段 | [stage04_tools](./stage04_tools) | 让模型能够访问计算、天气、文档搜索等外部工具 |
| 第 5 阶段 | [stage05_agent](./stage05_agent) | 理解 Agent 工具调用循环、日志、限制和确认 |

## 运行方式

```bash
npm run stage01
npm run stage02
npm run stage03
npm run stage04
npm run stage05

# 或逐个运行
npm run stage01:01
npm run stage01:02
npm run stage01:03
npm run stage01:04
npm run stage02:01
npm run stage02:02
npm run stage02:03
npm run stage02:04
npm run stage03:01
npm run stage03:02
npm run stage03:03
npm run stage03:04
npm run stage04:01
npm run stage04:02
npm run stage04:03
npm run stage04:04
npm run stage05:01
npm run stage05:02
npm run stage05:03
npm run stage05:04
```

后续新增几十个 demo 时，建议继续按阶段目录组织，避免把所有脚本堆在同一层。
