import { tool } from "langchain";
import { z } from "zod";

import {
  SimpleVectorStore,
  formatSourceList,
  loadMarkdownDirectory,
  splitDocuments,
} from "./simple-rag.js";

export const calculatorTool = tool(
  ({ operation, a, b }) => {
    const result = calculate(operation, a, b);
    return `计算结果：${a} ${operation} ${b} = ${result}`;
  },
  {
    name: "calculator",
    description: "当需要进行加、减、乘、除等确定性数学计算时使用。",
    schema: z.object({
      operation: z.enum(["add", "subtract", "multiply", "divide"]).describe("计算类型"),
      a: z.number().describe("第一个数字"),
      b: z.number().describe("第二个数字"),
    }),
  },
);

export const weatherTool = tool(
  ({ city }) => {
    const weatherByCity: Record<string, string> = {
      北京: "北京今天晴，20 到 28 摄氏度，适合通勤。",
      上海: "上海今天多云，22 到 29 摄氏度，午后可能有小雨。",
      深圳: "深圳今天阵雨，25 到 31 摄氏度，建议带伞。",
    };

    return weatherByCity[city] ?? `${city} 暂无 mock 天气数据。`;
  },
  {
    name: "getWeather",
    description: "当用户询问某个城市的天气时使用。输入必须是中文城市名。",
    schema: z.object({
      city: z.string().describe("城市名，例如 北京、上海、深圳"),
    }),
  },
);

export async function createLocalDocSearchTool(directoryPath: string) {
  const documents = await loadMarkdownDirectory(directoryPath);
  const chunks = splitDocuments(documents, { chunkSize: 180, chunkOverlap: 40 });
  const vectorStore = SimpleVectorStore.fromDocuments(chunks);

  return tool(
    ({ query }) => {
      const results = vectorStore.similaritySearchWithScore(query, 3);
      const docs = results.map((result) => result.document);

      return [
        `检索问题：${query}`,
        `来源：\n${formatSourceList(docs)}`,
        "摘要：",
        ...results.map(
          (result, index) =>
            `${index + 1}. score=${result.score.toFixed(3)} ${result.document.pageContent.replace(/\s+/g, " ").slice(0, 100)}`,
        ),
      ].join("\n");
    },
    {
      name: "searchLocalDocs",
      description: "当需要查询本地 LangChain 学习文档、RAG、Runnable、Tool 或 Agent 概念时使用。",
      schema: z.object({
        query: z.string().describe("要检索的具体问题"),
      }),
    },
  );
}

export const unstableApiTool = tool(
  ({ shouldFail }) => {
    if (shouldFail) {
      throw new Error("模拟外部 API 超时");
    }

    return "外部 API 调用成功：返回精简后的业务摘要。";
  },
  {
    name: "unstableApi",
    description: "演示工具错误处理。shouldFail=true 时会模拟外部 API 失败。",
    schema: z.object({
      shouldFail: z.boolean().describe("是否模拟失败"),
    }),
  },
);

export const deleteDemoFileTool = tool(
  ({ fileName, confirm }) => {
    if (!confirm) {
      return `已拒绝删除 ${fileName}：高风险操作必须显式 confirm=true。`;
    }

    return `模拟删除 ${fileName} 成功。注意：demo 不会真实删除文件。`;
  },
  {
    name: "deleteDemoFile",
    description: "高风险删除工具。只有用户明确确认时才能执行，demo 不会真实删除文件。",
    schema: z.object({
      fileName: z.string().describe("要删除的文件名"),
      confirm: z.boolean().describe("用户是否已明确确认删除"),
    }),
  },
);

function calculate(operation: "add" | "subtract" | "multiply" | "divide", a: number, b: number): number {
  if (operation === "add") {
    return a + b;
  }
  if (operation === "subtract") {
    return a - b;
  }
  if (operation === "multiply") {
    return a * b;
  }
  if (b === 0) {
    throw new Error("除数不能为 0");
  }
  return a / b;
}
