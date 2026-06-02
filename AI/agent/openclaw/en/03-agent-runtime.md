# 03 - Pi Agent Runtime

## Overview

OpenClaw's Agent runtime is built on **Pi Agent Core** (`@mariozechner/pi-agent-core`), an embedded AI Agent execution engine. It is responsible for:
- Receiving user messages and assembling context
- Calling LLM providers (streaming responses)
- Parsing and executing tool calls (looping until a final reply is produced)
- Managing the subagent lifecycle
- Streaming output to messaging channels (Block Streaming)

## Core File Structure

```
src/agents/
├── agent-scope.ts               # Agent scope resolution (workspace, agentId, sandbox paths)
├── agent-paths.ts               # Agent file path resolution (sessions, workspace, auth-profiles)
├── agent-command.ts             # Agent command execution entry point (agentCommand)
│
├── pi-embedded-runner/          # Pi embedded runner
│   └── runs.ts                  # runEmbeddedPiAgent — the core execution function
│
├── subagent-registry.ts         # Subagent registry
├── acp-spawn.ts                 # ACP subagent creation
├── acp-spawn-parent-stream.ts   # Parent-child streaming communication
│
├── model-catalog.ts             # Model catalog (ModelCatalogEntry type)
├── provider-capabilities.ts     # Provider capability declarations (ProviderCapabilities type)
├── tools/
│   └── common.ts                # AnyAgentTool type definition
│
├── auth-profiles/               # Auth profile management
│   └── types.ts                 # ApiKeyCredential / OAuthCredential types
├── api-key-rotation.ts          # API key rotation (cooldown + round-robin)
│
├── skills/                      # Skills system
│   └── refresh.ts               # Skills snapshot loading and refresh
│
├── apply-patch.ts               # apply_patch tool implementation
├── announce-idempotency.ts      # Idempotency announcement
├── auth-health.ts               # Auth health check
└── anthropic-payload-log.ts     # Payload logging for debugging
```

## The Agent Execution Loop (Agent Loop) in Detail

This is OpenClaw's most central piece of runtime logic—the complete lifecycle of an agentic loop:

### Entry Points

```
1. Gateway RPC: the `agent` and `agent.wait` methods
2. CLI: `openclaw agent --message "..."`
```

### Complete Execution Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    Agent Execution Loop (Agent Loop)          │
│                                                               │
│  1. Receive the request                                       │
│     ├→ The `agent` RPC validates parameters                   │
│     ├→ Resolve the session (sessionKey / sessionId)           │
│     ├→ Persist session metadata                               │
│     └→ Immediately return { runId, acceptedAt }               │
│                                                               │
│  2. agentCommand execution                                    │
│     ├→ Resolve model + thinking/verbose defaults              │
│     ├→ Load the Skills snapshot                               │
│     └→ Call runEmbeddedPiAgent (pi-agent-core runtime)        │
│                                                               │
│  3. runEmbeddedPiAgent                                        │
│     ├→ Serialize runs via per-session + global queues         │
│     ├→ Resolve model + auth profile, build the pi session     │
│     ├→ Subscribe to pi events, stream assistant/tool deltas   │
│     ├→ Enforce a timeout → abort the run if it times out      │
│     └→ Return payloads + usage metadata                       │
│                                                               │
│  4. subscribeEmbeddedPiSession (event bridging)               │
│     ├→ tool events    => stream: "tool"                       │
│     ├→ assistant deltas => stream: "assistant"                │
│     └→ lifecycle events => stream: "lifecycle"                │
│         └→ phase: "start" | "end" | "error"                  │
│                                                               │
│  5. agent.wait (optional wait)                                │
│     ├→ Wait for a lifecycle end/error                         │
│     └→ Return { status: ok|error|timeout, startedAt, endedAt }│
│                                                               │
│  6. Session + workspace preparation                           │
│     ├→ Resolve and create the workspace (sandboxed runs can   │
│        be redirected to a sandbox path)                       │
│     ├→ Skills loaded (or snapshot reused), injected into env  │
│        and prompt                                             │
│     ├→ Bootstrap/context files resolved and injected into the │
│        system prompt                                          │
│     └→ Acquire the session write lock; SessionManager ready   │
│                                                               │
│  7. Tool execution loop                                       │
│     ├→ LLM returns text blocks → streamed out                 │
│     ├→ LLM returns a tool call → execute tool → feed back     │
│        result → call the LLM again                            │
│     ├→ Loop until the LLM produces a plain-text reply         │
│        (no tool calls)                                        │
│     └→ Tool results are recorded/emitted after size and image │
│        payload sanitization                                   │
│                                                               │
│  8. Reply shaping + suppression                               │
│     ├→ Assemble the final payload: assistant text + reasoning │
│        + tool summaries                                       │
│     ├→ "NO_REPLY" is filtered as a silent token               │
│     ├→ Message tool duplicates are removed                    │
│     └→ No renderable payload + tool error → fall back to a    │
│        tool error reply                                       │
│                                                               │
│  9. Compaction + retry                                        │
│     ├→ Automatic compaction emits a compaction stream event   │
│     ├→ A retry may be triggered, resetting the in-memory      │
│        buffers and tool summaries                             │
│     └→ Queue check: if messages are queued, return to step 1  │
└──────────────────────────────────────────────────────────────┘
```

### Timeouts and Early Termination

```
Timeout control:
├── agent.wait default: 30s (waits only, does not stop the Agent)
│   └── The timeoutMs parameter can override this
├── Agent runtime: agents.defaults.timeoutSeconds default 600s
│   └── Enforced via an abort timer inside runEmbeddedPiAgent
│
Early termination scenarios:
├── Agent timeout (abort)
├── AbortSignal (cancellation)
├── Gateway disconnect or RPC timeout
└── agent.wait timeout (the wait times out only; the Agent is not stopped)
```

## System Prompt Assembly

OpenClaw builds a custom system prompt for every Agent run; it **does not use** pi-coding-agent's default prompt.

### Prompt Structure

```
Sections of the system prompt:

1. Tooling          — Current tool list + brief descriptions
2. Safety           — Safety guardrail reminders (avoid power-seeking behavior or circumventing oversight)
3. Skills           — List of available skills (name + description + file path)
4. Self-Update      — How to run config.apply and update.run
5. Workspace        — Working directory path
6. Documentation    — Path to local OpenClaw documentation
7. Workspace Files  — Bootstrap file injection markers
8. Sandbox          — Sandbox runtime info (if enabled)
9. Current Date     — User's time zone (no dynamic clock, to keep the prompt cache stable)
10. Reply Tags      — Optional reply tag syntax
11. Heartbeats      — Heartbeat hints and ack behavior
12. Runtime         — Host, OS, Node, model, repo root, thinking level
13. Reasoning       — Current visibility level + /reasoning toggle hint
```

### Prompt Modes

```typescript
// A runtime setting, not user configuration
promptMode:
  "full"    — Includes all sections (default)
  "minimal" — Used by subagents; omits Skills, Memory Recall, Self-Update,
              Model Aliases, User Identity, Reply Tags, Messaging,
              Silent Replies, Heartbeats
  "none"    — Returns only the basic identity line
```

### Workspace Bootstrap File Injection

After pruning, bootstrap files are appended to the **Project Context** section:

```
Injected files (in order):
├── AGENTS.md      — Operating instructions + memory
├── SOUL.md        — Personality, boundaries, tone
├── TOOLS.md       — Tool usage notes
├── IDENTITY.md    — Agent name, emoji
├── USER.md        — User info, preferences
├── HEARTBEAT.md   — Heartbeat configuration
├── BOOTSTRAP.md   — First-run ritual (new workspaces only, deleted afterward)
└── MEMORY.md      — Long-term memory (or memory.md as a lowercase fallback)

Truncation rules:
├── Max per file: agents.defaults.bootstrapMaxChars (default 20000)
├── Total injection cap: agents.defaults.bootstrapTotalMaxChars (default 150000)
├── Empty files are skipped
├── Large files are truncated, with a truncation marker appended at the end
├── Missing files inject a one-line missing-file marker
└── Truncation warning: agents.defaults.bootstrapPromptTruncationWarning
    (off / once / always, default once)

Subagents inject only: AGENTS.md + TOOLS.md (the rest are filtered out to keep the context lean)
```

### Skills Injection

When skills are available, a compact skills list is injected:

```xml
<available_skills>
  <skill>
    <name>Morning Brief</name>
    <description>Generate a morning briefing</description>
    <location>/path/to/skills/morning-brief/SKILL.md</location>
  </skill>
</available_skills>
```

The model is instructed to use the `read` tool to load the SKILL.md at the given path, keeping the base prompt lean.

### Internal Hook Interception

```
agent:bootstrap hook:
├── Runs before the system prompt is finalized
├── Can modify or replace the injected bootstrap files
└── Example: swap the SOUL.md persona for a specific session
```

## Queue System (Command Queue)

OpenClaw serializes inbound auto-reply runs through an in-process queue to prevent multiple Agent runs from conflicting.

### Queue Architecture

```
Lane-aware FIFO queue:
├── Per-session queue: guarantees only one active run per session at a time
│   └── lane: "session:<key>"
├── Global queue: controls overall parallelism
│   └── lane: "main" (default)
│   └── agents.defaults.maxConcurrent controls the degree of parallelism
├── Additional lanes:
│   ├── "cron"     — Background cron jobs
│   └── "subagent" — Subagent runs
└── No external dependencies: pure TypeScript + Promises

Default concurrency:
├── main lane: 4 (defaults to 1 when not configured)
├── subagent lane: 8
└── Single session: 1 (strictly serialized)
```

### The 4 Queue Modes in Detail

```
┌─────────────────────────────────────────────────────────────┐
│  steer mode                                                  │
│                                                              │
│  Currently executing Agent run                               │
│      │                                                       │
│      ├── Tool call 1 ──→ completes                          │
│      │                                                       │
│      │   ← New message arrives (enters the queue)           │
│      │                                                       │
│      ├── The tool batch the current assistant requested      │
│      │    keeps executing                                    │
│      ├── turn end boundary                                   │
│      └── Inject the queued message → visible to the next     │
│           LLM call                                           │
│                                                              │
│  Behavior: The default mode. It does not interrupt an        │
│        in-flight tool call; instead it injects the new       │
│        message at a model boundary. When the runtime does    │
│        not support steering, it waits for the current run    │
│        to finish.                                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  followup mode                                               │
│                                                              │
│  Currently executing Agent run → completes                   │
│      │                                                       │
│      └── Queued message → a new Agent run                    │
│                                                              │
│  Behavior: The new message waits for the current turn to     │
│        finish, then becomes the input for a new turn         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  collect mode                                                │
│                                                              │
│  Currently executing Agent run → completes                   │
│      │                                                       │
│      └── All queued messages merged into one → a new Agent run│
│                                                              │
│  Behavior: Like followup, but merges all queued messages     │
│        into a single followup                                │
│  Note: If messages target different channels/threads, they   │
│        are handled separately                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  interrupt mode                                              │
│                                                              │
│  Behavior: Abort the session's active run, then run the      │
│        latest message                                        │
└─────────────────────────────────────────────────────────────┘
```

### Queue Configuration

```json5
{
  messages: {
    queue: {
      mode: "steer",             // The current official default mode
      debounceMs: 500,           // Quiet window for followup/collect; also used by Codex steer batching
      cap: 20,                   // Max queued messages per session
      drop: "summarize",         // Overflow strategy: old / new / summarize
      byChannel: {               // Per-channel overrides
        discord: "collect",
        telegram: "steer"
      }
    }
  }
}
// Runtime commands:
// /queue steer                — Set the current session's mode
// /queue collect debounce:2s cap:25 drop:summarize  — Combine options
// /queue default | /queue reset — Clear the session override
```

**Overflow strategy `summarize`**: keeps a short bullet list of the dropped messages' key points and injects it as a synthetic followup prompt.

Current official defaults: `mode: "steer"`, `debounceMs: 500`, `cap: 20`, `drop: "summarize"`. The precedence is in-session `/queue` override > `messages.queue.byChannel` > `messages.queue.mode` > the default `steer`.

## Model Providers

### Model Reference Format

```
Format: "provider/model"
Examples:
  - "openai/<model-id>"
  - "anthropic/<model-id>"
  - "google/<model-id>"
  - "openrouter/moonshotai/kimi-k2"
```

### Provider Plugin Capabilities (Full List)

```typescript
// Provider capability declarations registered by plugins
interface ProviderRegistration {
  // Model catalog
  catalog: ModelCatalogEntry[];              // Static model catalog
  resolveDynamicModel(id: string);           // Dynamic model resolution (any model ID passes through)
  prepareDynamicModel(id: string);           // Metadata refresh
  normalizeResolvedModel(model);             // URL rewriting

  // Authentication
  auth: [{
    label: string;
    kind: "oauth" | "api_key" | "token" | "device_code" | "custom";
    run(ctx: ProviderAuthContext): ProviderAuthResult;
    runNonInteractive(opts): ProviderAuthResult;
  }];
  refreshOAuth(credential: OAuthCredential); // OAuth token refresh
  formatApiKey(key: string);                 // Format the API key
  prepareRuntimeAuth(profile);               // Prepare the runtime token

  // Request customization
  capabilities: ProviderCapabilities;        // Provider capability declarations
  prepareExtraParams(model, params);         // Inject extra request parameters
  wrapStreamFn(fn, model);                   // Wrap the request function (add headers, etc.)

  // Advanced features
  isBinaryThinking();                        // Whether thinking is binary
  supportsXHighThinking();                   // Whether xhigh thinking is supported
  resolveDefaultThinkingLevel();             // Default thinking level
  isCacheTtlEligible();                      // Prompt cache TTL
  fetchUsageSnapshot(): ProviderUsageSnapshot; // Usage query

  // Onboarding
  wizard: {
    setup: [{ label, value }];               // Setup options
    modelPicker: { models: [...] };          // Model picker
  };
}
```

### Auth Profile Management

```
Auth storage path:
~/.openclaw/agents/<agentId>/agent/auth-profiles.json

Credential types:
├── type: "api_key"  → { provider, key }
├── type: "oauth"    → { provider, access, refresh, expires, email? }
│                       (+ projectId / enterpriseUrl for some providers)
└── Profile ID:
    ├── Default: "provider:default" (when there is no email)
    └── OAuth: "provider:<email>" (e.g. "google-antigravity:user@gmail.com")
```

### Auth Profile Rotation Strategy

```
Rotation order (highest to lowest priority):
1. Explicit config: auth.order[provider] (if set)
2. Configured profiles: auth.profiles filtered by provider
3. Stored profiles: entries in auth-profiles.json

Round-robin ordering:
├── Primary key: profile type (OAuth preferred over API keys)
├── Secondary key: usageStats.lastUsed (oldest first, within the same type)
└── Cooldown/disabled profiles are moved to the end

Session pinning (cache-friendly):
├── The selected auth profile is pinned within the session
├── It does not rotate on every request
├── Pinning is released when:
│   ├── The session is reset (/new or /reset)
│   ├── Compaction completes
│   └── The profile enters cooldown/disabled
├── /model ...@<profileId> sets a user override (locked)
└── Automatic pinning acts as a preference (can rotate on rate limits)
```

### Cooldown Mechanism

```
Trigger: auth/rate-limit errors, or timeouts that look like rate limiting

Exponential backoff:
  1 minute → 5 minutes → 25 minutes → 1 hour (cap)

Storage format (auth-profiles.json):
{
  "usageStats": {
    "provider:profile": {
      "lastUsed": 1736160000000,
      "cooldownUntil": 1736160600000,
      "errorCount": 2
    }
  }
}

Billing-disabled (billing failures):
├── Default backoff: starts at 5 hours, doubles, caps at 24 hours
├── Resets the counter after 24 hours with no failures
└── Storage: disabledUntil + disabledReason: "billing"
```

### Model Failover Flow

```
┌──────────────────────────────────────────────────────────┐
│               Two-Phase Failover                          │
│                                                           │
│  Phase 1: Auth profile rotation (within the same provider)│
│  ┌──────────┐    ┌──────────┐    ┌──────────┐           │
│  │ Profile A │ →→ │ Profile B │ →→ │ Profile C │          │
│  │ (OAuth)   │    │ (API Key) │    │ (API Key) │          │
│  └──────────┘    └──────────┘    └──────────┘           │
│       ↓ all fail                                         │
│                                                           │
│  Phase 2: Model fallback (across providers)              │
│  ┌──────────────────┐    ┌──────────────────┐           │
│  │ primary:          │ →→ │ fallback:        │            │
│  │ anthropic/<model> │    │ openai/<model>    │            │
│  └──────────────────┘    └──────────────────┘           │
│                                                           │
│  Error types that trigger failover:                       │
│  ├── auth failures                                        │
│  ├── rate limits                                          │
│  ├── timeouts (after profile rotation is exhausted)       │
│  ├── format/invalid-request errors                        │
│  └── OpenAI-compatible stop-reason: error                 │
│                                                           │
│  Does NOT trigger failover: other generic errors          │
└──────────────────────────────────────────────────────────┘

Configuration:
{
  agents: {
    defaults: {
      model: {
        primary: "anthropic/<model-id>",
        fallbacks: ["openai/<model-id>", "google/<model-id>"]
      }
    }
  }
}
```

## Streaming Output (Block Streaming)

OpenClaw has two independent streaming layers:

### 1. Block Streaming (Channel Messages)

Sends completed **text blocks** as channel messages (not token-level deltas):

```
Model output
  └─ text_delta/events
       ├─ (blockStreamingBreak=text_end)
       │    └─ chunker emits a block as the buffer grows
       └─ (blockStreamingBreak=message_end)
            └─ chunker flushes at message_end
                   └─ channel send (block reply)
```

### 2. Preview Streaming (Telegram/Discord/Slack)

Updates a temporary **preview message**, based on message-level send + edit:

```
Modes:
├── off:      Disable preview streaming
├── partial:  A single preview, replaced by the latest text
├── block:    Chunked/append-style preview updates
└── progress: Shows a progress/status preview while generating, and the final answer on completion

Channel support:
| Channel  | off | partial | block | progress    |
|----------|-----|---------|-------|-------------|
| Telegram | ✅  | ✅      | ✅    | → partial   |
| Discord  | ✅  | ✅      | ✅    | → partial   |
| Slack    | ✅  | ✅      | ✅    | ✅          |
```

### Chunking Algorithm (EmbeddedBlockChunker)

```
EmbeddedBlockChunker rules:
├── Low bound: do not emit while the buffer < minChars (unless forced)
├── High bound: prefer to split before maxChars
├── Break preference (highest to lowest priority):
│   1. paragraph (paragraph boundary \n\n)
│   2. newline (line break \n)
│   3. sentence (sentence boundary)
│   4. whitespace (at whitespace)
│   5. hard break (forced cut)
├── Code fences: never split inside a fence
│   └── On a forced cut: close the fence + reopen it, keeping the Markdown valid
└── maxChars is clamped by the channel's textChunkLimit

Channel text limits:
├── WhatsApp: 4096 characters
├── Telegram: 4096 characters
├── Discord:  2000 characters
└── Discord maxLinesPerMessage: 17 (to avoid UI clipping)
```

### Coalescing

```
Block Streaming coalescing mechanism:
├── Wait for an idle gap (idleMs) before flushing
├── Force a flush when the buffer exceeds maxChars
├── minChars prevents tiny fragments from being sent
├── The final flush always sends the remaining text
├── The joiner is determined by breakPreference:
│   ├── paragraph → "\n\n"
│   ├── newline → "\n"
│   └── sentence → " "
└── Signal/Slack/Discord raise the default minChars to 1500
```

### Human-like Pacing

```json5
{
  agents: {
    defaults: {
      humanDelay: {
        mode: "natural",   // off / natural / custom
        // natural: 800-2500ms
        // custom: { minMs, maxMs }
      }
    }
  }
}
// Applies only to block replies, not to the final reply or tool summaries
```

### Full Configuration

```json5
{
  agents: {
    defaults: {
      blockStreamingDefault: "off",         // "on" / "off"
      blockStreamingBreak: "text_end",      // "text_end" / "message_end"
      blockStreamingChunk: {
        minChars: 800,
        maxChars: 1200,
        breakPreference: "paragraph"        // paragraph/newline/sentence
      },
      blockStreamingCoalesce: {
        minChars: 400,
        maxChars: 2000,
        idleMs: 500
      }
    }
  },
  channels: {
    telegram: {
      streaming: "partial",                 // off/partial/block/progress
      blockStreaming: true,                 // Channel-level override
      textChunkLimit: 4096
    },
    discord: {
      streaming: "partial",
      blockStreaming: false,
      maxLinesPerMessage: 17
    }
  }
}
```

## Thinking Mode

```
User commands:
/think         → Turn on thinking (default level)
/think high    → High thinking budget
/think xhigh   → Extra-high thinking budget (supported by some models)
/think off     → Turn off thinking
/fast          → Fast mode (low latency, provider-specific implementation)

Provider mapping:
├── Anthropic: extended_thinking parameter
├── OpenAI:    reasoning_effort parameter
└── Others:    Provider-plugin custom mapping (isBinaryThinking, supportsXHighThinking)
```

## Subagent System

### ACP (Agent Communication Protocol)

```
src/acp/
├── server.ts              # ACP server
├── client.ts              # ACP client
├── session.ts             # ACP session
├── translator.ts          # Message translator
├── persistent-bindings.ts # Persistent bindings
└── policy.ts              # ACP policy
```

### Subagent Lifecycle

```
Main Agent run
    │
    ├── Tool call: sessions_spawn({
    │     prompt: "...",
    │     model: "provider/model-id",            // Optional different model
    │     tools: { allow: ["read", "exec"] },    // Optional tool restriction
    │     workspace: "..."                        // Optional independent workspace
    │   })
    │   └── Creates the subagent:
    │       ├── Independent session
    │       ├── Independent tool permissions
    │       ├── Can be a different model
    │       └── promptMode: "minimal" (lean system prompt)
    │
    ├── Subagent executes...
    │   └── Streamed results are relayed back to the parent Agent via acp-spawn-parent-stream
    │
    └── Subagent completes
        └── Results are merged into the parent Agent's context

Subagent states: RUNNING / COMPLETED / FAILED / SWEPT (cleaned up)
```

### Subagent Context Control

```
Measures to keep subagents lean:
├── promptMode: "minimal"
│   └── Omits: Skills, Memory, Self-Update, Reply Tags, etc.
├── Bootstrap files: only AGENTS.md + TOOLS.md are injected
├── Context label: "Subagent Context" (instead of "Group Chat Context")
└── Independent session lane (subagent lane concurrency cap of 8)
```

## Built-in Tools

| Tool | Description |
|------|------|
| `read` | Read a file (supports line ranges, images, PDFs) |
| `write` | Write/overwrite a file |
| `edit` | Edit a file (precise diff-based modification) |
| `exec` | Execute a shell command (governed by the sandbox and policy) |
| `apply_patch` | Apply a unified diff patch (optional, tools.exec.applyPatch=true) |
| `message` | Send a message to a channel |
| `notify` | System notification (push to a device via Node) |
| `sessions_list` | List active sessions |
| `sessions_history` | View session history |
| `sessions_send` | Send a message to a specific session |
| `sessions_spawn` | Create a subagent |
| `session_status` | Session status + current timestamp |
| `memory_search` | Semantic memory search (hybrid vector + BM25) |
| `memory_get` | Read a memory file precisely |
| `cron_*` | Scheduled task management |
| `browser` | Browser control (CDP) |
| `canvas.*` | Canvas operations |
| `camera.*` | Camera operations (via Node) |
| `screen.record` | Screen recording (via Node) |
| `location.get` | Get location (via Node) |

## Hook Interception Points

Points in the Agent loop that can be intercepted:

```
Plugin hooks (Agent + Gateway lifecycle):
├── before_model_resolve  — Before model resolution (no messages), can override provider/model
├── before_prompt_build   — After the session is loaded (with messages), can inject:
│   ├── prependContext       — Dynamic text per turn
│   ├── systemPrompt         — System prompt
│   ├── prependSystemContext — Prepend to the system prompt
│   └── appendSystemContext  — Append to the system prompt
├── before_agent_start    — Legacy compatibility hook
├── before_tool_call      — Before a tool call (can modify arguments)
├── after_tool_call       — After a tool call
├── tool_result_persist   — Synchronously transform the tool result (before writing to the transcript)
├── agent_end             — After the Agent completes (can inspect the final message list)
├── before_compaction / after_compaction — Compaction cycle
├── message_received / message_sending / message_sent — Message hooks
└── session_start / session_end — Session lifecycle

Internal hooks (Gateway hooks):
├── agent:bootstrap — Runs while building the bootstrap files
│   └── Can add/remove bootstrap context files
└── Command hooks: /new, /reset, /stop, and similar events
```
