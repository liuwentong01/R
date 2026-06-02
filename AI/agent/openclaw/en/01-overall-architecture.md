# 01 - Overall Architecture Overview

## Architecture Design Philosophy

OpenClaw's architecture is built around several core ideas:

### 1. Gateway as a Centralized Control Plane

The heart of the entire system is a **single-process Gateway**, which is the hub through which all messages flow:

- **Single entry point**: all messaging channels (WhatsApp, Telegram, etc.) connect to this one Gateway
- **Dual WebSocket + HTTP protocols**: WS is used for real-time bidirectional communication, HTTP for Webhooks/REST/UI
- **One instance per machine**: each machine runs only one Gateway (for example, WhatsApp can only have one active Baileys session)
- **Binds locally by default**: `ws://127.0.0.1:18789`, security first
- **Staged HTTP pipeline**: requests pass through 10 stages in priority order until they are handled

### 2. Plugin Everything

OpenClaw takes an aggressive plugin-based approach, keeping the core as small as possible and extending a large amount of functionality through built-in extensions and external plugins:

```
Core                   Plugins (Extensions)        Count
─────────              ──────────────────          ────
Gateway framework       Messaging channels          WhatsApp, Telegram, Slack, Discord, WeChat, QQ, WebChat...
Agent runtime           LLM providers               OpenAI, Anthropic, Google, OpenRouter, local/self-hosted...
Session management       Memory systems              2 (memory-core, memory-lancedb)
Routing engine          Context engine              Extensible
CLI framework           Tool extensions             10+ (browser, firecrawl, tavily...)
Plugin SDK              Integration plugins          5+ (diagnostics, device-pair...)
```

There are **strict import boundaries** between plugins and the core:

```
✅ Allowed:    plugin → openclaw/plugin-sdk (public API)
✅ Allowed:    plugin → its own dependencies
❌ Forbidden:  plugin → core src/** (absolutely forbidden)
❌ Forbidden:  plugin → other plugins (absolutely forbidden)
```

### 3. The Agent as an Independently Isolated Unit

Each agent is a fully isolated "brain" with its own workspace, sessions, and memory:

```
Agent "main"                    Agent "work"
├── workspace/                  ├── workspace/
│   ├── AGENTS.md               │   ├── AGENTS.md        ← operating instructions
│   ├── SOUL.md                 │   ├── SOUL.md          ← personality definition
│   ├── USER.md                 │   ├── USER.md          ← user information
│   ├── TOOLS.md                │   ├── TOOLS.md         ← tool annotations
│   ├── IDENTITY.md             │   ├── IDENTITY.md      ← name/emoji
│   ├── MEMORY.md               │   ├── MEMORY.md        ← long-term memory
│   ├── memory/                 │   ├── memory/          ← daily memory
│   └── skills/                 │   └── skills/          ← workspace skills
├── agents/main/                ├── agents/work/
│   ├── agent/                  │   ├── agent/
│   │   └── auth-profiles.json  │   │   └── auth-profiles.json
│   └── sessions/               │   └── sessions/
│       ├── sessions.json       │       ├── sessions.json
│       └── *.jsonl             │       └── *.jsonl
```

### 4. Security as a First-Class Citizen

As a system that connects to real messaging platforms, security is designed in throughout:

```
Multi-layer security model:
1. Transport security  — TLS support; non-loopback plaintext ws:// is blocked
2. Auth modes          — Token / Password / Device Pairing / Bootstrap Token / None
3. Device identity     — Ed25519 key pairs, nonce-based challenge-response
4. Device pairing      — first-connection approval flow, binding roles/scopes
5. DM pairing          — unknown senders require verification-code pairing
6. Rate limiting       — per-IP rate limiting of authentication failures
7. Origin checks       — browser clients must pass allowed-origins validation
8. RBAC                — operator/node roles + admin/read/write/approvals scopes
9. Sandbox support     — agents can run sandboxed in Docker containers
10. Tool permissions   — per-agent tool allowlists/denylists
11. Local trust        — local connections can be auto-approved; remote connections require explicit approval
```

## Monorepo Structure

```
openclaw/
├── src/                    # Core source code (TypeScript ESM)
│   ├── gateway/            # Gateway server (267 files, the largest module)
│   │   ├── server.impl.ts  #   Main implementation (500+ lines of imports!)
│   │   ├── server-methods.ts #  WS API method handlers
│   │   ├── boot.ts         #   Runs BOOT.md at startup
│   │   └── ...
│   ├── agents/             # Pi Agent runtime
│   │   ├── agent-command.ts #  Agent command execution entry point
│   │   ├── pi-embedded-runner/ # Pi embedded runner
│   │   └── ...
│   ├── sessions/           # Session management (session key, storage, reset)
│   ├── channels/           # Channel abstraction layer
│   ├── routing/            # Message routing (bindings, matching)
│   ├── config/             # Configuration system (JSON5, hot reload)
│   ├── plugins/            # Plugin loading and lifecycle
│   │   ├── loader.ts       #   Main loading orchestrator
│   │   ├── discovery.ts    #   Plugin directory scanning
│   │   ├── registry.ts     #   Registry + API factory
│   │   ├── hooks.ts        #   25 lifecycle hooks
│   │   └── slots.ts        #   Exclusive slot system
│   ├── plugin-sdk/         # Plugin SDK (public API surface)
│   ├── context-engine/     # Context engine (4-phase lifecycle)
│   ├── browser/            # Browser control tool (CDP)
│   ├── canvas-host/        # Canvas/A2UI host
│   ├── node-host/          # Mobile Node host
│   ├── media/              # Media pipeline (image/audio/video)
│   ├── cron/               # Scheduled tasks
│   ├── hooks/              # Internal hook system
│   ├── memory/             # Memory system
│   ├── tts/                # Text-to-speech
│   ├── providers/          # LLM provider abstraction
│   ├── acp/                # Agent Communication Protocol
│   ├── auto-reply/         # Auto-reply pipeline
│   ├── security/           # Security module
│   ├── cli/                # CLI framework
│   ├── commands/           # CLI commands
│   └── ...                 # More submodules
├── extensions/             # Built-in extension packages (channels, providers, tools, memory, etc.)
│   ├── telegram/           # Telegram channel (grammY)
│   ├── discord/            # Discord channel (discord.js)
│   ├── whatsapp/           # WhatsApp channel (Baileys)
│   ├── openai/             # OpenAI models
│   ├── anthropic/          # Anthropic models
│   ├── google/             # Google Gemini models
│   ├── memory-lancedb/     # LanceDB vector memory
│   └── ...
├── ui/                     # Control UI (Lit + Vite)
├── apps/                   # Companion apps
│   ├── ios/                # iOS app (Swift + SwiftUI)
│   ├── android/            # Android app (Kotlin + Compose)
│   └── macos/              # → Swabble
├── Swabble/                # macOS voice assistant framework (Swift)
├── packages/               # Legacy/compatibility packages (clawdbot, moltbot)
├── docs/                   # Documentation (Mintlify)
├── skills/                 # Built-in skills
├── scripts/                # Build and operations scripts
└── test/                   # Integration tests
```

## Key Technology Choices

| Dimension | Choice | Rationale |
|------|------|------|
| Language | TypeScript (ESM) | Orchestration system, easy to extend and read |
| Runtime | Node 24 (recommended) / Node 22.19+ | Mature ecosystem; the official README recommends Node 24 as the runtime |
| Package management | pnpm monorepo | Multi-package workspace management, unifying core, UI, and extensions |
| Build | tsdown (based on Rolldown) | Fast TypeScript builds |
| Type checking | tsgo (tsc implemented in Go) | Extremely fast type checking |
| Plugin loading | Jiti | Runtime TypeScript loading (including SDK alias mapping) |
| Formatting/Lint | Oxfmt + Oxlint | Rust implementation, extremely fast |
| Testing | Vitest | Consistent with the Vite ecosystem |
| Frontend UI | Lit (Web Components) | Lightweight, no framework dependency |
| iOS/macOS | SwiftUI + Observation | Modern Apple ecosystem |
| Android | Kotlin + Jetpack Compose | Modern Android ecosystem |
| Protocol | WebSocket (JSON) | Real-time bidirectional communication |
| Schema | TypeBox | JSON Schema + TypeScript types + Swift model generation |
| Agent core | pi-agent-core | Embedded agent runtime |
| AI SDK | pi-ai | LLM abstraction layer (Model/Api types) |

## Core Dependency Chain

```
openclaw (root package)
├── @mariozechner/pi-agent-core    — Agent execution loop
├── @mariozechner/pi-ai            — LLM API abstraction (Model, Api, StreamFn)
├── @mariozechner/pi-coding-agent  — ModelRegistry types
├── @sinclair/typebox              — JSON Schema + TypeScript types
├── commander                      — CLI framework
└── extensions/* (workspace:*)     — Built-in extension packages

extensions/<plugin>
├── devDependencies: openclaw (workspace:*)
├── dependencies: plugin-specific dependencies
└── peerDependencies: openclaw (resolved at runtime)
```

## Lifecycle Overview

### Gateway Startup Flow

```
openclaw gateway [--port 18789]
    │
    ├── 1. Load configuration (~/.openclaw/openclaw.json, JSON5 format)
    ├── 2. Migrate legacy configuration
    ├── 3. Prepare secrets runtime snapshot
    ├── 4. Start the plugin runtime
    │   ├── Scan 4 sources: config → workspace → bundled → global
    │   ├── Check the openclaw.plugin.json manifest
    │   ├── Check enabled state + resolve dependencies
    │   ├── Jiti dynamic import + call the register function
    │   └── Register into the PluginRegistry (channels, providers, memory, tools...)
    ├── 5. Initialize the channel manager (connect WhatsApp/Telegram/...)
    ├── 6. Start the WebSocket server
    ├── 7. Start the HTTP server (staged pipeline)
    │   ├── Hooks → Tools Invoke → Sessions → Slack Callback
    │   ├── OpenResponses → Chat Completions → Canvas → Plugin Routes
    │   └── Control UI → Health Probes
    ├── 8. Start heartbeat, health monitoring, and Cron scheduling
    ├── 9. Run startup authentication checks
    ├── 10. Run BOOT.md (if present, execute the startup script)
    └── 11. Gateway ready, begin accepting connections
```

### Message Processing Flow

```
1. Channel plugin receives a message → normalizes into InboundMessage
       │
2. DM pairing/allowlist check
   ├── pairing: unknown sender → send pairing code → wait for approval
   ├── allowlist: check the allowlist
   └── open: handle directly
       │
3. Routing engine → determine agentId
   └── bindings rule matching (most specific first)
       │
4. Session resolution → determine sessionKey
   └── dmScope + channel + peer → agent:<agentId>:...
       │
5. Queue management (enqueue into the per-session lane)
   ├── steer: default behavior; inject new messages into the current run at run boundaries
   ├── collect: merge compatible queued messages after the current run finishes
   ├── followup: process queued messages one by one as follow-up turns after the current run finishes
   ├── interrupt: abort the current run and handle the latest message
   └── typing indicator triggers immediately
       │
6. Agent runtime execution:
   a. Inject context (workspace files + session history + tool definitions)
   b. Call the LLM (streaming response)
   c. Tool-call loop (until a plain-text reply is produced)
   d. Streaming output (Block Streaming + Preview Streaming)
       │
7. Reply is sent back to the channel
   ├── Markdown → platform-specific format
   ├── Long-message chunking (per-channel textChunkLimit)
   └── Media attachment handling
```

### Shutdown Flow

```
1. Receive a stop signal
2. Run the gateway_stop hook
3. Stop all channel connections
4. Close the WS server
5. Persist session state
6. Clean up resources (plugin dispose)
```
