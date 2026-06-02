# OpenClaw Mock Interview Q&A (Real-Conversation Style)

## Notes on Use

- This material isn't a list of knowledge points; it's written in the style of a real interview conversation.
- You can treat it as a "rehearsal script" and practice speaking directly.
- Suggested practice method:
  - First pass: look only at the questions and answer them yourself.
  - Second pass: compare against the reference answers and fill in structure and details.
  - Third pass: try going off-script, able to compress an answer to 1 minute or expand it to 3.

## Group 1: Project Introduction Type

### Mock 01

**Interviewer:** What's a project you've studied fairly deeply recently?
**You:** A project I've studied fairly deeply recently is an open-source one called OpenClaw. It's not an ordinary chat bot; it's a local-first personal AI assistant platform. Its core value isn't simply "answering questions," but unifying multiple message channels, multiple client entry points, an Agent runtime, a tool system, a memory system, and a plugin system into a long-running, always-online assistant system.

The reason I focused on it is that it's closer to real deployment scenarios than many Agent demos. Many projects focus on showing off "the model can call tools," but OpenClaw also seriously handles the more engineering-oriented problems—where messages come in from, how multiple users are isolated, how context is maintained long-term, how to recover when the model fails, how permissions are controlled, and how the system extends. So I treat it as a representative sample of deploying AI Agent engineering.

Architecturally, I usually split it into three layers. The first layer is the Gateway, the control plane, responsible for message ingestion, routing, session management, plugin loading, and security control. The second layer is the Agent Runtime, responsible for the actual context assembly, model calls, the tool loop, streaming, and the sub-Agent lifecycle. The third layer is the extension layer—Memory, Context Engine, Browser, Canvas, Node capabilities, and various Provider plugins. This way it's not a simple chat box, but a long-running system with state, boundaries, and extension capability.

### Mock 02

**Interviewer:** So what do you think is the biggest difference between OpenClaw and an ordinary chat bot?
**You:** I think there are four biggest differences. First, it's Local-first—it emphasizes running on the device or machine the user controls, rather than being fully cloud-hosted. Second, it's unified multi-entry—it's not just chatting in one web page; it can connect to WhatsApp, Telegram, Slack, and Discord, and also to CLI, Web UI, computer, and mobile. Third, it supports multiple Agents, each with its own workspace, session, memory, tools, and auth profile, so not everything is crammed into one assistant. Fourth, it's highly plugin-based—channels, models, memory, the context engine, and tools can all be replaced and extended.

In more plain terms, an ordinary chat bot is more like "an account that can reply to messages," whereas OpenClaw is more like "a long-running private AI assistant system that works across multiple scenarios." It doesn't just talk; it has memory, tools, and permission boundaries, and it can keep unified control across multiple channels.

## Group 2: Architecture Understanding Type

### Mock 03

**Interviewer:** Walk me through its overall architecture.
**You:** I'd cover it from three angles: the control plane, the execution plane, and the extension plane. The control plane is the Gateway—it's the hub of the whole system, responsible for connecting each message channel, maintaining sessions, doing message routing, managing the plugin runtime, providing WebSocket and HTTP services, and uniformly handling security policy. The execution plane is the Agent Runtime—it handles the actual execution of user requests, including building the system prompt, loading history messages and memory, calling the model, executing the tool loop, handling streaming, and the sub-Agent lifecycle. The extension plane is the capability layer—Plugins, Context Engine, Memory, Browser, Canvas, Node capabilities.

If I describe it via one message, it's more intuitive. A message first comes in from some channel plugin and is normalized into a unified structure; then the Gateway does deduplication, debouncing, DM pairing checks, and routing rule matching to determine the target Agent; then it computes the sessionKey and puts the message into the per-session queue; then the Runtime starts loading context and calling the model, and if the model wants to use a tool, it enters the tool loop; finally the result is sent back through the corresponding channel. In other words, it's not "the message connects directly to the model"—there's a complete control and orchestration layer in the middle.

What I think is most valuable about this architecture is that the layering is fairly clear. The Gateway is responsible for managing, the Runtime for doing, and the Plugins for extending. This way, even though system complexity is high, the complexity is placed in the right place.

### Mock 04

**Interviewer:** Why does OpenClaw adopt a Gateway-centralized control plane?
**You:** Because once the system connects to multiple channels, multiple clients, and multiple Agents, a lot of shared state inevitably appears—session, routing, presence, health, token usage, channel runtime, plugin runtime. If this state is scattered across each client or inside each channel, it will eventually drift. OpenClaw uses the Gateway to converge this shared state in one place, ensuring the whole system has a consistent source of truth and control entry point.

Another reason is security. What it connects to isn't an abstract API, but real message channels and high-privilege capabilities like shell, browser, system.run, and mobile device control. If authentication, pairing, rate limiting, and permission control are scattered around, it's very hard to guarantee consistency. Once centralized into the Gateway, the entire entry point and execution chain become more controllable.

Of course, centralization has a cost too—the Gateway becomes a large core module and forms a single point. But in this kind of multi-entry assistant system, I think it's a reasonable trade-off, because what it buys you is consistent state, clear operations, and unified security boundaries.

### Mock 05

**Interviewer:** Why have both WebSocket and HTTP?
**You:** Because they take on different responsibilities in OpenClaw. WebSocket is better suited to a real-time bidirectional control protocol—for example, after a client connects to the Gateway it first does a `connect` handshake, and then the Gateway keeps pushing events like `agent`, `presence`, `health`, and `sessions.changed`. This kind of real-time bidirectional communication suits WebSocket well.

HTTP is better suited to service-type entry points like webhooks, the OpenAI-compatible API, the Control UI, Canvas, and health checks. Paths like `/healthz`, `/readyz`, `/v1/chat/completions`, and `/v1/responses` are typical HTTP scenarios. External systems pushing webhook events to the Gateway also more naturally go over HTTP.

So this isn't protocol duplication; it separates the control plane from the service plane. WebSocket handles real-time control and event streams; HTTP handles API compatibility and hosted services. This way the protocol boundaries are clearer and it's easier for the system to evolve.

## Group 3: Message, Session, and Routing Type

### Mock 06

**Interviewer:** Roughly what steps does a message go through from entering the system to the final reply?
**You:** I usually answer in four stages. The first stage is inbound ingestion. The message is first received by a channel plugin like Telegram, WhatsApp, or Discord, then uniformly normalized into an internal message structure. The second stage is Gateway control logic. Here it does deduplication, debouncing, DM pairing or allowlist checks, bindings matching, sessionKey resolution, and queue enqueuing. The third stage is Agent Runtime execution. The system loads the workspace, session transcript, memory, system prompt, and tools, then calls the model; if the model returns a tool call, it executes the tool and backfills the result, then keeps calling the model. The fourth stage is outbound delivery. The final reply, after streaming, chunking, and platform formatting, is sent back through the original channel.

What's most critical here isn't "there are many steps," but that each step solves a different problem. Normalization solves multi-channel ingestion differences, routing solves message attribution, the sessionKey solves the context boundary, the queue guarantees consistency within the same session, the tool loop gives the model execution capability, and the outbound layer is responsible for the real experience the user sees.

### Mock 07

**Interviewer:** What's the difference between `dmPolicy` and `dmScope`?
**You:** These two are easily confused, but they're fundamentally different. `dmPolicy` solves the access-control problem—that is, who is qualified to send a DM to this assistant. For example, in the default `pairing` mode, a stranger first gets a pairing code and won't directly trigger the Agent; `allowlist` means only allowlisted users can send; `open` means anyone can send.

`dmScope` solves the context-isolation problem—that is, once messages come in, which session these DMs should be placed in. For example, `main` means all DMs share one main session, `per-peer` splits by user, `per-channel-peer` splits by channel plus user, and `per-account-channel-peer` splits more fine-grained by account, channel, and user.

So one governs "whether you can get in," the other governs "which table you sit at once you're in." This is very key, because in many systems, even if access control is strict, if the context isn't isolated, legitimate users will still get crossed over—you still have a security problem.

### Mock 08

**Interviewer:** Why is `dmScope="main"` risky in multi-user scenarios?
**You:** Because `main` mode aggregates multiple DM sources into the same main session. In a single-user personal-use scenario, this is very convenient because you can continue the same context across different channels; but once the assistant is open to multiple real users, a session-pollution risk appears.

The most typical example is: Alice chats with the assistant about a sensitive topic, then Bob comes and asks "what did we just talk about." If the two share one session, the model could entirely possibly carry Alice's context over to Bob. This isn't an abstract prompt-level risk; it's a very concrete session-isolation risk.

That's why OpenClaw's documentation explicitly recommends using the safer `per-channel-peer` or a more fine-grained mode in multi-user DM scenarios. This design shows it pushed the security problem deep into the sessionKey layer, rather than stopping at "do a token check at the entry point."

### Mock 09

**Interviewer:** Why do a per-session queue?
**You:** Because the context of the same session must stay strictly consistent. If two Agent runs ran at the same time within one session, they would read the same history simultaneously, write tool results simultaneously, and simultaneously affect compaction and usage stats, and the context order would end up scrambled. That would not only make the model's answers unpredictable, it would also pollute the transcript and subsequent sessions.

So OpenClaw's design lets the same session have only one active run at any given moment—per-session serialization. This solves a correctness problem, not a performance-optimization problem. Performance-level control is handled by the global concurrency pool or by different lanes.

In other words, the essence of the per-session queue is: the same session context must advance in order, like a database transaction—it can't be written concurrently and chaotically.

## Group 4: Agent Runtime and Execution Model Type

### Mock 10

**Interviewer:** What's the fundamental difference between OpenClaw's Agent Runtime and an ordinary "call the LLM once"?
**You:** The biggest difference is that it's not a single request; it's a stateful Agent Loop. An ordinary model call is more about sending the prompt to the model, getting back an answer, and ending. OpenClaw's Runtime has to handle a whole execution lifecycle: first resolve the session and agentId, then prepare the workspace, skills, bootstrap files, and system prompt, then begin model calls.

The key is the tool loop in the middle. If the model decides to call a tool, the Runtime needs to execute the tool, clean the tool result, backfill the result into the context, and keep calling the model. This process can happen over multiple rounds until the model outputs final text. And throughout, it also handles streaming, NO_REPLY, tool-error fallback, compaction, retries, and lifecycle events.

So it's more like a "stateful execution engine" than a "Q&A function." I think this is also where OpenClaw is more mature than many demo-type Agent frameworks.

### Mock 11

**Interviewer:** How do you understand `collect`, `followup`, and `steer`?
**You:** All three are actually answering the same question: when the current run hasn't finished yet, and the user sends a new message, what should the system do. `followup` is the most conservative—it waits for the current turn to fully end, then takes the new message as the next round's input. It suits tasks that need each turn closed off very clearly.

`collect` leans more toward conversational experience—it merges the multiple queued messages and, after the current run ends, takes them as a single followup input, so it doesn't seem too fragmented. `steer` is more aggressive—it tries to check queued messages at tool-call boundaries, and if it finds the user's topic has changed, it tries to stop further pointless tool calls and route the new message into the current execution flow.

So my understanding is: `followup` emphasizes stability, `collect` emphasizes naturalness, and `steer` emphasizes responsiveness. They're not about one being more advanced; they suit different interaction styles.

### Mock 12

**Interviewer:** Why is the system prompt assembled dynamically rather than hardcoded?
**You:** Because OpenClaw's runtime environment is too dynamic. Different Agents have different tools, different skills, different workspaces, different memory, and different security boundaries—even whether the sandbox is enabled, the current time information, reply tags, and heartbeat hints all change. If you hardcoded one super-prompt, it would be very imprecise and would constantly bloat.

The benefit of dynamic assembly is that you can put in only the necessary information based on the current runtime. For example, which tools exist now, what the current working directory is, which skills exist, which bootstrap files should be injected now, and whether to include sandbox info—these are all decided by the runtime. This makes the prompt more precise and easier to keep small.

Also, from a performance angle, dynamic assembly can better maintain a stable prefix for the prompt cache, because it keeps the changing information within the necessary scope rather than reshuffling a huge prompt every time.

### Mock 13

**Interviewer:** Why do sub-Agents use `minimal` prompt mode?
**You:** Because sub-Agents usually serve a local task and don't need to inherit all of the main Agent's personality, memory, and background. If you cram all of the main Agent's system prompt, memory, skills, reply tags, and heartbeats into the sub-Agent, it causes two problems: one is high token cost, and the other is a lot of noise, which actually hurts the sub-task's focus.

The core idea of `minimal` mode is to trim context to the task boundary. Keep the tools and operational boundaries the sub-task truly needs, like `AGENTS.md` and `TOOLS.md`, but don't force-feed all the long-term context. This way the sub-Agent is lighter, faster, and less likely to go off track.

I think this design reflects a very important idea: context isn't better the more there is—it's better the closer it is to the current task.

## Group 5: Memory, Context Engine, and Plugin Type

### Mock 14

**Interviewer:** How do you understand OpenClaw's Memory design?
**You:** I think the most interesting thing about it is that it puts the primary form of expression for memory back into files. That is, the information truly saved long-term isn't a completely invisible database, but Markdown files like `MEMORY.md` and `memory/*.md`. This way the user can see, edit, and proofread it, which better fits the transparency demand of a personal assistant.

There's a database and a vector index too, of course, but they're more like an acceleration layer than the memory itself. For example, `memory-lancedb` handles vector retrieval, automatic recall, and automatic capture, but it doesn't replace file-based memory—it enhances the searchability of file-based memory.

So if I had to sum it up in one sentence, I'd say: OpenClaw's memory design is "files are visible, the index enhances, vectors accelerate," which suits a personal AI assistant scenario better than many pure black-box vector memories.

### Mock 15

**Interviewer:** Why separate Pruning and Compaction?
**You:** Because they handle two different levels of problems. Pruning is more like lightweight tidying before each call—the focus is trimming large tool results to reduce context bloat, while trying not to change the main-thread message structure. Compaction is when the whole session context is genuinely about to overflow—it does heavier compression on old history, like generating summaries, keeping recent messages, and replacing old content.

Simply put, pruning solves "can this call be lighter," and compaction solves "can this long-term session keep living." If you only had pruning, a long-term session would eventually overflow; if you only had compaction, the cost per call would be too high. So both must exist.

### Mock 16

**Interviewer:** Why is the Context Engine worth abstracting separately?
**You:** Because "how to construct the context" is itself a highly variable capability that hugely affects results. It's not simply stitching history messages together; it has to decide which content should go into the context, when to compact, what the compaction strategy is, whether to insert additional system prompts, how to control the sub-Agent context, and so on.

If you hardcoded all this logic into the Runtime, the system would quickly be stuck with only one context strategy. By abstracting it into the Context Engine, OpenClaw can support more advanced retrieval, compaction, and context-maintenance schemes without breaking the main execution engine.

So I'd understand the Context Engine as a layer outside the Runtime—a "context strategy engine"—that gives context management its own room to be plugin-based and to evolve.

### Mock 17

**Interviewer:** Why is OpenClaw's plugin system more mature than many projects?
**You:** Because it's not just splitting code into multiple modules; it genuinely establishes a platform-style extension system. It has a manifest, registry, loader, hooks, slots, a Plugin SDK, and very strict import-boundary control. Plugins can't depend deeply on the core `src/**` directly; they have to plug in through the public SDK, which guarantees the relationship between core and plugins is a contract relationship, not a source-coupling relationship.

In addition, it very clearly distinguishes which capabilities can coexist in parallel and which must be a unique primary implementation. For example, making memory and the context engine into slots is a very mature approach. Because if multiple primary implementations took over the same responsibility at once, the system semantics would get very confused.

So I think it's mature not because of the number of plugins, but because plugin boundaries, lifecycle, and primary-implementation conflict problems are all systematically considered.

## Group 6: Security, Engineering, and Summary Type

### Mock 18

**Interviewer:** What points about OpenClaw's security model are worth mentioning?
**You:** I think the most worth mentioning is that it doesn't reduce security to "add a token." Because it faces real message channels and high-privilege tools, single authentication is far from enough. Its security model is layered, including transport security, Gateway authentication, device identity, DM pairing, allowlist/open policies, rate limiting, Origin checks, RBAC, tool permissions, and an optional sandbox.

I especially think it's very mature that it treats session isolation as a security problem too. Many systems only care about who can get in, but don't consider whether, once in, you're still within the correct context boundary. OpenClaw's handling of `dmScope` shows it treats "context won't cross over" as part of security too.

So to sum up, its security highlight isn't some particularly flashy mechanism; it's that it fairly completely models the attack surface an AI assistant will actually encounter.

### Mock 19

**Interviewer:** What do you think are the three design points most worth learning from OpenClaw?
**You:** First, I'd pick the Gateway as a unified control plane. Because it converges multi-channel, multi-client, multi-session, multi-Agent, and security policy into one center, giving the system a unified source of truth and a unified control entry point. Second, I'd pick the Agent Runtime's engineered execution model. It's not a simple model call; it organizes session, queue, streaming, the tool loop, fault tolerance, and subagents into a long-running framework. Third, I'd pick the boundary design of the plugin system and the context/memory system. Because this determines whether the system can keep evolving, rather than being written as a big, all-in-one but unmaintainable core.

If I could add one more sentence, I'd say what's most worth learning from OpenClaw isn't how many features it supports, but that it puts complexity at the right boundaries.

### Mock 20

**Interviewer:** If you were to build a similar system yourself, drawing on OpenClaw's ideas, which parts would you build first?
**You:** I wouldn't chase a lot of features at the start; I'd prioritize building four skeletons. First is the Gateway, the unified control plane, because without it a multi-entry system's state gets very chaotic. Second is Session and Routing, because the context boundary and message attribution must be solid first. Third is the Agent Runtime, the stable tool loop, queue, and streaming mechanism. Fourth is the permission model, including per-agent tools and high-risk action approval.

Once these four are stable, I'd then gradually build the more advanced extension capabilities like Plugins, Memory, and Context Engine. Because if neither the underlying control plane nor the execution plane is solid, the more features you add on top, the more easily the system turns into a demo that looks strong but is actually fragile.

## Final Advice

- I suggest you orally recite this material in full at least 2 to 3 times.
- In a real interview, don't read from the script—the focus is keeping the answer structure for each question.
- Once you can deliver these 20 mock Q&A sets fluently, this set of OpenClaw interview material is basically nailed down.
