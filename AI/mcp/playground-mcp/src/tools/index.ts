import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Config, HandlerMap } from '../types.js';

interface EchoParams {
  message?: string;
}

interface SumNumbersParams {
  numbers?: number[];
}

interface ExplainJsonSchemaParams {
  schemaText?: string;
}

export const ECHO_TOOL = {
  name: 'echo',
  description: '回显输入内容，适合演示最基础的 MCP tools/call 调用链路。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      message: {
        type: 'string',
        description: '要回显的字符串内容',
      },
    },
    required: ['message'],
  },
};

export const SUM_NUMBERS_TOOL = {
  name: 'sum_numbers',
  description: '对数字数组做聚合计算，演示参数校验与结构化返回。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      numbers: {
        type: 'array',
        description: '要计算的数字数组',
        items: {
          type: 'number',
        },
      },
    },
    required: ['numbers'],
  },
};

export const EXPLAIN_JSON_SCHEMA_TOOL = {
  name: 'explain_json_schema',
  description: '解析 JSON Schema 字符串并生成人类可读说明，适合面试时讲 schema 设计。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      schemaText: {
        type: 'string',
        description: 'JSON Schema 的 JSON 字符串',
      },
    },
    required: ['schemaText'],
  },
};

export const ALL_TOOLS = [
  ECHO_TOOL,
  SUM_NUMBERS_TOOL,
  EXPLAIN_JSON_SCHEMA_TOOL,
];

export const HANDLER_MAP: HandlerMap = {
  [ECHO_TOOL.name]: handleEcho,
  [SUM_NUMBERS_TOOL.name]: handleSumNumbers,
  [EXPLAIN_JSON_SCHEMA_TOOL.name]: handleExplainJsonSchema,
};

async function handleEcho(
  params: EchoParams,
  config: Config,
): Promise<CallToolResult> {
  const message = params.message?.trim();

  if (!message) {
    return buildError('参数 message 不能为空');
  }

  return {
    content: [
      {
        type: 'text',
        text: [
          `server: ${config.serverName}`,
          `message: ${message}`,
          `length: ${message.length}`,
        ].join('\n'),
      },
    ],
    isError: false,
  };
}

async function handleSumNumbers(
  params: SumNumbersParams,
): Promise<CallToolResult> {
  const numbers = params.numbers;

  if (!Array.isArray(numbers) || numbers.length === 0) {
    return buildError('参数 numbers 必须是非空数字数组');
  }

  if (!numbers.every((item) => Number.isFinite(item))) {
    return buildError('numbers 中只能包含有限数字');
  }

  const sum = numbers.reduce((total, value) => total + value, 0);
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const average = sum / numbers.length;

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            count: numbers.length,
            sum,
            min,
            max,
            average,
          },
          null,
          2,
        ),
      },
    ],
    isError: false,
  };
}

async function handleExplainJsonSchema(
  params: ExplainJsonSchemaParams,
): Promise<CallToolResult> {
  if (!params.schemaText?.trim()) {
    return buildError('参数 schemaText 不能为空');
  }

  let schema: Record<string, unknown>;

  try {
    schema = JSON.parse(params.schemaText) as Record<string, unknown>;
  } catch (error) {
    return buildError(
      `schemaText 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const topLevelType = typeof schema.type === 'string' ? schema.type : '未声明';
  const requiredFields = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === 'string')
    : [];
  const properties =
    schema.properties && typeof schema.properties === 'object'
      ? (schema.properties as Record<string, Record<string, unknown>>)
      : {};

  const propertyLines = Object.entries(properties).map(([name, value]) => {
    const type = typeof value.type === 'string' ? value.type : '未声明';
    const description =
      typeof value.description === 'string' ? value.description : '无说明';
    const requiredTag = requiredFields.includes(name) ? '必填' : '可选';

    return `- ${name}: ${type}，${requiredTag}，${description}`;
  });

  const output = [
    `顶层类型: ${topLevelType}`,
    `必填字段: ${requiredFields.length > 0 ? requiredFields.join(', ') : '无'}`,
    '字段说明:',
    propertyLines.length > 0 ? propertyLines.join('\n') : '- 当前 schema 未声明 properties',
  ].join('\n');

  return {
    content: [{ type: 'text', text: output }],
    isError: false,
  };
}

function buildError(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}
