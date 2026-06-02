# 10 - Project Engineering Structure and Development Practices

## Monorepo Management

### pnpm Workspace

> Source: `pnpm-workspace.yaml`

```yaml
# pnpm-workspace.yaml
packages:
  - .              # Root package (openclaw core)
  - ui             # Control UI (Vite + Lit)
  - packages/*     # Legacy/compatibility packages (clawdbot, moltbot)
  - extensions/*   # Built-in extension packages
```

The current workspace config also includes supply-chain security settings (such as `minimumReleaseAge`, `blockExoticSubdeps`, `overrides`, `allowBuilds`, etc.), where `allowBuilds` controls which native modules are permitted to run builds at install time:
- `@lydell/node-pty` — terminal emulation
- `@napi-rs/canvas` — Canvas rendering
- `sharp` — image processing
- `node-llama-cpp` — local LLM
- `esbuild` / `rastermill` and other build- or media-processing-related dependencies

### Package Dependency Relationships

```
openclaw (root package)
├── dependencies: core runtime dependencies
├── devDependencies: build/test tooling
│
├── ui/ (standalone package)
│   └── Built with Vite, Lit framework
│
├── extensions/* (built-in extension packages)
│   ├── devDependencies: openclaw (workspace:*)
│   ├── dependencies: plugin-specific dependencies
│   └── peerDependencies: openclaw (resolved at runtime)
│
└── packages/*
    ├── clawdbot/ (old-name compatibility)
    └── moltbot/ (old-name compatibility)
```

### Dependency Rules

```
✅ plugin → openclaw/plugin-sdk (public API)
✅ plugin → its own dependencies
❌ plugin → core src/** (absolutely forbidden)
❌ plugin → other plugins (absolutely forbidden)
❌ plugin → workspace:* in dependencies (npm install would break)
```

## Version Management

> Source: `package.json` — version field

### CalVer Version Format

```
CLI: YYYY.M.D (e.g. 2026.5.28)
Stable: vYYYY.M.D
Beta: vYYYY.M.D-beta.N
Patch: vYYYY.M.D-patch
```

**Package manager**: `pnpm@11.2.2` (pinned via the `packageManager` field)

### Release Channels

```
stable → npm dist-tag: latest
beta   → npm dist-tag: beta
dev    → npm dist-tag: dev (when publishing from the main branch)
```

### Version Sync Locations

```
package.json                              → CLI version (currently verified as 2026.5.28)
apps/android/app/build.gradle.kts         → Android (versionName/versionCode)
apps/ios/Sources/Info.plist               → iOS (CFBundleShortVersionString)
apps/macos/.../Info.plist                 → macOS (CFBundleShortVersionString)
extensions/*/package.json                 → all extensions kept in lockstep at the same version
```

## Build System

### Core Build Tool: tsdown

> Source: `tsdown.config.ts`

tsdown is a TypeScript build tool based on Rolldown (a bundler implemented in Rust):

```typescript
// tsdown.config.ts

export default defineConfig([
  nodeBuildConfig({
    entry: buildUnifiedDistEntries(),
    deps: {
      neverBundle: ["@lancedb/lancedb"],  // native modules are not bundled
    },
  }),
]);
```

**Key design — a unified build graph**: the core entry, plugin-sdk subpaths, extension entries, and hook entries are all compiled in a single build, ensuring that **runtime singletons are emitted only once**:

```
Entry points produced by buildUnifiedDistEntries():

1. Core entries:
   ├── src/index.ts
   ├── src/entry.ts
   ├── src/cli/daemon-cli.ts
   └── src/extensionAPI.ts

2. Plugin SDK subpaths:
   └── src/plugin-sdk/*.ts (90+)

3. Extension entries (auto-discovered):
   └── Reads the extensions/*/openclaw.plugin.json manifests
       ├── package.json#openclaw.extensions[] → main entry
       └── package.json#openclaw.setupEntry → setup wizard entry

4. Built-in hook entries (auto-discovered):
   └── Scans src/hooks/bundled/*/handler.ts

Build configuration:
├── platform: "node"
├── fixedExtension: false
├── environment: NODE_ENV = "production" (injected at compile time)
└── neverBundle: ["@lancedb/lancedb"] (native module excluded)
```

### Build Commands

```bash
# Full build (multi-step)
pnpm build
# Steps: tsdown → postbuild → plugin-sdk DTS generation → asset copy → build-info write

# Slim Docker build (skips plugin-sdk DTS and the A2UI bundle)
pnpm build:docker

# UI build
pnpm ui:build   # Vite build of the Control UI
```

### Key Dependencies at a Glance

> Source: `package.json` — dependencies/devDependencies

**Runtime dependencies**:
| Package | Version | Purpose |
|---|---|---|
| `@sinclair/typebox` | 0.34 | Runtime config validation (TypeBox schemas + ajv) |
| `@modelcontextprotocol/sdk` | 1.29 | MCP support |
| `@agentclientprotocol/sdk` | 0.22 | ACP (Agent Client Protocol) |
| `@mariozechner/pi-*` | per package.json | Pi Agent core/coding/TUI |
| `hono` | 4.12 | HTTP framework |
| `commander` | 14 | CLI framework |
| `chokidar` | 5 | File watching |
| `@lydell/node-pty` | — | Terminal emulation |

**Dev dependencies**:
| Package | Version | Purpose |
|---|---|---|
| `tsdown` | 0.22 | Bundler (Rolldown kernel) |
| `oxlint` / `oxfmt` | — | Oxc-ecosystem lint + formatting |
| `@typescript/native-preview` | 7.0.0-dev.20260524 | Native TS compiler (`tsgo`) |
| `vitest` | 4.1 | Test framework |
| `tsx` | — | TypeScript executor |

## TypeScript Configuration

> Source: `tsconfig.json`

```json
{
  "compilerOptions": {
    "strict": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "es2023",
    "lib": ["DOM", "DOM.Iterable", "ES2023", "ScriptHost"],
    "noEmit": true,
    "paths": {
      "openclaw/extension-api": ["./src/extensionAPI.ts"],
      "openclaw/plugin-sdk": ["./src/plugin-sdk/index.ts"],
      "openclaw/plugin-sdk/*": ["./src/plugin-sdk/*.ts"],
      "openclaw/plugin-sdk/account-id": ["./src/plugin-sdk/account-id.ts"]
    }
  },
  "include": ["src/**/*", "ui/**/*", "extensions/**/*"]
}
```

Key design decisions:

- **`strict: true`**: full strict mode
- **`module: "NodeNext"`**: complete ESM support
- **`noEmit: true`**: TypeScript only does type checking; tsdown handles output
- **`paths` aliases**: let extensions import the plugin-sdk just like an external package (`import { ... } from "openclaw/plugin-sdk"`), resolving to source paths during development

## Plugin SDK Public API

> Source: `src/plugin-sdk/index.ts`

The SDK deliberately keeps its root entry "minimal"—heavy functionality lives on dedicated subpaths:

### Value Exports (only 4)

```typescript
// src/plugin-sdk/index.ts — the only 4 value exports

export { emptyPluginConfigSchema } from "...";     // default empty schema
export { registerContextEngine } from "...";        // register a custom context engine
export { delegateCompactionToRuntime } from "...";  // compaction delegation helper
export { onDiagnosticEvent } from "...";            // diagnostic event listener
```

### Type Exports (many)

```typescript
// src/plugin-sdk/index.ts — type exports (excerpt)

// Channel plugin contracts
export type { ChannelPlugin, ChannelConfigSchema, ChannelCapabilities, ChannelGatewayContext };
// Setup flow
export type { ChannelSetupAdapter, ChannelSetupWizard };
// Generic plugin contracts
export type { OpenClawPluginApi, OpenClawPluginConfigSchema };
// LLM provider plugins
export type { ProviderAuthContext, ProviderRuntimeModel };
// Runtime API
export type { PluginRuntime, RuntimeLogger, SubagentRunParams };
// Config
export type { OpenClawConfig };
// Hooks and replies
export type { HookEntry, ReplyPayload, WizardPrompter };
// Context engine plugins
export type { ContextEngine, ContextEngineFactory };
// Stateful binding drivers
export type { StatefulBindingTargetDriver };
```

### 90+ Subpath Exports

Heavy functionality is distributed across dedicated subpaths, imported on demand to avoid loading unrelated code:

```
openclaw/plugin-sdk          → 4 value exports + many types
openclaw/plugin-sdk/routing  → routing utilities
openclaw/plugin-sdk/runtime  → runtime API
openclaw/plugin-sdk/core     → definePluginEntry, defineChannelPlugin
openclaw/plugin-sdk/account-id → account ID utilities
openclaw/plugin-sdk/...      → more
```

## Configuration System

### Config Schema

> Source: `src/config/types.openclaw.ts` + `src/config/types.ts`

OpenClawConfig is broken down into roughly 35 subtype modules, with the main `types.ts` acting as a barrel re-export:

```typescript
// src/config/types.openclaw.ts

export type OpenClawConfig = {
  meta?: { lastTouchedVersion?: string; lastTouchedAt?: string };
  auth?: AuthConfig;
  acp?: AcpConfig;
  env?: {
    shellEnv?: { enabled?: boolean; timeoutMs?: number };
    vars?: Record<string, string>;
  };
  wizard?: { lastRunAt?: string };
  diagnostics?: DiagnosticsConfig;
  logging?: LoggingConfig;
  cli?: CliConfig;
  update?: {
    channel?: "stable" | "beta" | "dev";
    checkOnStart?: boolean;
    auto?: { ... };
  };
  browser?: BrowserConfig;
  ui?: { seamColor?: string; assistant?: { name?: string; avatar?: string } };
  secrets?: SecretsConfig;
  skills?: SkillsConfig;
  plugins?: PluginsConfig;
  models?: ModelsConfig;
  nodeHost?: NodeHostConfig;
  agents?: AgentsConfig;
  tools?: ToolsConfig;
  bindings?: AgentBinding[];
  channels?: ChannelsConfig;
  memory?: MemoryConfig;
  mcp?: McpConfig;
  gateway?: GatewayConfig;
  hooks?: HooksConfig;
  // More: broadcast, audio, media, messages, commands,
  //       approvals, session, web, cron, discovery, canvasHost, talk
};
```

**Validation**: Schemas are defined with `@sinclair/typebox`, runtime validation is done with `ajv`, and both TypeScript types and JSON Schema are generated.

### Configuration Hierarchy

```
Priority (high → low):
1. Environment variables OPENCLAW_*
2. CLI arguments --port, --verbose, --model, ...
3. Config file ~/.openclaw/openclaw.json (JSON5 format)
4. Plugin defaults extensions/*/openclaw.plugin.json
5. Code defaults src/config/config.ts
```

## Code Quality Tools

### Oxlint + Oxfmt

OpenClaw uses the Oxc ecosystem (implemented in Rust) instead of the traditional ESLint + Prettier:

```bash
pnpm check          # oxlint (type-aware) + format check
pnpm lint           # oxlint --type-aware
pnpm format         # oxfmt --write
pnpm format:check   # oxfmt --check
```

`pnpm check` is actually a composite command that includes 15+ custom boundary lint scripts:
- Format checking
- `tsgo` (native TS type checking)
- Plugin isolation checks
- Extension boundary checks
- Channel-agnosticism checks

## Testing System

### Vitest Configuration

> Source: `vitest.config.ts` + `vitest.unit.config.ts`

```
vitest.config.ts           # Base config
vitest.unit.config.ts      # Unit tests (inherits the base config)
vitest.e2e.config.ts       # E2E tests
vitest.gateway.config.ts   # Gateway tests
vitest.channels.config.ts  # Channel tests
vitest.extensions.config.ts # Extension tests
vitest.live.config.ts      # Live tests (require a real API key)
```

#### Key Parameters of the Base Config

```typescript
// Key config in vitest.config.ts

{
  pool: "forks",         // use forks (instead of threads/vmForks)
  workers: isCI
    ? isWindows ? 2 : 3  // CI environment
    : Math.max(4, Math.min(16, cpuCount)),  // local

  testTimeout: 120_000,  // 120 seconds
  hookTimeout: isWindows ? 180_000 : undefined,

  // Environment safety: prevent cross-test pollution
  unstubEnvs: true,
  unstubGlobals: true,

  // Coverage thresholds
  coverage: {
    thresholds: {
      lines: 70,
      functions: 70,
      branches: 55,
      statements: 70,
    },
    include: ["./src/**/*.ts"],
    // excludes extensions/apps/UI
  },

  // Test scope
  include: [
    "src/**/*.test.ts",
    "extensions/**/*.test.ts",
    "test/**/*.test.ts",
  ],
  exclude: ["*.live.test.ts", "*.e2e.test.ts"],
}
```

#### Unit Test Config

```typescript
// vitest.unit.config.ts

// Inherits the base config, adding:
// - Loads precise include/exclude patterns from vitest.unit-paths.mjs
// - Supports the OPENCLAW_VITEST_INCLUDE_FILE env var (a JSON file listing glob patterns)
// - Supports the OPENCLAW_VITEST_EXTRA_EXCLUDE_FILE env var
// - Used for CI shard control
```

### Test Commands

```bash
# Regular tests
pnpm test                    # node scripts/test-parallel.mjs (custom parallel runner)
pnpm test:fast               # vitest run --config vitest.unit.config.ts

# Coverage
pnpm test:coverage           # vitest run --config vitest.unit.config.ts --coverage

# Precise tests
pnpm test -- src/gateway/boot.test.ts  # single file
pnpm test -- -t "test name"            # filter by name

# Extension tests
pnpm test:extension telegram     # test a single extension
pnpm test:extension --list       # list testable extensions
pnpm test:contracts              # cross-plugin contract tests

# Live tests (require a real key)
CLAWDBOT_LIVE_TEST=1 pnpm test:live
LIVE=1 pnpm test:live            # includes provider live

# Low-memory mode
OPENCLAW_TEST_PROFILE=low OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test
```

### Test File Conventions

```
Source file: src/gateway/boot.ts
Test file: src/gateway/boot.test.ts      # co-located
E2E: src/gateway/server.e2e.test.ts     # E2E suffix
Live: src/agents/xai.live.test.ts       # Live suffix (requires a real API)
```

## CI/CD

### GitHub Actions CI Pipeline

> Source: `.github/workflows/ci.yml`

**Triggers**: pushes to `main`, and all Pull Requests. The concurrency group cancels in-progress runs.

**19 jobs**, with smart scope detection skipping irrelevant jobs:

| Job | Purpose | Runner |
|---|---|---|
| `docs-scope` | Detect docs-only changes (skip heavyweight jobs) | Ubuntu 24.04 (Blacksmith 16vcpu) |
| `changed-scope` | Detect changed areas (node/macos/android/windows/python) | Ubuntu |
| `changed-extensions` | Detect per-extension changes, targeted testing | Ubuntu |
| `build-artifacts` | Build and cache dist artifacts | Ubuntu |
| `check` | Format check + `tsgo` + all lint rules + boundary checks | Ubuntu |
| `check-additional` | Dead-code analysis (knip), duplication check (jscpd), LOC limits | Ubuntu |
| `build-smoke` | Full build + singleton check + startup memory check | Ubuntu |
| `checks` | Unit tests (`test:fast`) + coverage | Ubuntu |
| `extension-fast` | Per-extension test isolation | Ubuntu |
| `release-check` | Release-readiness verification | Ubuntu |
| `check-docs` | Docs formatting, lint, link checking, i18n glossary | Ubuntu |
| `skills-python` | Python skill tests | Ubuntu |
| `secrets` | Secret scanning | Ubuntu |
| `checks-windows` | Windows-specific tests | Windows 2025 (Blacksmith 32vcpu) |
| `macos` | macOS build + Swift tests | macos-latest |
| `ios` | iOS build (xcodegen + xcodebuild) | macos-latest |
| `android` | Android build + lint + tests (Gradle) | Ubuntu |

**Key pattern — smart scope detection**:
```
docs-only PR → skip all heavyweight jobs
non-macOS changes → skip macOS/iOS jobs
non-Android changes → skip Android job
non-Windows changes → skip Windows job
```

**Job dependency graph**:
```
docs-scope ──→ changed-scope ──→ checks
                              ──→ check
                              ──→ check-additional
                              ──→ build-smoke
                              ──→ skills-python
           ──→ changed-extensions ──→ extension-fast
           ──→ build-artifacts ──→ release-check
           ──→ check-docs
           ──→ changed-scope ──→ checks-windows
                              ──→ macos ──→ (requires check to complete)
                              ──→ android
```

### Other Workflows

```
.github/workflows/
├── codeql.yml              # Code security scanning
├── docker-release.yml      # Docker release
├── openclaw-npm-release.yml  # npm release
├── plugin-npm-release.yml  # Plugin npm release
├── install-smoke.yml       # Install smoke test
├── sandbox-common-smoke.yml # Sandbox smoke test
├── labeler.yml             # PR auto-labeling
├── stale.yml               # Stale Issue/PR management
└── auto-response.yml       # Auto-response
```

## Docker Support

### Multi-Stage Build

> Source: `Dockerfile`

A carefully designed **4-stage** build:

```dockerfile
# Stage 1: ext-deps — extract the package.json of selected extensions
# Controlled via the OPENCLAW_EXTENSIONS build arg, which decides which extensions are enabled
FROM node:24-bookworm AS ext-deps
# Extract extensions/*/package.json (selected ones only)

# Stage 2: build — install dependencies + build
FROM node:24-bookworm AS build
# Install Bun + pnpm
# pnpm install --frozen-lockfile
# pnpm build:docker (slim build)
# pnpm ui:build

# Stage 3: runtime-assets — slim down runtime assets
FROM build AS runtime-assets
# pnpm prune --prod (remove devDependencies)
# Delete .d.ts and .map files

# Stage 4: runtime — minimal runtime image
FROM node:24-bookworm AS runtime
# Copy only: dist/, node_modules(prod), extensions/, skills/, docs/
# Run as non-root: node user
# Health check: http://127.0.0.1:18789/healthz
# Entrypoint: node openclaw.mjs gateway --allow-unconfigured
```

**Base image choices**:
- Default: `node:24-bookworm`
- Slim: `node:24-bookworm-slim` (via `--build-arg OPENCLAW_VARIANT=slim`)
- The image SHA256 digest is pinned to ensure reproducible builds

**Optional build args**:
- `OPENCLAW_INSTALL_BROWSER` — install Playwright + Chromium
- `OPENCLAW_INSTALL_DOCKER_CLI` — install the Docker CLI (needed by the sandbox)
- `OPENCLAW_DOCKER_APT_PACKAGES` — custom system packages
- `OPENCLAW_EXTENSIONS` — list of enabled extensions

## Extension Package Conventions

> Source: `extensions/telegram/package.json` (a typical example)

```json
{
  "name": "@openclaw/telegram",
  "version": "<root-version>",
  "private": true,
  "type": "module",
  "dependencies": {
    "@grammyjs/runner": "^2.0.3",
    "grammy": "^1.41.1"
  },
  "openclaw": {
    "extensions": ["./index.ts"],
    "setupEntry": "./setup-entry.ts",
    "channel": {
      "id": "telegram",
      "label": "Telegram",
      "docsPath": "/channels/telegram",
      "blurb": "simplest way to get started...",
      "systemImage": "paperplane"
    },
    "bundle": {
      "stageRuntimeDependencies": true
    }
  }
}
```

**`openclaw` field conventions**:
- `extensions` — list of entry-point files (auto-discovered by tsdown)
- `setupEntry` — setup wizard entry
- `channel` — channel metadata (id, label, docs path, UI blurb, icon)
- `bundle` — build-time flags (e.g. staging runtime dependencies into the main bundle)

Built-in extensions are workspace packages, usually versioned in lockstep with the root package; refer to each extension's `package.json` for specifics.

## Key Design Patterns

### 1. Dependency Injection (createDefaultDeps)

```typescript
export function createDefaultDeps(): CliDeps {
  return {
    config: loadConfig(),
    runtime: defaultRuntime,
    logger: createLogger(),
  };
}

async function myCommand(deps: CliDeps) {
  const cfg = deps.config;
  // ...
}
```

### 2. Dynamic Import Boundaries (*.runtime.ts)

```typescript
// ❌ Mixing both styles in the same module
import { foo } from "./heavy-module.js";
const { bar } = await import("./heavy-module.js");

// ✅ Create a dedicated runtime boundary
// heavy-module.runtime.ts (re-exports)
export { foo, bar } from "./heavy-module.js";

// Consumer (lazy loading)
const { foo } = await import("./heavy-module.runtime.js");
```

### 3. Subsystem Logging

```typescript
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("gateway");
const logCanvas = log.child("canvas");
const logChannels = log.child("channels");

log.info("Gateway started");
logCanvas.debug("Canvas host ready");
```

### 4. TypeBox Schema-Driven

```typescript
import { Type } from "@sinclair/typebox";

const ConnectParams = Type.Object({
  auth: Type.Optional(Type.Object({ token: Type.String() })),
  device: DeviceIdentity,
  role: Type.Union([Type.Literal("operator"), Type.Literal("node")])
});

// Auto-generates:
// - JSON Schema (runtime validation)
// - TypeScript types (compile-time type safety)
// - Swift models (iOS/macOS code generation)
```

### 5. Process-Global Symbol Singletons

This pattern is used in both the ContextEngine Registry and the MemoryIndexManager:

```typescript
// Ensures the multiple dist chunks produced by tsdown share the same global state
const STATE_KEY = Symbol.for("openclaw.someGlobalState");

function getState() {
  const g = globalThis as typeof globalThis & { [STATE_KEY]?: State };
  g[STATE_KEY] ??= { /* initial state */ };
  return g[STATE_KEY];
}
```

### 6. Event-Driven Architecture

```typescript
// Gateway internal event system
onAgentEvent(event);               // Agent events
onHeartbeatEvent(event);           // Heartbeat events
onSessionLifecycleEvent(event);    // Session lifecycle
onSessionTranscriptUpdate(event);  // Transcript updates
enqueueSystemEvent(event);         // Enqueue system events
```

## Project Evolution History

```
Warelay → Clawdbot → Moltbot → OpenClaw

The name changes reflect the project's evolution from a personal project to an open-source community project.
The clawdbot/ and moltbot/ under packages/ are legacy compatibility packages.
```
