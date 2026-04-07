import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** HTTP 调试服务配置 */
export interface Config {
  /** 允许访问的主机名白名单 */
  allowedHosts: string[];
  /** 请求超时时间 */
  timeoutMs: number;
  /** 响应预览最大字符数 */
  maxResponseChars: number;
  /** 自定义 User-Agent */
  userAgent: string;
}

/** 工具处理函数签名 */
export type ToolHandler = (
  params: any,
  config: Config,
) => Promise<CallToolResult>;

/** 工具名到处理函数的映射 */
export type HandlerMap = Record<string, ToolHandler>;
