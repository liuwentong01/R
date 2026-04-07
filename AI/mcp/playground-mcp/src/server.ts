import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Config } from './types.js';
import { ALL_TOOLS, HANDLER_MAP } from './tools/index.js';

const PLAYGROUND_RESOURCES = [
  {
    uri: 'playground://notes/mcp-core',
    name: 'MCP 核心概念速记',
    description: '一份适合面试回答的 MCP 核心概念摘要',
    mimeType: 'text/plain',
  },
  {
    uri: 'playground://notes/tool-design',
    name: 'Tool 设计检查清单',
    description: '设计 MCP Tool 时常见的输入、输出和安全检查点',
    mimeType: 'text/plain',
  },
];

const RESOURCE_CONTENT_MAP: Record<string, string> = {
  'playground://notes/mcp-core': [
    'MCP 面试速记',
    '',
    '1. Host 通过 tools/list 发现工具，再通过 tools/call 调用能力。',
    '2. stdio 适合本地集成，启动简单、稳定、便于调试。',
    '3. Tools 适合执行动作，Resources 适合只读数据，Prompts 适合模板化提示。',
    '4. 真正的工程重点通常不在协议本身，而在参数校验、权限边界和错误处理。',
  ].join('\n'),
  'playground://notes/tool-design': [
    'Tool 设计检查清单',
    '',
    '- description 是否清楚说明使用场景',
    '- inputSchema 是否避免歧义参数',
    '- 返回值是否既能给模型读，也方便人类排障',
    '- 是否限制副作用、访问范围和输出大小',
    '- 错误信息是否足够明确',
  ].join('\n'),
};

const PLAYGROUND_PROMPTS = [
  {
    name: 'mcp-interview-answer',
    description: '生成一段适合面试口述的 MCP 主题回答',
    arguments: [
      {
        name: 'topic',
        description: '主题，例如 tools、resources、stdio',
        required: true,
      },
      {
        name: 'level',
        description: '回答深度，例如 quick、deep',
        required: false,
      },
    ],
  },
];

/**
 * 创建 Playground MCP Server
 * 同时演示 tools、resources、prompts 三类能力的注册方式
 */
export function createServer(config: Config): Server {
  const server = new Server(
    {
      name: config.serverName,
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
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

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: PLAYGROUND_RESOURCES,
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const text = RESOURCE_CONTENT_MAP[uri];

    if (!text) {
      throw new Error(`未知资源: ${uri}`);
    }

    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text,
        },
      ],
    };
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: PLAYGROUND_PROMPTS,
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name !== 'mcp-interview-answer') {
      throw new Error(`未知 Prompt: ${request.params.name}`);
    }

    const topic =
      typeof request.params.arguments?.topic === 'string'
        ? request.params.arguments.topic
        : 'MCP';
    const level =
      typeof request.params.arguments?.level === 'string'
        ? request.params.arguments.level
        : 'quick';

    return {
      description: '根据主题生成一段适合面试表达的 MCP 回答提示词',
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `请用中文生成一段关于「${topic}」的 MCP 面试回答。`,
              `回答深度: ${level}`,
              '要求：',
              '1. 先给一句定义',
              '2. 再讲它解决什么问题',
              '3. 最后补一句工程实践中的风险控制',
            ].join('\n'),
          },
        },
      ],
    };
  });

  return server;
}
