import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Config } from './types.js';
import { ALL_TOOLS, HANDLER_MAP } from './tools/index.js';

/**
 * 创建 HTTP 调试 MCP Server
 * 展示外部 API 访问、allowlist 和响应裁剪等工程细节
 */
export function createServer(config: Config): Server {
  const server = new Server(
    {
      name: 'http-debug-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const name = request.params.name;
      const params = request.params.arguments;
      const handler = HANDLER_MAP[name];

      if (!name || !handler) {
        return {
          content: [{ type: 'text', text: `未知工具: ${name}` }],
          isError: true,
        };
      }

      return await handler(params, config);
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `工具执行失败: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}
