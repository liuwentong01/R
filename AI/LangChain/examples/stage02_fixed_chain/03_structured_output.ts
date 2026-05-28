import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";

import { printMessage, printTitle } from "../../src/langchain-learning/display.js";
import { createChatModel } from "../../src/langchain-learning/models.js";

async function main(): Promise<void> {
  printTitle("Stage 02 Demo 03 - structured output parser");

  const parser = StructuredOutputParser.fromNamesAndDescriptions({
    title: "文章标题",
    summary: "60 字以内的文章摘要",
    audience: "适合阅读这篇文章的目标读者",
  });

  const model = createChatModel([
    JSON.stringify({
      title: "Runnable 与 LCEL：固定流程的基础",
      summary: "Runnable 统一了调用接口，LCEL 用管道把 Prompt、Model 和 Parser 组合成稳定流程。",
      audience: "刚开始学习 LangChain 的前端或 Node.js 开发者",
    }),
  ]);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "你是一个严谨的技术写作助手。\n{formatInstructions}"],
    ["human", "请基于主题“{topic}”生成结构化文章信息。"],
  ]);

  const chain = prompt.pipe(model).pipe(parser);

  const result = await chain.invoke({
    topic: "LangChain Runnable 和 LCEL",
    formatInstructions: parser.getFormatInstructions(),
  });

  printMessage("structured output", JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
