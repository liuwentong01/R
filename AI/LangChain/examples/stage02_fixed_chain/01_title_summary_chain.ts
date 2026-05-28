import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";

import { printMessage, printTitle } from "../../src/langchain-learning/display.js";
import { createChatModel } from "../../src/langchain-learning/models.js";

interface TopicInput {
  topic: string;
}

interface TitleState extends TopicInput {
  title: string;
}

interface ArticleDraft extends TitleState {
  summary: string;
}

async function main(): Promise<void> {
  printTitle("Stage 02 Demo 01 - title then summary chain");

  const model = createChatModel([
    "从 Prompt 到 Agent：LangChain 入门路线",
    "这篇文章可以先解释 LangChain 如何用 Prompt、Model 和 Parser 组成固定流程，再说明复杂任务为什么需要 Agent。",
  ]);
  const parser = new StringOutputParser();

  const titleChain = ChatPromptTemplate.fromMessages([
    ["system", "你是一个技术文章标题编辑，只返回一个中文标题。"],
    ["human", "请为主题“{topic}”生成一个简洁标题。"],
  ])
    .pipe(model)
    .pipe(parser);

  const summaryChain = ChatPromptTemplate.fromMessages([
    ["system", "你是一个技术文章摘要助手，只返回一段中文摘要。"],
    ["human", "主题：{topic}\n标题：{title}\n请生成 60 字以内摘要。"],
  ])
    .pipe(model)
    .pipe(parser);

  const chain = RunnableSequence.from<TopicInput, ArticleDraft>([
    RunnableLambda.from(async (input: TopicInput): Promise<TitleState> => ({
      topic: input.topic,
      title: await titleChain.invoke(input),
    })),
    RunnableLambda.from(async (state: TitleState): Promise<ArticleDraft> => ({
      ...state,
      summary: await summaryChain.invoke(state),
    })),
  ]);

  const input = { topic: "LangChain 固定流程 Chain" };
  const result = await chain.invoke(input);

  printMessage("topic", result.topic);
  printMessage("title", result.title);
  printMessage("summary", result.summary);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
