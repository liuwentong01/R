import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Config } from './types.js';
import { ALL_TOOLS, HANDLER_MAP } from './tools/index.js';

/**
 * 创建只读文件访问 MCP Server
 * 重点展示路径白名单、错误处理和返回结果截断
 */
export function createServer(config: Config): Server {
  const server = new Server(
    {
      name: 'safe-files-mcp-server',
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
