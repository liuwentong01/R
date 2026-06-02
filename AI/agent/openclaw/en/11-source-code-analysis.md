# 11 - Review Notes for the Current OpenClaw Version

> Review date: 2026-05-28
> Based on: the official `README.md`, `package.json`, `pnpm-workspace.yaml`, `docs/concepts/*`, and `docs/gateway/*`

## Why the Old Source-Code Analysis Was Replaced

The original file was based on `v2026.4.3` and contained many specific function signatures, model names, version numbers, and configuration examples. OpenClaw evolves quickly, and such source-code snapshots go stale easily; keeping them would mislead later study. This file is therefore reframed as "current facts + volatile points," recording only what can be confirmed from official materials.

## Currently Confirmed Information

### Project Version and Runtime Environment

- Current `package.json` version: `2026.5.28`
- Recommended runtime: Node 24
- Minimum runtime: Node `>=22.19.0`
- Package manager: `pnpm@11.2.2`
- Primary language: TypeScript ESM
- UI: Lit + Vite
- Testing: Vitest
- Lint/Format: Oxlint + Oxfmt
- Build: tsdown, built on top of Rolldown

### Workspace Structure

The official `pnpm-workspace.yaml` currently contains:

```yaml
packages:
  - .
  - ui
  - packages/*
  - extensions/*
```

It also configures `minimumReleaseAge`, `minimumReleaseAgeExclude`, `nodeLinker: hoisted`, `blockExoticSubdeps`, `overrides`, `allowBuilds`, `packageExtensions`, and `patchedDependencies`. This shows it is not just an ordinary monorepo, but also includes fairly strict supply-chain and install-time build controls.

### Gateway Architecture

The official architecture docs still confirm that the Gateway is a single, long-running control plane:

- Listens on `127.0.0.1:18789` by default
- WebSocket carries the control-plane protocol
- HTTP on the same port serves Canvas, A2UI, WebChat, health checks, and compatibility interfaces
- The first frame must be `connect`
- The frame types are still `req`, `res`, and `event`
- `hello-ok.features.methods/events` is discovery metadata, and is not equivalent to a complete generated list of all callable routes
- Methods with side effects (such as `send` and `agent`) require an idempotency key to support safe retries

### Nodes and Pairing

The official docs emphasize that all WS clients—including operators and nodes—must carry a device identity in `connect`. A node connects with `role: "node"` and declares its caps/commands.

Current pairing essentials:

- A new device requires pairing approval
- The Gateway issues a device token for subsequent connections
- Loopback local connections can be auto-approved to preserve the local-machine experience
- Non-local connections such as tailnet/LAN still require explicit approval
- Every connection must sign the `connect.challenge` nonce
- The v3 signature payload binds `platform` and `deviceFamily`

### Agent Runtime and the Queue

The official current queue defaults:

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

This differs from the `collect` default in the old docs. `steer` does not interrupt a tool call in progress; instead, it injects queued messages after the current assistant turn's tool batch completes and before the next LLM call. Only when the runtime cannot accept steering does it wait for the current run to finish before processing.

Queue priority:

1. Per-session `/queue` override
2. `messages.queue.byChannel`
3. `messages.queue.mode`
4. The default `steer`

### Session Semantics

The official docs still state that DMs share a single `main` session by default, which suits a single user using it for themselves; if multiple users can DM the same Agent, you should explicitly set:

```json5
{
  session: {
    dmScope: "per-channel-peer"
  }
}
```

The session lifecycle fields need to be distinguished:

- `sessionStartedAt`: when the current `sessionId` began; the daily reset depends on it
- `lastInteractionAt`: the time of the last real user/channel interaction; the idle reset depends on it
- `updatedAt`: the time the store row was last changed; suitable for listing and maintenance, but should not be used as the authoritative basis for daily/idle resets

System events such as heartbeat, cron, and exec can write metadata, but do not extend the daily/idle reset freshness.

### Skills Loading Locations

The official current Skills priority:

1. `<workspace>/skills`
2. `<workspace>/.agents/skills`
3. `~/.agents/skills`
4. `~/.openclaw/skills`
5. bundled skills
6. `skills.load.extraDirs`

The old docs listed only workspace, managed, and bundled, which is no longer complete.

### Installation and CLI

The official README currently recommends:

```bash
npm install -g openclaw@latest
openclaw onboard --install-daemon
```

Common commands:

```bash
openclaw gateway status
openclaw gateway --port 18789 --verbose
openclaw message send --target +1234567890 --message "Hello from OpenClaw"
openclaw agent --message "Ship checklist" --thinking high
openclaw doctor
```

Note that the `message send` example uses `--target`; the `--to` example in the old docs should not continue to be propagated.

## Content That Tends to Go Stale

The following should not be written as fixed facts in learning docs:

- Specific model names, such as `gpt-*`, `claude-*`, `gemini-*`
- Fixed numbers like a plugin count
- Specific source-code line numbers and function signatures
- Exact dependency versions, unless a review date is noted alongside them
- The number of supported channels—better to list the channels currently in the official README, or point to the official Channels docs
- The dist entry path in Docker/Systemd examples; the OpenClaw release entry point changes with the build method

## Old Content Removed/Replaced This Time

- Removed `RESEARCH-REPORT-2026-04-03.md`: this file was an old-version research report, with obvious version differences from the current README/official docs.
- Replaced the old `11-source-code-analysis.md`: the original file contained a large amount of `v2026.4.3` source-snapshot-style content, and is now reframed as review notes for the current version.

## Suggestions for Ongoing Maintenance

- Before each update to this directory, first cross-check the official `README.md`, `package.json`, `docs/concepts/queue.md`, `docs/concepts/session.md`, and `docs/concepts/agent.md`.
- If source-level analysis must be retained, note the commit SHA, and avoid writing example model names and specific line numbers as long-lived facts.
- Interview-style docs should prioritize design principles and stable boundaries, and write fewer short-lived version numbers.
