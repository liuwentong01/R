import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import path from "node:path";

import { printMessage, printTitle } from "../../src/langchain-learning/display.js";
import { createChatModel } from "../../src/langchain-learning/models.js";
import {
  SimpleVectorStore,
  formatDocumentsWithSources,
  formatSourceList,
  loadMarkdownFile,
  splitDocuments,
} from "../../src/langchain-learning/simple-rag.js";

async function main(): Promise<void> {
  printTitle("Stage 03 Demo 01 - single Markdown RAG");

  const filePath = path.resolve("examples/stage03_rag/sample_docs/rag-notes.md");
  const documents = await loadMarkdownFile(filePath);
  const chunks = splitDocuments(documents, { chunkSize: 140, chunkOverlap: 30 });
  const vectorStore = SimpleVectorStore.fromDocuments(chunks);
  const retriever = vectorStore.asRetriever(2);

  const question = "RAG 的在线链路是什么？";
  const relevantDocs = await retriever.invoke(question);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "你是严谨的知识库问答助手。只能基于上下文回答，并在末尾说明来源。"],
    ["human", "上下文：\n{context}\n\n问题：{question}"],
  ]);
  const model = createChatModel([
    "RAG 在线链路是：用户提问，Retriever 检索相关片段，Context Prompt 注入上下文，Chat Model 基于上下文回答，并返回来源。\n\n来源：rag-notes.md",
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
