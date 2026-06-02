# OpenClaw Architecture Analysis

> Architecture analysis based on the https://github.com/openclaw/openclaw repository and the official documentation
> Initial analysis: 2026-03-21
> Last reviewed: 2026-05-28 (official package.json: 2026.5.28)

## Project Overview

OpenClaw is a **personal AI assistant platform**. Its core idea is to let users run an AI assistant on their own devices and interact with it through existing instant-messaging channels (WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, IRC, Microsoft Teams, Matrix, Feishu, LINE, Mattermost, Nextcloud Talk, Nostr, Synology Chat, Tlon, Twitch, Zalo, Zalo Personal, WeChat, QQ, WebChat, and more).

**Key characteristics:**
- **Local-first**: the Gateway runs on the user's own machine, and all data stays local
- **Unified multi-channel**: a single Gateway controls all messaging platforms
- **Multi-agent routing**: supports multiple independent agents, each with its own workspace, sessions, and permissions
- **Plugin-based architecture**: a minimal core, with channels, LLMs, memory, tools, and other capabilities extended through built-in extensions and external plugins
- **Cross-platform**: macOS/iOS/Android companion apps + CLI + Web UI

**Tech stack:** TypeScript (ESM), Node 24 recommended / Node 22.19+ minimum, pnpm monorepo, Vitest for testing, Lit Web Components

## Document Index

| File | Contents | Priority |
|------|------|----------|
| [01-overall-architecture.md](./01-overall-architecture.md) | Overall architecture overview and core design philosophy | Must-read intro |
| [02-gateway.md](./02-gateway.md) | Gateway control plane (WS/HTTP protocols, authentication, security, health monitoring) | Core |
| [03-agent-runtime.md](./03-agent-runtime.md) | Pi Agent runtime (execution loop, queue, streaming, provider failover) | Core |
| [04-session-management.md](./04-session-management.md) | Session management (session key, dmScope security, pruning, compaction, maintenance) | Core |
| [05-plugin-system.md](./05-plugin-system.md) | Plugin system (38 hooks, 4 execution modes, Plugin SDK API) | Core |
| [06-channel-routing.md](./06-channel-routing.md) | Messaging channels and routing (8-level matching, multi-agent bindings, debounce and deduplication) | Important |
| [07-tools-and-capabilities.md](./07-tools-and-capabilities.md) | Tools and capabilities (Browser/CDP, Canvas/A2UI, Node, Cron, Skills) | Important |
| [08-context-and-memory.md](./08-context-and-memory.md) | Context engine and memory (4-phase lifecycle, vector retrieval, memory flush) | Core |
| [09-companion-apps.md](./09-companion-apps.md) | Companion apps (macOS Swabble, iOS/Android Node, Control UI) | Reference |
| [10-project-structure.md](./10-project-structure.md) | Engineering practices (build, testing, configuration, CI/CD, design patterns) | Reference |
| [11-source-code-analysis.md](./11-source-code-analysis.md) | Source code / official documentation review notes (current version differences, points prone to going stale) | Advanced |

## Architecture Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Messaging Channels                          │
│  WhatsApp │ Telegram │ Slack │ Discord │ Signal │ iMessage │ ...   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Normalized into InboundMessage
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  Gateway (single-process control plane)             │
│               ws://127.0.0.1:18789 + HTTP                           │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │ Channel  │  │ Session  │  │ Routing  │  │  Cron /  │            │
│  │ Manager  │  │ Manager  │  │ Engine   │  │ Webhooks │            │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │  Plugin  │  │   Auth   │  │  Node    │  │  Canvas  │            │
│  │ Runtime  │  │ & Pairing│  │ Registry │  │   Host   │            │
│  │(extens.) │  │(Ed25519) │  │(iOS/And) │  │ (A2UI)   │            │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │
│                                                                      │
│  HTTP Pipeline (10 stages):                                          │
│  Hooks → Tools → Sessions → Slack → OpenResponses →                  │
│  Chat Completions → Canvas → Plugin Routes → Control UI → Health     │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐
  │  Pi Agent    │   │  CLI / TUI   │   │  Companion Apps  │
  │  Runtime     │   │  (openclaw)  │   │  macOS / iOS /   │
  │              │   └──────────────┘   │  Android / WebUI │
  │ ┌──────────┐│                       └──────────────────┘
  │ │ Context  ││   Queue: collect / steer / followup
  │ │ Engine   ││   Streaming: block / preview / coalesce
  │ └──────────┘│   Failover: profile rotation → model fallback
  │ ┌──────────┐│
  │ │ Tools    ││
  │ │ (built-in││
  │ │ +plugins)││
  │ └──────────┘│
  │ ┌──────────┐│
  │ │ Provider ││
  │ │ (30+ LLM)││
  │ └──────────┘│
  └──────────────┘
```

## Core Data Flow

```
1. User sends a message (WhatsApp/Telegram/...)
       │
2. Channel plugin receives it → normalizes into InboundMessage
       │
3. Deduplication (short-lived cache) + debounce (debounceMs merges rapid consecutive messages)
       │
4. DM policy check (pairing / allowlist / open)
       │
5. Routing engine determines the target agent (Bindings, 8-level most-specific-first matching)
       │
6. Session Key resolution (dmScope + channel + peer → agent:<agentId>:...)
       │
7. Queue management (per-session lane serialization, defaults to steer, switchable to followup/collect/interrupt)
       │
8. Pi Agent Runtime processing:
   a. Context engine assembles the context
      ├── System prompt (13 sections + Bootstrap file injection)
      ├── Session history (JSONL, after pruning)
      └── Tool definitions
   b. Auth profile rotation → call the LLM provider (streaming response)
   c. Parse the LLM response → tool calls → execution → feed results back → loop
   d. Block Streaming (EmbeddedBlockChunker + Coalescing)
       │
9. Reply is sent back to the original platform through the channel plugin
   ├── Markdown → platform-specific format
   ├── Long-message chunking (per-channel textChunkLimit)
   └── Optional: human-like pacing (humanDelay)
```
