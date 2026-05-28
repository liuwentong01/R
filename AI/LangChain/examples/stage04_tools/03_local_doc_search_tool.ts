import path from "node:path";

import { printMessage, printTitle } from "../../src/langchain-learning/display.js";
import { createLocalDocSearchTool } from "../../src/langchain-learning/demo-tools.js";

async function main(): Promise<void> {
  printTitle("Stage 04 Demo 03 - local document search tool");

  const tool = await createLocalDocSearchTool(path.resolve("examples/stage03_rag/sample_docs"));
  const result = await tool.invoke({
    query: "Runnable 和 LCEL 是什么？",
  });

  printMessage("tool name", tool.name);
  printMessage("tool description", tool.description);
  printMessage("tool result", String(result));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
