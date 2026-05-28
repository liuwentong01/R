import { printMessage, printTitle } from "../../src/langchain-learning/display.js";
import { createChatModel } from "../../src/langchain-learning/models.js";

async function main(): Promise<void> {
  printTitle("Demo 01 - Chat Model invoke");

  const model = createChatModel([
    "LangChain 是一个帮助开发者构建 LLM 应用的框架，常用于模型调用、RAG 和 Agent。",
  ]);

  const question = "用一句话解释 LangChain 是什么。";
  const response = await model.invoke(question);

  printMessage("user", question);
  printMessage("assistant", String(response.content));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
