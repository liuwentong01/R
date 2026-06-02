import { ChatPromptTemplate } from "@langchain/core/prompts";

import { printMessage, printTitle } from "../../src/langchain-learning/display.js";
import { createChatModel } from "../../src/langchain-learning/models.js";

async function main(): Promise<void> {
  printTitle("Demo 03 - Prompt Template");

  const model = createChatModel([
    "防抖是在连续触发停止后才执行，适合搜索输入；节流是在固定间隔内最多执行一次，适合滚动监听。",
  ]);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "你是一个{role}，回答要包含一个具体例子。"],
    ["human", "请解释：{topic}"],
  ]);

  const promptValue = await prompt.invoke({
    role: "前端面试教学助手",
    topic: "防抖和节流的区别",
  });

  for (const message of promptValue.toChatMessages()) {
    printMessage(message._getType(), String(message.content));
  }

  printMessage("status", "Prompt 已生成，开始调用 Chat Model...");
  const response = await model.invoke(promptValue);

  printMessage("assistant", String(response.content));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error("\n[error]");
  console.error(`模型调用失败：${message}`);

  if (message.includes("Service is too busy") || message.includes("503")) {
    console.error("DeepSeek 当前服务繁忙，可以稍后重试，或临时把 LANGCHAIN_DEMO_PROVIDER 改回 mock 学习本地流程。");
  }

  process.exitCode = 1;
});
