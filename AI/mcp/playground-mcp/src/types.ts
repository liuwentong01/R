import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Playground 服务的运行配置 */
export interface Config {
  /** 对外展示的服务名，便于演示不同实例 */
  serverName: string;
}

/** 工具处理函数签名 */
export type ToolHandler = (
  params: any,
  config: Config,
) => Promise<CallToolResult>;

/** 工具名到处理函数的映射 */
export type HandlerMap = Record<string, ToolHandler>;
