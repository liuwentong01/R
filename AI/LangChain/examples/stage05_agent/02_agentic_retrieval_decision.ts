import { FakeToolCallingModel, createAgent } from "langchain";
import path from "node:path";

import { summarizeAgentMessages } from "../../src/langchain-learning/agent-display.js";
import { printMessage, printTitle } from "../../src/langchain-learning/display.js";
import { createLocalDocSearchTool } from "../../src/langchain-learning/demo-tools.js";

async function main(): Promise<void> {
  printTitle("Stage 05 Demo 02 - agent decides to retrieve");

  const searchTool = await createLocalDocSearchTool(path.resolve("examples/stage03_rag/sample_docs"));
  const model = new FakeToolCallingModel({
    toolCalls: [
      [{ name: "searchLocalDocs", args: { query: "RAG 检索质量 Prompt 花活" }, id: "call_search" }],
      [],
    ],
  });

  const agent = createAgent({
    model,
    tools: [searchTool],
    systemPrompt:
      "如果用户问题需要本地学习文档才能可靠回答，就先调用 searchLocalDocs；如果不需要，就直接回答。",
  });

  const result = await agent.invoke({
    messages: [{ role: "user", content: "为什么 RAG 里检索质量比 Prompt 花活更重要？" }],
  });

  printMessage("agent messages", summarizeAgentMessages(result.messages));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
