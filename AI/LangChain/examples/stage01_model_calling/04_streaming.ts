import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import { printMessage, printStream, printTitle } from "../../src/langchain-learning/display.js";
import { createChatModel } from "../../src/langchain-learning/models.js";

async function main(): Promise<void> {
  printTitle("Demo 04 - Streaming");

  const model = createChatModel([
    "stream 会把模型回复拆成多个增量片段返回。这样用户可以更早看到内容，也更适合聊天界面。",
  ]);

  const messages = [
    new SystemMessage("你是一个简洁的 LangChain 教学助手。"),
    new HumanMessage("用两句话解释 stream 有什么用。"),
  ];

  for (const message of messages) {
    printMessage(message._getType(), String(message.content));
  }

  await printStream(await model.stream(messages));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
