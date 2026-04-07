# Playground MCP Server

一个专门拿来学习和面试演示的 MCP Server。

它的目标不是接真实业务，而是把 MCP 最核心的三类能力一次讲清楚：

- `Tools`: 让模型执行动作
- `Resources`: 让客户端读取只读上下文
- `Prompts`: 提供可复用的提示模板

## 功能

### Tools

| 工具 | 说明 |
| --- | --- |
| `echo` | 回显输入内容，适合演示最小调用链路 |
| `sum_numbers` | 对数字数组做聚合计算，演示参数校验和结构化输出 |
| `explain_json_schema` | 解析 JSON Schema 字符串，输出人类可读说明 |

### Resources

| 资源 URI | 说明 |
| --- | --- |
| `playground://notes/mcp-core` | MCP 核心概念速记 |
| `playground://notes/tool-design` | Tool 设计检查清单 |

### Prompts

| Prompt | 说明 |
| --- | --- |
| `mcp-interview-answer` | 生成一段适合面试口述的 MCP 主题回答 |

## 快速开始

```bash
cd AI/mcp/playground-mcp
npm install
npm run build
```

直接运行：

```bash
node dist/index.js
```

## 在 Cursor 中配置

编辑 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "playground": {
      "command": "node",
      "args": [
        "/absolute/path/to/AI/mcp/playground-mcp/dist/index.js"
      ]
    }
  }
}
```

## 面试时怎么讲

你可以用这个服务回答下面几类问题：

1. MCP Server 最小可运行闭环是什么
2. `tools/list` 和 `tools/call` 分别负责什么
3. `Tools`、`Resources`、`Prompts` 的边界差异是什么
4. 为什么本地插件常用 `stdio`

## 目录结构

```text
src/
├── index.ts
├── server.ts
├── types.ts
└── tools/
    └── index.ts
```
