# OpenClaw Common Interview Questions and Answers (92 Questions)

## Notes

- This document is based on the existing research docs under the `AI/agent/openclaw` directory, as well as the OpenClaw official repository's `README.md`, `AGENTS.md`, and parts of the core source code.
- The goal is not to enumerate obscure APIs, but to cover the **high-frequency, high-priority, easy-to-follow-up** architecture, design, and source-code comprehension questions that come up in interviews.
- Answers stick to confirmed information as much as possible, avoiding making up implementation details from intuition.

## I. Fundamentals and Overall Architecture

### 01. What is OpenClaw?
A: OpenClaw is a personal AI assistant platform that runs on the user's own devices. It can connect to many messaging channels such as WhatsApp, Telegram, Slack, and Discord, and it can also tap into device capabilities on macOS, iOS, Android, and more, letting the same assistant work across channels.

### 02. Why does the project say "the Gateway is just the control plane; the real product is the assistant"?
A: Because the Gateway is responsible for control-plane capabilities such as channel connectivity, sessions, routing, tools, event dispatch, and the control UI; but what the user actually perceives is the assistant itself running on top of those capabilities. In other words, the Gateway is the infrastructure, and the assistant is the ultimate object of interaction.

### 03. What are OpenClaw's core design principles?
A: They can be summarized in four points: local-first, unified multi-channel, isolated multi-Agent, and pluggable extensibility. It does not hardcode all capabilities into the core; instead, it tries to make channels, models, tools, memory, and so on into plugins.

### 04. Why does OpenClaw emphasize being Local-first?
A: Because what it handles is often real private chats, device capabilities, and local workspace data. The Gateway binds to the local address by default, and a lot of state is also saved locally. This reduces the privacy exposure surface and makes the assistant feel more like "a personal system running on my own machine."

### 05. What is OpenClaw's core tech stack?
A: The core code is mainly TypeScript ESM. Node 24 is the recommended runtime, with a minimum of Node 22.19+. The project takes the form of a pnpm monorepo, testing is primarily done with Vitest, the Control UI uses Lit, and plugins extend the system through the Plugin SDK.

### 06. What interaction surfaces does OpenClaw support?
A: One category is messaging channels, such as WhatsApp, Telegram, Slack, Discord, Signal, iMessage, WebChat, etc.; the other is devices and clients, such as macOS, iOS, Android, CLI, Web UI, and Canvas. The key point to grasp in an interview: it is not a single-chat-box product, but a "unified assistant with multiple entry points."

### 07. How can OpenClaw's major modules be divided?
A: They can be divided into several layers: Gateway, Agent Runtime, Session, Routing, Plugins, Context Engine, Memory, Channels, Nodes, Canvas, and CLI/UI. When answering in an interview, first describe the control plane, then the execution plane, then the extension plane—this makes the layering very clear.

### 08. Why is OpenClaw described as "Plugin Everything"?
A: Because many capabilities are not hardcoded into the core. Channels, LLM providers, the memory system, search capabilities, tools, and even the context engine can all be registered through plugins. This keeps the core lean and delegates extensibility to the plugin ecosystem.

### 09. Why does OpenClaw impose such strict requirements on plugin import boundaries?
A: Because if a plugin directly depends deeply on the core `src/**`, any change to the core will shatter all the plugins. It requires plugins to access capabilities through public surfaces like `openclaw/plugin-sdk/*`, which is essentially about controlling coupling and stabilizing the ABI.

### 10. How should we understand an Agent in OpenClaw?
A: An Agent is not a piece of prompt text, but an isolated work unit. It has its own workspace, session, auth profiles, skills, memory, and tool permissions, so multiple Agents can exist simultaneously yet remain relatively independent of one another.

## II. Gateway and the Control Plane

### 11. What is the Gateway mainly responsible for in OpenClaw?
A: It is responsible for channel connections, the WebSocket API, HTTP services, session management, message routing, Cron, the plugin runtime, health checks, device pairing, and more. You can think of it as the traffic hub and control center of the entire system.

### 12. Why does OpenClaw usually run only one Gateway per machine?
A: Because many external channels are themselves not suited to being held by multiple instances at once—for example, some chat platforms only allow a single active session. Concentrating all channels and state in one Gateway also reduces state fragmentation and contention problems.

### 13. Why does the Gateway use both WebSocket and HTTP?
A: WebSocket handles real-time bidirectional control, such as connections, event pushes, and Agent streaming output; HTTP handles webhooks, the OpenAI-compatible interface, the Control UI, Canvas, and health checks. One leans toward real-time control, the other toward interfaces and hosting.

### 14. Why does the Gateway bind to `127.0.0.1:18789` by default?
A: This is a security-first default. Opening only to the local machine first significantly reduces the risk of being exposed on the LAN or the public internet; if remote access is needed, it is then explicitly opened up via TLS, Tailscale, an SSH tunnel, and so on.

### 15. In OpenClaw's WebSocket protocol, what are the three most important frame types?
A: `req`, `res`, and `event`. `req` is a client request, `res` is the corresponding response, and `event` is an event the Gateway pushes proactively, such as health, presence, agent streaming, etc.

### 16. Why does the WebSocket handshake require the first frame to be `connect`?
A: Because the Gateway needs to confirm the client's identity, role, and authentication information before actually opening up business capabilities. This puts authentication at the protocol entry point, avoiding the loose model of "connect first, then slowly try permissions."

### 17. Why does the WebSocket use the `noServer: true` mode?
A: This way the HTTP `upgrade` process can be taken over by the Gateway itself, allowing authentication, rate limiting, and path routing to happen before the handshake completes. Another benefit is that the Canvas WS path can be split off separately.

### 18. What are the typical modes in OpenClaw's authentication system?
A: The resolved Gateway authentication modes are mainly `none`, `token`, `password`, and `trusted-proxy`. In addition, there are supporting mechanisms such as device signatures, device tokens, bootstrap tokens, and Tailscale headers, which shows it is multi-layer authentication rather than a single token.

### 19. What is the Gateway's default authentication rate-limiting policy?
A: The default value in the official source code is at most 10 failures within a 1-minute window; after exceeding that it locks for 5 minutes, recorded by `{scope}:{ip}` dimension. It is also an in-memory sliding-window rate limiter that does not rely on external storage.

### 20. Why is localhost exempt from authentication lockout by default?
A: Because the local CLI or on-machine control client is the most common usage pattern; if the loopback were also locked out, users could easily lock themselves out. OpenClaw exempts the local loopback address by default, which is essentially giving local access preferential treatment in the trade-off between security and usability.

### 21. Why does "missing credentials" not necessarily consume the rate-limit quota?
A: Because "didn't bring a token" and "brought a wrong token" are not the same in security semantics. OpenClaw's approach is to reject missing credentials outright but not count it as a failure; only a true credential mismatch is recorded as a failure. This reduces the malicious consumption of quota by probing traffic.

### 22. How can the Gateway's HTTP pipeline be summarized?
A: It can be summarized as a multi-stage processing chain covering health, hooks, tools invoke, sessions, Slack callback, OpenResponses, chat completions, Canvas, plugin routes, and the Control UI. The core idea is not "one big routing table," but staged decision-making by processing priority.

### 23. After a channel connection fails, what is OpenClaw's recovery strategy?
A: It performs exponential-backoff restarts rather than blindly looping reconnects forever. The strategy given in the docs is an initial 5 seconds, an exponential factor of 2, and a maximum of 5 minutes, with a maximum retry-count limit.

### 24. Why does the Gateway also need health monitoring?
A: Because real chat channels frequently disconnect, expire, or hang, so you cannot just look at "the process is alive." Health monitoring combines information such as event freshness and restart counts to judge whether a channel is truly healthy, and pushes the results to clients.

## III. Agent Runtime and the Execution Loop

### 25. What are OpenClaw's Agent execution entry points?
A: There are at least two common categories of entry points: the Gateway's `agent` / `agent.wait` RPC, and the CLI's `openclaw agent --message ...`. In other words, it can be controlled remotely or triggered imperatively from the local command line.

### 26. Roughly how does OpenClaw's Agent Loop proceed?
A: First it receives the request and resolves the session, then prepares the workspace and system prompt, then calls the model; if the model returns a tool call, it executes the tool and feeds the result back, then calls the model again, until a final text reply is produced. This is a typical agentic loop.

### 27. Why does OpenClaw use a two-level queue of "per-session serial + global concurrency control"?
A: Per-session serialization prevents multiple turns in the same conversation from concurrently rewriting context; global concurrency control prevents the whole system from running too many Agents at once and blowing up resources. One solves consistency, the other solves throughput and resource limits.

### 28. How do the `collect`, `steer`, and `followup` queue modes differ?
A: `steer` is the default mode: after the current turn finishes executing its tool calls and before the next model call, it injects mid-run messages into the active run, so no second turn is started; `followup` is more conservative, waiting until the current turn finishes and then handling new messages one by one as later turns; `collect` coalesces queued messages into a single followup after a quiet window. There is also `interrupt`, which aborts the current run to handle the newest message. In an interview, emphasize: the difference is not "whether to queue," but "how to handle new messages that arrive mid-run."

### 29. Why does an `agent.wait` timeout not equal killing the Agent?
A: Because it is only the timeout of the "wait interface," not the timeout of the running body itself. This way the caller can decide how long to wait, without accidentally harming a background Agent that is still running normally just because a wait request timed out.

### 30. Why is OpenClaw's system prompt "assembled" rather than written as one big hardcoded block?
A: Because the runtime context varies greatly—for example, the tool list, workspace, skills, sandbox, date, and heartbeat configuration may all change. Dynamic assembly achieves "the same framework, with different contexts injected automatically."

### 31. What parts does the system prompt commonly include?
A: It commonly includes tool descriptions, safety guardrails, the Skills list, the working directory, document paths, bootstrap-file injection, sandbox information, the date, Reply Tags, Heartbeats, Runtime information, and Reasoning information. In an interview you don't need to memorize all 13 sections, but you should know that it is assembled in a structured way.

### 32. Which files in the workspace get injected into the prompt?
A: Typically `AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`, and `MEMORY.md`. These files make the Agent's behavior more like "a working entity with personality and long-term context" rather than a one-off prompt.

### 33. Why does OpenClaw not hardcode "the exact current time" into every prompt?
A: Because that would break the stable prefix of the prompt cache. It prefers to put relatively stable information like the date or time zone into the system prompt, and leave the true "current timestamp" to be fetched on demand by a tool like `session_status`.

### 34. What is the significance of the `full`, `minimal`, and `none` prompt modes?
A: `full` suits the main Agent and has the most complete information; `minimal` suits sub-Agents and omits a great deal of unnecessary context; `none` keeps only minimal identity information. Its essence is controlling context cost by task granularity.

### 35. Why do sub-Agents commonly use `minimal` mode?
A: Because a sub-Agent usually serves a localized task and does not need to inherit all of the main Agent's personality, skills, and memory. Compressing context to the minimum reduces token cost and lowers context noise.

### 36. Why is OpenClaw's model failure recovery "two-stage"?
A: The first stage rotates auth profiles within the same provider; only the second stage performs model fallback across providers. This way it prioritizes fixing the problem with "the same provider, different credentials," and only switches the model source when even that layer fails.

### 37. Why does auth profile rotation "pin" to a session rather than change every time?
A: Because pinning improves prompt-cache friendliness and behavioral stability. The pin is only released when the session is reset, compaction completes, or the current profile enters cooldown / becomes disabled.

### 38. Why does OpenClaw need a cooldown mechanism?
A: Because when there is rate limiting, billing failure, or a similar issue, immediately hitting the same profile again usually has no point. Cooldown lets the system bypass a broken credential for a short time and prioritize trying other available profiles.

### 39. What is the difference between Block Streaming and Preview Streaming?
A: Block Streaming sends "complete text blocks" to the chat channel in batches; Preview Streaming is more like updating or editing a temporary message, letting users see a preview of what is being generated. The former leans toward stable output, the latter toward a real-time experience.

### 40. Why does the chunker try to avoid cutting in the middle of a code fence?
A: Because that would break the Markdown and code-block structure, making the receiving end display look bad. OpenClaw's chunking strategy tries to split at paragraph, newline, sentence, and whitespace boundaries, and when necessary it will close and reopen code fences.

### 41. What is Thinking mode in OpenClaw?
A: It is a unified abstraction layer over the different providers' reasoning budgets. For example, when a user sends `/think high` in OpenClaw, the underlying layer maps it to each provider's own parameters, such as Anthropic's extended thinking or OpenAI's reasoning effort.

### 42. How are sub-Agents created in OpenClaw?
A: Usually through a tool like `sessions_spawn`. A sub-Agent can have its own session, its own tool allowlist, and its own model, and when necessary can point to a different workspace.

### 43. Why do sub-Agents go through a separate `subagent lane`?
A: Because sub-Agents are essentially resource consumers too. If they fully shared the same concurrency pool as the main conversation, complex tasks would easily block one another; a separate lane separates the resource contention between the main conversation and sub-tasks.

## IV. Session, Routing, and Message Flow

### 44. What is the role of the sessionKey in OpenClaw?
A: It uniquely identifies "which session context this message belongs to." Only when the sessionKey is stable can the system correctly route a message to the same history, the same set of session files, and the same serial execution queue.

### 45. What are the common `dmScope` modes?
A: Common ones are `main`, `per-peer`, `per-channel-peer`, and `per-account-channel-peer`. Their difference lies in whether the same user, the same channel, or different accounts share one DM session, or are split into finer-grained sessions.

### 46. Why is `dmScope="main"` risky in multi-user scenarios?
A: Because different people's private chats may be merged into the same main session. As a result, when the model answers Bob, it could in theory reference Alice's earlier context, so multi-user scenarios are better served by `per-channel-peer` or even finer-grained isolation.

### 47. What problem does `identityLinks` solve?
A: It is used to merge the identity of "the same person across multiple channels." For example, if the same user contacts the assistant via both Telegram and Discord, `identityLinks` can map both sides to the same identity.

### 48. Why does OpenClaw's session storage commonly use `sessions.json + JSONL transcript`?
A: `sessions.json` is suited to storing the session index, metadata, and current mapping relationships, while JSONL is suited to appending the complete transcript in chronological order. One is good for table lookups, the other for tracing history; their responsibilities are clear.

### 49. What are the common Session Reset strategies?
A: The most common are daily reset and idle-time reset, and they can also be combined. The idea is simple: some conversations should be split by "natural day," others by "a long period of silence."

### 50. What is the difference between Pruning and Compaction?
A: Pruning, before each model call, prioritizes trimming old tool results to reduce context bloat; Compaction, when the context nears its limit, compresses old history using a summary or engine strategy. One is lightweight cleanup, the other is heavyweight compaction.

### 51. Why does Pruning mainly target tool results rather than arbitrarily deleting user messages?
A: Because user messages and the assistant's key replies usually determine the semantic main thread, and deleting them wrongly would directly break conversational coherence; whereas tool results are often large and highly redundant, making them better candidates for trimming first. This is the design of "delete the big stuff first, not the main thread."

### 52. Why does OpenClaw emphasize that "the Gateway is the single source of truth for the Session"?
A: Because in remote mode, the real session files and token statistics are on the machine where the Gateway lives. If a client reads local files on its own, it can easily read stale state, or even fail to read the real data at all.

### 53. What is the difference between `pairing`, `allowlist`, and `open` in the DM policy?
A: `pairing` is the default, safer mode where a stranger first gets a pairing code and can only chat after approval; `allowlist` means only allowlisted users can chat; `open` means anyone can DM, the highest security risk. In an interview it's best to clearly say: `open` is explicit opt-in and should not be treated as a default.

### 54. Why is OpenClaw's multi-Agent routing said to be "most specific first"?
A: Because it doesn't simply scan in order, but has hierarchical matching priority. For example, an exact peer binding is certainly more specific than a channel-level fallback, so the finer-grained rule should be matched first.

### 55. Roughly what priority tiers does OpenClaw's bindings have?
A: They can be summarized as peer exact match, thread inheritance, Discord guild+roles, Discord guild, Slack team, accountId exact match, accountId wildcard, and finally the default Agent. In an interview you don't necessarily have to recite all 8 tiers, but you should make clear that "the finer the granularity, the higher the priority."

### 56. If multiple bindings match at the same priority, which one wins?
A: The first matching item in configuration order wins. In other words, beyond the "priority tiers," bindings themselves still retain order semantics.

### 57. Why does OpenClaw use mention gating by default in group chats?
A: Because group chats have a high message volume; if it responded to every message, it would easily spam the screen, go off-track, or even waste tokens. Activating only when @-mentioned or matching mentionPatterns is more in line with how a group-chat assistant is used.

### 58. In multi-account routing, what is the difference between omitting `accountId` and writing it as `*`?
A: Omitting it usually matches only the default account; writing `*` means a channel-level fallback rule across all accounts. This distinction is very important when integrating multiple bots or multiple numbers.

## V. Plugins, Tools, and Extensions

### 59. From what sources are OpenClaw's plugins generally discovered?
A: There are commonly four source categories: paths explicitly specified in the config, the plugin directory under the workspace, OpenClaw's bundled plugins, and plugins installed in the user's global directory. This design accommodates local development, in-project plugins, and global installs.

### 60. Why must a plugin carry `openclaw.plugin.json`?
A: Because the manifest file defines the plugin's identity, config schema, capability kind, whether it is enabled by default, and other metadata. Without a manifest, the core cannot safely discover, validate, and register the plugin.

### 61. What is the significance of the `kind` field in the plugin system?
A: It determines which capability category the plugin belongs to, such as memory, context-engine, channel, provider, etc. For types like memory and context-engine, `kind` also affects exclusive slot selection.

### 62. What is the Slot system? Why is it needed?
A: The Slot system ensures that certain capabilities have only one "effective implementation" at a time—typically memory and the context engine. Otherwise, two memory plugins competing for primary control, or two context engines simultaneously deciding compaction, would produce semantic conflicts.

### 63. What are OpenClaw's two default core slot values?
A: In the official source code, the default slot for `memory` is `memory-core`, and the default slot for `contextEngine` is `legacy`. These two defaults are excellent for illustrating in an interview that "the framework has a default implementation, but it can be replaced."

### 64. What does `applyExclusiveSlotSelection` do?
A: It switches the corresponding slot to the new plugin and automatically disables plugins of the same type that no longer hold any other slot. In other words, switching a slot is not just changing a string—it also adjusts the enabled state accordingly, preventing multiple plugins of the same type from being active simultaneously.

### 65. Why do OpenClaw's plugin hooks need to be divided into execution modes?
A: Because different hooks have different semantics. Some are suited to parallel fire-and-forget, some need to modify context in order, some let only the first claimant take effect, and some must run synchronously on the hot path.

### 66. What are the four common hook execution modes?
A: Void, Modifying, Claiming, and Synchronous. You can remember them in an interview as: notification-type, modification-type, claim-type, and hot-path synchronous-type.

### 67. Why are hooks like `before_prompt_build` considered high-risk?
A: Because they can directly modify the prompt, which is essentially "programmable prompt injection." OpenClaw brings this kind of capability under additional policy control, allowing only explicitly authorized plugins to do it.

### 68. Why do OpenClaw's tools commonly register via a "context-aware factory" rather than registering a static object directly?
A: Because the same tool may have different availability and configuration under different Agents, sessions, and channels. The factory pattern can dynamically decide, based on the current context, to return a tool, return multiple tools, or return unavailable.

### 69. How are per-agent tool permissions controlled?
A: Usually through `tools.allow` and `tools.deny`, with wildcard support, and `deny` taking precedence. In other words, the approach is more like a policy system than a simple "on/off master switch."

### 70. Why does OpenClaw need a human-approval mechanism like Exec Approval?
A: Because capabilities like shell, system commands, and device control are too high-risk to be left entirely to the model's own judgment. The essence of the approval flow is turning high-risk actions into controlled, human-in-the-loop operations.

### 71. What is the relationship between the `message` tool and an ordinary assistant text reply?
A: The `message` tool is an explicit action to "proactively send a message," not ordinary natural-language output. OpenClaw tracks such tool-based sends to avoid the assistant repeating "I've already sent it," thereby reducing duplicate messages.

### 72. Why is the `session_status` tool so important?
A: Because, beyond session status, it can also provide runtime information such as the current timestamp. In many scenarios the system does not want to hardcode volatile information into the prompt, so it lets the model call this tool on demand.

### 73. Is `memory-core` now just two simple tools?
A: No. In the source code, besides registering `memory_search` and `memory_get`, it also registers the memory capability, CLI commands, a built-in embedding provider adapter, and capabilities related to memory flush; it's just that the most directly exposed core tools to the Agent are usually those two, which get attention first.

## VI. Context Engine and Memory

### 74. What is the Context Engine responsible for in OpenClaw?
A: It is responsible for "how the context is handed to the model." Specifically, this includes message ingestion, context assembly, compaction, post-turn maintenance, and, when needed, participating in the sub-Agent lifecycle.

### 75. How do you remember the Context Engine's four-stage lifecycle?
A: The most common mnemonic is Ingest, Assemble, Compact, AfterTurn. That is: first take in messages, then assemble the context, compact when necessary, and finally do post-turn persistence or maintenance.

### 76. Why is the `ownsCompaction` flag important?
A: It determines whether compaction is driven by the runtime's built-in logic or fully taken over by the context engine itself. Once this flag is true, the compaction lifecycle, hook timing, and post-processing path all change.

### 77. Why does OpenClaw provide a `sessionKey/prompt` compatibility proxy for the legacy context engine?
A: Because historical third-party engine implementations may not recognize the new parameters. The official source code uses proxy wrapping and error-pattern recognition to automatically strip the new parameters and retry when necessary, thereby keeping old plugins from being abruptly broken by the new interface.

### 78. Why does the context engine registry use a `Symbol.for()`-level global singleton?
A: Because the build artifacts may contain multiple dist chunks; if only an ordinary module variable were used, different chunks would get different registries. `Symbol.for()` can attach state to the process-level global, avoiding "multiple registries appearing in the same process."

### 79. Why can the public SDK's `registerContextEngine()` not preempt core IDs?
A: Because the core default engine is the foundation of framework stability and cannot be arbitrarily overridden by ordinary third-party plugins. The source code explicitly restricts the public registration entry point from declaring a core slot's default ID, such as `legacy`.

### 80. Why does OpenClaw say "memory is first and foremost files, not a database"?
A: Because its most basic and most explainable form of memory is the Markdown files in the workspace, such as `MEMORY.md` and `memory/*.md`. Advanced search and vector indexing are merely an acceleration layer built on top of these visible files.

### 81. What is the difference in positioning between `MEMORY.md` and `memory/YYYY-MM-DD.md`?
A: `MEMORY.md` is better suited to long-term, structured, cross-time stable memory; `memory/YYYY-MM-DD.md` is more like a daily work log or stage-by-stage record. One leans toward "long-term knowledge," the other toward a "timeline log."

### 82. What is the main difference between `memory-core` and `memory-lancedb`?
A: `memory-core` leans more toward file-based, built-in memory tools and retrieval capabilities; `memory-lancedb`, on top of that, strengthens capabilities like vectorized memory, automatic recall, automatic capture, and forgetting. You can understand it as the difference between "basic file memory" and a "smarter vector memory plugin."

### 83. Why does OpenClaw's memory retrieval do hybrid search?
A: Because vector search alone easily misses exact keywords, while keyword search alone struggles to cover semantically similar phrasings. Hybrid search combines vector similarity with BM25 text relevance, usually yielding more stable recall quality.

### 84. Why is the pre-compaction memory flush a good design?
A: Because once compaction begins, old context is replaced by a summary and many details may no longer be present. Using a silent turn beforehand to remind the Agent to write information worth keeping long-term into memory files is essentially doing "knowledge offloading" first, then "context slimming."

### 85. Why should automatic capture for vector memory prioritize user messages over assistant messages?
A: Because automatically writing the model's own output back into memory easily causes self-pollution and error amplification. Taking user input as the main capture target better fits the goal of "remembering user preferences, facts, and explicit instructions."

### 86. In an interview, how would you summarize OpenClaw's Memory design in one sentence?
A: You could say: **OpenClaw adopts a memory scheme of "visible files, index acceleration, and write-back before compaction," which both preserves explainability and provides semantic retrieval capability.**

## VII. Engineering and System-Design Follow-Ups

### 87. Why does OpenClaw use a pnpm monorepo?
A: Because it has a core package, a UI, dozens of plugins, clients, and compatibility packages, which are naturally suited to workspace management. This both shares dependencies and keeps plugins as independent packages.

### 88. Why does OpenClaw emphasize a unified build graph?
A: Because the core, the Plugin SDK, the extension entry points, and some runtime singletons need to be compiled within one consistent build graph, to avoid duplicate emission that invalidates singletons. Put simply, it prevents "the same global state being bundled into multiple copies."

### 89. What problem does TypeBox mainly solve in OpenClaw?
A: It ties together the runtime schema, TypeScript types, and part of the cross-platform model generation. This way config validation, protocol definitions, and the type system can share a single source, reducing hand-written duplication.

### 90. Why does OpenClaw's config system support hot reloading?
A: Because config for channels, tools, cron, hooks, and so on may be adjusted while running, and a full restart is costly. Hot reloading lets the hot-updatable parts take effect online as much as possible, and only the non-hot-updatable parts go through the restart path.

### 91. Why does OpenClaw treat prompt-cache stability as a "correctness + performance" issue?
A: Because once the request prefix changes frequently, the cache hit rate drops, and both cost and latency rise. It is not just an optimization—it also affects the system's real-world experience under high-frequency, multi-turn conversations.

### 92. If an interviewer asked you to summarize OpenClaw's three most representative design points, how would you answer?
A: First, the Gateway as a unified control plane, converging multi-channel, multi-device, and multi-session into one center; second, the Agent Runtime forming a stable execution kernel through queues, the tool loop, and failover; third, Plugin + Context + Memory making the system both extensible and able to maintain long-term personalization.

## Review Suggestions

- In the first pass, memorize `01-24`—these are the most likely-to-be-asked fundamental architecture questions.
- In the second pass, focus on thoroughly mastering `25-58`—these are the runtime, session, and plugin questions most likely to set you apart.
- If the interview leans toward source code or system design, then fill in `59-92`.
