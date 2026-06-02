# 11 - OpenClaw 当前版本校对笔记

> 校对时间：2026-05-28
> 依据：官方 `README.md`、`package.json`、`pnpm-workspace.yaml`、`docs/concepts/*` 与 `docs/gateway/*`

## 为什么替换旧版源码分析

原文件基于 `v2026.4.3`，包含大量具体函数签名、模型名、版本号和配置示例。OpenClaw 演进很快，这类源码快照容易过期；继续保留会误导后续学习。因此本文件改为“当前事实 + 易变点”形式，只记录官方资料中能确认的内容。

## 当前确认信息

### 项目版本与运行环境

- 当前 `package.json` 版本：`2026.5.28`
- 推荐运行时：Node 24
- 最低运行时：Node `>=22.19.0`
- 包管理器：`pnpm@11.2.2`
- 主要语言：TypeScript ESM
- UI：Lit + Vite
- 测试：Vitest
- Lint/Format：Oxlint + Oxfmt
- 构建：tsdown，底层基于 Rolldown

### Workspace 结构

官方 `pnpm-workspace.yaml` 当前包含：

```yaml
packages:
 - .
 - ui
 - packages/*
 - extensions/*
```

同时配置了 `minimumReleaseAge`、`minimumReleaseAgeExclude`、`nodeLinker: hoisted`、`blockExoticSubdeps`、`overrides`、`allowBuilds`、`packageExtensions` 和 `patchedDependencies`。这说明它不仅是普通 monorepo，也包含比较严格的供应链与安装期构建控制。

### Gateway 架构

官方架构文档仍确认 Gateway 是单个长期运行的控制平面：

- 默认监听 `127.0.0.1:18789`
- WebSocket 承担控制面协议
- HTTP 同端口承载 Canvas、A2UI、WebChat、健康检查和兼容接口
- 第一帧必须是 `connect`
- 帧类型仍是 `req`、`res`、`event`
- `hello-ok.features.methods/events` 是发现元数据，不等同于所有可调用路由的完整生成清单
- 有副作用的方法（如 `send`、`agent`）需要 idempotency key 以支持安全重试

### 节点与配对

官方文档强调所有 WS 客户端，包括 operator 和 node，都需要在 `connect` 中携带设备身份。Node 以 `role: "node"` 连接，并声明 caps/commands。

当前配对要点：

- 新设备需要配对审批
- Gateway 为后续连接发放 device token
- loopback 本地连接可自动审批以保持本机体验
- tailnet/LAN 等非本地连接仍需要显式审批
- 所有连接都要签名 `connect.challenge` nonce
- v3 签名 payload 绑定 `platform` 和 `deviceFamily`

### Agent Runtime 与队列

官方当前队列默认值：

```json5
{
  messages: {
    queue: {
      mode: "steer",
      debounceMs: 500,
      cap: 20,
      drop: "summarize"
    }
  }
}
```

这与旧文档中的 `collect` 默认值不同。`steer` 不会中断正在执行的工具调用，而是在当前 assistant turn 的工具批次完成后、下一次 LLM 调用前注入排队消息。运行时不能接受 steering 时，才等待当前 run 结束后再处理。

队列优先级：

1. session 内 `/queue` 覆盖
2. `messages.queue.byChannel`
3. `messages.queue.mode`
4. 默认 `steer`

### Session 语义

官方文档仍说明 DM 默认共享一个 `main` session，这适合单用户自用；如果多个用户可以 DM 同一个 Agent，应显式设置：

```json5
{
  session: {
    dmScope: "per-channel-peer"
  }
}
```

Session 生命周期字段需要区分：

- `sessionStartedAt`：当前 `sessionId` 开始时间，daily reset 依赖它
- `lastInteractionAt`：最后一次真实用户/通道交互时间，idle reset 依赖它
- `updatedAt`：store row 最近变更时间，适合列表和维护，不应作为 daily/idle reset 的权威依据

心跳、cron、exec 等系统事件可以写 metadata，但不延长 daily/idle reset freshness。

### Skills 加载位置

官方当前 Skills 优先级：

1. `<workspace>/skills`
2. `<workspace>/.agents/skills`
3. `~/.agents/skills`
4. `~/.openclaw/skills`
5. bundled skills
6. `skills.load.extraDirs`

旧文档只列出 workspace、managed、bundled，已经不完整。

### 安装与 CLI

官方 README 当前推荐：

```bash
npm install -g openclaw@latest
openclaw onboard --install-daemon
```

常用命令：

```bash
openclaw gateway status
openclaw gateway --port 18789 --verbose
openclaw message send --target +1234567890 --message "Hello from OpenClaw"
openclaw agent --message "Ship checklist" --thinking high
openclaw doctor
```

注意 `message send` 示例使用 `--target`，旧文档中的 `--to` 示例应避免继续传播。

## 容易过期的内容

以下内容不建议在学习文档中写成固定事实：

- 具体模型名，如 `gpt-*`、`claude-*`、`gemini-*`
- 插件数量这类固定数字
- 具体源码行号和函数签名
- 依赖精确版本，除非同时注明校对日期
- 支持渠道数量，建议列官方 README 当前渠道清单，或指向官方 Channels 文档
- Docker/Systemd 示例中的 dist 入口路径，OpenClaw 发布入口会随构建方式变化

## 本次删除/替换的旧内容

- 删除 `RESEARCH-REPORT-2026-04-03.md`：该文件是旧版本研究报告，和当前 README/官方文档存在明显版本差异。
- 替换旧版 `11-source-code-analysis.md`：原文件包含大量 `v2026.4.3` 源码快照式内容，改为当前版本校对笔记。

## 后续维护建议

- 每次更新本目录前，先核对官方 `README.md`、`package.json`、`docs/concepts/queue.md`、`docs/concepts/session.md`、`docs/concepts/agent.md`。
- 如果需要保留源码级分析，建议注明 commit SHA，并避免把示例模型名和具体行号写成长期有效事实。
- 面试类文档应优先讲设计原则和稳定边界，少写短期版本号。
