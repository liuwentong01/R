# AI/mcp

这个目录用于存放基于 MCP 协议实现的独立服务。

目前包含 4 个子项目：

| 目录 | 定位 | 适合讲什么 |
| --- | --- | --- |
| `confluence-mcp` | Confluence 集成服务 | 企业文档读写、真实业务型 MCP |
| `playground-mcp` | 最小教学型 MCP | Tools / Resources / Prompts 三类能力 |
| `safe-files-mcp` | 本地只读文件 MCP | 路径白名单、只读权限、结果截断 |
| `http-debug-mcp` | 外部 API 调试 MCP | allowlist、超时、响应裁剪 |

## 推荐学习顺序

1. `playground-mcp`
   先搞清楚 MCP 的最小闭环：服务启动、工具注册、资源读取、Prompt 模板。
2. `safe-files-mcp`
   再看本地能力如何做权限边界，这一类问题面试很常被追问。
3. `http-debug-mcp`
   最后看网络类能力如何限制访问范围、超时和返回大小。
4. `confluence-mcp`
   再回头看真实业务服务，就更容易理解为什么代码会更复杂。

## 通用使用方式

每个目录都是独立项目，单独安装、构建和运行：

```bash
cd AI/mcp/<server-name>
npm install
npm run build
npm start
```

## Cursor 配置示例

```json
{
  "mcpServers": {
    "playground": {
      "command": "node",
      "args": [
        "/absolute/path/to/AI/mcp/playground-mcp/dist/index.js"
      ]
    },
    "safe-files": {
      "command": "node",
      "args": [
        "/absolute/path/to/AI/mcp/safe-files-mcp/dist/index.js",
        "--root", "/absolute/path/to/allowed-directory"
      ]
    },
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

## 面试回答建议

如果面试官问你“你为什么会 MCP”，你可以沿着这个顺序展开：

1. 我不仅知道 `tools/list` / `tools/call` 的协议流程，还自己实现过可运行的 stdio MCP Server
2. 我做过教学型 Playground，也做过带安全边界的文件和 HTTP 插件
3. 我知道一个可用的 MCP 服务不只是把能力暴露出来，更重要的是参数校验、权限控制、错误处理和输出裁剪
