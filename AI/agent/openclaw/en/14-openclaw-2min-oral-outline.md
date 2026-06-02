# OpenClaw 2-Minute Oral Outline (matching the 36 questions)

## How to Use

- This isn't a full answer set; it's an "oral skeleton."
- For each question, I suggest speaking in the order `definition -> why it's designed this way -> how it's implemented -> pros and cons / summary`.
- It works best alongside `13-openclaw-classic-detailed-interview-qa.md`.

## I. Overall Understanding and Architecture Overview

### 01. What is OpenClaw?
- Opening line: OpenClaw isn't an ordinary chat bot; it's a personal AI assistant platform that runs on the user's own device.
- First cover the four traits: Local-first, unified multi-entry, multi-Agent, plugin-based.
- Then cover how it differs from an ordinary bot: it doesn't just answer questions, it also connects message channels, device capabilities, long-term memory, and tool execution.
- Finally, sum up: it's more like a "personal AI operating system" or a "personal intelligence hub."

### 02. How do you describe OpenClaw's overall architecture?
- The three-layer framing: control plane Gateway, execution plane Agent Runtime, extension plane Plugins/Memory/Context Engine.
- Then add one real message path: message ingestion -> routing -> session -> runtime -> tool loop -> reply delivery.
- Emphasize that the model doesn't connect directly to message platforms; there's a unified control layer in the middle.
- Wrap up: the benefit of this is unified state, controllable security, and easy extensibility.

### 03. Why use a Gateway-centralized control plane?
- Lead with the core point: to unify state, unify the security entry point, and unify orchestration.
- Expand on the state issue: session, routing, presence, health, and token usage can't be maintained in a scattered way.
- Expand on the security issue: authentication, pairing, rate limiting, RBAC, and tool permissions are all best centralized at the entry layer.
- Summary: the cost is having one large core module, but in exchange you get consistency and observability.

### 04. Why use both WebSocket and HTTP?
- First explain the division of responsibilities: WS handles real-time bidirectional control, HTTP handles APIs, the compatibility layer, and hosted resources.
- WS examples: connect, presence, health, agent streaming.
- HTTP examples: webhook, OpenAI-compatible API, Canvas, Control UI, healthz.
- Summary: it's not protocol duplication; it's a split between the control plane and the service plane.

### 05. Why emphasize Local-first?
- Opening: Local-first isn't just a deployment method; it's a product philosophy.
- Cover three points: privacy first, control stays in the user's hands, and easy integration with the local workspace and device capabilities.
- Example: it binds to `127.0.0.1:18789` by default, and both session and memory files are stored locally.
- Wrap up: local-first is what makes it more like a "personal assistant" rather than a purely cloud-based bot.

### 06. Why support multiple Agents?
- First cover the problem with a single assistant: muddled responsibilities, memory pollution, and excessive permissions.
- Then cover the isolation points of multi-Agent: workspace, session, memory, skills, auth profiles, tools.
- Example: a work assistant and a home assistant are kept separate, with both messages and permissions isolated.
- Summary: the core problem multi-Agent solves isn't concurrency; it's responsibility and security boundaries.

## II. Gateway, Message Path, and Routing

### 07. How does a message's complete path flow?
- The four-stage framing: inbound normalization -> Gateway control logic -> Agent Runtime execution -> outbound delivery.
- Inbound control focus: deduplication, debouncing, DM policy, bindings routing, sessionKey, queue.
- Runtime focus: system prompt, history, tools, model calls, tool loop.
- Outbound focus: streaming, chunking, platform formatting, channel delivery.

### 08. Why does routing use "most-specific-first"?
- First cover the problem: coarse-grained rules can easily steal messages that should have hit a precise match.
- Then cover the approach: an exact peer match takes priority over account/channel-level fallbacks.
- Add one note: this is a hierarchical design of routing rules, not simple sequential matching.
- Summary: the goal is to make multi-Agent routing stable and predictable.

### 09. What's the difference between `dmPolicy` and `dmScope`?
- One-line distinction: `dmPolicy` governs "whether you can get in," `dmScope` governs "which session you belong to once you're in."
- `dmPolicy` covers pairing / allowlist / open.
- `dmScope` covers main / per-peer / per-channel-peer / per-account-channel-peer.
- Finally, emphasize: many leakage problems aren't access-control problems, they're session-isolation problems.

### 10. Why is `dmScope="main"` risky in multi-user scenarios?
- Opening: it folds multiple DM sources into the same main session.
- Give a risk example: Alice's context gets inherited by Bob.
- Then cover what scenarios it suits: single-user personal use, unified multi-entry.
- Wrap up: for multiple users, you should switch to `per-channel-peer` or a more fine-grained mode.

### 11. Why is the Gateway the single source of truth for Session?
- First correct the misconception: a session isn't just a JSONL file.
- Explain that it also includes the mapping relationships, usage, metadata, and current state.
- Explain why clients can't read local files directly: remote mode, inconsistency, incomplete state.
- Summary: the file is the storage medium, but the Gateway is the holder of session semantics.

### 12. Why do deduplication and debouncing?
- First separate the two problems: deduplication solves duplicate delivery, debouncing solves merging consecutive short messages.
- Cover the duplicate problem caused by channel reconnections.
- Cover the fragmented-response problem caused by users sending consecutive messages in a short time.
- Wrap up: one preserves correctness, the other preserves experience and resource efficiency.

## III. Agent Runtime and Execution Model

### 13. How do you describe the Agent Loop?
- Definition: an embedded Agent execution engine with a tool loop.
- Describe it by stage: receive request -> context preparation -> model call -> tool loop -> post-processing.
- Highlight the key middle part: the model may make multiple rounds of calls; it doesn't end after one request.
- Wrap up: this is a long-running runtime, not a simple prompt call.

### 14. Why have two levels of queues?
- First cover per-session serialization: to avoid concurrent context writes within the same session.
- Then cover global concurrency: to avoid multiple sessions running at once and blowing out system resources.
- Point out that the two correspond to consistency and throughput respectively.
- Summary: this is scheduling capability that a production-grade Agent system must have.

### 15. What scenarios suit `collect`, `followup`, and `steer`?
- `followup`: the most stable; handles new messages only after the current turn ends.
- `collect`: the more natural default; merges queued messages into a single followup.
- `steer`: the most flexible; detects new messages mid-flight and tries to redirect.
- Wrap up: these aren't better-or-worse; they're choices for different interaction styles and task types.

### 16. Why is the system prompt assembled dynamically?
- First cover the problem with a fixed large prompt: imprecise, and it bloats.
- Then cover what gets injected dynamically: tools, workspace, skills, date, sandbox, bootstrap files.
- Add one note: it also helps maintain a stable prefix for the prompt cache.
- Summary: the prompt is a runtime-constructed artifact, not hardcoded copy.

### 17. Why do sub-Agents commonly use `minimal`?
- First cover the role of sub-Agents: they solve local tasks and don't need the full personality baggage.
- Then cover what gets trimmed: skills, memory, reply tags, heartbeats, and so on.
- Explain the benefits: more token-efficient, less noise, more focused execution.
- Wrap up: a sub-Agent's context should shrink to the task boundary.

### 18. Why do auth profile rotation and model failover?
- Opening: real model calls run into rate limits, expirations, billing issues, and provider anomalies.
- Two layers of recovery: first rotate profiles within the same provider, then fall back across providers.
- Add one note about cooldown: it temporarily benches a bad profile.
- Summary: this is a runtime fault-tolerance system, not just a config trick.

### 19. What's the difference between Block Streaming and Preview Streaming?
- Block Streaming: the official reply is sent in chunks; leans toward stability.
- Preview Streaming: a preview during generation; leans toward interactive experience.
- Then cover why you need both: platform capabilities differ, scenarios differ.
- Add detail: code fences, character limits, and message-editing capabilities all affect the strategy.

## IV. Session, Context, and Memory

### 20. Why is Session important?
- Opening: a Session isn't just chat history; it's the smallest unit of conversational consistency.
- Cover what it binds: message source, conversation boundary, history, queue, storage location.
- Then cover advanced capabilities: reset, pruning, compaction, and memory flush all revolve around the session.
- Summary: sessionKey is the primary index for long-term conversation state.

### 21. What's the difference between Pruning and Compaction?
- First cover the layering: pruning is lightweight tidying before each turn, compaction is heavy compression when nearing the limit.
- Pruning focus: prioritize pruning large tool results, without changing the original on-disk transcript.
- Compaction focus: summarize old history, update session state, trigger more follow-up actions.
- Summary: one is daily housekeeping, the other is a periodic move.

### 22. Why do we say "memory is first a file"?
- Opening: the primary form of expression for memory is Markdown files.
- Cover the advantages: visible, editable, explainable, easy to debug.
- Then cover the role of the database/vector store: a retrieval acceleration layer, not the memory itself.
- Summary: this suits a personal assistant better than purely black-box vector memory.

### 23. What's the difference between `memory-core` and `memory-lancedb`?
- `memory-core`: foundational memory capability, file-driven, providing the base layer for search, reading, CLI, flush, etc.
- `memory-lancedb`: enhanced capabilities like vector search, automatic recall, automatic capture, deduplication, forget, etc.
- Cover the relationship: it's not a complete replacement; it's more like a base layer and an enhancement layer.
- Summary: one ensures baseline usability, the other ensures intelligence and recall quality.

### 24. Why is hybrid retrieval more reasonable?
- First cover the weakness of pure vectors: unstable for exact keywords.
- Then cover the weakness of pure keywords: poor for semantic approximation.
- Explain OpenClaw's approach: vector + BM25 + weighted merging + MMR + time decay.
- Summary: it balances semantic recall and literal hits, which suits real memory scenarios better.

### 25. Why is memory flush clever?
- Opening: many details get lost before compaction.
- The core move: first trigger a silent turn that writes important information into memory files.
- Cover the value: proactively promoting short-term context into long-term memory.
- Summary: this is the migration bridge between short-term memory and long-term memory.

### 26. What is the Context Engine?
- Definition: the strategy layer that decides what context the model sees, when to compact, and how to maintain the transcript.
- Lifecycle: Ingest, Assemble, Compact, AfterTurn.
- Emphasize the purpose of the abstraction: turning context management from hardcoded logic into a replaceable capability.
- Summary: it's the "context strategy engine" outside the runtime.

### 27. Why is `ownsCompaction` important?
- Opening: it changes the compaction path; it's not just a descriptive field.
- `false`: continue using built-in compaction, with optional delegation when needed.
- `true`: the engine owns the compaction semantics itself, and the lifecycle orchestration changes.
- Summary: it determines "who owns control of compaction."

## V. Plugin System, Tool System, and Security

### 28. Why insist on Plugin Everything?
- First cover the reality: channels, models, tools, memory, Canvas, and Browser are all highly variable.
- The consequence of not going plugin-based: the core bloats, and adding capability means changing the core every time.
- The benefit of going plugin-based: the core becomes a platform, and change is isolated out.
- Wrap up: complexity increases, but this is for maintainability at scale.

### 29. Why must plugin import boundaries be strict?
- First cover the risk of source-level coupling: the core can't evolve freely.
- Then cover the risk of inter-plugin coupling: it forms a pseudo-plugin architecture.
- Explain OpenClaw's approach: exposing public contracts through `openclaw/plugin-sdk/*`.
- Summary: boundary control is the prerequisite for becoming a platform.

### 30. Why does the Hook system distinguish execution modes?
- First cover the four kinds of semantics: notification-type, modifying-type, claiming-type, and hot-path synchronous-type.
- Examples: agent_end, before_prompt_build, inbound_claim, tool_result_persist.
- Explain why they can't all be unified into async serial: both performance and semantics would break.
- Summary: a mature platform doesn't just open up extension points, it also defines the runtime semantics of those extension points.

### 31. What is the Slot system?
- Definition: there can be only one primary implementation of the same class of core capability at any given moment.
- Examples: the memory slot defaults to `memory-core`, the contextEngine slot defaults to `legacy`.
- Cover the behavior when switching: update the slot, and disable same-class plugins when necessary.
- Summary: it prevents multiple plugins from taking over the same responsibility at the same time.

### 32. Why does the tool system emphasize a context-aware factory?
- Opening: tool availability is inherently strongly tied to agent, session, owner, and sandbox.
- Cover what the factory returns: a single tool, multiple tools, or unavailable.
- Cover the benefit: tool strategy can be finely adapted to the runtime context.
- Summary: tools aren't a global constant; they're a runtime projection of capability.

### 33. Why are per-agent tool permissions and Exec Approval necessary?
- First cover the risk: read/write/exec/browser/system.run can all be very dangerous.
- Two layers of control: agent-level allow/deny + manual approval for high-risk actions.
- Example: the permissions of a home assistant and a work assistant must never be the same.
- Summary: this is the security baseline for deploying an AI Agent, not an optional optimization.

### 34. Why isn't OpenClaw's security model just "add a token"?
- Opening: it faces real message platforms and high-privilege device capabilities.
- List the layers: transport security, authentication, device identity, pairing, DM policy, rate limiting, Origin, RBAC, tool permissions, sandbox.
- Emphasize that security runs through the entire chain of messages, devices, tools, and execution.
- Summary: OpenClaw's highlight is systematically modeling the attack surface.

## VI. Engineering, Maintainability, and System Design Summary

### 35. Why use a pnpm monorepo?
- First cover the project scale: core, UI, dozens of plugins, apps, compatibility packages.
- Cover the monorepo benefits: unified versioning, shared dependencies, clear boundaries.
- Then cover OpenClaw's engineering characteristics: a unified build graph, global-singleton stability.
- Summary: it's not a simple multi-package repo; it's an engineering structure oriented toward becoming a platform.

### 36. What are the three design points most worth learning from OpenClaw?
- First: the Gateway unified control plane.
- Second: the Agent Runtime's engineered execution model, including queues, streaming, fault tolerance, and subagents.
- Third: the boundary design of the plugin system and the context/memory system.
- Wrap up: OpenClaw's value isn't just having many features; it's that "change is correctly placed."
