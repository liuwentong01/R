import { FakeListChatModel } from "@langchain/core/utils/testing";
import { ChatOpenAI } from "@langchain/openai";

import { getSettings } from "./config.js";

const DEFAULT_MOCK_RESPONSES = [
  "LangChain 是一个用于构建 LLM 应用的组件库和编排框架。",
  "你好，我会用简洁、耐心的方式解释 LangChain 的核心概念。",
  "防抖是在连续触发停止后才执行，适合搜索输入；节流是在固定间隔内最多执行一次，适合滚动监听。",
  "stream 会把模型回复拆成多个增量片段返回。这样用户可以更早看到内容，也更适合聊天界面。",
];

export function createChatModel(mockResponses = DEFAULT_MOCK_RESPONSES) {
  const settings = getSettings();

  if (settings.provider === "mock") {
    return new FakeListChatModel({
      responses: mockResponses,
    });
  }

  if (!settings.deepseekApiKey) {
    throw new Error("DEEPSEEK_API_KEY is required when LANGCHAIN_DEMO_PROVIDER=deepseek.");
  }

  // DeepSeek 提供 OpenAI-compatible API，LangChain 通过 ChatOpenAI 适配器接入。
  return new ChatOpenAI({
    apiKey: settings.deepseekApiKey,
    model: settings.model,
    temperature: settings.temperature,
    timeout: settings.timeoutMs,
    maxRetries: 0,
    configuration: {
      baseURL: settings.deepseekBaseUrl,
    },
  });
}
