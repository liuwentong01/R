import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Config, HandlerMap } from '../types.js';

interface HttpGetParams {
  url?: string;
  headers?: Record<string, string>;
}

interface HttpPostJsonParams {
  url?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

interface InspectResponseHeadersParams {
  url?: string;
  method?: 'HEAD' | 'GET';
  headers?: Record<string, string>;
}

export const HTTP_GET_TOOL = {
  name: 'http_get',
  description: '发起受 allowlist 限制的 GET 请求，返回状态码、响应头和预览内容。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: '完整请求 URL',
      },
      headers: {
        type: 'object',
        description: '可选请求头，值必须是字符串',
        additionalProperties: {
          type: 'string',
        },
      },
    },
    required: ['url'],
  },
};

export const HTTP_POST_JSON_TOOL = {
  name: 'http_post_json',
  description: '发起受 allowlist 限制的 JSON POST 请求，适合演示外部 API 调用插件。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: '完整请求 URL',
      },
      body: {
        description: '要发送的 JSON 数据',
      },
      headers: {
        type: 'object',
        description: '额外请求头，值必须是字符串',
        additionalProperties: {
          type: 'string',
        },
      },
    },
    required: ['url'],
  },
};

export const INSPECT_RESPONSE_HEADERS_TOOL = {
  name: 'inspect_response_headers',
  description: '优先用 HEAD 请求检查响应头，不支持 HEAD 时自动回退 GET。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: '完整请求 URL',
      },
      method: {
        type: 'string',
        description: '请求方法，支持 HEAD 或 GET，默认 HEAD',
        enum: ['HEAD', 'GET'],
      },
      headers: {
        type: 'object',
        description: '可选请求头，值必须是字符串',
        additionalProperties: {
          type: 'string',
        },
      },
    },
    required: ['url'],
  },
};

export const ALL_TOOLS = [
  HTTP_GET_TOOL,
  HTTP_POST_JSON_TOOL,
  INSPECT_RESPONSE_HEADERS_TOOL,
];

export const HANDLER_MAP: HandlerMap = {
  [HTTP_GET_TOOL.name]: handleHttpGet,
  [HTTP_POST_JSON_TOOL.name]: handleHttpPostJson,
  [INSPECT_RESPONSE_HEADERS_TOOL.name]: handleInspectResponseHeaders,
};

async function handleHttpGet(
  params: HttpGetParams,
  config: Config,
): Promise<CallToolResult> {
  try {
    const url = validateUrl(params.url, config.allowedHosts);
    const headers = normalizeHeaders(params.headers);

    const response = await sendRequest(
      {
        method: 'GET',
        url,
        headers,
      },
      config,
    );

    return buildSuccess(formatResponse(response, config, 'GET'));
  } catch (error) {
    return buildError(formatError(error));
  }
}

async function handleHttpPostJson(
  params: HttpPostJsonParams,
  config: Config,
): Promise<CallToolResult> {
  try {
    const url = validateUrl(params.url, config.allowedHosts);
    const headers = {
      'content-type': 'application/json',
      ...normalizeHeaders(params.headers),
    };

    const response = await sendRequest(
      {
        method: 'POST',
        url,
        headers,
        data: params.body ?? {},
      },
      config,
    );

    return buildSuccess(formatResponse(response, config, 'POST'));
  } catch (error) {
    return buildError(formatError(error));
  }
}

async function handleInspectResponseHeaders(
  params: InspectResponseHeadersParams,
  config: Config,
): Promise<CallToolResult> {
  try {
    const url = validateUrl(params.url, config.allowedHosts);
    const headers = normalizeHeaders(params.headers);
    const preferredMethod = params.method ?? 'HEAD';

    let response = await sendRequest(
      {
        method: preferredMethod,
        url,
        headers,
      },
      config,
    );
    let actualMethod = preferredMethod;

    if (
      preferredMethod === 'HEAD' &&
      [405, 501].includes(response.status)
    ) {
      response = await sendRequest(
        {
          method: 'GET',
          url,
          headers,
        },
        config,
      );
      actualMethod = 'GET';
    }

    return buildSuccess(
      JSON.stringify(
        {
          requestedMethod: preferredMethod,
          actualMethod,
          url,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    return buildError(formatError(error));
  }
}

async function sendRequest(
  request: AxiosRequestConfig,
  config: Config,
): Promise<AxiosResponse<string>> {
  return axios.request<string>({
    ...request,
    responseType: 'text',
    timeout: config.timeoutMs,
    validateStatus: () => true,
    headers: {
      'user-agent': config.userAgent,
      ...request.headers,
    },
  });
}

function validateUrl(urlValue: string | undefined, allowedHosts: string[]): string {
  if (!urlValue?.trim()) {
    throw new Error('url 不能为空');
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(urlValue);
  } catch (error) {
    throw new Error(
      `url 不是合法地址：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`仅支持 http/https，当前协议为 ${parsedUrl.protocol}`);
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const isAllowed = allowedHosts.some((host) => matchAllowedHost(hostname, host));

  if (!isAllowed) {
    throw new Error(
      `目标主机 ${hostname} 不在 allowlist 中，当前允许: ${allowedHosts.join(', ')}`,
    );
  }

  return parsedUrl.toString();
}

function matchAllowedHost(hostname: string, allowedHost: string): boolean {
  const normalizedAllowedHost = allowedHost.toLowerCase().trim();

  if (!normalizedAllowedHost) {
    return false;
  }

  if (normalizedAllowedHost.startsWith('*.')) {
    const suffix = normalizedAllowedHost.slice(2);
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  }

  return hostname === normalizedAllowedHost;
}

function normalizeHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  if (!headers) {
    return {};
  }

  const normalizedHeaders: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== 'string') {
      throw new Error(`请求头 ${key} 的值必须是字符串`);
    }
    normalizedHeaders[key] = value;
  }

  return normalizedHeaders;
}

function formatResponse(
  response: AxiosResponse<string>,
  config: Config,
  method: string,
): string {
  const preview = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  const truncated =
    preview.length > config.maxResponseChars
      ? `${preview.slice(0, config.maxResponseChars)}\n...<truncated>`
      : preview;

  return JSON.stringify(
    {
      method,
      url: response.config.url,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      preview: truncated,
      previewLength: truncated.length,
    },
    null,
    2,
  );
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function buildSuccess(text: string): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    isError: false,
  };
}

function buildError(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}
