# 02 - Gateway Control Plane Deep Dive

## Overview

The Gateway is OpenClaw's core control plane, a long-running daemon responsible for:
- Managing all message channel connections
- Providing a WebSocket API for clients to connect to
- Hosting the Control UI and Canvas Host HTTP services
- Scheduling Agent runs, Cron tasks, and Webhook handling
- Managing session state and device pairing

The Gateway is the **largest module** in the entire system; `src/gateway/` contains 267 files.

## Core File Structure

```
src/gateway/
├── server.ts                # Entry point, re-exports startGatewayServer
├── server.impl.ts           # Main Gateway server implementation (1355 lines)
├── boot.ts                  # Executes BOOT.md at startup
├── client.ts                # WS client connection management
├── call.ts                  # Agent RPC calls
│
├── server-methods.ts        # Core WS API method handlers
├── server-methods-list.ts   # WS method and event registry
├── server-methods/          # Split-out method handlers
│   ├── exec-approval.js     # Execution approval
│   ├── nodes.helpers.ts     # Node helpers
│   └── secrets.ts           # Secret management
│
├── server-http.ts           # HTTP staged pipeline (200+ import lines)
├── server-runtime-state.ts  # Runtime state creation (HTTP/WS/Canvas)
├── server-ws-runtime.ts     # WS runtime handler attachment
├── server-channels.ts       # Channel manager creation
├── server-chat.ts           # Chat event handling
├── server-cron.ts           # Cron service construction
├── server-plugins.ts        # Plugin loading
├── server-startup.ts        # Sidecar service startup
├── server-runtime-config.ts # Runtime config resolution
├── server-model-catalog.ts  # Model catalog loading
├── server-session-key.ts    # Session key resolution
├── server-discovery-runtime.ts # mDNS service discovery
├── server-tailscale.ts      # Tailscale exposure
├── server-lanes.ts          # Concurrency lane management
├── server-maintenance.ts    # Maintenance timers
│
├── auth.ts                  # Authentication logic
├── auth-rate-limit.ts       # Authentication rate limiting
├── device-auth.ts           # Device Ed25519 signatures
├── connection-auth.ts       # Connection authentication
├── startup-auth.ts          # Startup-time authentication
│
├── config-reload.ts         # Config hot-reload
├── config-reload-plan.ts    # Hot-reload rule mapping
├── channel-health-monitor.ts # Channel health monitoring
├── channel-health-policy.ts  # Health policy
│
├── node-registry.ts         # Node device registry
├── exec-approval-manager.ts # Execution approval management
├── model-pricing-cache.ts   # Model pricing cache
│
├── server/                  # Server submodules
│   ├── health-state.ts      # Health state
│   ├── readiness.ts         # Readiness checks
│   ├── tls.ts               # TLS runtime
│   ├── hooks.ts             # Hook handling
│   ├── plugins-http.ts      # Plugin HTTP routes
│   └── close-reason.ts      # WS close reasons
│
├── events.ts                # Gateway event definitions
├── ws-log.ts                # WS logging
└── control-ui.ts            # Control UI state
```

## Gateway Startup Sequence (server.impl.ts)

The entire Gateway is orchestrated by the `startGatewayServer` function, following a strict linear startup sequence:

```typescript
// Actual type definitions
export type GatewayServer = {
  close: (opts?: { reason?: string; restartExpectedMs?: number | null }) => Promise<void>;
};

export type GatewayServerOptions = {
  bind?: GatewayBindMode;     // loopback | lan | tailnet | auto
  host?: string;
  controlUiEnabled?: boolean;
  openAiChatCompletionsEnabled?: boolean;
  openResponsesEnabled?: boolean;
  auth?: GatewayAuthConfig;
  tailscale?: GatewayTailscaleConfig;
  allowCanvasHostInTests?: boolean;
  wizardRunner?: (...) => Promise<void>;
};

export async function startGatewayServer(
  port = 18789,
  opts: GatewayServerOptions = {},
): Promise<GatewayServer>
```

### 10-Stage Startup Flow

```
┌──────────────────────────────────────────────────────────────┐
│  startGatewayServer() startup sequence (1355 lines of orch.)  │
│                                                               │
│  1. Config Loading & Migration                                │
│     ├→ readConfigFileSnapshot() reads openclaw.json           │
│     ├→ Auto-migrate legacy config entries                     │
│     ├→ Validate config + auto-enable plugins                  │
│     └→ Output: cfgAtStart (OpenClawConfig)                     │
│                                                               │
│  2. Secrets Activation                                        │
│     ├→ activateRuntimeSecrets() with lock serialization       │
│     ├→ Graceful recovery (keep starting on decrypt failure)   │
│     └→ Fail-fast semantics on startup failure                 │
│                                                               │
│  3. Auth Bootstrap                                            │
│     ├→ prepareGatewayStartupConfig() resolves auth mode       │
│     ├→ Auto-generate and persist token when missing           │
│     └→ Output: resolvedAuth (ResolvedGatewayAuth)             │
│                                                               │
│  4. Plugin Loading                                            │
│     ├→ loadGatewayPlugins() returns pluginRegistry            │
│     ├→ Channel plugins contribute extra gatewayMethods        │
│     └→ Output: pluginRegistry + merged gatewayMethods         │
│                                                               │
│  5. Runtime State Creation                                    │
│     ├→ createGatewayRuntimeState() creates:                   │
│     │   ├── HTTP Server(s) (possibly multiple bind addresses) │
│     │   ├── WebSocketServer (noServer: true mode)             │
│     │   ├── Canvas Host Handler                               │
│     │   ├── Client Set + Broadcaster                          │
│     │   └── Chat Run State + Dedupe Map                       │
│     └→ Output: wss, httpServer, broadcast, etc.               │
│                                                               │
│  6. Subsystem Wiring                                          │
│     ├→ NodeRegistry (device registry)                         │
│     ├→ Cron Service (scheduled tasks)                         │
│     ├→ Channel Manager (channel management)                   │
│     ├→ Maintenance Timers (tick/health/dedupe/media)          │
│     ├→ Agent/Heartbeat/Transcript/Lifecycle event handlers    │
│     ├→ ExecApprovalManager (execution approval)               │
│     └→ applyGatewayLaneConcurrency() (concurrency limits)     │
│                                                               │
│  7. WebSocket Handler Attachment                              │
│     └→ attachGatewayWsHandlers({                              │
│          wss, clients, resolvedAuth, gatewayMethods,          │
│          extraHandlers: { pluginHandlers, execApprovals,      │
│                           secretsHandlers },                  │
│          context: gatewayRequestContext                        │
│        })                                                     │
│                                                               │
│  8. Sidecar Startup                                           │
│     ├→ Browser Control Server (CDP)                           │
│     ├→ Plugin Services                                        │
│     ├→ Channel Startup (startChannels)                        │
│     └→ gateway_start plugin hook                              │
│                                                               │
│  9. Config Hot-Reload Watcher                                 │
│     └→ startGatewayConfigReloader({                           │
│          onHotReload: applyHotReload,                         │
│          onRestart: requestGatewayRestart                     │
│        })                                                     │
│                                                               │
│  10. Close Handler Assembly                                   │
│      └→ createGatewayCloseHandler() tears down all subsystems │
│          in reverse order                                     │
│          + gateway_stop hook + rate limiter cleanup           │
└──────────────────────────────────────────────────────────────┘
```

### WebSocket Creation (Actual Code)

```typescript
// src/gateway/server-runtime-state.ts
const wss = new WebSocketServer({
  noServer: true,           // HTTP upgrade handled manually
  maxPayload: MAX_PREAUTH_PAYLOAD_BYTES,  // Limit payload size before auth
});

// Attach an upgrade handler to every HTTP Server
for (const server of httpServers) {
  attachGatewayUpgradeHandler({
    httpServer: server,
    wss,
    canvasHost,              // Canvas WS path routing
    clients,
    resolvedAuth: params.resolvedAuth,
    rateLimiter: params.rateLimiter,
  });
}
```

Key design: the WebSocket uses `noServer: true` mode—the HTTP server's `upgrade` event is intercepted by `attachGatewayUpgradeHandler`, which **performs authentication before completing the handshake**. The Canvas WS path (`/__openclaw__/canvas/`) is routed to the Canvas WS server.

## WebSocket Protocol

### Connection Lifecycle

```
Client                          Gateway
  │                               │
  │── ws://127.0.0.1:18789 ──────│  1. Establish WebSocket connection
  │                               │     (auth verified at upgrade time)
  │── req:connect ───────────────→│  2. First frame must be connect
  │   {type:"req", method:"connect",│     contains device identity, auth token,
  │    params: {                   │     role (operator/node)
  │      auth: {token: "..."},     │
  │      device: {...},            │
  │      role: "operator"|"node"   │
  │    }}                          │
  │                               │
  │←── res:connect ──────────────│  3. Return handshake result
  │   {ok: true, payload: {       │     includes presence + health snapshot
  │     snapshot: {presence, health}│
  │   }}                          │
  │                               │
  │←── event:presence ───────────│  4. Begin pushing events
  │←── event:tick ───────────────│
  │←── event:agent (streaming) ──│
  │                               │
  │── req:agent ─────────────────→│  5. Request Agent execution
  │←── res:agent {status:"accepted"}│  6. Agent accepted/rejected
  │←── event:agent (streaming) ──│  7. Streaming Agent events
  │←── res:agent {status:"done"}──│  8. Agent done
```

### Frame Format

```typescript
// Request
{ type: "req", id: string, method: string, params: object }

// Response
{ type: "res", id: string, ok: boolean, payload?: object, error?: {code, message} }

// Event (server push)
{ type: "event", event: string, payload: object, seq?: number, stateVersion?: number }
```

### Core Methods and Events

| Method | Description | | Event | Description |
|------|------|-|------|------|
| `connect` | Handshake (must be the first frame) | | `agent` | Agent streaming output |
| `health` | Health status query | | `chat` | Chat message event |
| `agent` | Trigger Agent execution | | `presence` | Presence change |
| `sessions.list` | List sessions | | `health` | Health status change |
| `sessions.send` | Send to a specific session | | `heartbeat` | Heartbeat |
| `cron.*` | Cron task management | | `session.message` | Session message push |
| `channels.*` | Channel management | | `sessions.changed` | Session change push |
| `plugins.*` | Plugin management | | `voicewake.changed` | Wake-word change |
| `config.*` | Config management | | `shutdown` | Shutdown notification |

## Authentication System (auth.ts)

### Authentication Mode Types

```typescript
// Resolved authentication mode
export type ResolvedGatewayAuthMode = "none" | "token" | "password" | "trusted-proxy";

// Authentication result
export type GatewayAuthResult = {
  ok: boolean;
  method?: "none" | "token" | "password" | "tailscale"
         | "device-token" | "bootstrap-token" | "trusted-proxy";
  user?: string;
  reason?: string;
  rateLimited?: boolean;
  retryAfterMs?: number;
};
```

### Authorization Decision Tree

`authorizeGatewayConnect` makes decisions in the following order:

```
1. Trusted-proxy mode
   ├── Check whether the remote address is in the trusted proxy list
   ├── Extract user identity from the configured header
   └── Validate the allowUsers allowlist

2. None mode → pass directly

3. Rate limit check
   └── limiter.check(ip, scope) before credential comparison

4. Tailscale header authentication (WS Control UI only)
   └── Validate the Tailscale-User-Login header via a whois query

5. Token mode
   └── Constant-time comparison safeEqualSecret()

6. Password mode
   └── Same constant-time comparison as above
```

### Key Security Design: Rate Limiting Does Not Penalize Missing Credentials

```typescript
// Missing credentials do not consume rate-limit quota (prevents probing)
if (!connectAuth?.token) {
  return { ok: false, reason: "token_missing" };  // does not call recordFailure
}
// Only an actual mismatch is penalized
if (!safeEqualSecret(connectAuth.token, auth.token)) {
  limiter?.recordFailure(ip, rateLimitScope);      // record failure
  return { ok: false, reason: "token_mismatch" };
}
// Success clears all failure records
limiter?.reset(ip, rateLimitScope);
```

### Device Signature Verification (device-auth.ts)

Uses Ed25519 signatures with a versioned, pipe-delimited payload format:

```typescript
export function buildDeviceAuthPayloadV3(params: DeviceAuthPayloadV3Params): string {
  return [
    "v3", params.deviceId, params.clientId, params.clientMode,
    params.role, params.scopes.join(","), String(params.signedAtMs),
    params.token ?? "", params.nonce,
    normalizeDeviceMetadataForAuth(params.platform),    // bind platform
    normalizeDeviceMetadataForAuth(params.deviceFamily), // bind device family
  ].join("|");
}
```

The V3 format additionally binds `platform` + `deviceFamily` to prevent metadata tampering. Signature verification tolerates a 2-minute clock skew.

### Rate Limiter (auth-rate-limit.ts)

A sliding-window in-memory rate limiter that tracks each scope independently:

```typescript
export interface RateLimitConfig {
  maxAttempts?: number;     // default 10
  windowMs?: number;        // default 60_000 (1 minute)
  lockoutMs?: number;       // default 300_000 (5 minutes)
  exemptLoopback?: boolean; // default true (localhost never locked out)
  pruneIntervalMs?: number; // default 60_000
}

// Three independent rate-limit scopes
export const AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET = "shared-secret";
export const AUTH_RATE_LIMIT_SCOPE_DEVICE_TOKEN = "device-token";
export const AUTH_RATE_LIMIT_SCOPE_HOOK_AUTH = "hook-auth";
```

It uses a `Map<string, RateLimitEntry>` keyed by `"${scope}:${ip}"`, with periodic automatic pruning via `setInterval` (`.unref()` allows the process to exit normally).

## HTTP Staged Pipeline (server-http.ts)

The HTTP request pipeline uses a staged architecture; each request passes through the stages in order until it is handled:

```
HTTP request → setDefaultSecurityHeaders()
            → Route matching (by priority):

Stage 1: Health Probes
  /health, /healthz → liveness check
  /ready, /readyz   → readiness check (optional detailed info)

Stage 2: Hooks (/hooks/...)
  ├── extractHookToken() extracts auth
  ├── resolveHookIdempotencyKey() idempotency check
  ├── normalizeAgentPayload() normalizes the request
  └── dispatchAgentHook() dispatches to the Agent

Stage 3: Tools Invoke
  └── handleToolsInvokeHttpRequest()

Stage 4: Sessions
  ├── handleSessionKillHttpRequest()
  └── handleSessionHistoryHttpRequest()

Stage 5: Slack Callback
  └── handleSlackHttpRequest()

Stage 6: OpenResponses (optional)
  └── POST /v1/responses (OpenAI-compatible)

Stage 7: Chat Completions (optional)
  └── POST /v1/chat/completions (OpenAI-compatible)

Stage 8: Canvas
  ├── authorizeCanvasRequest()
  └── Proxy to the Canvas Host Server

Stage 9: Plugin Routes
  ├── resolvePluginRoutePathContext()
  ├── enforcePluginRouteGatewayAuth()
  └── handlePluginRequest()

Stage 10: Control UI
  ├── handleControlUiAvatarRequest()
  └── handleControlUiHttpRequest() (SPA)
```

WebSocket upgrades bypass the HTTP pipeline and are intercepted and dispatched by `attachGatewayUpgradeHandler`.

## Config Hot-Reload (config-reload.ts)

### File Watching

Uses **chokidar** to watch for config file changes:

```typescript
const watcher = chokidar.watch(opts.watchPath, {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  usePolling: Boolean(process.env.VITEST),  // use polling in the test environment
});
watcher.on("add", schedule);
watcher.on("change", schedule);
watcher.on("unlink", schedule);
```

### Reload Modes

```typescript
export type GatewayReloadSettings = {
  mode: GatewayReloadMode;   // "off" | "restart" | "hot" | "hybrid"
  debounceMs: number;        // default 300
};
```

### Diff Detection and Reload Planning (config-reload-plan.ts)

Changed paths are mapped to reload actions through an ordered rule table:

```typescript
type ReloadAction =
  | "reload-hooks"
  | "restart-gmail-watcher"
  | "restart-browser-control"
  | "restart-cron"
  | "restart-heartbeat"
  | "restart-health-monitor"
  | `restart-channel:${ChannelId}`;

// Example rules:
// hooks.*          → hot reload + "reload-hooks"
// cron.*           → hot reload + "restart-cron"
// channels.*       → hot reload + "restart-channel:*"
// gateway.*        → full restart (requires restart)
// plugins.*        → full restart
// discovery.*      → full restart
// agents.*, tools.*, session.* → "none" (read on demand, no reload needed)
// unmatched paths  → force restart
```

The `hybrid` mode (the default) hot-reloads whenever possible and only restarts when something cannot be hot-reloaded. When the config file is temporarily missing, it retries up to 2 times (150ms apart) to handle editor-save race conditions.

### Reload Orchestration (Actual Code)

```typescript
// Reloader setup in server.impl.ts
const configReloader = startGatewayConfigReloader({
  initialConfig: cfgAtStart,
  readSnapshot: readConfigFileSnapshot,
  onHotReload: async (plan, nextConfig) => {
    // Activate the new secrets first
    const prepared = await activateRuntimeSecrets(nextConfig, {
      reason: "reload", activate: true,
    });
    try {
      await applyHotReload(plan, prepared.config);
    } catch (err) {
      // Roll back the secrets snapshot on failure
      if (previousSnapshot) activateSecretsRuntimeSnapshot(previousSnapshot);
      throw err;
    }
  },
  onRestart: async (plan, nextConfig) => {
    await activateRuntimeSecrets(nextConfig, { reason: "restart-check", activate: false });
    requestGatewayRestart(plan, nextConfig);
  },
  watchPath: configSnapshot.path,
});
```

## Concurrency Control (Lanes)

The Gateway uses the concept of Lanes to control concurrency, split into four independent queues:

```typescript
// src/process/lanes.ts
export const enum CommandLane {
  Main = "main",         // main Agent runs
  Cron = "cron",         // Cron scheduled tasks
  Subagent = "subagent", // subagents
  Nested = "nested",     // internal nested calls
}

// src/gateway/server-lanes.ts — apply concurrency limits at startup
export function applyGatewayLaneConcurrency(cfg: ReturnType<typeof loadConfig>) {
  setCommandLaneConcurrency(CommandLane.Cron, cfg.cron?.maxConcurrentRuns ?? 1);
  setCommandLaneConcurrency(CommandLane.Main, resolveAgentMaxConcurrent(cfg));
  setCommandLaneConcurrency(CommandLane.Subagent, resolveSubagentMaxConcurrent(cfg));
}
```

## Channel Lifecycle (server-channels.ts)

### Core Types

```typescript
export type ChannelManager = {
  getRuntimeSnapshot: () => ChannelRuntimeSnapshot;
  startChannels: () => Promise<void>;
  startChannel: (channel: ChannelId, accountId?: string) => Promise<void>;
  stopChannel: (channel: ChannelId, accountId?: string) => Promise<void>;
  markChannelLoggedOut: (channelId, cleared, accountId?) => void;
  isManuallyStopped: (channelId, accountId) => boolean;
  resetRestartAttempts: (channelId, accountId) => void;
  isHealthMonitorEnabled: (channelId, accountId) => boolean;
};
```

### Exponential Backoff Restart Policy

```typescript
const CHANNEL_RESTART_POLICY: BackoffPolicy = {
  initialMs: 5_000,      // first retry 5 seconds
  maxMs: 5 * 60_000,     // max 5 minutes
  factor: 2,             // exponential factor
  jitter: 0.1,           // 10% jitter
};
const MAX_RESTART_ATTEMPTS = 10;
```

Restart logic:
1. Increment the per-account restart counter
2. Exceeding `MAX_RESTART_ATTEMPTS` (10) → give up permanently
3. Compute the backoff delay `computeBackoff(policy, attempt)`
4. Wait using an `AbortSignal` (a manual stop can cancel it)
5. Recursively call `startChannelInternal()` with `preserveRestartAttempts: true`
6. Reset the restart counter after a successful start

### Per-Channel Runtime Store

```typescript
type ChannelRuntimeStore = {
  aborts: Map<string, AbortController>;     // cancellation control
  starting: Map<string, Promise<void>>;     // start gate (prevents concurrent starts)
  tasks: Map<string, Promise<unknown>>;     // running tasks
  runtimes: Map<string, ChannelAccountSnapshot>; // per-account runtime snapshots
};
```

## BOOT.md Execution (boot.ts)

At startup, the Gateway can optionally execute a `BOOT.md` file in the workspace:

```typescript
export type BootRunResult =
  | { status: "skipped"; reason: "missing" | "empty" }
  | { status: "ran" }
  | { status: "failed"; reason: string };

export async function runBootOnce(params: {
  cfg: OpenClawConfig;
  deps: CliDeps;
  workspaceDir: string;
  agentId?: string;
}): Promise<BootRunResult>
```

### Boot Prompt Construction

```typescript
function buildBootPrompt(content: string) {
  return [
    "You are running a boot check. Follow BOOT.md instructions exactly.",
    "", "BOOT.md:", content, "",
    "If BOOT.md asks you to send a message, use the message tool.",
    `After sending, reply with ONLY: ${SILENT_REPLY_TOKEN}.`,
    `If nothing needs attention, reply with ONLY: ${SILENT_REPLY_TOKEN}.`,
  ].join("\n");
}
```

### Session Snapshot/Restore

The main session mapping is saved before execution and restored afterward, to avoid polluting the user's session:

```typescript
const mappingSnapshot = snapshotMainSessionMapping({ cfg, sessionKey });
// ... run boot agent ...
const mappingRestoreFailure = await restoreMainSessionMapping(mappingSnapshot);
```

## Health Monitoring

```
channel-health-monitor.ts:
├── Configurable check interval (default 5 minutes)
├── Configurable stale-event threshold (staleEventThresholdMinutes)
├── Maximum restarts-per-hour limit (maxRestartsPerHour)
├── Three-level config override: per-account > per-channel > default(true)
└── Pushed to all clients via event:health

server/health-state.ts:
├── Maintains a global health snapshot cache
├── Increments healthVersion on every change
├── Clients can fetch incrementally by version number
└── Includes: channel status, Agent status, queue depth
```

## Security Architecture (11 Layers)

```
1.  Transport security — TLS support; non-loopback cleartext ws:// triggers a warning
2.  Authentication modes — Token / Password / Tailscale / Trusted-Proxy / None
3.  Device identity   — Ed25519 key pairs, v3 payload binds platform+deviceFamily
                        nonce-based challenge-response, tolerates 2-minute clock skew
4.  Device pairing    — First-connection approval flow, binds role/scopes
5.  Rate limiting     — per-IP sliding window (10 attempts/60s, 5-minute lockout)
                        tracked independently by scope (shared-secret/device-token/hook-auth)
                        missing credentials don't consume quota, localhost exempt from lockout
6.  Origin checks     — Browser clients must pass allowed-origins validation
7.  RBAC              — Role-level (operator/node) + scope-level
                        (admin/read/write/approvals/pairing)
8.  Control-plane rate limiting — Write methods limited to 3 attempts/60s/client
9.  Slow-consumer protection — Clients with excessive bufferedAmount are disconnected (close 1008)
10. Pre-auth limit    — Messages before auth have a smaller payload limit (MAX_PREAUTH_PAYLOAD_BYTES)
11. Unauthorized flood — Repeated unauthorized requests trigger connection close
```

## Gateway Shutdown Flow

The `close()` method tears down all subsystems in reverse order:

```typescript
// At the end of server.impl.ts
return {
  close: async (opts) => {
    // 1. Run the gateway_stop plugin hook
    await runGlobalGatewayStopSafely({ event: { reason }, ctx: { port } });
    // 2. Stop the diagnostics heartbeat
    if (diagnosticsEnabled) stopDiagnosticHeartbeat();
    // 3. Clear the Skills refresh timer
    skillsChangeUnsub();
    // 4. Dispose the rate limiters
    authRateLimiter?.dispose();
    browserAuthRateLimiter.dispose();
    // 5. Stop model pricing refresh
    stopModelPricingRefresh();
    // 6. Stop channel health monitoring
    channelHealthMonitor?.stop();
    // 7. Clear the secrets runtime snapshot
    clearSecretsRuntimeSnapshot();
    // 8. Perform the full shutdown (channels, cron, heartbeat, WS, HTTP...)
    await close(opts);
  },
};
```
