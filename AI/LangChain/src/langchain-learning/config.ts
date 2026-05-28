import "dotenv/config";

export interface Settings {
  provider: "mock" | "deepseek";
  model: string;
  temperature: number;
  deepseekApiKey?: string;
  deepseekBaseUrl: string;
}

export function getSettings(): Settings {
  const provider = (process.env.LANGCHAIN_DEMO_PROVIDER ?? "mock").trim().toLowerCase();

  if (provider !== "mock" && provider !== "deepseek") {
    throw new Error("Unsupported LANGCHAIN_DEMO_PROVIDER. Use 'mock' or 'deepseek'.");
  }

  return {
    provider,
    model: process.env.LANGCHAIN_DEMO_MODEL ?? "deepseek-v4-flash",
    temperature: Number(process.env.LANGCHAIN_DEMO_TEMPERATURE ?? "0"),
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
  };
}
