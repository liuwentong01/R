# 05 - Plugin / Extension System

## Overview

OpenClaw's plugin system is one of its most distinctive architectural designs. It follows a "lean core, capabilities pushed outward" philosophy, implementing a large portion of functionality as plugins—including messaging channels, LLM providers, the memory system, search engines, and more.

## Plugin System Architecture

### Core Components

```
src/plugins/
├── loader.ts                # Main loading orchestrator (Jiti dynamic import + SDK alias mapping)
├── discovery.ts             # Plugin directory scanning (4 sources + safety checks + caching)
├── manifest.ts              # openclaw.plugin.json parsing and validation
├── registry.ts              # Plugin registry + OpenClawPluginApi factory
├── registry-empty.ts        # Empty registry creation
├── types.ts                 # All plugin type definitions (including 38 hook event types)
├── hooks.ts                 # Hook runner (priority sorting + 4 execution modes)
├── slots.ts                 # Exclusive slot system (memory, context-engine)
├── runtime/                 # Plugin runtime
│   ├── index.ts             # Runtime creation
│   └── types.ts             # PluginRuntime type (deep internal access)
├── hook-runner-global.ts    # Global hook runner (globalThis singleton)
├── services.ts              # Plugin service handles (start/stop lifecycle)
├── commands.ts              # Plugin command registration
├── http-path.ts             # HTTP path normalization
├── http-route-overlap.ts    # HTTP route overlap detection
├── interactive.ts           # Interactive handler registration
├── provider-validation.ts   # Provider registration validation
├── provider-auth-types.ts   # Auth type definitions
├── provider-oauth-flow.ts   # OAuth flow
├── path-safety.ts           # Path safety checks
├── roots.ts                 # Plugin source root resolution
├── bundle-manifest.ts       # Bundle manifest loading
└── channel-plugin-ids.ts    # Channel plugin ID resolution

src/plugin-sdk/
├── index.ts                 # SDK entry point (public API plugins can import)
├── core.ts                  # Core SDK (definePluginEntry, defineChannelPluginEntry)
├── plugin-entry.ts          # Lightweight non-channel plugin entry definition
├── routing.ts               # Routing SDK
├── runtime.ts               # Runtime SDK
├── sandbox.ts               # Sandbox SDK
├── provider-setup.ts        # Provider setup
├── self-hosted-provider-setup.ts
├── ollama-setup.ts          # Ollama setup
└── account-id.ts            # Account ID utilities
```

### Plugin Discovery

Plugins are discovered from 4 sources, ordered by priority:

```
Priority (high → low):

1. config (origin: "config")
   └── Paths explicitly configured in plugins.load.paths

2. workspace (origin: "workspace")
   └── <workspace>/extensions/ directory (per-agent scope)

3. bundled (origin: "bundled")
   └── OpenClaw's built-in extensions/ directory

4. global (origin: "global")
   └── ~/.openclaw/extensions/ directory (user-installed, shared across agents)
```

The discovery process includes **safety checks**: it rejects world-writable paths, suspicious file ownership, symbolic links that escape the plugin root, and hard links in non-bundled plugins.

Discovery implementation details (from `src/plugins/discovery.ts`):

```typescript
// Plugin candidate type
type PluginCandidate = {
  idHint: string;          // Plugin ID hint
  source: string;          // Entry file path
  setupSource?: string;    // Setup entry path
  rootDir: string;         // Plugin root directory
  origin: PluginOrigin;    // "config" | "workspace" | "bundled" | "global"
  format?: PluginFormat;
  bundleFormat?: PluginBundleFormat;
  workspaceDir?: string;
  packageName?: string;
  packageVersion?: string;
};

// Reasons a candidate is blocked by safety checks
type CandidateBlockReason =
  | "source_escapes_root"        // Symbolic link escapes the plugin root
  | "path_stat_failed"           // Failed to stat the path
  | "path_world_writable"        // Path is world-writable
  | "path_suspicious_ownership"; // Suspicious file ownership

// Discovery results carry a short-lived cache (1s) to absorb bursty reloads at startup
const DEFAULT_DISCOVERY_CACHE_MS = 1000;
```

### Plugin Manifest File

Every plugin must have an `openclaw.plugin.json` manifest:

```json
{
  "id": "telegram",
  "configSchema": {},
  "channels": ["telegram"],
  "providerAuthEnvVars": {},
  "providerAuthChoices": [],
  "skills": [],
  "enabledByDefault": true,
  "name": "Telegram",
  "description": "Telegram messaging channel"
}
```

Key fields:
- `id` — Unique identifier (required)
- `configSchema` — JSON Schema for the plugin's configuration (required)
- `kind` — `"memory"` | `"context-engine"` (used by the slot system, optional)
- `channels` — List of channel IDs provided (optional)
- `providers` — List of model provider IDs provided (optional)
- `providerAuthEnvVars` — Auth environment variable mapping (optional)
- `skills` — Skills shipped with the plugin (optional)
- `enabledByDefault` — Whether the plugin is enabled by default (optional)

### Plugin Kinds

```
kind types:
├── "channel"          # Messaging channels (telegram, discord, whatsapp...)
├── "provider"         # LLM providers (openai, anthropic, google...)
├── "memory"           # Memory systems (memory-core, memory-lancedb)
├── "context-engine"   # Context engines
├── "tool"             # Tool extensions (browser, firecrawl, tavily...)
├── "integration"      # Integration plugins (diagnostics-otel, device-pair)
└── "general"          # General-purpose plugins
```

### Core Type Definitions (from source)

```typescript
// src/plugins/registry.ts — Plugin record
type PluginRecord = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  format?: PluginFormat;
  bundleFormat?: PluginBundleFormat;
  kind?: PluginKind;              // "memory" | "context-engine"
  source: string;                 // Entry file path
  rootDir?: string;
  origin: PluginOrigin;           // "config"|"workspace"|"bundled"|"global"
  enabled: boolean;
  status: "loaded" | "disabled" | "error";
  error?: string;
  // Counts of the various registered components
  toolNames: string[];
  hookNames: string[];
  channelIds: string[];
  providerIds: string[];
  speechProviderIds: string[];
  mediaUnderstandingProviderIds: string[];
  imageGenerationProviderIds: string[];
  webSearchProviderIds: string[];
  gatewayMethods: string[];
  cliCommands: string[];
  services: string[];
  commands: string[];
  httpRoutes: number;
  hookCount: number;
  configSchema: boolean;
};

// src/plugins/registry.ts — Plugin registry (central data structure)
type PluginRegistry = {
  plugins: PluginRecord[];                    // All plugin records
  tools: PluginToolRegistration[];            // Tool registrations
  hooks: PluginHookRegistration[];            // Hook registrations
  typedHooks: TypedPluginHookRegistration[];  // Typed hooks
  channels: PluginChannelRegistration[];      // Channel plugins
  channelSetups: PluginChannelSetupRegistration[]; // Channel setup entries
  providers: PluginProviderRegistration[];    // LLM providers
  speechProviders: ...;                       // TTS providers
  mediaUnderstandingProviders: ...;           // Media understanding providers
  imageGenerationProviders: ...;              // Image generation providers
  webSearchProviders: ...;                    // Web search providers
  gatewayHandlers: GatewayRequestHandlers;    // Gateway WS methods
  httpRoutes: PluginHttpRouteRegistration[];  // HTTP routes
  cliRegistrars: PluginCliRegistration[];     // CLI commands
  services: PluginServiceRegistration[];      // Service handles
  commands: PluginCommandRegistration[];      // Plugin commands
  conversationBindingResolvedHandlers: ...;   // Conversation binding resolved handlers
  diagnostics: PluginDiagnostic[];            // Diagnostic information
};
```

## Plugin Lifecycle

```
┌──────────────────────────────────────────────┐
│              Plugin loading flow               │
│                                               │
│  1. Gateway starts                            │
│     └→ loadGatewayPlugins()                   │
│                                               │
│  2. Scan the extensions/ directory            │
│     └→ Check each subdirectory for            │
│        openclaw.plugin.json                   │
│                                               │
│  3. Check enabled status                      │
│     └→ config.plugins.entries[id].enabled     │
│                                               │
│  4. Resolve dependencies                      │
│     └→ Check peerDependencies                 │
│                                               │
│  5. Load plugin code                          │
│     └→ Dynamically import the entry file      │
│     └→ Call the default export (register fn)  │
│                                               │
│  6. Register into the plugin registry         │
│     └→ Call api.registerChannel() /           │
│        api.registerProvider() /               │
│        api.registerContextEngine() / ...       │
│                                               │
│  7. Initialize                                │
│     └→ Establish channel connections /        │
│        load model catalogs / ...              │
│                                               │
│  8. Running                                   │
│     └→ Handle events, respond to requests     │
│                                               │
│  9. Shutdown                                  │
│     └→ dispose() to clean up resources        │
└──────────────────────────────────────────────┘
```

## Plugin SDK API

### PluginRuntime (Deep Internal Access)

Trusted plugins gain deep access to OpenClaw internals through `api.runtime`:

```typescript
runtime.config           // Load/write configuration files
runtime.agent            // Agent directory resolution, embedded pi-agent runner, session storage
runtime.subagent         // Create and manage subagents (run, waitForRun, getSessionMessages)
runtime.channel          // Channel-specific runtime operations
runtime.system           // System events, heartbeats, process execution
runtime.media            // Media loading, MIME detection, image scaling
runtime.tts / runtime.stt     // TTS / STT
runtime.mediaUnderstanding    // Visual description, audio transcription
runtime.imageGeneration       // Image generation
runtime.webSearch             // Web search
runtime.tools                 // Memory tool factory
runtime.events                // Agent event listeners, transcript update listeners
runtime.logging               // Logging
runtime.state                 // State directory resolution
runtime.modelAuth             // Resolve API keys for models/providers
```

### Registration Modes

`PluginRegistrationMode` (from `src/plugins/types.ts`) has 6 registration modes:

```
"full"           — Live runtime activation (tools, hooks, providers, etc. all registered; long-lived side effects may start)
"discovery"      — Read-only capability discovery (skip sockets/workers/clients)
"tool-discovery" — Capability discovery for executable tools (skip channel runtime hydration)
"setup-only"     — Lightweight channel setup entry only (used to enable a setup wizard for unconfigured channels)
"setup-runtime"  — Setup flow plus the runtime channel entry (configured channels are deferred and fully loaded after the Gateway starts listening)
"cli-metadata"   — CLI command metadata collection
```

### Channel Plugin API

```typescript
// Example structure of extensions/telegram/index.ts
export default function register(api: PluginAPI) {
  api.registerChannel("telegram", {
    // Channel info
    info: {
      id: "telegram",
      displayName: "Telegram",
      supportsGroups: true,
      supportsThreads: true,    // Forum topics
      supportsReactions: true,
    },

    // Start the channel connection
    async start(config) {
      const bot = new Bot(config.botToken);
      bot.on("message", (ctx) => {
        // Normalize the message and forward it to the Gateway
        api.onInboundMessage({
          channel: "telegram",
          from: String(ctx.from.id),
          text: ctx.message.text,
          // ...more fields
        });
      });
      await bot.start();
    },

    // Send a message to the channel
    async send(params) {
      await bot.api.sendMessage(params.to, params.text);
    },

    // Channel status
    async status() {
      return { connected: true, botUsername: "..." };
    },

    // Cleanup
    async dispose() {
      await bot.stop();
    }
  });
}
```

### Provider Plugin API

```typescript
// Example structure of extensions/openai/index.ts
export default function register(api: PluginAPI) {
  api.registerProvider("openai", {
    // Model catalog
    catalog: [
      {
        id: "<model-id>",
        name: "Current OpenAI model",
        contextWindow: 256000,
        maxTokens: 32000,
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 3, output: 15, cacheRead: 0.75, cacheWrite: 3.75 },
      },
      // ... more models
    ],

    // Authentication flows
    auth: [{
      label: "API Key",
      async run() { /* interactive setup */ },
      async runNonInteractive(opts) { /* headless setup */ },
    }],

    // Onboarding UI
    wizard: {
      setup: [{ label: "OpenAI API Key", value: "openai-api-key" }],
      modelPicker: { models: [...] },
    },

    // Runtime capabilities
    capabilities: {
      providerFamily: "openai",
      supportsToolStreaming: true,
    },

    // Dynamic model resolution
    async resolveDynamicModel(modelId) {
      // Allow any model ID to pass through
    },

    // Request customization
    async prepareExtraParams(model, params) {
      return { ...params, stream: true };
    },

    // Request wrapping
    async wrapStreamFn(fn, model) {
      return async (req) => {
        // Add custom headers
        req.headers["X-Custom"] = "value";
        return fn(req);
      };
    },
  });
}
```

### Memory Plugin API

```typescript
// Example of extensions/memory-lancedb/index.ts
export default function register(api: PluginAPI) {
  api.registerMemoryPlugin("memory-lancedb", {
    info: {
      id: "memory-lancedb",
      name: "LanceDB Memory",
    },

    // Search memory
    async search(query, options) {
      // Hybrid vector + BM25 search
      return results;
    },

    // Read a memory file
    async get(path, lineRange) {
      return { text: "...", path };
    },

    // Update the index
    async index(files) {
      // Rebuild the vector index
    },

    // Cleanup
    async dispose() { /* ... */ }
  });
}
```

### Context Engine Plugin API

```typescript
api.registerContextEngine("my-engine", () => ({
  info: {
    id: "my-engine",
    name: "My Context Engine",
    ownsCompaction: true,     // Whether it takes over compaction
  },

  // Ingest a message
  async ingest({ sessionId, message, isHeartbeat }) {
    return { ingested: true };
  },

  // Assemble context
  async assemble({ sessionId, messages, tokenBudget }) {
    return {
      messages: buildContext(messages, tokenBudget),
      estimatedTokens: countTokens(messages),
      systemPromptAddition: "Use lcm_grep to search history...",
    };
  },

  // Compaction
  async compact({ sessionId, force }) {
    return { ok: true, compacted: true };
  },

  // Post-processing (optional)
  async afterTurn({ sessionId, messages }) { /* ... */ },

  // Subagent ended (optional)
  async onSubagentEnded({ parentSessionId, childSessionId }) { /* ... */ },
}));
```

## Lifecycle Hook System (38 Hooks)

Plugins register hooks via `api.on(hookName, handler, { priority })`. Hook handlers run sequentially in descending `priority` (higher runs first); same-priority hooks keep registration order. `api.on` also accepts an optional `timeoutMs` per-hook budget; operators can set budgets without patching plugin code via `plugins.entries.<id>.hooks.timeoutMs` / `hooks.timeouts.<hookName>`.

The authoritative list of hook names is `PLUGIN_HOOK_NAMES` in `src/plugins/hook-types.ts` (which carries a compile-time exhaustiveness assertion against the `PluginHookName` union), totaling **38**, of which `subagent_spawning` and `deactivate` are deprecated compatibility aliases. By the runner mechanics there are 4 execution modes:

### 1. Void Hooks (Fire-and-Forget, Parallel Execution)
```
agent_end             — Agent execution ended (observe final messages, success state, duration)
model_call_started    — Model call started (sanitized metadata, no prompt/response content)
model_call_ended      — Model call ended (sanitized metadata, timing, outcome)
llm_input             — Before the LLM request is sent (observe input)
llm_output            — After the LLM response is received (observe output, usage)
before_compaction     — Before compaction
after_compaction      — After compaction
before_reset          — Before a session reset (/new, /reset)
message_received      — Message received
message_sent          — After a message is sent
after_tool_call       — After a tool call
session_start         — Session started
session_end           — Session ended
subagent_spawned      — After a subagent is created
subagent_ended        — After a subagent ends
gateway_start         — Gateway started
gateway_stop          — Gateway stopped
cron_changed          — Gateway cron lifecycle change (added/updated/removed/started/finished/scheduled)
deactivate            — Deprecated compatibility alias for gateway_stop
```

### 2. Modifying Hooks (Sequential Execution, Results Merged)
```
before_model_resolve  — Before model resolution (can override provider/model)
agent_turn_prepare    — Consume queued turn injections and add same-turn context before prompt hooks
before_prompt_build   — Before prompt building (can inject context/system prompt)
before_agent_start    — Compatibility combined phase (deprecated; prefer the two hooks above)
before_agent_finalize — Before a natural final answer is accepted (can request one more model pass)
before_agent_run      — Gate before model input (returns pass/block; most-restrictive decision wins)
message_sending       — While a message is being sent (can modify content or cancel)
reply_payload_sending — Before a normalized reply payload is delivered (sequential, can rewrite or cancel)
before_tool_call      — Before a tool call (can modify args, block, or require approval)
subagent_spawning     — While a subagent is being created (deprecated)
subagent_delivery_target — Subagent delivery target
heartbeat_prompt_contribution — Heartbeat-turn-only context contribution
before_install        — After a skill/plugin install scan (can add findings or block the install)
```

### 3. Claiming Hooks (Sequential Execution, First-Handled-Wins)
```
inbound_claim         — Inbound message claim (the first handler wins)
before_agent_reply    — Short-circuit the model turn with a synthetic reply
before_dispatch       — Inspect/rewrite an outbound dispatch before channel handoff
reply_dispatch        — Participate in the final reply-dispatch pipeline
```

### 4. Synchronous Hooks (Hot Path, No async)
```
tool_result_persist   — Tool result persistence
before_message_write  — Before a message is written
```

**Safety feature:** `PROMPT_INJECTION_HOOK_NAMES` lists 4 hooks classified as "prompt injection": `agent_turn_prepare`, `before_prompt_build`, `before_agent_start`, and `heartbeat_prompt_contribution`, governed by the `plugins.entries.<id>.hooks.allowPromptInjection` policy. In addition, the raw conversation hooks in `CONVERSATION_HOOK_NAMES` (`before_model_resolve`, `before_agent_reply`, `llm_input`, `llm_output`, `before_agent_finalize`, `agent_end`, `before_agent_run`) require non-bundled plugins to explicitly set `plugins.entries.<id>.hooks.allowConversationAccess = true` to register.

### Hook Runner Implementation (from source)

```typescript
// src/plugins/hooks.ts — Hooks sorted by priority
function getHooksForName<K extends PluginHookName>(
  registry: HookRunnerRegistry,
  hookName: K,
): PluginHookRegistration<K>[] {
  return (registry.typedHooks as PluginHookRegistration<K>[])
    .filter((h) => h.hookName === hookName)
    .toSorted((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    // Higher priority runs first (descending order)
}

// Hook runner options
type HookRunnerOptions = {
  logger?: HookRunnerLogger;
  catchErrors?: boolean;  // Catch errors and log them instead of throwing
  // Per-hook failure policy: defaults to fail-open, can be set to fail-closed per hook
  failurePolicyByHook?: Partial<Record<PluginHookName, HookFailurePolicy>>;
  // Timeout for void/observation hooks (a timed-out hook is logged and the runner continues; the plugin's work is not cancelled)
  voidHookTimeoutMsByHook?: Partial<Record<PluginHookName, number>>;
  // Timeout for modifying hooks (a timed-out hook is logged and skipped; the plugin's work is not cancelled)
  modifyingHookTimeoutMsByHook?: Partial<Record<PluginHookName, number>>;
};
```

### Prompt Injection Safety Controls

```typescript
// Unauthorized prompt injection hooks are constrained
// Legacy compatibility for before_agent_start: strip prompt mutation fields
const constrainLegacyPromptInjectionHook = (
  handler: PluginHookHandlerMap["before_agent_start"],
): PluginHookHandlerMap["before_agent_start"] => {
  return (event, ctx) => {
    const result = handler(event, ctx);
    // Both sync and async results pass through stripPromptMutationFields
    return stripPromptMutationFieldsFromLegacyHookResult(result);
  };
};

// Configuration control:
// plugins.entries.<pluginId>.hooks.allowPromptInjection = true
// Only explicitly authorized plugins can inject context via before_prompt_build
```

## Plugin Slot System

Certain plugin kinds are **exclusive** (only one can be active at a time). From `src/plugins/slots.ts`:

```typescript
// Kind → Slot mapping
const SLOT_BY_KIND: Record<PluginKind, PluginSlotKey> = {
  memory: "memory",
  "context-engine": "contextEngine",
};

// Default slot values
const DEFAULT_SLOT_BY_KEY: Record<PluginSlotKey, string> = {
  memory: "memory-core",
  contextEngine: "legacy",
};

// Exclusive selection: when a new slot plugin is selected, automatically disable other plugins of the same kind
function applyExclusiveSlotSelection(params: {
  config: OpenClawConfig;
  selectedId: string;
  selectedKind?: PluginKind;
  registry?: { plugins: SlotPluginRecord[] };
}): SlotSelectionResult {
  // 1. Get the slot key (memory or contextEngine)
  // 2. Set the new slot value
  // 3. Iterate over other plugins of the same kind and set enabled: false
  // 4. Return the updated config + warnings
}
```

Configuration example:

```json5
{
  plugins: {
    slots: {
      contextEngine: "legacy",       // Context engine (default "legacy")
      memory: "memory-core",         // Memory system ("none" to disable)
    },
    entries: {
      "memory-lancedb": {
        enabled: true,
        // Plugin-specific configuration
      },
      "lossless-claw": {
        enabled: true,
      }
    }
  }
}
```

## Plugin Tool Registration (from source)

```typescript
// src/plugins/registry.ts — Tool registration type
type PluginToolRegistration = {
  pluginId: string;
  pluginName?: string;
  factory: OpenClawPluginToolFactory;  // Context-aware factory function
  names: string[];                     // List of tool names
  optional: boolean;                   // Whether it is optional
  source: string;
  rootDir?: string;
};

// src/plugins/types.ts — Tool context
type OpenClawPluginToolContext = {
  config?: OpenClawConfig;
  workspaceDir?: string;
  agentDir?: string;
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;           // Regenerated on each /new and /reset
  messageChannel?: string;
  agentAccountId?: string;
  requesterSenderId?: string;   // Trusted sender ID (provided at runtime)
  senderIsOwner?: boolean;      // Whether the sender is the owner
  sandboxed?: boolean;
};

// Factory pattern: dynamically create tools based on context
type OpenClawPluginToolFactory = (
  ctx: OpenClawPluginToolContext,
) => AnyAgentTool | AnyAgentTool[] | null | undefined;
// Returning null/undefined means the tool is unavailable in this context
```

## Plugin Provider Authentication (from source)

```typescript
// src/plugins/types.ts — Auth types
type ProviderAuthKind = "oauth" | "api_key" | "token" | "device_code" | "custom";

type ProviderAuthResult = {
  profiles: Array<{
    profileId: string;              // e.g. "provider:default" or "provider:user@email.com"
    credential: AuthProfileCredential;
  }>;
  configPatch?: Partial<OpenClawConfig>;  // Config patch applied after authentication
  defaultModel?: string;                   // Suggested default model
  notes?: string[];                        // Informational notes
};

type ProviderAuthContext = {
  config: OpenClawConfig;
  agentDir?: string;
  workspaceDir?: string;
  prompter: WizardPrompter;       // Interactive prompter
  runtime: RuntimeEnv;
  opts?: ProviderAuthOptionBag;   // CLI preset flags
  secretInputMode?: SecretInputMode;
  allowSecretRefPrompt?: boolean; // Whether to offer a choice of secret storage mode
  isRemote: boolean;
  openUrl: (url: string) => Promise<void>;
  oauth: {
    createVpsAwareHandlers: typeof createVpsAwareOAuthHandlers;
  };
};
```

## Plugin Installation and Management

### CLI Commands

```bash
# Install from npm
openclaw plugins install @martian-engineering/lossless-claw

# Install from a local path (for development)
openclaw plugins install -l ./my-plugin

# Enable/disable
openclaw plugins enable my-plugin
openclaw plugins disable my-plugin

# List
openclaw plugins list

# Diagnostics
openclaw doctor
```

### Package Structure

```
extensions/telegram/
├── openclaw.plugin.json   # Plugin manifest (required)
├── package.json           # npm package descriptor
├── index.ts               # Entry file (register function)
├── api.ts                 # Internal API barrel file
├── runtime-api.ts         # Runtime API barrel file
├── setup-entry.ts         # Onboarding setup entry
├── session-key-api.ts     # Session key API (some plugins)
└── src/                   # Implementation details
    ├── channel.ts         # Channel implementation
    ├── send.ts            # Send logic
    ├── group.ts           # Group handling
    ├── media.ts           # Media handling
    └── ...
```

### Import Boundary Rules

This is a **strict architectural constraint**:

```
✅ Allowed:
  extensions/telegram/src/channel.ts
    import { ... } from "openclaw/plugin-sdk"
    import { ... } from "openclaw/plugin-sdk/core"
    import { ... } from "openclaw/plugin-sdk/routing"
    import { ... } from "../api.ts"
    import { ... } from "../runtime-api.ts"

❌ Forbidden:
  extensions/telegram/src/channel.ts
    import { ... } from "../../src/gateway/..."      // Cannot reference core code
    import { ... } from "../../src/plugin-sdk/..."   // Cannot directly reference the SDK implementation
    import { ... } from "../../../extensions/discord/..." // Cannot reference other plugins
```

## Plugin List

### Channel Plugins (Messaging Channels)

| Plugin | Platform | Technology |
|------|------|------|
| `telegram` | Telegram | grammY |
| `discord` | Discord | discord.js |
| `whatsapp` | WhatsApp | Baileys |
| `slack` | Slack | Bolt |
| `signal` | Signal | signal-cli |
| `bluebubbles` | iMessage | BlueBubbles API |
| `imessage` | iMessage (legacy) | Direct imsg |
| `irc` | IRC | irc library |
| `msteams` | Microsoft Teams | Bot Framework |
| `matrix` | Matrix | matrix-js-sdk |
| `googlechat` | Google Chat | Chat API |
| `feishu` | Feishu | Feishu Open Platform |
| `line` | LINE | Messaging API |
| `mattermost` | Mattermost | REST API |
| `nextcloud-talk` | Nextcloud Talk | API |
| `nostr` | Nostr | NIP protocols |
| `synology-chat` | Synology Chat | Webhook |
| `tlon` | Tlon/Urbit | Tlon API |
| `twitch` | Twitch | TMI.js |
| `zalo` | Zalo OA | Zalo API |
| `zalouser` | Zalo personal | Zalo API |
| `wechat` | WeChat | WeChat ecosystem integration |
| `qqbot` | QQ | QQ Bot |
| `webchat` | WebChat | Gateway Web UI |
| `voice-call` | Voice call | Twilio/ElevenLabs |

### Provider Plugins (LLM Models)

| Plugin | Provider | Example Models |
|------|--------|----------|
| `openai` | OpenAI | Per the official model catalog |
| `anthropic` | Anthropic | Per the official model catalog |
| `google` | Google Gemini | Per the official model catalog |
| `openrouter` | OpenRouter | Aggregates multiple providers |
| `ollama` | Ollama | Local models |
| `github-copilot` | GitHub Copilot | OAuth |
| `copilot-proxy` | Copilot proxy | Proxy mode |
| `amazon-bedrock` | AWS Bedrock | Multiple providers |
| `microsoft` | Azure OpenAI | Microsoft-hosted |
| `mistral` | Mistral | mistral-large |
| `xai` | xAI | Grok |
| `moonshot` | Moonshot | Kimi K2.5 |
| `zai` | Z.AI | GLM-5 |
| `minimax` | MiniMax | M2.5 |
| `qianfan` | Baidu Qianfan | Domestic models |
| `modelstudio` | Model Studio | Multiple providers |
| `volcengine` | Volcano Engine | Doubao |
| `byteplus` | BytePlus | International Volcano Engine |
| `together` | Together | Open-source models |
| `nvidia` | NVIDIA | NVIDIA models |
| `huggingface` | HuggingFace | Open-source models |
| `perplexity` | Perplexity | Search-augmented |
| `venice` | Venice | Privacy-focused models |
| `vllm` | vLLM | Self-hosted |
| `sglang` | SGLang | Self-hosted |
| `qwen-portal-auth` | Tongyi Qianwen | OAuth |
| `kimi-coding` | Kimi Coding | Coding models |
| `kilocode` | Kilo Gateway | Aggregation proxy |

### Feature Plugins

| Plugin | Feature |
|------|------|
| `memory-core` | Built-in memory (Markdown + search) |
| `memory-lancedb` | LanceDB vector memory |
| `brave` | Brave Search integration |
| `tavily` | Tavily search |
| `firecrawl` | Firecrawl web scraping |
| `elevenlabs` | ElevenLabs TTS |
| `lobster` | Lobster persona system |
| `llm-task` | LLM task scheduling |
| `diffs` | Diff visualization |
| `open-prose` | Document editing |
| `talk-voice` | Talk-mode voice |
| `phone-control` | Phone control |
| `device-pair` | Device pairing |
| `thread-ownership` | Thread ownership |
| `diagnostics-otel` | OpenTelemetry diagnostics |
| `openshell` | Shell integration |
| `acpx` | ACP extension |
