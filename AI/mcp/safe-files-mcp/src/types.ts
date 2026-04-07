import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** safe-files 服务运行时配置 */
export interface Config {
  /** 允许访问的根目录 */
  rootDir: string;
  /** 单文件最大读取字节数 */
  maxFileSizeBytes: number;
  /** 搜索结果上限 */
  maxSearchResults: number;
  /** 列目录时最多返回的条目数 */
  maxDirectoryEntries: number;
}

/** 工具处理函数签名 */
export type ToolHandler = (
  params: any,
  config: Config,
) => Promise<CallToolResult>;

/** 工具名到处理函数的映射 */
export type HandlerMap = Record<string, ToolHandler>;
