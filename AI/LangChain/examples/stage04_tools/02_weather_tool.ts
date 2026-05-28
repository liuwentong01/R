import { printMessage, printTitle } from "../../src/langchain-learning/display.js";
import { weatherTool } from "../../src/langchain-learning/demo-tools.js";

async function main(): Promise<void> {
  printTitle("Stage 04 Demo 02 - weather mock tool");

  const result = await weatherTool.invoke({
    city: "上海",
  });

  printMessage("tool name", weatherTool.name);
  printMessage("schema purpose", "参数 schema 让模型知道必须提供 city 字段。");
  printMessage("tool result", String(result));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
