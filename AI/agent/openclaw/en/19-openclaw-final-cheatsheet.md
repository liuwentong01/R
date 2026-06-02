# OpenClaw Pre-Interview Quick-Memory Cheatsheet

## One-Sentence Definition

OpenClaw isn't an ordinary chat bot; it's a **personal AI assistant platform that is local-first, supports multi-channel ingestion, supports multi-Agent isolation, and supports tool and memory extension**.

## All-Purpose Interview Opener

If the interviewer asks "what project have you studied recently," you can answer directly like this:

> Recently I've focused on studying OpenClaw. It's a local-first AI Agent platform—not just a chat box, but something that integrates multi-channel ingestion, session management, an Agent runtime, tool calling, a memory system, and a plugin system.
> I think its biggest value is that the engineering is done fairly completely, especially the Gateway control plane, session isolation, the tool loop, Memory, and the plugin system—it's fairly like a real, deployable AI assistant system rather than a single-turn demo.

## Must-Memorize Keywords

- Local-first
- Multi-channel Unified
- Multi-Agent Isolation
- Plugin-everything
- Gateway Control Plane
- Session Key
- Per-session Queue
- Tool Loop
- Prompt Assembly
- Memory + Context Engine

## Three-Layer Architecture Mnemonic

### 1. Control plane: Gateway

Responsible for:

- Message ingestion
- Routing/dispatch
- Session management
- Plugin loading
- Authentication/authorization
- Health checks
- WebSocket/HTTP services

One-sentence memory:

> The Gateway is the hub and unified entry point of the whole system.

### 2. Execution plane: Agent Runtime

Responsible for:

- Parsing requests
- Assembling context
- Calling the model
- Executing the tool loop
- Handling streaming
- Managing sub-Agents

One-sentence memory:

> The Runtime isn't a single model call; it's a stateful Agent Loop.

### 3. Extension plane: Plugins / Memory / Context Engine / Tools

Responsible for:

- Model Provider extensions
- Channel extensions
- Memory extensions
- Context-strategy extensions
- Tool extensions

One-sentence memory:

> OpenClaw's extension capability isn't a bolt-on; it's a systematic design.

## Short Answers for High-Frequency Must-Answer Questions

### 1. Why have a Gateway?

Because multiple channels, multiple clients, and multiple Agents share a lot of state, and if it's not managed centrally, session, routing, health, and security all get chaotic. The Gateway provides a unified control plane that guarantees consistent state and unified security boundaries.

### 2. Why have both WebSocket and HTTP?

WebSocket suits real-time bidirectional events and control protocols; HTTP suits webhooks, REST APIs, the OpenAI-compatible API, health checks, and UI services. The two have different responsibilities—it's not duplicate design.

### 3. What's the difference between `dmPolicy` and `dmScope`?

`dmPolicy` governs "who can DM in"—it's access control; `dmScope` governs "which session you land in once you're in"—it's context isolation.

### 4. Why do a per-session serial queue?

Because the same session's context can't be written concurrently and chaotically, otherwise tool results, history messages, and state stats would conflict. Serialization is to guarantee session consistency.

### 5. What's the difference between the Runtime and an ordinary model call?

An ordinary call is a single request; the Runtime is a complete execution engine that handles context assembly, model calls, the tool loop, streaming, error recovery, and lifecycle management.

### 6. Why is the system prompt assembled dynamically?

Because different Agents, different tools, different workspaces, and different runtime environments need different prompts. Dynamic assembly is more precise, more token-efficient, and easier to maintain.

### 7. Why do sub-Agents use a minimal prompt?

Because sub-Agents only need to handle a local task and shouldn't inherit all the context. This reduces token cost, lowers noise, and improves focus.

### 8. Why make Memory file-first?

Because files are visible, editable, and auditable, which suits a personal-assistant scenario better. The vector store and index are more like an acceleration layer, not the single source of truth.

### 9. What's the difference between Pruning and Compaction?

Pruning is lightweight slimming before each call, mainly trimming large tool results; Compaction is heavy compression when a long-term session is about to exceed the token limit, used to keep a long session sustainable.

### 10. Why is the plugin system important?

Because channels, models, tools, memory, and context strategies can all change. Going plugin-based keeps the core stable and puts the changing capabilities at the boundary layer.

## The 8 Highlights You Must Be Able to Say Off the Cuff

- It's not a chat bot; it's a long-running, always-online AI assistant system.
- It's local-first and doesn't fully rely on cloud hosting.
- It unifies multiple entry points like Telegram, WhatsApp, Slack, Discord, CLI, and Web UI.
- It supports multiple Agents, each with independent boundaries.
- It makes the Gateway a unified control plane.
- It makes the Runtime a complete Agent Loop, not a single model call.
- It values session isolation, permission boundaries, and high-risk operation control.
- It makes Memory, Context Engine, and the Plugin system into an extensible architecture.

## Points That Easily Shine the Moment the Interviewer Probes

- Don't just say "it supports tool calling"; say "it has a stable tool loop and runtime orchestration."
- Don't just say "it has memory"; say "it makes file memory the primary expression and vector retrieval the enhancement layer."
- Don't just say "it supports multiple users"; say "it controls context isolation through `dmScope` to avoid crossover."
- Don't just say "it's very secure"; say "it puts authentication, pairing, rate limiting, tool permissions, and session isolation into a unified security model."
- Don't just say "it's extensible"; say "it ensures orderly extension through the Plugin SDK, hooks, slots, and import-boundary control."

## Places Where It's Easy to Answer Vaguely

- Don't describe it as "yet another AI chat product."
- Don't only talk about the model and skip the Gateway, Session, and Runtime.
- Don't conflate `dmPolicy` and `dmScope`.
- Don't describe Pruning and Compaction as the same thing.
- Don't understand plugins as simple npm-package extensions.
- Don't overlook security and permission boundaries.

## 30-Second Summary Template

> OpenClaw is a local-first personal AI assistant platform that integrates multi-channel ingestion, session management, an Agent runtime, tool calling, a memory system, and a plugin system.
> I think there are three things most worth learning from it: the unified Gateway control plane, the engineered Agent Runtime, and the clear plugin and context boundary design.

## 3-Minute Summary Template

> Recently I studied OpenClaw. It's not an ordinary chat bot; it's closer to a real, deployable AI Agent system.
> Its first major trait is local-first and unified multi-channel—it can simultaneously connect to Telegram, WhatsApp, Slack, Discord, CLI, and Web UI.
> The second trait is that it has a fairly mature control plane, the Gateway, responsible for message ingestion, session management, routing/dispatch, and security policy.
> The third trait is that its Agent Runtime isn't a simple single model call but a complete execution engine, supporting context assembly, the tool loop, streaming, sub-Agents, and error recovery.
> Beyond that, its memory system, context engine, and plugin system are also done fairly clearly, which shows it's not a demo but an architecture that can keep evolving.
> So my biggest takeaway from studying it isn't some single-point feature, but learning how, when an AI Agent system gets engineered for real deployment, the control plane, execution plane, and extension plane should be split.

## What to Look at in the Last 5 Minutes

- First read the "one-sentence definition"
- Then read the "three-layer architecture mnemonic"
- Then memorize the "short answers for high-frequency must-answer questions"
- Finally read through the "30-second summary template" and "3-minute summary template" once

## One-Sentence Closing

If you can only remember one sentence, remember this:

> OpenClaw's value isn't just having many features; it's that it puts the complexity of an AI assistant system at the right engineering boundaries.
