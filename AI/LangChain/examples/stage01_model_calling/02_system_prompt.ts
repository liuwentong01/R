import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

import { printMessage, printTitle } from "../../src/langchain-learning/display.js";
import { createChatModel } from "../../src/langchain-learning/models.js";

async function main(): Promise<void> {
  printTitle("Demo 02 - System/User/Assistant messages");

  const model = createChatModel([
    "Chat Model 接收的是一组带角色的消息，因此能清楚区分规则、历史对话和当前问题。",
  ]);

  const messages = [
    new SystemMessage("你是一个耐心的 AI 工程教学助手，回答要简洁、准确。"),
    new HumanMessage("我准备学习 LangChain。"),
    new AIMessage("好的，我们可以先从模型调用、Prompt 和消息结构开始。"),
    new HumanMessage("Chat Model 和普通字符串调用有什么不同？"),
  ];

  const response = await model.invoke(messages);

  for (const message of messages) {
    printMessage(message._getType(), String(message.content));
  }
  printMessage("assistant", String(response.content));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
