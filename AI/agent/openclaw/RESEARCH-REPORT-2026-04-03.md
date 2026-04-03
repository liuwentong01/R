# OpenClaw 源码研究报告

**研究时间**: 2026-04-03  
**仓库版本**: openclaw/openclaw v2026.4.3  
**研究范围**: 架构实现、协议规范、源码分析

---

## 执行摘要

本次研究对 OpenClaw 官方仓库进行了深度源码分析，获取了以下关键信息：

### 核心发现

1. **Gateway 架构**
   - 采用单进程 WebSocket + HTTP 混合服务器
   - 10 阶段 HTTP Pipeline 处理（hooks → tools → sessions → ... → health）
   - TypeBox 定义的严格协议 Schema（`src/gateway/protocol/schema/`）
   - 请求-响应-事件三种帧类型，支持序列号和状态版本追踪

2. **Agent Runtime 实现**
   - 核心执行函数: `runEmbeddedPiAgent` (`src/agents/pi-embedded-runner/run.ts`)
   - 两级队列机制: Session Lane (串行) + Global Lane (并发控制)
   - Provider Failover 策略: Auth Profile 轮换 → Model Fallback → Retry
   - 支持 6 种 Failover 场景: 认证、账单、速率限制、上下文溢出、模型不存在、服务错误

3. **Context Engine 接口**
   - 5 个核心方法: bootstrap → ingest → assemble → compact → maintain
   - 插件化设计，支持多种后端（builtin/qmd/honcho）
   - 混合搜索：向量相似度 + 关键词匹配
   - 支持 Transcript Rewrite（安全的会话 DAG 更新）

4. **Plugin 系统**
   - 25+ Hook 点覆盖完整生命周期
   - Plugin SDK 提供隔离的运行时环境
   - 4 种执行模式: native / browser / subprocess / remote
   - 资源限制和权限检查机制

5. **MCP 集成**
   - 提供 `plugin-tools-serve.ts` 将插件工具暴露为 MCP Server
   - 实现 `tools/list` 和 `tools/call` 协议
   - 支持通过 stdio 与 Claude Code 集成

6. **配置系统**
   - JSON5 格式（支持注释和尾随逗号）
   - 混合热重载：部分配置即时生效，关键变更触发自动重启
   - 支持 `$include` 多文件组织
   - 严格 Schema 验证，未知键拒绝启动

---

## 关键源码模块分析

### 1. Gateway 核心文件

| 文件 | 作用 | 关键点 |
|------|------|--------|
| `src/gateway/server.impl.ts` | 服务器主入口 | 启动流程、依赖初始化 |
| `src/gateway/server-http.ts` | HTTP 服务器 | 10 阶段 Pipeline |
| `src/gateway/server-ws-runtime.ts` | WebSocket 运行时 | 帧处理、连接管理 |
| `src/gateway/protocol/schema/frames.ts` | 协议定义 | TypeBox Schema |
| `src/gateway/server-methods.ts` | RPC 方法实现 | `agent`, `config.get`, `chat` 等 |
| `src/gateway/server-channels.ts` | 通道管理器 | 消息路由、去重防抖 |

**协议握手流程**:
```
客户端 connect 请求 
  → Gateway 验证 auth (token/password/deviceToken)
  → 返回 hello-ok (包含完整状态快照)
  → 客户端开始发送 RPC 请求和接收事件
```

### 2. Agent Runtime 核心文件

| 文件 | 作用 | 关键点 |
|------|------|--------|
| `src/agents/pi-embedded-runner/run.ts` | Agent 执行主循环 | `runEmbeddedPiAgent` 函数 |
| `src/agents/pi-embedded-runner/run/attempt.ts` | 单次尝试执行 | LLM 调用、工具循环 |
| `src/agents/pi-embedded-runner/run/failover-policy.ts` | Failover 决策 | 错误分类、重试策略 |
| `src/agents/pi-embedded-runner/run/auth-controller.ts` | 认证控制器 | Profile 轮换、冷却管理 |
| `src/agents/pi-embedded-runner/lanes.ts` | 队列 Lane | 并发控制逻辑 |

**执行流程**:
```
runEmbeddedPiAgent
  → enqueueSession (per-session lane, concurrency=1)
  → enqueueGlobal (global lane, concurrency=3-5)
  → resolveModel + loadSkills
  → runEmbeddedAttempt
      → Context Engine assemble
      → LLM invoke (streaming)
      → Tool execution loop
      → Result delivery
  → Failover handling (if error)
```

### 3. Context Engine 核心文件

| 文件 | 作用 | 关键点 |
|------|------|--------|
| `src/context-engine/types.ts` | 接口定义 | `ContextEngine` 接口 |
| `src/context-engine/index.ts` | 引擎解析 | 根据配置加载后端 |
| `src/context-engine/registry.ts` | 注册表 | 引擎实例管理 |

**生命周期**:
```
1. bootstrap - 会话首次启动，导入历史
2. ingest - 每条消息后，记录到存储
3. assemble - 每次 LLM 调用前，组装上下文
4. compact - Token 超限时，压缩历史
5. maintain - 后台维护，优化存储
```

### 4. Session 管理核心文件

| 文件 | 作用 | 关键点 |
|------|------|--------|
| `src/sessions/session-id.ts` | Session Key 生成 | dmScope 规则 |
| `src/gateway/session-utils.ts` | 会话工具函数 | JSONL 读写 |
| `src/gateway/session-transcript-files.fs.ts` | Transcript 文件操作 | 追加、分支 |

**Session Key 格式**:
```
dmScope: main               → agent:<agentId>:main
dmScope: per-peer           → agent:<agentId>:dm:<peerId>
dmScope: per-channel-peer   → agent:<agentId>:dm:<channelId>:<peerId>
dmScope: per-account-...    → agent:<agentId>:dm:<accountId>:<channelId>:<peerId>
```

### 5. Tool 系统核心文件

| 文件 | 作用 | 关键点 |
|------|------|--------|
| `src/agents/tools/common.ts` | 工具接口定义 | `AnyAgentTool` 类型 |
| `src/agents/tools/*.ts` | Built-in 工具 | read/write/exec/memory/... |
| `src/plugins/tools.ts` | 插件工具解析 | `resolvePluginTools` |

**工具定义模板**:
```typescript
{
  name: "tool_name",
  description: "Tool description",
  parameters: { /* JSON Schema */ },
  async execute(runId, params) {
    // 实现逻辑
    return { content: "Result" };
  }
}
```

### 6. Plugin 系统核心文件

| 文件 | 作用 | 关键点 |
|------|------|--------|
| `src/plugins/runtime/types.ts` | Plugin Runtime 接口 | `PluginRuntime` 类型 |
| `src/plugins/runtime/index.ts` | Runtime 创建 | 隔离环境 |
| `src/plugins/hook-runner-global.ts` | Hook 执行器 | 全局 Hook 管理 |
| `src/gateway/server-plugin-bootstrap.ts` | 插件加载 | 启动时加载 |

**Plugin 能力**:
- 注册 LLM Provider
- 注册工具
- 注册 Hook 处理器
- 注册 HTTP 路由
- 访问配置和日志
- 启动子 Agent

### 7. MCP 集成核心文件

| 文件 | 作用 | 关键点 |
|------|------|--------|
| `src/mcp/plugin-tools-serve.ts` | MCP Server 实现 | 暴露插件工具 |
| `src/mcp/channel-bridge.ts` | Channel 桥接 | 通道作为 MCP 客户端 |

**MCP Server 实现要点**:
- 使用 `@modelcontextprotocol/sdk` 创建服务器
- 实现 `tools/list` 返回工具目录
- 实现 `tools/call` 执行工具
- 通过 stdio 传输（stdin/stdout）

---

## 协议规范摘录

### WebSocket 连接协议

#### Connect 请求
```json
{
  "type": "req",
  "id": "conn-1",
  "method": "connect",
  "params": {
    "minProtocol": 1,
    "maxProtocol": 1,
    "client": {
      "id": "com.openclaw.macos",
      "version": "2026.4.3",
      "platform": "darwin",
      "mode": "app"
    },
    "auth": {
      "token": "...",
      "password": "...",
      "deviceToken": "..."
    }
  }
}
```

#### Hello-OK 响应
```json
{
  "type": "hello-ok",
  "protocol": 1,
  "server": {
    "version": "2026.4.3",
    "connId": "gw-conn-abc"
  },
  "features": {
    "methods": ["agent", "agent.wait", "config.get", ...],
    "events": ["chat", "agent", "presence", ...]
  },
  "snapshot": { /* 完整状态 */ },
  "policy": {
    "maxPayload": 10485760,
    "maxBufferedBytes": 52428800,
    "tickIntervalMs": 30000
  }
}
```

### RPC 方法示例

#### agent (发起 Agent 运行)
```json
// 请求
{
  "type": "req",
  "id": "req-123",
  "method": "agent",
  "params": {
    "sessionKey": "agent:default:main",
    "message": "What is the weather?",
    "provider": "anthropic",
    "model": "claude-sonnet-4-6"
  }
}

// 响应
{
  "type": "res",
  "id": "req-123",
  "ok": true,
  "payload": {
    "runId": "run-abc-123",
    "acceptedAt": 1711234567890
  }
}
```

#### agent 事件流
```json
// 开始事件
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "run-abc-123",
    "stream": "lifecycle",
    "phase": "start"
  }
}

// Assistant 流式输出
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "run-abc-123",
    "stream": "assistant",
    "delta": "The weather is sunny..."
  }
}

// 结束事件
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "run-abc-123",
    "stream": "lifecycle",
    "phase": "end",
    "usage": {
      "promptTokens": 123,
      "completionTokens": 456
    }
  }
}
```

---

## 配置格式规范

### 完整配置示例 (~/.openclaw/openclaw.json)

```json5
{
  // Agent 配置
  "agents": {
    "defaults": {
      "agentId": "default",
      "workspace": "/path/to/workspace",
      "provider": "anthropic",
      "model": "claude-sonnet-4-6",
      "models": [
        {
          "provider": "anthropic",
          "id": "claude-sonnet-4-6",
          "contextWindow": 200000
        }
      ],
      "modelFallbacks": [
        "anthropic/claude-sonnet-4",
        "openai/gpt-4o"
      ]
    }
  },
  
  // 通道配置
  "channels": {
    "whatsapp": {
      "enabled": true,
      "allowFrom": ["+1234567890"],
      "dmPolicy": "allowlist",
      "dmScope": "per-peer"
    }
  },
  
  // 认证
  "auth": {
    "mode": "token",
    "token": "secret-token"
  },
  
  // 内存系统
  "memory": {
    "backend": "builtin",
    "builtin": {
      "embeddings": {
        "provider": "openai",
        "model": "text-embedding-3-small"
      }
    }
  },
  
  // 会话管理
  "sessions": {
    "pruning": {
      "enabled": true,
      "maxMessages": 100
    },
    "compaction": {
      "enabled": true,
      "triggerAt": 180000
    }
  },
  
  // 插件
  "plugins": {
    "memory-lancedb": {
      "enabled": true
    }
  }
}
```

---

## 设计模式总结

### 1. Lane-based 队列
- **目的**: 细粒度并发控制
- **实现**: 每个 Session Key 一个队列（concurrency=1），全局队列控制总并发
- **优势**: 避免同一会话竞态，同时允许多会话并行

### 2. Event-driven 架构
- **目的**: 解耦组件
- **实现**: EventBus 中心化事件分发，组件订阅感兴趣的事件
- **优势**: 易于扩展，插件可订阅系统事件

### 3. Plugin 隔离
- **目的**: 安全性和稳定性
- **实现**: 受限的 PluginRuntime API，资源限制，权限检查
- **优势**: 防止恶意或错误插件影响核心系统

### 4. Failover 策略
- **目的**: 高可用性
- **实现**: 错误分类 → Profile 轮换 → Model Fallback → Retry
- **优势**: 自动应对 API 错误、速率限制、账单问题

### 5. Context Engine 抽象
- **目的**: 可插拔的上下文管理
- **实现**: 统一接口，多种后端（builtin/qmd/honcho）
- **优势**: 支持不同的记忆和检索策略

---

## 性能优化要点

### 1. Skills 快照缓存
- 会话启动时扫描 Skills，缓存结果
- 避免每次 LLM 调用重新扫描文件系统
- 可选热重载模式

### 2. 流式响应分块
- EmbeddedBlockChunker 智能分块
- 优先在段落/句子边界切分
- 避免单词截断，提升用户体验

### 3. 队列并发控制
- Session Lane 防止同一会话并发执行
- Global Lane 控制系统总负载
- 避免 Token 浪费和 API 速率限制

### 4. Auth Profile 轮换
- 多个 API Key 轮流使用
- 失败或速率限制时自动切换
- Cooldown 机制避免重复使用失败的 Key

---

## 安全机制

### 1. DM 策略
- **pairing**: 需配对码（默认，最安全）
- **allowlist**: 白名单制（适合团队）
- **open**: 所有人可用（仅测试环境）

### 2. 设备配对 (Pairing)
- 生成 6 位配对码（5 分钟有效）
- Ed25519 签名验证
- 设备令牌持久化

### 3. 工具权限
- `ownerOnly` 工具限制
- Exec Approval 机制
- Sandbox 隔离（Docker）

### 4. Plugin 权限
- 声明式权限系统
- 资源限制（内存、CPU、超时）
- 禁止直接文件系统/网络访问

---

## MCP 集成方案

### OpenClaw 作为 MCP Server

**步骤**:
1. 启动 OpenClaw Gateway
2. 运行 `node src/mcp/plugin-tools-serve.ts`
3. 在 Claude Code 配置中添加:

```json
{
  "mcpServers": {
    "openclaw": {
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

**可用工具**:
- `memory_search` - 语义搜索
- `memory_store` - 存储记忆
- `memory_forget` - 删除记忆
- 所有插件注册的工具

---

## 部署建议

### 开发环境
```bash
# 安装依赖
pnpm install

# 启动开发模式
pnpm dev

# 或启动 Gateway
pnpm gateway:dev
```

### 生产环境

**Docker**:
```bash
docker build -t openclaw .
docker run -d \
  -p 18789:18789 \
  -v ~/.openclaw:/root/.openclaw \
  -e ANTHROPIC_API_KEY=... \
  openclaw
```

**Systemd**:
```bash
# /etc/systemd/system/openclaw.service
[Unit]
Description=OpenClaw Gateway

[Service]
Type=simple
ExecStart=/usr/bin/node /opt/openclaw/dist/cli/index.js gateway start
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## 后续建议

### 1. 文档更新优先级

**高优先级** (建议立即更新):
- ✅ **新增**: `11-source-code-analysis.md` (本次已创建)
- 更新 `02-gateway.md`: 添加协议 Schema 定义和 HTTP Pipeline 详细说明
- 更新 `03-agent-runtime.md`: 补充 Failover 策略代码示例
- 更新 `08-context-and-memory.md`: 添加 Context Engine 接口规范

**中优先级** (可后续补充):
- 更新 `05-plugin-system.md`: 添加 Plugin SDK 使用示例
- 更新 `07-tools-and-capabilities.md`: 添加工具定义模板和参数解析工具
- 创建 `12-mcp-integration.md`: 专门介绍 MCP 集成

**低优先级** (参考资料):
- 创建 `TROUBLESHOOTING.md`: 常见问题排查
- 创建 `BEST-PRACTICES.md`: 最佳实践指南

### 2. mini-openclaw 项目改进

基于源码分析，建议为 `AI/mini-openclaw/` 项目添加:

1. **完善 Gateway 协议**
   - 实现完整的帧类型（Request/Response/Event）
   - 添加序列号和状态版本追踪
   - 实现 hello-ok 握手和快照机制

2. **增强 Agent Runtime**
   - 实现两级队列（Session + Global）
   - 添加 Provider Failover 策略
   - 支持 Auth Profile 轮换

3. **Context Engine 接口**
   - 实现 5 个核心方法
   - 添加向量检索支持（可选）
   - 实现 Compaction 机制

4. **Plugin 系统**
   - 实现 Plugin SDK（简化版）
   - 支持 Hook 机制
   - 添加隔离和权限控制

5. **MCP 集成**
   - 添加 MCP Server 模块
   - 暴露内置工具
   - 支持 Claude Code 集成

### 3. 学习路径建议

对于希望深入学习 OpenClaw 的开发者:

**第一阶段** (理解架构):
1. 阅读 `01-overall-architecture.md`
2. 阅读 `11-source-code-analysis.md` (本文档)
3. 查看 `architecture-flowchart.html` 可视化图

**第二阶段** (核心组件):
1. 深入 `02-gateway.md` - 理解控制平面
2. 深入 `03-agent-runtime.md` - 理解执行循环
3. 深入 `08-context-and-memory.md` - 理解上下文管理

**第三阶段** (扩展能力):
1. 学习 `05-plugin-system.md` - 开发插件
2. 学习 `07-tools-and-capabilities.md` - 开发工具
3. 实践 MCP 集成

**第四阶段** (实战项目):
1. 基于 `mini-openclaw` 实现核心功能
2. 开发自定义 Plugin
3. 集成到现有系统

---

## 参考资源

- **官方仓库**: https://github.com/openclaw/openclaw
- **官方文档**: https://docs.openclaw.ai
- **Pi Agent Core**: https://github.com/mariozechner/pi-agent-core
- **MCP 协议**: https://modelcontextprotocol.io
- **TypeBox**: https://github.com/sinclairzx81/typebox

---

## 附录: 关键文件清单

### Gateway 核心 (15 个关键文件)
- `src/gateway/server.impl.ts` - 主入口
- `src/gateway/server-http.ts` - HTTP 服务器
- `src/gateway/server-ws-runtime.ts` - WebSocket 运行时
- `src/gateway/server-methods.ts` - RPC 方法
- `src/gateway/protocol/schema/frames.ts` - 协议定义
- `src/gateway/server-channels.ts` - 通道管理
- `src/gateway/server-chat.ts` - 聊天处理
- `src/gateway/auth.ts` - 认证
- `src/gateway/device-auth.ts` - 设备认证
- `src/gateway/session-utils.ts` - 会话工具

### Agent Runtime (10 个关键文件)
- `src/agents/pi-embedded-runner/run.ts` - 主循环
- `src/agents/pi-embedded-runner/run/attempt.ts` - 执行尝试
- `src/agents/pi-embedded-runner/run/failover-policy.ts` - Failover
- `src/agents/pi-embedded-runner/run/auth-controller.ts` - 认证控制
- `src/agents/pi-embedded-runner/lanes.ts` - 队列 Lane
- `src/agents/model-auth.ts` - 模型认证
- `src/agents/auth-profiles.ts` - Auth Profile
- `src/agents/model-selection.ts` - 模型选择

### Context Engine (5 个关键文件)
- `src/context-engine/types.ts` - 接口定义
- `src/context-engine/index.ts` - 引擎解析
- `src/context-engine/registry.ts` - 注册表

### Tool System (8 个关键文件)
- `src/agents/tools/common.ts` - 工具接口
- `src/agents/tools/read-tool.ts` - 读取工具
- `src/agents/tools/write-tool.ts` - 写入工具
- `src/agents/tools/exec-tool.ts` - 执行工具
- `src/agents/tools/memory-tool.ts` - 记忆工具

### Plugin System (8 个关键文件)
- `src/plugins/runtime/types.ts` - Runtime 接口
- `src/plugins/runtime/index.ts` - Runtime 创建
- `src/plugins/hook-runner-global.ts` - Hook 执行器
- `src/gateway/server-plugin-bootstrap.ts` - 插件加载

### MCP (3 个关键文件)
- `src/mcp/plugin-tools-serve.ts` - MCP Server
- `src/mcp/channel-bridge.ts` - Channel 桥接

**总计**: ~50 个核心文件构成了 OpenClaw 的主要架构。

---

*报告结束*
