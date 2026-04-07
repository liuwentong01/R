#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { Config } from './types.js';

function parseArgs(): Config {
  const args = process.argv.slice(2);
  let allowHosts = '';
  let timeoutMs = 10_000;
  let maxResponseChars = 4_000;
  let userAgent = 'http-debug-mcp/1.0';

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--allow-hosts':
        allowHosts = args[++i] || '';
        break;
      case '--timeout-ms':
        timeoutMs = Number(args[++i]) || timeoutMs;
        break;
      case '--max-response-chars':
        maxResponseChars = Number(args[++i]) || maxResponseChars;
        break;
      case '--user-agent':
        userAgent = args[++i] || userAgent;
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  const allowedHosts = allowHosts
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (allowedHosts.length === 0) {
    console.error(MISSING_CONFIG_MESSAGE);
    process.exit(1);
  }

  return {
    allowedHosts,
    timeoutMs,
    maxResponseChars,
    userAgent,
  };
}

function printHelp() {
  console.error(`
HTTP Debug MCP Server

用法:
  http-debug-mcp --allow-hosts api.github.com,httpbin.org

参数:
  --allow-hosts        允许访问的主机名列表，逗号分隔（必填）
  --timeout-ms         请求超时时间，默认 10000
  --max-response-chars 响应预览最大字符数，默认 4000
  --user-agent         自定义 User-Agent
  --help               显示帮助信息

支持精确主机名和通配前缀，例如：
  --allow-hosts api.github.com,*.example.com
`);
}

async function main() {
  const config = parseArgs();
  const transport = new StdioServerTransport();
  const server = createServer(config);
  await server.connect(transport);
  console.error(
    `HTTP Debug MCP Server running on stdio (hosts: ${config.allowedHosts.join(', ')})`,
  );
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

const MISSING_CONFIG_MESSAGE = `请提供 --allow-hosts 参数，例如：

  http-debug-mcp --allow-hosts api.github.com,httpbin.org

在 Cursor 中配置：
{
  "mcpServers": {
    "http-debug": {
      "command": "node",
      "args": [
        "/path/to/http-debug-mcp/dist/index.js",
        "--allow-hosts", "api.github.com,httpbin.org"
      ]
    }
  }
}`;
