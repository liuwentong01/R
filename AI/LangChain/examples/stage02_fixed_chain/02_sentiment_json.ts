import { JsonOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";

import { printMessage, printTitle } from "../../src/langchain-learning/display.js";
import { createChatModel } from "../../src/langchain-learning/models.js";

interface SentimentResult {
  sentiment: "positive" | "negative" | "neutral";
  confidence: number;
  reason: string;
}

async function main(): Promise<void> {
  printTitle("Stage 02 Demo 02 - sentiment to JSON");

  const model = createChatModel([
    JSON.stringify({
      sentiment: "positive",
      confidence: 0.92,
      reason: "文本表达了对 LangChain 固定流程的认可，并且语气积极。",
    }),
  ]);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "你是一个情绪分析器。只返回 JSON，不要输出 Markdown。"],
    [
      "human",
      "请判断下面文本的情绪，字段为 sentiment、confidence、reason。\n\n文本：{text}",
    ],
  ]);
  const parser = new JsonOutputParser<SentimentResult>();

  const chain = prompt.pipe(model).pipe(parser);

  const text = "这个固定流程 Chain 很清楚，适合我先理解 Runnable 和 LCEL。";
  const result = await chain.invoke({ text });

  printMessage("input", text);
  printMessage("json", JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
