import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import path from "node:path";

import { printMessage, printTitle } from "../../src/langchain-learning/display.js";
import { createChatModel } from "../../src/langchain-learning/models.js";
import {
  SimpleVectorStore,
  formatDocumentsWithSources,
  formatSourceList,
  loadMarkdownDirectory,
  splitDocuments,
} from "../../src/langchain-learning/simple-rag.js";

async function main(): Promise<void> {
  printTitle("Stage 03 Demo 02 - directory RAG with sources");

  const directoryPath = path.resolve("examples/stage03_rag/sample_docs");
  const documents = await loadMarkdownDirectory(directoryPath);
  const chunks = splitDocuments(documents, { chunkSize: 160, chunkOverlap: 40 });
  const vectorStore = SimpleVectorStore.fromDocuments(chunks);
  const retriever = vectorStore.asRetriever(3);

  const question = "工具描述为什么重要？";
  const relevantDocs = await retriever.invoke(question);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "你是知识库问答助手。回答必须基于上下文，并列出来源文件。"],
    ["human", "上下文：\n{context}\n\n问题：{question}"],
  ]);
  const model = createChatModel([
    "工具名称、描述和参数 schema 会影响模型是否能正确选择工具。描述越清晰，模型越容易判断什么时候调用哪个工具。\n\n来源：tools-agent.md",
  ]);
  const chain = prompt.pipe(model).pipe(new StringOutputParser());
  const answer = await chain.invoke({
    context: formatDocumentsWithSources(relevantDocs),
    question,
  });

  printMessage("question", question);
  printMessage("retrieved sources", formatSourceList(relevantDocs));
  printMessage("answer", answer);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
