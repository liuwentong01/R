import { BaseMessage } from "@langchain/core/messages";

export function summarizeAgentMessages(messages: BaseMessage[]): string {
  return messages
    .map((message, index) => {
      const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content);
      const toolCalls = "tool_calls" in message && Array.isArray(message.tool_calls)
        ? ` tool_calls=${message.tool_calls.map((call) => call.name).join(",")}`
        : "";

      return `${index + 1}. ${message._getType()}${toolCalls}\n${content}`;
    })
    .join("\n\n");
}
