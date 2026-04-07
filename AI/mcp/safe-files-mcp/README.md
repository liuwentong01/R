# Safe Files MCP Server

一个带安全边界的本地只读文件 MCP 服务。

它非常适合面试时讲下面这件事：MCP 的重点不仅是“把工具暴露出来”，更是“把可访问范围限制清楚”。

## 功能

| 工具 | 说明 |
| --- | --- |
| `list_files` | 列出白名单根目录内的文件和目录 |
| `read_text_file` | 读取文本文件，并支持按行截取 |
| `search_in_files` | 在文本文件中搜索关键字，返回文件、行号和预览 |

## 安全设计

这个服务默认内建了 4 个常见安全控制点：

1. 必须通过 `--root` 指定允许访问的根目录
2. 任何 `../` 越界访问都会被拒绝
3. 只读取文本文件，二进制文件会报错或被跳过
4. 对单文件大小、搜索结果数量、目录返回条数都做了限制

## 快速开始

```bash
cd AI/mcp/safe-files-mcp
npm install
npm run build
```

直接运行：

```bash
node dist/index.js --root /absolute/path/to/allowed-directory
```

## 在 Cursor 中配置

```json
{
  "mcpServers": {
    "safe-files": {
      "command": "node",
      "args": [
        "/absolute/path/to/AI/mcp/safe-files-mcp/dist/index.js",
        "--root", "/absolute/path/to/allowed-directory"
      ]
    }
  }
}
```

## 面试时怎么讲

你可以重点讲 3 点：

1. 为什么文件工具必须有根目录白名单
2. 为什么只做只读而不是直接给写权限
3. 为什么要限制文件大小、返回条数和搜索深度

## 目录结构

```text
src/
├── index.ts
├── server.ts
├── types.ts
└── tools/
    └── index.ts
```
