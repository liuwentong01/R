import { printMessage, printTitle } from "../../src/langchain-learning/display.js";
import { unstableApiTool } from "../../src/langchain-learning/demo-tools.js";

async function main(): Promise<void> {
  printTitle("Stage 04 Demo 04 - tool error handling");

  try {
    await unstableApiTool.invoke({
      shouldFail: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    printMessage("raw tool error", message);
    printMessage(
      "safe message for model",
      "工具 unstableApi 调用失败：外部服务超时。请不要编造结果，可以建议用户稍后重试或改用其他资料来源。",
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
