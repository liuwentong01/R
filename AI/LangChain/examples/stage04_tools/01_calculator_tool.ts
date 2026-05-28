import { printMessage, printTitle } from "../../src/langchain-learning/display.js";
import { calculatorTool } from "../../src/langchain-learning/demo-tools.js";

async function main(): Promise<void> {
  printTitle("Stage 04 Demo 01 - calculator tool");

  const result = await calculatorTool.invoke({
    operation: "multiply",
    a: 6,
    b: 7,
  });

  printMessage("tool name", calculatorTool.name);
  printMessage("tool description", calculatorTool.description);
  printMessage("tool result", String(result));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
