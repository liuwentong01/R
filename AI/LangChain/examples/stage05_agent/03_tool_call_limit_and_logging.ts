import { ToolMessage } from "@langchain/core/messages";
import { FakeToolCallingModel, createAgent, createMiddleware, toolCallLimitMiddleware } from "langchain";
import path from "node:path";

import { summarizeAgentMessages } from "../../src/langchain-learning/agent-display.js";
import { printMessage, printTitle } from "../../src/langchain-learning/display.js";
import { calculatorTool, createLocalDocSearchTool } from "../../src/langchain-learning/demo-tools.js";

async function main(): Promise<void> {
  printTitle("Stage 05 Demo 03 - tool call limit and logging");

  const logs: string[] = [];
  const searchTool = await createLocalDocSearchTool(path.resolve("examples/stage03_rag/sample_docs"));
  const model = new FakeToolCallingModel({
    toolCalls: [
      [{ name: "calculator", args: { operation: "add", a: 10, b: 5 }, id: "call_calculator" }],
      [{ name: "searchLocalDocs", args: { query: "Agent 工具调用" }, id: "call_search" }],
      [],
    ],
  });

  const loggingMiddleware = createMiddleware({
    name: "ToolLoggingMiddleware",
    wrapToolCall: async (request, handler) => {
      const toolName = request.tool?.name ?? request.toolCall.name;
      logs.push(`before ${toolName}`);
      try {
        const result = await handler(request);
        logs.push(`after ${toolName}`);
        return result;
      } catch (error) {
        logs.push(`error ${toolName}: ${error instanceof Error ? error.message : String(error)}`);
        return new ToolMessage({
          content: `工具 ${toolName} 调用失败，已记录日志。`,
          tool_call_id: request.toolCall.id ?? `failed_${toolName}`,
        });
      }
    },
  });

  const agent = createAgent({
    model,
    tools: [calculatorTool, searchTool],
    middleware: [
      loggingMiddleware,
      toolCallLimitMiddleware({ runLimit: 1, exitBehavior: "continue" }),
    ],
    systemPrompt: "你是带工具调用上限的学习助手。",
  });

  const result = await agent.invoke({
    messages: [{ role: "user", content: "先计算 10+5，再搜索 Agent 工具调用。" }],
  });

  printMessage("tool logs", logs.join("\n"));
  printMessage("agent messages", summarizeAgentMessages(result.messages));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
