import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";

import { printMessage, printStream, printTitle } from "../../src/langchain-learning/display.js";
import { createChatModel } from "../../src/langchain-learning/models.js";

async function main(): Promise<void> {
  printTitle("Stage 02 Demo 04 - batch and stream");

  const model = createChatModel([
    "Runnable 是 LangChain 中统一的可调用单元。",
    "LCEL 用管道把多个 Runnable 组合成固定流程。",
    "Output Parser 负责把模型输出转换成业务需要的格式。",
    "固定流程适合步骤明确、可预测、便于测试的任务。",
  ]);
  const parser = new StringOutputParser();

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "你是一个 LangChain 教学助手，只用一句话回答。"],
    ["human", "请解释：{concept}"],
  ]);

  const chain = prompt.pipe(model).pipe(parser);

  const batchResults = await chain.batch([
    { concept: "Runnable" },
    { concept: "LCEL" },
    { concept: "Output Parser" },
  ]);

  printMessage("batch", batchResults.map((item, index) => `${index + 1}. ${item}`).join("\n"));

  const stream = await chain.stream({
    concept: "固定流程 Chain 什么时候比 Agent 更合适",
  });

  await printStream(stream);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
