import path from "node:path";

import { printMessage, printTitle } from "../../src/langchain-learning/display.js";
import {
  SimpleVectorStore,
  loadMarkdownDirectory,
  splitDocuments,
} from "../../src/langchain-learning/simple-rag.js";

function preview(text: string): string {
  return text.replace(/\s+/g, " ").slice(0, 120);
}

async function main(): Promise<void> {
  printTitle("Stage 03 Demo 03 - chunk size comparison");

  const directoryPath = path.resolve("examples/stage03_rag/sample_docs");
  const documents = await loadMarkdownDirectory(directoryPath);
  const question = "为什么检索质量比 Prompt 花活更重要？";

  const smallChunks = splitDocuments(documents, { chunkSize: 80, chunkOverlap: 20 });
  const largeChunks = splitDocuments(documents, { chunkSize: 220, chunkOverlap: 50 });

  const smallResults = SimpleVectorStore.fromDocuments(smallChunks).similaritySearchWithScore(question, 3);
  const largeResults = SimpleVectorStore.fromDocuments(largeChunks).similaritySearchWithScore(question, 3);

  printMessage("question", question);
  printMessage(
    "small chunks",
    smallResults
      .map(
        (result, index) =>
          `${index + 1}. score=${result.score.toFixed(3)} source=${result.document.metadata.source}\n${preview(result.document.pageContent)}`,
      )
      .join("\n\n"),
  );
  printMessage(
    "large chunks",
    largeResults
      .map(
        (result, index) =>
          `${index + 1}. score=${result.score.toFixed(3)} source=${result.document.metadata.source}\n${preview(result.document.pageContent)}`,
      )
      .join("\n\n"),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
