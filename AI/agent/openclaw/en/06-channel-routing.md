# 06 - Message Channels and Routing System

## Overview

OpenClaw's routing system is responsible for accurately dispatching messages from different messaging platforms to the target Agent. This is a multi-layered decision process involving channel management, DM policy, deduplication/debounce, binding rules, queue modes, and session mapping.

## Message Flow Overview

```
Inbound message
  → Deduplication check (short-lived cache, prevents duplicate delivery on channel reconnect)
  → Debounce merging (debounceMs, rapid consecutive messages from the same sender)
  → DM policy check (pairing / allowlist / open)
  → routing/bindings → determine agentId
  → session key resolution
  → queue (if there is an active run: collect / steer / followup)
  → agent run (streaming + tools)
  → outbound replies (channel limits + chunking + formatting)
```

## Channel Abstraction Layer

### Standardized Message Format

Each channel plugin converts the platform-specific message format into OpenClaw's internal standard format:

```typescript
// Standardized inbound message
interface InboundMessage {
  // Source identification
  channel: ChannelId;        // "telegram" | "discord" | "whatsapp" | ...
  accountId?: string;        // account ID in multi-account scenarios
  from: string;              // sender ID (platform format)
  to?: string;               // recipient ID

  // Message content
  text?: string;             // text content
  media?: MediaAttachment[]; // media attachments

  // Group/thread information
  group?: {
    id: string;
    kind: "group" | "channel";
    subject?: string;
    threadId?: string;
  };

  // Context
  replyTo?: string;          // ID of the message being replied to
  mentions?: string[];       // @mentions
  reactions?: Reaction[];    // emoji reactions

  // Metadata
  messageId: string;
  timestamp: Date;
  senderName?: string;
}
```

### Message Body Separation

OpenClaw separates the message body into three layers:

```
Body:        the prompt text sent to the Agent (may include channel envelope and history wrapping)
CommandBody: the raw user text, used for instruction/command parsing
RawBody:     legacy alias for CommandBody

History wrapping format:
  [Chat messages since your last reply - for context]
    sender1: message1
    sender2: message2
  [Current message - respond to this]
    sender3: current message

In non-direct chats (groups/channels), the current message body is prefixed with a sender label,
keeping real-time and queued/historical messages consistent in the Agent prompt.
```

### Inbound Deduplication

```
A channel may redeliver the same message after reconnecting.
OpenClaw maintains a short-lived cache:
  key = channel + accountId + peer + session + messageId
  → duplicate delivery will not trigger a new Agent run
```

### Inbound Debounce

```
Rapid consecutive messages from the same sender can be merged into a single Agent turn:

Configuration:
{
  messages: {
    inbound: {
      debounceMs: 2000,           // global default
      byChannel: {
        whatsapp: 5000,           // WhatsApp 5 seconds
        slack: 1500,
        discord: 1500
      }
    }
  }
}

Notes:
├── Only text messages participate in debounce
├── Media/attachment messages flush immediately
├── Control commands bypass debounce (kept independent)
└── Uses the reply threading/ID of the latest message
```

## DM Access Policy

### Policy Types

```
dmPolicy policies:

1. "pairing" (default)
   ┌──────────┐     ┌────────────┐     ┌──────────┐
   │ Unknown   │ ──→ │ Send       │ ──→ │ User      │ ──→ Added to allowlist
   │ sender    │     │ pairing    │     │ approval  │
   └──────────┘     │ code       │     └──────────┘
                    └────────────┘
   Bot reply: "Hey! I don't know you yet. Your pairing code is: ABC-123"
   User approval: openclaw pairing approve telegram ABC-123

2. "allowlist"
   ┌──────────┐     ┌──────────────┐
   │ Check     │ ──→ │ In the list? │ ──→ Yes: process / No: ignore
   │ allowlist │     └──────────────┘
   └──────────┘

3. "open" (must be explicitly enabled, ⚠️ security risk)
   ┌──────────┐
   │ All DMs   │ ──→ Process directly
   └──────────┘

Important: DM access control is global per-channel-account, not per-agent
```

### Allowlist Configuration

```json5
{
  channels: {
    whatsapp: {
      dmPolicy: "allowlist",
      allowFrom: ["+8613800138000", "+8613900139000"]
    },
    telegram: {
      dmPolicy: "pairing"
      // In pairing mode, approved users are automatically stored in the local allowlist
    }
  }
}
```

## Multi-Agent Routing

### Agent Isolation

Each Agent is a **fully isolated unit**:

```
Each Agent owns its own:
├── Workspace (files, AGENTS.md/SOUL.md/USER.md, Skills)
├── State Directory (agentDir: auth profiles, model registry, per-agent config)
│   └── ~/.openclaw/agents/<agentId>/agent/auth-profiles.json
├── Session Store (chat history + routing state)
│   └── ~/.openclaw/agents/<agentId>/sessions/
└── Skills (workspace/skills/ + shared ~/.openclaw/skills/)

Important:
├── Auth profiles are per-agent (not shared automatically)
├── Never reuse an agentDir across Agents (it causes auth/session conflicts)
├── The workspace is the default cwd, not a hard sandbox
│   └── Relative paths resolve within the workspace; absolute paths can reach other host locations
│   └── If you need a sandbox, enable sandboxing
└── To share credentials, copy auth-profiles.json into another Agent's agentDir
```

### Bindings

When the Gateway runs multiple Agents, bindings decide message dispatch. Bindings are **deterministic**, with **most specific first**:

```json5
{
  agents: {
    list: [
      { id: "main", workspace: "~/.openclaw/workspace-main" },
      { id: "work", workspace: "~/.openclaw/workspace-work" },
      { id: "family", workspace: "~/.openclaw/workspace-family" }
    ]
  },
  bindings: [
    // Tier 1: Peer exact match (highest priority)
    { agentId: "family", match: {
      channel: "whatsapp",
      peer: { kind: "group", id: "120363999@g.us" }
    }},

    // Tier 6: Account-level match
    { agentId: "work", match: {
      channel: "whatsapp", accountId: "biz"
    }},

    // Tier 7: Channel wildcard
    { agentId: "main", match: {
      channel: "whatsapp", accountId: "*"
    }}
  ]
}
```

### Routing Priority (8-level matching)

```
Priority from high to low:

Tier 1: peer exact match
  match: { channel, peer: { kind: "direct"|"group"|"channel", id: "..." } }
  → pinpoints a specific person or a specific group

Tier 2: parentPeer match (thread inheritance)
  match: { channel, parentPeer: "..." }
  → threads inherit the Agent of the parent message

Tier 3: guildId + roles (Discord role routing)
  match: { channel: "discord", guildId: "...", roles: [...] }
  → dispatch based on Discord roles

Tier 4: guildId (Discord server level)
  match: { channel: "discord", guildId: "..." }

Tier 5: teamId (Slack team level)
  match: { channel: "slack", teamId: "..." }

Tier 6: accountId exact match
  match: { channel, accountId: "specific-account" }
  → omitting accountId matches only the default account

Tier 7: accountId wildcard
  match: { channel, accountId: "*" }
  → channel-level fallback across all accounts

Tier 8: default Agent
  the one with default: true in agents.list, or the first one, defaulting to "main"

Multiple matches in the same tier: the first in configuration order wins
```

### AND Semantics

When a binding sets multiple match fields, all must be satisfied (AND relationship):

```json5
// Must all be satisfied: channel=whatsapp AND accountId=biz AND peer matches
{
  agentId: "work",
  match: {
    channel: "whatsapp",
    accountId: "biz",
    peer: { kind: "group", id: "120363999@g.us" }
  }
}
```

### Account Scope Details

```
├── A binding omitting accountId → matches only the default account
├── accountId: "*" → channel-level fallback across all accounts
├── When a binding with an explicit accountId is later added for the same Agent
│   → OpenClaw upgrades the existing channel-only binding to account-scoped
│      rather than creating a duplicate
```

### Routing One WhatsApp Number to Multiple People

The same WhatsApp number can route to different Agents by DM sender:

```json5
{
  agents: {
    list: [
      { id: "alex", workspace: "~/.openclaw/workspace-alex" },
      { id: "mia", workspace: "~/.openclaw/workspace-mia" }
    ]
  },
  bindings: [
    {
      agentId: "alex",
      match: { channel: "whatsapp", peer: { kind: "direct", id: "+15551230001" } }
    },
    {
      agentId: "mia",
      match: { channel: "whatsapp", peer: { kind: "direct", id: "+15551230002" } }
    }
  ],
  channels: {
    whatsapp: {
      dmPolicy: "allowlist",
      allowFrom: ["+15551230001", "+15551230002"]
    }
  }
}
// Note: replies still come from the same WhatsApp number (there is no per-agent sender identity)
```

## Group Message Handling

### Activation Modes

```
Group policies:

1. @mention activation (default)
   ├── Responds only when @bot or a matching mentionPattern is present
   ├── mentionPatterns: ["@assistant", "@openclaw", "@bot"]
   └── Mention detection + reply tagging

2. Free activation
   ├── groupPolicy: "open"
   └── Responds to all messages (suitable for small private groups)

3. Allowlist
   ├── groupPolicy: "allowlist"
   └── Responds only in designated groups
```

### Group History Context

```
History buffer (pending-only):
├── Includes: group messages that did not trigger a run (e.g. mention-gated messages)
├── Excludes: messages already in the session transcript
├── Configuration: messages.groupChat.historyLimit (global)
│   └── Channel override: channels.slack.historyLimit, etc.
│   └── Set to 0 to disable
├── Instruction stripping is applied only to the current message part (history stays intact)
└── Joiner format:
    [Chat messages since your last reply - for context]
      sender1: message1
    [Current message - respond to this]
      sender2: current message
```

### Group Mechanics Across Platforms

```
Telegram:
├── Regular group → group:<groupId>
├── Supergroup → group:<groupId>
└── Forum group → group:<groupId>:topic:<threadId>
    └── Each topic has an isolated session

Discord:
├── Server channel → channel:<channelId>
├── Thread → channel:<channelId> + threadId
├── per-guild configuration (channel allowlist, role routing)
└── guildId + roles routing (Tier 3-4)

Slack:
├── Channel → channel:<channelId>
├── Thread → channel:<channelId> + threadId
├── per-team configuration (teamId routing Tier 5)
└── Native streaming API (nativeStreaming)

WhatsApp:
├── Group → group:<jid>
└── Mention detection + reply tagging

Matrix:
├── Room → room:<roomId>
├── Thread → room:<roomId> + threadId
└── Space hierarchy support
```

## Outbound Message Handling

### Message Formatting and Chunking

```
Agent generates a reply
    │
    ├── 1. Determine target channel and session
    │   └── Obtained from the inbound message's session origin
    │
    ├── 2. Check the Send Policy
    │   └── Whether sending to this session type is allowed
    │
    ├── 3. Message formatting
    │   ├── Markdown → platform-specific format
    │   ├── Long message chunking (per-channel rules):
    │   │   ├── WhatsApp: textChunkLimit = 4096 characters
    │   │   ├── Telegram: textChunkLimit = 4096 characters
    │   │   ├── Discord:  textChunkLimit = 2000 characters
    │   │   │   └── maxLinesPerMessage = 17 (avoids UI clipping)
    │   │   └── Other channels have their own limits
    │   ├── chunkMode:
    │   │   ├── "length" (default): chunk by character count
    │   │   └── "newline": split first at blank lines (paragraph boundaries), then by length
    │   └── Media attachment handling
    │
    ├── 4. Prefix and reply threading
    │   ├── responsePrefix (global → channel → account cascade)
    │   └── replyToMode (reply threading configuration)
    │
    ├── 5. Block Streaming (if enabled)
    │   └── See the detailed description in 03-agent-runtime.md
    │
    └── 6. Send through the channel plugin
        └── plugin.send({ to, text, media, ... })
```

## Multi-Account Support

The same channel can run multiple accounts:

```json5
{
  channels: {
    whatsapp: {
      defaultAccount: "personal",
      accounts: {
        personal: { /* authDir */ },
        biz: { /* authDir */ }
      }
    },
    telegram: {
      accounts: {
        default: { botToken: "123456:ABC..." },
        alerts: { botToken: "987654:XYZ..." }
      }
    },
    discord: {
      accounts: {
        default: { token: "BOT_TOKEN_1" },
        coding: { token: "BOT_TOKEN_2" }
      }
    }
  }
}
```

### Channels That Support Multiple Accounts

WhatsApp, Telegram, Discord, Slack, Signal, iMessage, IRC, LINE, Google Chat,
Mattermost, Matrix, Nextcloud Talk, BlueBubbles, Zalo, Zalo Personal, Nostr, Feishu

## Complete Message Flow Example

```
Scenario: Alice sends a message to the "work" Agent via WhatsApp

1. WhatsApp (Baileys) receives the message
   from: "+8613800138000", text: "Help me write a Python script"

2. Deduplication check → new message ✅

3. Debounce check → no more messages within debounceMs=5000 → flush

4. WhatsApp plugin normalizes → InboundMessage {
     channel: "whatsapp", accountId: "biz",
     from: "+8613800138000", text: "Help me write a Python script",
     group: null  // DM
   }

5. DM policy check
   dmPolicy: "allowlist", allowFrom contains "+8613800138000" ✅

6. Routing engine match
   binding: { agentId: "work", match: { channel: "whatsapp", accountId: "biz" } }
   → Tier 6 match → routed to Agent "work"

7. Session key resolution
   dmScope: "per-channel-peer"
   → sessionKey: "agent:work:whatsapp:direct:+8613800138000"

8. Queue check
   no active run for this session → start directly

9. Agent "work" processes
   workspace: ~/.openclaw/workspace-work/
   model: provider/model-id
   → run the Agent loop (context assembly → LLM → tools → reply)

10. Reply sent through the WhatsApp plugin
    to: "+8613800138000"
    text: "Sure, here is a Python script..."
    → within textChunkLimit=4096 → sent as a single message
```
