#!/usr/bin/env node

import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { Config } from './types.js';

function parseArgs(): Config {
  const args = process.argv.slice(2);
  let rootDir = '';
  let maxFileSizeBytes = 64 * 1024;
  let maxSearchResults = 20;
  let maxDirectoryEntries = 200;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--root':
        rootDir = args[++i] || '';
        break;
      case '--max-file-size-bytes':
        maxFileSizeBytes = Number(args[++i]) || maxFileSizeBytes;
        break;
      case '--max-search-results':
        maxSearchResults = Number(args[++i]) || maxSearchResults;
        break;
      case '--max-directory-entries':
        maxDirectoryEntries = Number(args[++i]) || maxDirectoryEntries;
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  if (!rootDir) {
    console.error(MISSING_CONFIG_MESSAGE);
    process.exit(1);
  }

  rootDir = path.resolve(rootDir);

  if (!existsSync(rootDir) || !statSync(rootDir).isDirectory()) {
    console.error(`❌ --root 指定的路径不存在或不是目录: ${rootDir}`);
    process.exit(1);
  }

  return {
    rootDir,
    maxFileSizeBytes,
    maxSearchResults,
    maxDirectoryEntries,
  };
}

function printHelp() {
  console.error(`
Safe Files MCP Server

用法:
  safe-files-mcp --root <DIRECTORY>

参数:
  --root                  允许访问的根目录（必填）
  --max-file-size-bytes   单文件最大读取字节数，默认 65536
  --max-search-results    搜索结果上限，默认 20
  --max-directory-entries 列目录返回上限，默认 200
  --help                  显示帮助信息

这个服务只支持白名单根目录下的只读文件操作，
专门用于演示 MCP 工具中的权限边界与安全控制。
`);
}

async function main() {
  const config = parseArgs();
  const transport = new StdioServerTransport();
  const server = createServer(config);
  await server.connect(transport);
  console.error(`Safe Files MCP Server running on stdio (root: ${config.rootDir})`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

const MISSING_CONFIG_MESSAGE = `请提供 --root 参数，例如：

  safe-files-mcp --root /absolute/path/to/your/project

在 Cursor 中配置：
{
  "mcpServers": {
    "safe-files": {
      "command": "node",
      "args": [
        "/path/to/safe-files-mcp/dist/index.js",
        "--root", "/absolute/path/to/allowed-directory"
      ]
    }
  }
}`;
