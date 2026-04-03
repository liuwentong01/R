# 11 - OpenClaw 源码深度分析

> 基于 GitHub 仓库 openclaw/openclaw 的源码实现分析
> 更新时间: 2026-04-03
> 仓库版本: v2026.4.3

## 概述

本文档提供 OpenClaw 源码级别的实现细节分析，包括关键模块的代码结构、设计模式、协议规范和配置格式。适用于需要深入理解系统内部机制或开发类似系统的开发者。

## 1. Gateway 核心实现

### 1.1 服务器启动流程

**入口文件**: `src/gateway/server.impl.ts`

Gateway 启动时执行的关键步骤：

```typescript
// 核心依赖导入
import { createGatewayRuntimeState } from "./server-runtime-state.js";
import { attachGatewayWsHandlers } from "./server-ws-runtime.js";
import { loadGatewayStartupPlugins } from "./server-plugin-bootstrap.js";
import { startChannelHealthMonitor } from "./channel-health-monitor.js";
import { startGatewayMaintenanceTimers } from "./server-maintenance.js";

// 启动顺序
1. loadConfig() - 加载配置文件
2. runStartupSessionMigration() - 会话数据迁移
3. createGatewayRuntimeState() - 初始化运行时状态
4. loadGatewayStartupPlugins() - 加载启动插件
5. attachGatewayWsHandlers() - 绑定 WebSocket 处理器
6. startChannelHealthMonitor() - 启动通道健康监控
7. startGatewayMaintenanceTimers() - 启动维护定时器
```

### 1.2 WebSocket 协议架构

**协议定义**: `src/gateway/protocol/schema/frames.ts`

#### 连接握手流程

```typescript
// 1. 客户端发送 connect 请求
{
  type: "req",
  id: "conn-1",
  method: "connect",
  params: {
    minProtocol: 1,
    maxProtocol: 1,
    client: {
      id: "com.openclaw.macos",
      version: "2026.4.3",
      platform: "darwin",
      mode: "app", // 或 "cli"
    },
    auth: {
      token: "...",      // Bearer token
      password: "...",   // 或密码
      deviceToken: "..." // 或设备令牌
    },
    scopes: ["read", "write", "admin"]
  }
}

// 2. Gateway 响应 hello-ok
{
  type: "hello-ok",
  protocol: 1,
  server: {
    version: "2026.4.3",
    connId: "gw-conn-abc123"
  },
  features: {
    methods: ["agent", "agent.wait", "config.get", ...],
    events: ["chat", "agent", "presence", "health", ...]
  },
  snapshot: {
    // 完整状态快照
    channels: [...],
    sessions: [...],
    devices: [...]
  },
  policy: {
    maxPayload: 10485760,      // 10MB
    maxBufferedBytes: 52428800, // 50MB
    tickIntervalMs: 30000       // 30秒心跳
  }
}
```

#### 帧类型定义

```typescript
// 请求帧 (客户端 → Gateway)
interface RequestFrame {
  type: "req";
  id: string;           // 唯一请求 ID
  method: string;       // RPC 方法名
  params?: unknown;     // 方法参数
}

// 响应帧 (Gateway → 客户端)
interface ResponseFrame {
  type: "res";
  id: string;           // 对应请求的 ID
  ok: boolean;
  payload?: unknown;    // 成功时的数据
  error?: {
    code: string;
    message: string;
    details?: unknown;
    retryable?: boolean;
    retryAfterMs?: number;
  };
}

// 事件帧 (Gateway → 客户端，单向推送)
interface EventFrame {
  type: "event";
  event: string;        // 事件名称
  payload?: unknown;
  seq?: number;         // 序列号（用于检测丢失）
  stateVersion?: {      // 状态版本号
    health: number;
    presence: number;
  };
}
```

### 1.3 HTTP Pipeline 架构

**实现文件**: `src/gateway/server-http.ts`

Gateway 的 HTTP 服务器采用 10 阶段管道处理：

```typescript
// HTTP 阶段顺序（按优先级）
const HTTP_STAGES = [
  "hooks",              // 1. Webhook 入口
  "tools",              // 2. 工具调用 API
  "sessions",           // 3. 会话管理 API
  "slack",              // 4. Slack 集成
  "openresponses",      // 5. OpenResponses 协议
  "chat-completions",   // 6. OpenAI 兼容 API
  "canvas",             // 7. Canvas/A2UI 服务
  "plugin-routes",      // 8. 插件自定义路由
  "control-ui",         // 9. Control UI 静态文件
  "health"              // 10. 健康检查端点
];

// 路由注册示例
function attachStage(app: Express, stage: string) {
  switch(stage) {
    case "chat-completions":
      app.post("/v1/chat/completions", handleChatCompletions);
      break;
    case "health":
      app.get("/health", (req, res) => res.json({ ok: true }));
      break;
  }
}
```

## 2. Agent 运行时实现

### 2.1 核心执行函数

**实现文件**: `src/agents/pi-embedded-runner/run.ts`

```typescript
// Agent 执行主函数签名
export async function runEmbeddedPiAgent(
  params: RunEmbeddedPiAgentParams
): Promise<EmbeddedPiRunResult>

// 参数结构
interface RunEmbeddedPiAgentParams {
  runId: string;
  sessionId: string;
  sessionKey?: string;
  agentId?: string;
  
  prompt: string;             // 用户消息
  provider?: string;          // LLM 提供者 (默认 "anthropic")
  model?: string;             // 模型 ID (默认 "claude-sonnet-4")
  
  workspaceDir?: string;
  messageChannel?: string;    // 来源通道 ("whatsapp", "telegram", ...)
  toolResultFormat?: "markdown" | "plain";
  
  config?: OpenClawConfig;    // 配置对象
  enqueue?: QueueFunction;    // 队列函数（用于并发控制）
  lane?: string;              // 执行通道（用于速率限制）
}

// 返回结果
interface EmbeddedPiRunResult {
  ok: boolean;
  status: "ok" | "error" | "timeout";
  
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  
  meta?: {
    provider: string;
    model: string;
    thinkingLevel?: "off" | "low" | "medium" | "high";
    runTimeMs: number;
  };
  
  error?: string;
}
```

### 2.2 执行队列管理

**实现文件**: `src/agents/pi-embedded-runner/run.ts` (lines 100-120)

```typescript
// 两级队列机制
export async function runEmbeddedPiAgent(params) {
  // 1. Session Lane - 确保同一会话请求串行执行
  const sessionLane = resolveSessionLane(
    params.sessionKey?.trim() || params.sessionId
  );
  
  // 2. Global Lane - 跨会话的全局速率限制
  const globalLane = resolveGlobalLane(params.lane);
  
  // 队列包装器
  const enqueueSession = params.enqueue ?? 
    ((task, opts) => enqueueCommandInLane(sessionLane, task, opts));
  
  const enqueueGlobal = params.enqueue ?? 
    ((task, opts) => enqueueCommandInLane(globalLane, task, opts));
  
  // 嵌套执行：session lane 先入队，内部再走 global lane
  return enqueueSession(() =>
    enqueueGlobal(async () => {
      // 实际的 Agent 执行逻辑...
    })
  );
}
```

### 2.3 Provider Failover 机制

**实现文件**: `src/agents/pi-embedded-runner/run/assistant-failover.ts`

```typescript
// Failover 触发条件
enum FailoverReason {
  AUTH_ERROR = "auth_error",           // 401/403 认证失败
  BILLING_ERROR = "billing_error",     // 402 账单问题
  RATE_LIMIT = "rate_limit",           // 429 速率限制
  CONTEXT_OVERFLOW = "context_overflow", // Token 超限
  MODEL_NOT_FOUND = "model_not_found", // 404 模型不存在
  PROVIDER_ERROR = "provider_error"    // 5xx 服务端错误
}

// Failover 策略
class AuthController {
  private profileRotationLimit = 3;  // 最多轮换 3 次 Auth Profile
  private modelFallbackLimit = 2;    // 最多降级 2 次模型
  
  async handleFailover(error: Error): Promise<Action> {
    const reason = classifyFailoverReason(error);
    
    switch(reason) {
      case "rate_limit":
        // 1. 标记当前 Profile 为冷却（cooldown）
        // 2. 轮换到下一个 Profile
        // 3. 添加退避延迟（exponential backoff）
        return { action: "rotate_profile", backoffMs: 5000 };
        
      case "context_overflow":
        // 1. 触发会话压缩（Compaction）
        // 2. 如有配置 fallback 模型，切换到更大上下文模型
        return { action: "compact_and_fallback" };
        
      case "auth_error":
      case "billing_error":
        // 1. 标记 Profile 为失败（不再使用）
        // 2. 立即切换到下一个 Profile
        return { action: "rotate_profile", immediate: true };
        
      case "model_not_found":
        // 降级到 fallback 模型
        return { action: "fallback_model" };
        
      default:
        // 其他错误：重试当前配置（最多 2 次）
        return { action: "retry", maxRetries: 2 };
    }
  }
}
```

### 2.4 Context Engine 接口

**类型定义**: `src/context-engine/types.ts`

```typescript
// Context Engine 核心接口
interface ContextEngine {
  readonly info: ContextEngineInfo;
  
  // 1. Bootstrap - 会话首次启动时调用
  bootstrap?(params: {
    sessionId: string;
    sessionKey?: string;
    sessionFile: string;  // JSONL 文件路径
  }): Promise<BootstrapResult>;
  
  // 2. Ingest - 每个消息/工具调用后调用
  ingest(params: {
    sessionId: string;
    message: AgentMessage;
    isHeartbeat?: boolean;
  }): Promise<IngestResult>;
  
  // 3. Assemble - 每次 LLM 调用前组装上下文
  assemble(params: {
    sessionId: string;
    maxTokens?: number;
    includeBootstrap?: boolean;
  }): Promise<AssembleResult>;
  
  // 4. Compact - Token 溢出时触发压缩
  compact(params: {
    sessionId: string;
    sessionFile: string;
    targetTokens?: number;
  }): Promise<CompactResult>;
  
  // 5. Maintain - 后台维护（清理、优化）
  maintain?(params: {
    sessionId: string;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<ContextEngineMaintenanceResult>;
}

// Assemble 结果示例
interface AssembleResult {
  messages: AgentMessage[];      // 组装后的消息数组
  estimatedTokens: number;       // 估计的 Token 数
  systemPromptAddition?: string; // 可选的系统提示追加内容
}

// Compact 结果示例
interface CompactResult {
  ok: boolean;
  compacted: boolean;
  reason?: string;
  result?: {
    summary?: string;           // 压缩后的摘要
    firstKeptEntryId?: string;  // 保留的第一条消息 ID
    tokensBefore: number;
    tokensAfter?: number;
  };
}
```

## 3. Session 管理实现

### 3.1 Session Key 生成规则

**实现文件**: `src/sessions/session-id.ts`

```typescript
// Session Key 格式
// agent:<agentId>:<scope-specific-parts>

// 1. dmScope: "main" (所有 DM 共享一个会话)
//    格式: agent:<agentId>:main
//    示例: agent:default:main

// 2. dmScope: "per-peer" (每个联系人一个会话)
//    格式: agent:<agentId>:dm:<peerId>
//    示例: agent:default:dm:+1234567890

// 3. dmScope: "per-channel-peer" (每个通道+联系人一个会话)
//    格式: agent:<agentId>:dm:<channelId>:<peerId>
//    示例: agent:default:dm:whatsapp:+1234567890

// 4. dmScope: "per-account-channel-peer" (每个账号+通道+联系人)
//    格式: agent:<agentId>:dm:<accountId>:<channelId>:<peerId>
//    示例: agent:default:dm:work:telegram:user123

// 代码实现
function buildSessionKey(params: {
  agentId: string;
  dmScope: DmScope;
  accountId?: string;
  channelId: string;
  peerId: string;
}): string {
  const { agentId, dmScope, accountId, channelId, peerId } = params;
  
  switch(dmScope) {
    case "main":
      return `agent:${agentId}:main`;
      
    case "per-peer":
      return `agent:${agentId}:dm:${peerId}`;
      
    case "per-channel-peer":
      return `agent:${agentId}:dm:${channelId}:${peerId}`;
      
    case "per-account-channel-peer":
      if (!accountId) throw new Error("accountId required");
      return `agent:${agentId}:dm:${accountId}:${channelId}:${peerId}`;
  }
}
```

### 3.2 Session 存储格式

**存储路径**: `~/.openclaw/agents/<agentId>/sessions/<sessionKey>.jsonl`

```jsonl
// JSONL 格式（每行一个 JSON 对象）
{"role":"user","content":"What is the capital of France?","entryId":"e1","ts":1711234567890}
{"role":"assistant","content":"The capital of France is Paris.","entryId":"e2","ts":1711234568123,"usage":{"promptTokens":15,"completionTokens":8}}
{"role":"user","content":"Tell me more about it","entryId":"e3","ts":1711234600000}
{"role":"assistant","content":"Paris is...","entryId":"e4","ts":1711234601000}
```

**元数据文件**: `<sessionKey>.meta.json`

```json
{
  "sessionKey": "agent:default:main",
  "agentId": "default",
  "createdAt": 1711234567890,
  "lastActiveAt": 1711234600000,
  "messageCount": 4,
  "totalTokens": 523,
  "labels": ["personal", "research"],
  "dmScope": "main",
  "channel": "telegram",
  "peerId": "+1234567890"
}
```

## 4. Tool 系统实现

### 4.1 Tool 定义规范

**接口定义**: `src/agents/tools/common.ts`

```typescript
// Agent Tool 接口（基于 Pi Agent Core）
interface AgentTool<TParams = any, TResult = unknown> {
  name: string;
  description: string;
  
  // JSON Schema 参数定义
  parameters: {
    type: "object";
    properties: Record<string, JSONSchema>;
    required?: string[];
  };
  
  // 执行函数
  execute(
    runId: string,
    params: TParams
  ): Promise<AgentToolResult>;
  
  // 可选扩展
  ownerOnly?: boolean;        // 仅所有者可用
  displaySummary?: string;    // 简短描述
}

// Tool 执行结果
interface AgentToolResult {
  content: string | ContentBlock[];
  
  // 可选元数据
  error?: boolean;
  partial?: boolean;         // 部分结果（流式）
  meta?: {
    tokensUsed?: number;
    durationMs?: number;
    [key: string]: unknown;
  };
}

// ContentBlock 类型（支持多媒体）
type ContentBlock = 
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };
```

### 4.2 Tool 参数解析工具

```typescript
// 字符串参数
readStringParam(params, "message", { 
  required: true,
  trim: true,
  label: "消息内容"
});

// 数字参数
readNumberParam(params, "count", { 
  required: false,
  integer: true,
  label: "数量"
});

// 布尔参数
readBooleanParam(params, "force", { 
  default: false
});

// 字符串数组
readStringArrayParam(params, "tags", {
  required: false,
  trim: true
});

// 错误处理
throw new ToolInputError("参数 'message' 是必需的");
throw new ToolAuthorizationError("此工具仅限所有者使用");
```

### 4.3 Built-in Tools 示例

**Memory Tool 实现** (简化版)

```typescript
// memory_search 工具
{
  name: "memory_search",
  description: "Semantic search in agent's memory using vector embeddings",
  
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query (semantic or keyword)"
      },
      limit: {
        type: "integer",
        description: "Max results (default: 10)"
      }
    },
    required: ["query"]
  },
  
  async execute(runId, params) {
    const query = readStringParam(params, "query", { required: true });
    const limit = readNumberParam(params, "limit") ?? 10;
    
    // 1. 生成查询向量
    const embedding = await embedText(query);
    
    // 2. 向量相似度搜索
    const results = await vectorDB.search(embedding, limit);
    
    // 3. 混合关键词匹配
    const keywordResults = await fullTextSearch(query);
    
    // 4. 合并排序
    const merged = mergeAndRank(results, keywordResults);
    
    return {
      content: formatSearchResults(merged)
    };
  }
}
```

## 5. Plugin 系统实现

### 5.1 Plugin 定义格式

**文件**: `openclaw.plugin.json`

```json
{
  "id": "my-custom-plugin",
  "name": "My Custom Plugin",
  "version": "1.0.0",
  "description": "A custom plugin example",
  
  "main": "dist/index.js",
  "type": "native",
  
  "openclaw": {
    "capabilities": {
      "provides": ["llm", "tools"],
      "requires": ["config.plugins.myPlugin"]
    },
    
    "hooks": [
      "beforeAgentStart",
      "afterAgentEnd",
      "onToolCall"
    ],
    
    "routes": [
      {
        "path": "/api/my-plugin",
        "method": "POST"
      }
    ],
    
    "skills": [
      "./skills/custom-skill"
    ]
  },
  
  "dependencies": {
    "@openclaw/plugin-sdk": "^2026.4.0"
  }
}
```

### 5.2 Plugin SDK 使用示例

```typescript
import { definePlugin, type PluginRuntime } from "@openclaw/plugin-sdk";

export default definePlugin({
  id: "my-plugin",
  
  // 插件初始化
  async init(runtime: PluginRuntime) {
    const config = runtime.config.plugins?.myPlugin;
    
    // 注册 LLM Provider
    runtime.registerProvider({
      id: "custom-llm",
      name: "Custom LLM",
      
      async invoke(params) {
        // 调用自定义 LLM API
        const response = await fetch("https://api.example.com/chat", {
          method: "POST",
          body: JSON.stringify({
            messages: params.messages,
            model: params.model
          })
        });
        
        return response.json();
      }
    });
    
    // 注册工具
    runtime.registerTool({
      name: "custom_tool",
      description: "A custom tool",
      parameters: { type: "object", properties: {} },
      
      async execute(runId, params) {
        return { content: "Tool result" };
      }
    });
    
    // 注册 Hook
    runtime.hooks.beforeAgentStart(async (context) => {
      console.log("Agent starting:", context.sessionId);
      // 可以修改上下文或中止执行
    });
  },
  
  // HTTP 路由处理
  async handleRequest(req, res, runtime) {
    if (req.path === "/api/my-plugin") {
      res.json({ message: "Hello from plugin" });
    }
  }
});
```

### 5.3 Plugin Hook 系统

**Hook 列表和调用时机**:

```typescript
// Agent 生命周期
beforeAgentStart      // Agent 启动前（可修改参数）
afterAgentEnd         // Agent 结束后（可访问结果）
onAgentError          // Agent 错误时

// 工具调用
beforeToolCall        // 工具调用前（可拦截或修改）
afterToolCall         // 工具调用后（可处理结果）
onToolError           // 工具错误时

// 会话管理
onSessionCreate       // 会话创建时
onSessionActivate     // 会话激活时
onSessionDeactivate   // 会话停用时
onSessionDelete       // 会话删除时

// 消息流
onInboundMessage      // 入站消息（来自通道）
onOutboundMessage     // 出站消息（发送到通道）

// 配置和状态
onConfigReload        // 配置重载时
onGatewayStartup      // Gateway 启动时
onGatewayShutdown     // Gateway 关闭时

// Channel 事件
onChannelConnect      // 通道连接时
onChannelDisconnect   // 通道断开时
onChannelError        // 通道错误时

// Compaction
beforeCompaction      // 压缩前
afterCompaction       // 压缩后

// 其他
onCronTrigger         // Cron 作业触发时
onHeartbeat           // 心跳事件
```

**Hook 函数签名**:

```typescript
type HookFunction<TContext, TResult = void> = (
  context: TContext,
  runtime: PluginRuntime
) => Promise<TResult | HookAction>;

// Hook 可以返回动作
type HookAction =
  | { action: "continue" }           // 继续执行
  | { action: "abort"; reason: string } // 中止执行
  | { action: "modify"; data: unknown } // 修改数据

// 示例：拦截敏感消息
runtime.hooks.onInboundMessage(async (context, runtime) => {
  if (containsSensitiveData(context.message.content)) {
    return {
      action: "abort",
      reason: "Message contains sensitive data"
    };
  }
  return { action: "continue" };
});
```

## 6. MCP (Model Context Protocol) 集成

### 6.1 MCP Server 实现

**实现文件**: `src/mcp/plugin-tools-serve.ts`

OpenClaw 提供了将插件工具暴露为 MCP 服务器的能力：

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} from "@modelcontextprotocol/sdk/types.js";

// 创建 MCP 服务器
function createPluginToolsMcpServer(params: {
  config?: OpenClawConfig;
  tools?: AnyAgentTool[];
}): Server {
  const tools = params.tools ?? resolvePluginTools({
    context: { config: params.config },
    suppressNameConflicts: true
  });
  
  const server = new Server(
    { name: "openclaw-plugin-tools", version: VERSION },
    { capabilities: { tools: {} } }
  );
  
  // 实现 tools/list 方法
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.parameters // JSON Schema
    }))
  }));
  
  // 实现 tools/call 方法
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find(t => t.name === request.params.name);
    
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
        isError: true
      };
    }
    
    try {
      const result = await tool.execute(
        `mcp-${Date.now()}`,
        request.params.arguments ?? {}
      );
      
      return {
        content: Array.isArray(result.content)
          ? result.content
          : [{ type: "text", text: String(result.content) }]
      };
    } catch (err) {
      return {
        content: [{ 
          type: "text", 
          text: `Tool error: ${err.message}` 
        }],
        isError: true
      };
    }
  });
  
  return server;
}

// 启动 MCP 服务器
async function serveMcp() {
  const server = createPluginToolsMcpServer({ 
    config: loadConfig() 
  });
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

### 6.2 MCP 配置示例

在 Claude Code 中配置 OpenClaw MCP 服务器：

```json
{
  "mcpServers": {
    "openclaw-tools": {
      "command": "node",
      "args": [
        "--import",
        "tsx",
        "/path/to/openclaw/src/mcp/plugin-tools-serve.ts"
      ]
    }
  }
}
```

这样 Claude Code 就可以访问 OpenClaw 的所有插件工具（memory_search、memory_store 等）。

## 7. 配置系统详解

### 7.1 配置文件结构

**路径**: `~/.openclaw/openclaw.json`
**格式**: JSON5（支持注释和尾随逗号）

```json5
{
  // === Agent 配置 ===
  "agents": {
    "defaults": {
      "agentId": "default",
      "workspace": "/Users/me/openclaw-workspace",
      
      // 模型配置
      "provider": "anthropic",
      "model": "claude-sonnet-4-6",
      
      // 模型目录（白名单）
      "models": [
        {
          "provider": "anthropic",
          "id": "claude-sonnet-4-6",
          "contextWindow": 200000
        },
        {
          "provider": "openai",
          "id": "gpt-4o",
          "contextWindow": 128000
        }
      ],
      
      // Fallback 配置
      "modelFallbacks": [
        "anthropic/claude-sonnet-4",
        "openai/gpt-4o"
      ],
      
      // 并发控制
      "concurrency": {
        "global": 3,        // 全局最大并发
        "perSession": 1     // 每会话最大并发
      }
    }
  },
  
  // === 通道配置 ===
  "channels": {
    "whatsapp": {
      "enabled": true,
      "allowFrom": ["+1234567890"],  // 白名单
      "dmPolicy": "allowlist",       // pairing | allowlist | open
      "dmScope": "per-peer"          // main | per-peer | per-channel-peer
    },
    
    "telegram": {
      "enabled": true,
      "token": "bot123456:ABC...",
      "allowFrom": ["user123"],
      "dmPolicy": "pairing"
    },
    
    "discord": {
      "enabled": true,
      "token": "...",
      "allowFrom": ["123456789"],
      "groupPolicy": {
        "requireMention": true       // 需要 @bot
      }
    }
  },
  
  // === 访问控制 ===
  "auth": {
    "mode": "token",                 // token | password | open
    "token": "secret-token-here",    // Bearer token
    
    "devices": {
      "allowPairing": true,
      "maxDevices": 5
    }
  },
  
  // === 内存系统 ===
  "memory": {
    "backend": "builtin",            // builtin | qmd | honcho
    
    "builtin": {
      "embeddings": {
        "provider": "openai",
        "model": "text-embedding-3-small"
      },
      "vectorSearch": {
        "enabled": true,
        "topK": 10
      }
    }
  },
  
  // === Session 配置 ===
  "sessions": {
    "pruning": {
      "enabled": true,
      "maxMessages": 100,
      "maxTokens": 50000
    },
    
    "compaction": {
      "enabled": true,
      "triggerAt": 180000,           // Token 阈值
      "targetTokens": 100000
    }
  },
  
  // === 工具和沙箱 ===
  "tools": {
    "policy": "default",             // default | restricted | open
    
    "allow": ["read", "write", "exec"],
    "deny": ["system_run"],
    
    "execApproval": {
      "enabled": true,
      "requireConfirm": true
    }
  },
  
  "sandbox": {
    "mode": "off",                   // off | non-main | all
    "docker": {
      "image": "openclaw/sandbox:latest"
    }
  },
  
  // === 自动化 ===
  "cron": {
    "enabled": true,
    "jobs": [
      {
        "id": "daily-summary",
        "schedule": "0 9 * * *",     // 每天 9:00
        "sessionKey": "agent:default:main",
        "prompt": "Generate daily summary"
      }
    ]
  },
  
  "hooks": {
    "enabled": true,
    "endpoints": [
      {
        "id": "webhook-1",
        "url": "https://example.com/webhook",
        "events": ["agent.end", "session.create"]
      }
    ]
  },
  
  // === 插件 ===
  "plugins": {
    "memory-lancedb": {
      "enabled": true,
      "path": "/path/to/lancedb"
    },
    
    "custom-plugin": {
      "enabled": true,
      "apiKey": "..."
    }
  },
  
  // === Gateway 配置 ===
  "gateway": {
    "host": "127.0.0.1",
    "port": 18789,
    
    "tls": {
      "enabled": false,
      "cert": "/path/to/cert.pem",
      "key": "/path/to/key.pem"
    },
    
    "discovery": {
      "enabled": true,
      "tailscale": false
    }
  }
}
```

### 7.2 配置热重载

OpenClaw 支持配置热重载，无需重启 Gateway：

```typescript
// 监听配置变化
registerConfigWriteListener(async (newConfig) => {
  console.log("Config changed, reloading...");
  
  // 1. 验证新配置
  const validation = validateConfig(newConfig);
  if (!validation.ok) {
    console.error("Invalid config:", validation.errors);
    return;
  }
  
  // 2. 计算差异
  const diff = diffConfig(oldConfig, newConfig);
  
  // 3. 应用变更
  if (diff.channels.changed) {
    await reloadChannels(newConfig.channels);
  }
  
  if (diff.plugins.changed) {
    await reloadPlugins(newConfig.plugins);
  }
  
  // 4. 某些变更需要重启
  if (diff.gateway.changed || diff.auth.changed) {
    console.log("Gateway restart required");
    await scheduleRestart();
  }
});
```

## 8. 关键设计模式

### 8.1 Lane-based 队列

OpenClaw 使用 "Lane" 概念实现细粒度的并发控制：

```typescript
// Lane 类型
type LaneId = string;  // "global" | "session:<sessionKey>" | "user:<userId>"

// Lane 队列实现
class LaneQueue {
  private lanes = new Map<LaneId, Queue>();
  
  async enqueue<T>(
    laneId: LaneId,
    task: () => Promise<T>,
    options?: { priority?: number }
  ): Promise<T> {
    const queue = this.getOrCreateLane(laneId);
    return queue.add(task, options);
  }
  
  private getOrCreateLane(laneId: LaneId): Queue {
    if (!this.lanes.has(laneId)) {
      this.lanes.set(laneId, new Queue({
        concurrency: this.getConcurrency(laneId)
      }));
    }
    return this.lanes.get(laneId)!;
  }
  
  private getConcurrency(laneId: LaneId): number {
    if (laneId === "global") return 5;
    if (laneId.startsWith("session:")) return 1;
    return 2;
  }
}
```

### 8.2 Event-driven Architecture

Gateway 使用事件驱动架构解耦组件：

```typescript
// 事件总线
class EventBus {
  private listeners = new Map<string, Set<Function>>();
  
  on(event: string, handler: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }
  
  async emit(event: string, payload: unknown) {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    
    await Promise.all(
      Array.from(handlers).map(h => h(payload))
    );
  }
}

// 使用示例
eventBus.on("agent.end", async (payload) => {
  // 记录到数据库
  await logAgentRun(payload);
  
  // 触发 webhook
  await triggerWebhook("agent.end", payload);
  
  // 更新统计
  await updateStats(payload);
});
```

### 8.3 Plugin 隔离机制

插件运行在受限的运行时环境中：

```typescript
// Plugin Sandbox
class PluginSandbox {
  createIsolatedRuntime(plugin: Plugin): PluginRuntime {
    // 1. 创建受限的 API 表面
    const runtime: PluginRuntime = {
      // 只暴露安全的 API
      config: this.getPluginConfig(plugin.id),
      logger: this.createLogger(plugin.id),
      
      // 能力注册（带权限检查）
      registerTool: this.checkPermission("tools", () => 
        this.registerTool.bind(this)
      ),
      
      registerProvider: this.checkPermission("providers", () =>
        this.registerProvider.bind(this)
      ),
      
      // 禁止直接访问文件系统、网络等
      // （除非显式声明权限）
    };
    
    // 2. 资源限制
    this.setResourceLimits(plugin.id, {
      maxMemory: 100 * 1024 * 1024,  // 100MB
      maxCpu: 0.5,                    // 50% CPU
      timeout: 30000                  // 30秒超时
    });
    
    return runtime;
  }
}
```

## 9. 性能优化技巧

### 9.1 Skills 快照缓存

```typescript
// Skills 在会话启动时快照，避免每次调用重新扫描
class SkillsManager {
  private snapshots = new Map<string, Skill[]>();
  
  async getSkillsForSession(sessionKey: string): Promise<Skill[]> {
    // 1. 检查缓存
    if (this.snapshots.has(sessionKey)) {
      return this.snapshots.get(sessionKey)!;
    }
    
    // 2. 扫描并缓存
    const skills = await this.scanSkills();
    this.snapshots.set(sessionKey, skills);
    
    // 3. 可选：启用热重载
    if (this.watchEnabled) {
      this.watchSkillsDir(() => {
        this.snapshots.delete(sessionKey);
      });
    }
    
    return skills;
  }
}
```

### 9.2 流式响应优化

```typescript
// Block Chunker - 智能分块发送
class BlockChunker {
  private buffer = "";
  private minChunkSize = 800;
  private maxChunkSize = 1200;
  
  async push(delta: string): Promise<string[]> {
    this.buffer += delta;
    const chunks: string[] = [];
    
    while (this.buffer.length > this.maxChunkSize) {
      // 寻找段落边界
      const breakPoint = this.findBreakPoint(this.buffer);
      
      if (breakPoint > this.minChunkSize) {
        chunks.push(this.buffer.slice(0, breakPoint));
        this.buffer = this.buffer.slice(breakPoint);
      } else {
        // 强制切分
        chunks.push(this.buffer.slice(0, this.maxChunkSize));
        this.buffer = this.buffer.slice(this.maxChunkSize);
      }
    }
    
    return chunks;
  }
  
  private findBreakPoint(text: string): number {
    // 优先在段落边界切分
    const paragraphBreak = text.indexOf("\n\n");
    if (paragraphBreak > 0) return paragraphBreak + 2;
    
    // 其次在句子边界
    const sentenceBreak = text.search(/[.!?]\s/);
    if (sentenceBreak > 0) return sentenceBreak + 2;
    
    // 最后在单词边界
    const wordBreak = text.lastIndexOf(" ");
    return wordBreak > 0 ? wordBreak : text.length;
  }
}
```

## 10. 安全机制

### 10.1 DM 策略实现

```typescript
// DM 策略检查
async function checkDmPolicy(
  message: InboundMessage,
  config: OpenClawConfig
): Promise<{ allowed: boolean; reason?: string }> {
  const channelConfig = config.channels[message.channelId];
  const policy = channelConfig.dmPolicy ?? "pairing";
  
  switch(policy) {
    case "open":
      // 允许所有人
      return { allowed: true };
      
    case "allowlist":
      // 检查白名单
      const allowFrom = channelConfig.allowFrom ?? [];
      if (!allowFrom.includes(message.sender.id)) {
        return {
          allowed: false,
          reason: "Sender not in allowlist"
        };
      }
      return { allowed: true };
      
    case "pairing":
      // 检查是否已配对
      const isPaired = await checkPairing(
        message.channelId,
        message.sender.id
      );
      
      if (!isPaired) {
        // 发送配对码提示
        await sendPairingPrompt(message);
        return {
          allowed: false,
          reason: "Pairing required"
        };
      }
      
      return { allowed: true };
  }
}
```

### 10.2 设备配对机制

```typescript
// 配对流程
class DevicePairing {
  // 1. 生成配对码
  async generatePairingCode(userId: string): Promise<string> {
    const code = randomBytes(3).toString("hex").toUpperCase(); // 6位
    
    await this.storePairingCode({
      code,
      userId,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5分钟过期
      used: false
    });
    
    return code;
  }
  
  // 2. 验证配对码
  async verifyPairingCode(
    code: string,
    userId: string
  ): Promise<boolean> {
    const record = await this.getPairingCode(code);
    
    if (!record || record.used) return false;
    if (record.expiresAt < Date.now()) return false;
    if (record.userId !== userId) return false;
    
    // 标记为已使用
    await this.markCodeAsUsed(code);
    
    // 生成设备令牌
    const deviceToken = await this.generateDeviceToken(userId);
    
    return true;
  }
  
  // 3. 生成设备令牌（Ed25519 签名）
  async generateDeviceToken(userId: string): Promise<string> {
    const deviceId = randomUUID();
    const keypair = generateKeyPair();
    
    const payload = {
      deviceId,
      userId,
      publicKey: keypair.publicKey,
      issuedAt: Date.now()
    };
    
    const signature = sign(payload, keypair.privateKey);
    
    await this.storeDevice({
      ...payload,
      signature
    });
    
    return jwt.sign(payload, signature);
  }
}
```

## 11. 调试和监控

### 11.1 诊断事件

```typescript
// 启用诊断模式
const diagnosticsEnabled = isDiagnosticsEnabled();

if (diagnosticsEnabled) {
  // 记录详细事件
  emitDiagnosticEvent({
    type: "agent.run.start",
    runId,
    sessionKey,
    model: `${provider}/${modelId}`,
    timestamp: Date.now()
  });
  
  emitDiagnosticEvent({
    type: "agent.run.tokens",
    runId,
    usage: {
      prompt: 1234,
      completion: 567,
      total: 1801
    }
  });
}
```

### 11.2 Health 监控

```typescript
// Health 端点
app.get("/health", (req, res) => {
  const health = {
    ok: true,
    version: VERSION,
    uptime: process.uptime(),
    
    channels: getChannelHealth(),
    sessions: getSessionHealth(),
    queue: getQueueHealth(),
    
    memory: {
      used: process.memoryUsage().heapUsed,
      total: process.memoryUsage().heapTotal
    }
  };
  
  res.json(health);
});

// Channel Health
function getChannelHealth() {
  return Array.from(channels.values()).map(channel => ({
    id: channel.id,
    connected: channel.isConnected(),
    lastSeen: channel.lastSeenAt,
    errors: channel.errorCount
  }));
}
```

## 12. 部署和运维

### 12.1 Docker 部署

```dockerfile
# Dockerfile (简化示例)
FROM node:24-alpine

WORKDIR /app

# 安装依赖
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# 复制代码
COPY . .

# 构建
RUN pnpm build

# 暴露端口
EXPOSE 18789

# 启动
CMD ["node", "dist/cli/index.js", "gateway", "start"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  openclaw:
    build: .
    ports:
      - "18789:18789"
    volumes:
      - ./data:/root/.openclaw
    environment:
      - NODE_ENV=production
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    restart: unless-stopped
```

### 12.2 进程管理

```bash
# systemd service 示例
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
User=openclaw
WorkingDirectory=/opt/openclaw
ExecStart=/usr/bin/node /opt/openclaw/dist/cli/index.js gateway start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## 总结

本文档提供了 OpenClaw 源码级别的实现细节，涵盖了：

1. **Gateway** - WebSocket 协议、HTTP Pipeline、认证机制
2. **Agent Runtime** - 执行循环、队列管理、Failover 策略
3. **Session** - Key 生成规则、存储格式
4. **Tool System** - 定义规范、参数解析、Built-in Tools
5. **Plugin System** - 定义格式、SDK API、Hook 系统
6. **MCP 集成** - Server 实现、配置方式
7. **配置系统** - 文件结构、热重载机制
8. **设计模式** - Lane 队列、事件驱动、插件隔离
9. **性能优化** - 缓存策略、流式响应
10. **安全机制** - DM 策略、设备配对
11. **调试监控** - 诊断事件、健康检查
12. **部署运维** - Docker、进程管理

结合现有文档（01-10），开发者现在拥有完整的 OpenClaw 架构知识，足以：

- 深入理解 OpenClaw 的工作原理
- 开发自定义插件和工具
- 集成到现有系统
- 构建类似的 AI Agent 平台

## 参考资源

- **官方仓库**: https://github.com/openclaw/openclaw
- **文档**: https://docs.openclaw.ai
- **Plugin SDK**: `@openclaw/plugin-sdk`
- **Pi Agent Core**: `@mariozechner/pi-agent-core`
- **MCP SDK**: `@modelcontextprotocol/sdk`
