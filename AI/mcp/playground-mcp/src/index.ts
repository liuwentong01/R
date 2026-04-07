#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { Config } from './types.js';

function parseArgs(): Config {
  const args = process.argv.slice(2);
  let serverName = 'playground-mcp-server';

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--server-name':
        serverName = args[++i] || serverName;
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  return {
    serverName,
  };
}

function printHelp() {
  console.error(`
Playground MCP Server

用法:
  playground-mcp
  playground-mcp --server-name demo-playground

参数:
  --server-name   自定义服务名，默认 playground-mcp-server
  --help          显示帮助信息

这个服务专门用于学习和演示 MCP 的三类核心能力：
  1. Tools
  2. Resources
  3. Prompts
`);
}

async function main() {
  const config = parseArgs();
  const transport = new StdioServerTransport();
  const server = createServer(config);
  await server.connect(transport);
  console.error(`Playground MCP Server running on stdio (${config.serverName})`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
