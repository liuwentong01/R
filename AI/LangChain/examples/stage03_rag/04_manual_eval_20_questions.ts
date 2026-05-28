import path from "node:path";

import { printMessage, printTitle } from "../../src/langchain-learning/display.js";
import {
  SimpleVectorStore,
  loadMarkdownDirectory,
  splitDocuments,
} from "../../src/langchain-learning/simple-rag.js";

const evalQuestions = [
  { question: "LangChain 是什么？", expectedSource: "langchain-intro.md" },
  { question: "入门 LangChain 应该先学什么？", expectedSource: "langchain-intro.md" },
  { question: "Chat Model 为什么适合多轮对话？", expectedSource: "langchain-intro.md" },
  { question: "Runnable 是什么？", expectedSource: "runnable-lcel.md" },
  { question: "LCEL 管道如何理解？", expectedSource: "runnable-lcel.md" },
  { question: "固定流程 Chain 什么时候合适？", expectedSource: "runnable-lcel.md" },
  { question: "RAG 离线链路有哪些步骤？", expectedSource: "rag-notes.md" },
  { question: "RAG 在线链路有哪些步骤？", expectedSource: "rag-notes.md" },
  { question: "为什么检索质量比 Prompt 更关键？", expectedSource: "rag-notes.md" },
  { question: "检索到错误资料会发生什么？", expectedSource: "rag-notes.md" },
  { question: "Tool 可以代表哪些外部能力？", expectedSource: "tools-agent.md" },
  { question: "工具名称和描述为什么重要？", expectedSource: "tools-agent.md" },
  { question: "工具结果应该如何设计？", expectedSource: "tools-agent.md" },
  { question: "Agent 是什么？", expectedSource: "tools-agent.md" },
  { question: "Agent 会如何使用工具？", expectedSource: "tools-agent.md" },
  { question: "Parser 在 Chain 中负责什么？", expectedSource: "runnable-lcel.md" },
  { question: "Retriever 在 RAG 中负责什么？", expectedSource: "rag-notes.md" },
  { question: "Vector Store 在 RAG 中负责什么？", expectedSource: "rag-notes.md" },
  { question: "什么时候从 Chain 进入 Agent？", expectedSource: "runnable-lcel.md" },
  { question: "工具原始 JSON 应该直接返回给模型吗？", expectedSource: "tools-agent.md" },
];

async function main(): Promise<void> {
  printTitle("Stage 03 Demo 04 - manual eval with 20 questions");

  const directoryPath = path.resolve("examples/stage03_rag/sample_docs");
  const documents = await loadMarkdownDirectory(directoryPath);
  const chunks = splitDocuments(documents, { chunkSize: 180, chunkOverlap: 40 });
  const vectorStore = SimpleVectorStore.fromDocuments(chunks);

  const results = evalQuestions.map((item) => {
    const retrieved = vectorStore.similaritySearchWithScore(item.question, 3);
    const sources = retrieved.map((result) => String(result.document.metadata.source));
    const hit = sources.includes(item.expectedSource);

    return {
      ...item,
      hit,
      sources,
    };
  });

  const hitCount = results.filter((result) => result.hit).length;
  const report = results
    .map(
      (result, index) =>
        `${index + 1}. ${result.hit ? "PASS" : "FAIL"} expected=${result.expectedSource} got=${result.sources.join(", ")}\n   Q: ${result.question}`,
    )
    .join("\n");

  printMessage("hit@3", `${hitCount}/${results.length}`);
  printMessage("details", report);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
