import { FakeToolCallingModel, createAgent } from "langchain";

import { summarizeAgentMessages } from "../../src/langchain-learning/agent-display.js";
import { printMessage, printTitle } from "../../src/langchain-learning/display.js";
import { deleteDemoFileTool } from "../../src/langchain-learning/demo-tools.js";

async function main(): Promise<void> {
  printTitle("Stage 05 Demo 04 - high risk confirmation");

  const model = new FakeToolCallingModel({
    toolCalls: [
      [{ name: "deleteDemoFile", args: { fileName: "important.md", confirm: false }, id: "call_delete" }],
      [],
    ],
  });

  const agent = createAgent({
    model,
    tools: [deleteDemoFileTool],
    systemPrompt:
      "你是安全优先的文件助手。删除类高风险操作必须先确认；没有 confirm=true 时，工具只能拒绝执行。",
  });

  const result = await agent.invoke({
    messages: [{ role: "user", content: "帮我删除 important.md。" }],
  });

  printMessage("agent messages", summarizeAgentMessages(result.messages));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
