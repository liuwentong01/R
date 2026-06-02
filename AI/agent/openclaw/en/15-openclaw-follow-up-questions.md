# OpenClaw Interview Follow-up Questions and Answer Directions (matching the 36 questions)

## Notes on Use

- This isn't a set of standard answers; it's "how the interviewer will follow up next."
- For each question, it gives common follow-ups and suggested answer directions so you can expand further.
- It works best paired with `13-openclaw-classic-detailed-interview-qa.md` and `14-openclaw-2min-oral-outline.md`.

## I. Overall Understanding and Architecture Overview

### 01. What is OpenClaw?
- Common follow-up: Is it more of a product, a framework, or a platform?
- Answer direction: first answer "platform," then add "it's a product for end users, and a framework and platform for developers."
- Common follow-up: How does it differ from AutoGPT and ordinary bot frameworks?
- Answer direction: emphasize real message channels, the control plane, multi-Agent, local-first, and long-running capability.

### 02. How do you describe the overall architecture?
- Common follow-up: Which module do you think is the most core?
- Answer direction: lead with Gateway and Agent Runtime—the former handles control, the latter handles execution.
- Common follow-up: If you removed one layer, which part would break first?
- Answer direction: removing the Gateway loses unified state and the security entry point; removing the Runtime leaves only channels and it's no longer an Agent system.

### 03. Why centralize on the Gateway?
- Common follow-up: Won't centralization cause a single point of failure?
- Answer direction: yes, but it's a deliberate trade-off—trading a single point for consistency and controllability.
- Common follow-up: If you wanted to go distributed in the future, which part would be hardest to split out?
- Answer direction: session state, routing, presence, channel runtime, and the auth/approval logic would be the hardest to split out.

### 04. Why use both WebSocket and HTTP?
- Common follow-up: Could you keep only HTTP + SSE?
- Answer direction: it could cover some scenarios, but bidirectional control, device connections, and real-time event pushing aren't as natural as with WS.
- Common follow-up: Why not run everything over WS?
- Answer direction: HTTP is better suited to webhooks, health, the OpenAI-compatible API, and serving static resources.

### 05. Why emphasize Local-first?
- Common follow-up: What's the biggest benefit of Local-first?
- Answer direction: privacy, control, and deep integration with the local workspace/device capabilities.
- Common follow-up: What's the cost?
- Answer direction: deployment and operations get more complex, and remote access needs additional security design.

### 06. Why support multiple Agents?
- Common follow-up: What's the difference between multiple Agents and multiple sessions?
- Answer direction: multiple sessions are different conversation boundaries of the same Agent; multiple Agents are different responsibility and permission boundaries.
- Common follow-up: When do you not need multiple Agents?
- Answer direction: when it's single-user, single-responsibility, low-privilege, and the risk of context pollution is very low, a single Agent is enough.

## II. Gateway, Message Path, and Routing

### 07. The complete message path
- Common follow-up: Which step in the path is most error-prone?
- Answer direction: routing and session resolution are the most critical—getting them wrong sends the message to the wrong context.
- Common follow-up: Which layers in the path are best to monitor?
- Answer direction: the inbound channel, queue length, the Agent run lifecycle, and the outbound failure rate all need monitoring.

### 08. Most-specific-first matching
- Common follow-up: What if two same-level rules both match?
- Answer direction: the first one in configuration order wins.
- Common follow-up: Why not do "highest-score rule matching"?
- Answer direction: the rule hierarchy already expresses priority; ordering is more predictable and easier to operate.

### 09. `dmPolicy` vs `dmScope`
- Common follow-up: If `dmPolicy` is already very strict, do you still need a secure `dmScope`?
- Answer direction: yes, because legitimate users can still have their context crossed over.
- Common follow-up: How would you explain the difference to a non-technical interviewer?
- Answer direction: one is the door access, the other is the seat assignment.

### 10. `dmScope="main"` risk
- Common follow-up: Then why does the system still keep `main`?
- Answer direction: because it's very convenient for single-user personal use, and it can share context across channels.
- Common follow-up: What if you absolutely must share context across multiple users?
- Answer direction: then you have to explicitly acknowledge that it's a shared assistant, not a private DM assistant, and redesign the privacy boundaries.

### 11. The Gateway is the single source of truth
- Common follow-up: Why can't clients read the files directly?
- Answer direction: they'd read incomplete, stale, or simply not-on-this-machine data.
- Common follow-up: What's the cost of this design?
- Answer direction: all clients depend on the Gateway's availability, but in exchange you get consistent state.

### 12. Deduplication and debouncing
- Common follow-up: Why does their order matter?
- Answer direction: usually dedup first, then debounce—first rule out duplicate messages, then decide whether to merge genuinely new ones.
- Common follow-up: What kinds of messages aren't suited to debouncing?
- Answer direction: media messages, control commands, and highly time-sensitive messages usually aren't suited to delayed merging.

## III. Agent Runtime and Execution Model

### 13. Agent Loop
- Common follow-up: What's the termination condition of the tool loop?
- Answer direction: the model no longer outputs tool calls and instead produces a final plain-text reply.
- Common follow-up: Why is this more than just a "function call chain"?
- Answer direction: because it involves session state, streaming events, tool result backfilling, and multiple rounds of model calls.

### 14. Two levels of queues
- Common follow-up: What happens if you don't do per-session serialization?
- Answer direction: the context gets out of order, tool result attribution gets confused, and session consistency is broken.
- Common follow-up: What happens if you don't do global concurrency limiting?
- Answer direction: system resources may get maxed out by a large number of sessions at once, dragging down overall stability.

### 15. `collect` / `followup` / `steer`
- Common follow-up: Why is `collect` often the default choice?
- Answer direction: it balances stability and a natural conversational experience—it's fairly balanced.
- Common follow-up: What's the risk of `steer`?
- Answer direction: it may interrupt a tool chain that was about to complete, the logic is complex, and it's more likely to make the output seem repetitive or jumpy.

### 16. Dynamic system prompt assembly
- Common follow-up: What's the biggest challenge in dynamic assembly?
- Answer direction: when there's too much information, you have to control bloat while keeping the prompt cache stable.
- Common follow-up: Why not inject all knowledge?
- Answer direction: more context isn't always better; both noise and cost rise.

### 17. Sub-Agents using `minimal`
- Common follow-up: Why don't sub-Agents just inherit all of the main Agent's memory?
- Answer direction: local tasks don't need the full personality and long-term context; inheriting too much adds noise.
- Common follow-up: When does a sub-Agent actually need more context?
- Answer direction: when the sub-task itself depends on the broad background of the main task—but even then you should inject selectively, not inherit everything wholesale.

### 18. auth profile rotation and failover
- Common follow-up: Why rotate profiles first, then switch providers?
- Answer direction: recovering within the same provider first is more stable in semantics and behavior, and the switching cost is smaller.
- Common follow-up: When should you switch providers directly?
- Answer direction: when all profiles are down, the provider is broadly malfunctioning, or the model is unavailable or continuously erroring.

### 19. Block Streaming vs Preview Streaming
- Common follow-up: Which is closer to the "real output"?
- Answer direction: Block Streaming—it's better suited to the final official message.
- Common follow-up: Why can't every platform do preview?
- Answer direction: not every platform supports stable message editing, and editing frequency and limits differ too.

## IV. Session, Context, and Memory

### 20. Why is Session important?
- Common follow-up: What's the difference between sessionKey and sessionId?
- Answer direction: sessionKey is the logical session identifier; sessionId is more like the current concrete session instance or storage identifier.
- Common follow-up: Is session a business concept or a storage concept?
- Answer direction: it's both, but fundamentally it's first a runtime control boundary.

### 21. Pruning vs Compaction
- Common follow-up: Why does pruning prioritize trimming tool results?
- Answer direction: tool results are usually larger and more redundant, and they're more suitable for trimming than the user's main-thread messages.
- Common follow-up: What's the risk of compaction?
- Answer direction: summaries are irreversible and details get lost, so you need a memory-migration or other remedial mechanism before compaction.

### 22. Memory is first a file
- Common follow-up: Won't this sacrifice search performance?
- Answer direction: no, because the file is the primary data; the index and vector store can act as an acceleration layer.
- Common follow-up: Compared with purely database-based memory, what's the biggest advantage?
- Answer direction: it's explainable, editable, and debuggable.

### 23. `memory-core` vs `memory-lancedb`
- Common follow-up: Why is `memory-core` the default?
- Answer direction: because it's more foundational, highly explainable, and has fewer dependencies—it's a stable base layer.
- Common follow-up: When is `memory-lancedb` a better fit?
- Answer direction: when you need semantic recall, automatic capture, and stronger long-term memory capability.

### 24. Hybrid retrieval
- Common follow-up: What if the vector and BM25 results conflict?
- Answer direction: balance them through weighted fusion, reranking, and threshold strategies—not a simple either/or.
- Common follow-up: When is pure BM25 more appropriate?
- Answer direction: for exact entities, keywords, and symbol searches it's often more appropriate.

### 25. memory flush
- Common follow-up: Why not write memory after compaction?
- Answer direction: because many details have already been discarded after compaction.
- Common follow-up: What's the biggest risk of flush?
- Answer direction: writing too much irrelevant content, so you need prompt design and write-boundary control.

### 26. Context Engine
- Common follow-up: Why can't this logic just be hardcoded into the SessionManager?
- Answer direction: because the context-construction strategy is highly variable and should be its own pluggable layer.
- Common follow-up: What's the value of a custom Context Engine?
- Answer direction: you can implement more advanced retrieval, compaction, lossless, or RAG strategies.

### 27. `ownsCompaction`
- Common follow-up: What happens if a custom engine implements `compact()` but doesn't set `ownsCompaction`?
- Answer direction: it may still go through the default orchestration path; the semantics aren't necessarily "fully taking over," so you have to declare it clearly.
- Common follow-up: Why is this field dangerous?
- Answer direction: because it changes the system's compaction behavior—if you misunderstand it, you could end up with missing or duplicated compaction logic.

## V. Plugin System, Tool System, and Security

### 28. Plugin Everything
- Common follow-up: What's the biggest cost of going plugin-based?
- Answer direction: higher complexity in loading, registration, boundary management, and debugging.
- Common follow-up: Why is it still worth it for OpenClaw?
- Answer direction: because the kinds of capabilities are many and change fast; without plugins the core would get out of control.

### 29. Plugin import boundaries
- Common follow-up: Why not just import `src/**` directly—wouldn't that be faster?
- Answer direction: convenient short-term, but long-term it binds the core and plugins together.
- Common follow-up: What if a plugin really does need a new capability?
- Answer direction: you should first elevate the capability to the public surface of the Plugin SDK, rather than secretly reaching deep into the core.

### 30. Hook execution modes
- Common follow-up: Which kind of Hook is the most dangerous?
- Answer direction: modifying hooks that can change the prompt or tool arguments carry the highest risk.
- Common follow-up: Which kind of Hook tests performance the most?
- Answer direction: synchronous hot-path hooks, because every turn may pass through them and they can't be too slow.

### 31. Slot system
- Common follow-up: Why don't all plugins use a slot?
- Answer direction: because not all capabilities require a unique primary implementation; many capabilities can naturally coexist in parallel.
- Common follow-up: What's the relationship between slots and enable/disable?
- Answer direction: a slot selects the primary implementation; enable/disable controls whether a plugin participates in the system. The two are related but not equivalent.

### 32. The tool system's context-aware factory
- Common follow-up: Why not just do an if-check inside the tool?
- Answer direction: trimming earlier at the factory layer is clearer, and it also avoids exposing unavailable tools to the model.
- Common follow-up: What's the biggest benefit of this design?
- Answer direction: tool visibility and permission control can be made fine-grained at the generation stage.

### 33. Per-agent tool permissions and Exec Approval
- Common follow-up: Why do you need both layers—isn't one enough?
- Answer direction: allow/deny is a static permission boundary; approval is dynamic control over high-risk actions.
- Common follow-up: Without approval, what's the most dangerous outcome?
- Answer direction: the model could automatically execute high-privilege commands, causing real external side effects.

### 34. The security model is more than a token
- Common follow-up: What security point do you think is most easily overlooked?
- Answer direction: DM session isolation, Origin validation, tool permissions, and human approval are often underestimated.
- Common follow-up: Won't too many security layers hurt the experience?
- Answer direction: yes, but an AI assistant touches real channels and devices, so security must take priority over "saving one click."

## VI. Engineering, Maintainability, and System Design Summary

### 35. pnpm monorepo
- Common follow-up: Why not multiple repos?
- Answer direction: even though the core and plugin boundaries are clear, they still need shared dependencies, versioning, and build infrastructure.
- Common follow-up: What's the biggest risk of a monorepo?
- Answer direction: when boundaries are unclear it turns into a super-large repo, which is exactly why OpenClaw especially emphasizes import boundaries and the public SDK.

### 36. The three design points most worth learning from
- Common follow-up: Which one do you most agree with?
- Answer direction: generally lead with the Gateway control plane, because it's what "anchors" the whole system.
- Common follow-up: If you were to replicate a similar system, which layer would you build first?
- Answer direction: first build the stable skeleton of Gateway + Session + Runtime, then gradually make capabilities plugin-based.
