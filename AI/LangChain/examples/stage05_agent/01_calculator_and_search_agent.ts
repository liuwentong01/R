import { FakeToolCallingModel, createAgent } from "langchain";
import path from "node:path";

import { summarizeAgentMessages } from "../../src/langchain-learning/agent-display.js";
import { printMessage, printTitle } from "../../src/langchain-learning/display.js";
import { calculatorTool, createLocalDocSearchTool } from "../../src/langchain-learning/demo-tools.js";

async function main(): Promise<void> {
  printTitle("Stage 05 Demo 01 - calculator and search agent");

  const searchTool = await createLocalDocSearchTool(path.resolve("examples/stage03_rag/sample_docs"));
  const model = new FakeToolCallingModel({
    toolCalls: [
      [{ name: "calculator", args: { operation: "multiply", a: 6, b: 7 }, id: "call_calculator" }],
      [{ name: "searchLocalDocs", args: { query: "LCEL 固定流程" }, id: "call_search" }],
      [],
    ],
  });

  const agent = createAgent({
    model,
    tools: [calculatorTool, searchTool],
    systemPrompt: "你是 LangChain 学习助手。需要时调用工具，然后基于工具结果回答。",
  });

  const result = await agent.invoke({
    messages: [{ role: "user", content: "先算 6*7，再查一下 LCEL 固定流程是什么。" }],
  });

  printMessage("agent messages", summarizeAgentMessages(result.messages));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
