# 04 - Session Management System

## Overview

OpenClaw's session management is the critical link connecting messaging channels and the agent runtime. It determines:
- Which "conversation" a message belongs to (Session Key resolution)
- How conversation history is stored and retrieved (JSONL transcripts)
- When conversations expire and reset (Reset Policy)
- How multiple users are isolated from each other (dmScope security)
- How context is optimized (pruning, compaction, memory flush)

**Core design decision**: all session state is held by the Gateway; UI clients must query the Gateway to obtain it (they cannot read local files directly).

## Session Key

### Key Structure and dmScope Mapping

Every message is mapped to a unique session key. For DM messages, the key format depends on the `session.dmScope` configuration:

```
dmScope="main" (default; all DMs share one main session):
  agent:<agentId>:<mainKey>
  Example: agent:main:main

  Characteristic: multiple phone numbers and channels can map to the same agent main key,
                  acting as different transport channels for the same conversation

dmScope="per-peer" (isolated by sender):
  agent:<agentId>:direct:<peerId>
  Example: agent:main:direct:+8613800138000

dmScope="per-channel-peer" (recommended for multi-user setups; isolated by channel + sender):
  agent:<agentId>:<channel>:direct:<peerId>
  Example: agent:main:telegram:direct:tg:123456789

dmScope="per-account-channel-peer" (multi-account inbox; isolated by account + channel + sender):
  agent:<agentId>:<channel>:<accountId>:direct:<peerId>
  Example: agent:main:whatsapp:biz:direct:+8613800138000
  Note: accountId defaults to "default"
```

### Group / Channel / Special Keys

```
Group messages:
  agent:<agentId>:<channel>:group:<groupId>
  Example: agent:main:whatsapp:group:120363999@g.us

Channel / room messages:
  agent:<agentId>:<channel>:channel:<channelId>
  Example: agent:main:discord:channel:123456789012345678

Telegram forum topics (topic-level isolation):
  agent:<agentId>:telegram:group:<groupId>:topic:<threadId>

Cron jobs:
  cron:<jobId>                    # Isolated (mints a new sessionId on each run)
  session:<customId>              # Persistent (reused across runs)

Webhook:
  hook:<uuid>                     # Unless the hook configuration explicitly specifies one

Node runs:
  node-<nodeId>
```

### Security Implications of dmScope

This is a **critical security design** that directly affects user privacy:

```
⚠️  Security warning: If your agent can receive DMs from multiple people, enabling a secure DM mode is strongly recommended.

Problem scenario (default dmScope="main"):
1. Alice messages your agent about a private topic (e.g., a medical appointment)
2. Bob messages and asks "What were we just talking about?"
3. Because both people's DMs share the same session, the model may answer Bob using Alice's context
   → Private information leak!

Solution:
{
  session: {
    dmScope: "per-channel-peer"    // recommended
  }
}

Scenarios where a secure DM mode should be enabled:
├── Multiple senders have been approved via pairing
├── The DM allowlist has multiple entries
├── dmPolicy: "open" is set
└── Multiple phone numbers or accounts can message the agent

Notes:
├── The official documentation still states that DMs share the `main` session by default, which suits single-user personal use
├── When multiple people can DM the same agent, you should explicitly set "per-channel-peer" or a finer granularity
└── You can verify DM settings with openclaw security audit
```

### Identity Links

When the same person contacts you through different channels, their sessions can be merged:

```json5
{
  session: {
    identityLinks: {
      // provider-prefixed peer id → canonical identity
      "alice": ["telegram:123456789", "discord:987654321012345678"],
      "bob": ["whatsapp:+8613800138000", "signal:+8613800138000"]
    }
  }
}
// Effect: Alice's DMs via Telegram and Discord share the same session
// Applies to per-peer, per-channel-peer, and per-account-channel-peer
```

## Session Storage

### File Layout

```
~/.openclaw/agents/<agentId>/sessions/
├── sessions.json                    # Session mapping table (source of truth)
│                                     # Format: sessionKey → { sessionId, sessionStartedAt, lastInteractionAt, updatedAt, ... }
│                                     # Deleting an entry is safe; it is rebuilt on the next message
├── <SessionId>.jsonl                # Session transcript (one message per line)
├── <SessionId>-topic-<threadId>.jsonl  # Telegram topic transcript
├── <SessionId>.deleted.<timestamp>  # Archive of deleted sessions
└── <SessionId>.reset.<timestamp>    # Archive of reset sessions
```

### sessions.json Structure

```json
{
  "agent:main:main": {
    "sessionId": "boot-2026-03-21_10-30-00-abc12345",
    "sessionStartedAt": "2026-03-21T10:30:00Z",
    "lastInteractionAt": "2026-03-21T10:30:00Z",
    "updatedAt": "2026-03-21T10:30:00Z",
    "inputTokens": 15000,
    "outputTokens": 5000,
    "totalTokens": 20000,
    "contextTokens": 18000,
    "origin": {
      "label": "WhatsApp DM",
      "provider": "whatsapp",
      "from": "+8613800138000",
      "to": "+8613900139000"
    },
    "displayName": "Alice",
    "channel": "whatsapp"
  },
  "agent:main:telegram:group:123456": {
    "sessionId": "group-tg-123456-xyz",
    "displayName": "Dev Team",
    "channel": "telegram",
    "subject": "Project Discussion",
    "room": "telegram:123456"
  }
}
```

### JSONL Transcript Format

One JSON object per line, recording the full conversation history:

```jsonl
{"role":"system","content":"You are...","timestamp":"..."}
{"role":"user","content":"Hello","timestamp":"...","meta":{"channel":"whatsapp","from":"+86..."}}
{"role":"assistant","content":"Hi!","timestamp":"...","usage":{"input":100,"output":50}}
{"role":"assistant","content":"","tool_calls":[{"id":"tc1","function":{"name":"exec","arguments":"{...}"}}]}
{"role":"tool","tool_call_id":"tc1","content":"Command output..."}
{"role":"assistant","content":"Done!","timestamp":"..."}
```

## Session Lifecycle

### Reset Policy

```
┌─────────────────────────────────────────────────────────────┐
│               Session Reset Decision Tree                     │
│                                                              │
│  1. New message received                                     │
│  2. Check resetByChannel (channel-level override, highest priority) │
│  3. Check resetByType (type-level override: direct/group/thread)    │
│  4. Check reset (global policy)                              │
│                                                              │
│  Policy types:                                               │
│  ├── daily: reset at hour N every day                        │
│  │   └── Defaults to 4:00 AM in the Gateway host's local time │
│  │   └── Based on sessionStartedAt, not updatedAt            │
│  ├── idle: reset after N idle minutes                        │
│  │   └── Based on lastInteractionAt; heartbeat/cron/system events do not renew it │
│  └── daily + idle: whichever comes first (triggers on the earlier expiry) │
│                                                              │
│  Type mapping:                                               │
│  ├── direct = DM conversations                               │
│  ├── group  = group conversations                            │
│  └── thread = Slack/Discord threads, Telegram topics,        │
│              Matrix threads                                   │
│                                                              │
│  5. If the session has expired → create a new sessionId      │
│  6. If not expired → keep using the current session          │
│                                                              │
│  Special: Cron jobs always mint a new sessionId on each run (no reuse) │
└─────────────────────────────────────────────────────────────┘
```

### Configuration Example

```json5
{
  session: {
    // Global policy
    reset: {
      mode: "daily",
      atHour: 4,              // 4 AM
      idleMinutes: 120        // or 2 hours idle (whichever comes first)
    },
    // Override by session type
    resetByType: {
      direct: { mode: "idle", idleMinutes: 240 },
      group:  { mode: "idle", idleMinutes: 120 },
      thread: { mode: "daily", atHour: 4 }
    },
    // Override by channel (highest priority)
    resetByChannel: {
      discord: { mode: "idle", idleMinutes: 10080 }  // Discord 7 days
    },
    // Manual reset commands
    resetTriggers: ["/new", "/reset"]
  }
}
```

### Manual Reset

```
/new              → start a new session, running a short "hello" greeting turn to confirm the reset
/new opus         → new session + switch model (supports alias, provider/model, and fuzzy matching on provider name)
/reset            → reset the current session
The remainder of the message sent with /new and /reset is passed through
```

## Session Pruning

### Overview

Pruning trims old tool results **before every LLM call** to reduce context bloat. It **does not modify the JSONL history on disk**.

### cache-ttl Mode (Anthropic Optimization)

```
Trigger condition: the last Anthropic call was more than ttl ago (default 5m)
Effect: reduces the cacheWrite size of the first request after the TTL expires;
        after pruning, the TTL window resets and subsequent requests can reuse the new cache

Smart defaults (Anthropic):
├── OAuth/setup-token profiles: enable cache-ttl + heartbeat=1h
├── API key profiles: enable cache-ttl + heartbeat=30m + cacheRetention="short"
└── Explicit settings are not overridden
```

### Pruning Rules

```
What can be pruned:
├── Only toolResult messages
├── user + assistant messages are never modified
├── Tool results after the last keepLastAssistants (default 3) assistant messages are not pruned
├── Tool results containing image blocks are skipped
└── When there are not enough assistant messages to establish a cutoff, pruning is skipped

Two levels of pruning:
├── Soft-trim (oversized tool results):
│   ├── Keep head + tail, insert "..." in the middle
│   ├── Append a note about the original size
│   └── Defaults: maxChars=4000, headChars=1500, tailChars=1500
│
└── Hard-clear (older tool results):
    ├── The entire result is replaced with a placeholder
    └── Default: "[Old tool result content cleared]"
```

### Before and After Pruning

```
Before pruning:
[system] System prompt
[user] Message 1
[assistant] Reply 1 (with tool call)
[tool] Tool result 1 (58000 chars)    ← soft-trim
[assistant] Reply 2 (with tool call)
[tool] Tool result 2 (120000 chars)   ← hard-clear
[user] Message 3
[assistant] Reply 3 (with tool call)    ← within keepLastAssistants range
[tool] Tool result 3                  ← kept
[user] Current message

After pruning:
[system] System prompt
[user] Message 1
[assistant] Reply 1
[tool] "head...tail\n[Trimmed from 58000 chars]"
[assistant] Reply 2
[tool] "[Old tool result content cleared]"
[user] Message 3
[assistant] Reply 3
[tool] Tool result 3                  ← fully kept
[user] Current message
```

### Pruning Configuration

```json5
{
  agents: {
    defaults: {
      contextPruning: {
        mode: "cache-ttl",          // "off" / "cache-ttl"
        ttl: "5m",                  // TTL window
        keepLastAssistants: 3,      // protect the most recent N assistants
        softTrimRatio: 0.3,
        hardClearRatio: 0.5,
        minPrunableToolChars: 50000,
        softTrim: {
          maxChars: 4000,
          headChars: 1500,
          tailChars: 1500
        },
        hardClear: {
          enabled: true,
          placeholder: "[Old tool result content cleared]"
        },
        tools: {
          allow: ["exec", "read"],    // restrict which tools are pruned (optional)
          deny: ["*image*"]           // tools to exclude
        }
      }
    }
  }
}
```

## Session Compaction

When the context window approaches full, it is compacted automatically or manually:

```
Trigger conditions:
├── Automatic: estimated tokens > contextWindow - reserveTokensFloor
├── Manual: the user sends /compact [instructions]
└── Overflow recovery: emergency compaction when the context exceeds the limit

Compaction flow:
1. Pre-compaction memory flush (memoryFlush, if enabled)
   ├── Append to the system prompt: "Session nearing compaction. Store durable memories now."
   ├── Run a silent agent turn
   ├── The agent reviews important information in the current context
   ├── Writes to memory/ files
   └── Replies NO_REPLY (silent; invisible to the user)

2. The context engine runs compact()
   ├── Legacy Engine: built-in summary compaction
   │   ├── Old messages → call the LLM to generate a summary
   │   ├── Keep the most recent N messages
   │   └── The summary replaces the old messages
   └── Plugin Engine: custom compaction strategy
       └── e.g., DAG summaries, vector retrieval, etc.

3. Stream and emit a compaction event
4. May trigger a retry, resetting the memory buffer and tool summaries
5. Update sessions.json to mark it as compacted

Configuration:
{
  agents: {
    defaults: {
      compaction: {
        reserveTokensFloor: 20000,      // reserved token floor
        memoryFlush: {
          enabled: true,                 // on by default
          softThresholdTokens: 4000,     // trigger threshold
          systemPrompt: "Session nearing compaction...",
          prompt: "Write durable notes to memory/..."
        }
      }
    }
  }
}
```

## Session Maintenance

OpenClaw automatically cleans up old sessions to control disk usage:

### Order of Maintenance Operations

```
Cleanup order in enforce mode:
1. Prune expired entries (pruneAfter, default 30 days)
2. Limit total entry count (maxEntries, default 500; oldest first)
3. Archive transcript files of deleted entries
4. Clean up old .deleted/.reset archives (resetArchiveRetention)
5. Rotate sessions.json (rotateBytes, default 10MB)
6. Disk budget enforcement (maxDiskBytes, optional)
   └── Clean up toward highWaterBytes (default 80% of maxDiskBytes)
       Clean up the oldest artifacts first, then the oldest sessions
```

### Configuration Examples

```json5
// Conservative enforce policy
{
  session: {
    maintenance: {
      mode: "enforce",              // "warn" (default, report only) / "enforce"
      pruneAfter: "45d",
      maxEntries: 800,
      rotateBytes: "20mb",
      resetArchiveRetention: "14d"
    }
  }
}

// Large deployment + hard disk budget
{
  session: {
    maintenance: {
      mode: "enforce",
      pruneAfter: "14d",
      maxEntries: 2000,
      rotateBytes: "25mb",
      maxDiskBytes: "2gb",
      highWaterBytes: "1.6gb"
    }
  }
}
```

### Performance Considerations

```
Factors that increase maintenance cost:
├── Very high maxEntries values
├── Long pruneAfter windows (retaining stale entries)
├── A large number of transcript/archive files under sessions/
└── maxDiskBytes enabled without sensible pruning/caps

Recommendations:
├── Use mode: "enforce" in production
├── Set both time and count limits (pruneAfter + maxEntries)
├── Keep highWaterBytes well below maxDiskBytes (default 80%)
└── Preview the impact with --dry-run after configuration changes
```

### CLI Commands

```bash
# Preview cleanup
openclaw sessions cleanup --dry-run --json

# Perform cleanup
openclaw sessions cleanup --enforce

# Active key protection
openclaw sessions cleanup --enforce --active-key agent:main:main
```

## Send Policy

You can block sending messages to specific session types:

```json5
{
  session: {
    sendPolicy: {
      rules: [
        // Forbid sending to Discord groups
        { action: "deny", match: { channel: "discord", chatType: "group" } },
        // Forbid sending to Cron sessions
        { action: "deny", match: { keyPrefix: "cron:" } },
        // Match the raw session key (including the agent:<id>: prefix)
        { action: "deny", match: { rawKeyPrefix: "agent:main:discord:" } },
      ],
      default: "allow"
    }
  }
}
```

Runtime overrides (owner only):
- `/send on` — allow sending
- `/send off` — forbid sending
- `/send inherit` — clear the override and use the configured rules

## The Gateway Is the Single Source of Truth

```
✅ Correct: macOS App → WS request → Gateway → returns the session list
❌ Wrong:   macOS App → reads the local sessions.json directly

Reasons:
├── In remote mode, sessions.json lives on the remote Gateway host
├── Token counts come from the Gateway's store (inputTokens, outputTokens,
│   totalTokens, contextTokens), not from the client parsing JSONL
├── Maintain a single source of truth and avoid data inconsistencies
└── UI clients do not parse JSONL transcripts to "correct" the counts
```
