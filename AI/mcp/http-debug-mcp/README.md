# HTTP Debug MCP Server

一个适合面试展示的 HTTP 调试 MCP 服务。

它的重点不是“帮你代理所有网络请求”，而是展示一个真实可用的外部 API 类 MCP 插件该怎么做边界控制。

## 功能

| 工具 | 说明 |
| --- | --- |
| `http_get` | 发起 GET 请求，返回状态码、响应头和内容预览 |
| `http_post_json` | 发起 JSON POST 请求 |
| `inspect_response_headers` | 优先用 HEAD 检查响应头，不支持时自动回退 GET |

## 安全设计

这个服务默认内建了 4 个限制：

1. 必须通过 `--allow-hosts` 配置主机白名单
2. 只允许访问 `http` / `https`
3. 所有请求都带超时限制
4. 响应内容只返回预览，不直接无限透传

## 快速开始

```bash
cd AI/mcp/http-debug-mcp
npm install
npm run build
```

直接运行：

```bash
node dist/index.js --allow-hosts api.github.com,httpbin.org
```

## 在 Cursor 中配置

```json
{
  "mcpServers": {
    "http-debug": {
      "command": "node",
      "args": [
        "/absolute/path/to/AI/mcp/http-debug-mcp/dist/index.js",
        "--allow-hosts", "api.github.com,httpbin.org"
      ]
    }
  }
}
```

## 面试时怎么讲

这个服务特别适合回答下面几类追问：

1. 为什么要做 host allowlist，而不是让模型任意发请求
2. 为什么要限制超时和响应大小
3. 为什么返回结构化摘要，而不是把整个响应原样塞给模型

## 目录结构

```text
src/
├── index.ts
├── server.ts
├── types.ts
└── tools/
    └── index.ts
```
