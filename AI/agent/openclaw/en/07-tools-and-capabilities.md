# 07 - Tools and Capabilities System

## Overview

OpenClaw provides a rich tool system that lets agents interact with the outside world. Tools fall into four categories: **built-in tools**, **Skills**, **plugin tools**, and **Node capabilities**. Tool permissions are controlled by per-agent policies, and high-risk operations require human-in-the-loop approval.

## Tool System Structure

```
┌──────────────────────────────────────────────────────────────┐
│                       Tool System                             │
│                                                               │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │  Built-in Tools │  │  Plugin Tools  │  │   Skills       │ │
│  │ (Core Tools)   │  │ (plugin-registered)│ (composable skills)│ │
│  │                │  │                │  │                │ │
│  │ read/write/edit│  │ browser (CDP)  │  │ bundled/       │ │
│  │ exec           │  │ canvas.*       │  │ managed/       │ │
│  │ apply_patch    │  │ firecrawl      │  │ workspace/     │ │
│  │ message/notify │  │ tavily         │  │                │ │
│  │ sessions_*     │  │ brave_search   │  │ SKILL.md       │ │
│  │ memory_*       │  │ elevenlabs     │  │ + triggers     │ │
│  │ cron_*         │  │ open_prose     │  │                │ │
│  │ session_status │  │ ...            │  │                │ │
│  └────────────────┘  └────────────────┘  └────────────────┘ │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Node Capabilities (device capabilities, invoked remotely via WebSocket) │ │
│  │                                                         │  │
│  │  camera.snap/clip │ screen.record │ location.get        │  │
│  │  canvas.push/eval/snapshot │ system.notify/run          │  │
│  │  contacts.* │ calendar.* │ photos.* │ motion.*          │  │
│  │  sms.* (Android) │ calllog.* (Android)                  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Plugin Tool Registration

Plugins register tools through the SDK, using a factory pattern to create them dynamically based on context:

```typescript
// Plugin SDK tool registration types
type OpenClawPluginToolContext = {
  config?: OpenClawConfig;
  workspaceDir?: string;
  agentDir?: string;
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;          // regenerated on every /new and /reset
  messageChannel?: string;
  agentAccountId?: string;
  requesterSenderId?: string;  // trusted sender ID (provided by the runtime)
  senderIsOwner?: boolean;     // whether the sender is the owner
  sandboxed?: boolean;
};

// Factory function: returns tools dynamically based on context
type OpenClawPluginToolFactory = (
  ctx: OpenClawPluginToolContext,
) => AnyAgentTool | AnyAgentTool[] | null | undefined;

// Registration example
api.registerTool({
  name: "brave_search",
  factory: (ctx) => {
    if (!ctx.config?.tools?.braveSearch?.enabled) return null;
    return createBraveSearchTool(ctx.config.tools.braveSearch.apiKey);
  }
});
```

## Built-in Tools in Detail

### File Operation Tools

```
read:
  ├── Read file contents
  ├── Supports reading line ranges
  ├── Supports reading images/PDFs (multimodal)
  └── Parameters: path, lineRange?

write:
  ├── Write/overwrite a file
  ├── Create a new file
  └── Parameters: path, content

edit:
  ├── Edit an existing file (precise diff-based modification)
  ├── Safer than a full write
  └── Parameters: path, oldContent, newContent

apply_patch:
  ├── Apply a unified diff patch
  ├── Optional feature; must be enabled in configuration
  └── Configuration: tools.exec.applyPatch = true

exec:
  ├── Execute a shell command
  ├── Controlled by the sandbox and tool policy
  ├── Configurable timeout
  ├── High-risk operations require approval
  └── Parameters: command, timeout?, cwd?
```

### Messaging Tools

```
message:
  ├── Send a message to a specified channel
  ├── action: "send"
  ├── Specify channel + target
  ├── Supports attachments
  └── Sends via the message tool are tracked to avoid duplicating the assistant's confirmation text

notify:
  ├── System notification
  └── Pushed via the Node device
```

### Session Tools

```
sessions_list:     List all active sessions
sessions_history:  View the history messages of a specified session
sessions_send:     Send a message to a specified session (cross-session communication)
sessions_spawn:    Create a sub-agent session (independent model, tools, workspace)
session_status:    Current session status + token usage + current timestamp
                   (the agent should use this tool when it needs the current time)
```

### Memory Tools

```
memory_search:
  ├── Semantic search over the memory store
  ├── Supports hybrid vector + BM25 search
  ├── Searches across MEMORY.md and memory/*.md
  └── Parameters: query

memory_get:
  ├── Read a memory file precisely
  ├── Supports line ranges
  └── Degrades gracefully when the file does not exist (returns empty text)
```

## Browser Tool

### Architecture

```
src/browser/
├── Browser control server
├── CDP (Chrome DevTools Protocol) client
├── Page snapshots (DOM accessibility tree + screenshots)
├── Action executor
└── Configuration management

Workflow:
1. The Gateway creates a standalone Chrome/Chromium instance at startup
2. The agent sends commands via the browser tool
3. The browser performs operations via CDP (navigate, click, type...)
4. A page snapshot (accessibility tree or screenshot) is returned to the agent

Key capabilities:
├── Navigate to a URL
├── Screenshot (full page/region)
├── DOM snapshot (accessibility tree — understand page structure without a vision model)
├── Click/type/select/upload files
├── Multi-tab management
├── Browser profiles (persistent login state)
└── Login assistance
```

### Configuration

```json5
{
  tools: {
    browser: {
      enabled: true,
      headless: true,               // headless mode
      chromePath: "/path/to/chrome", // custom Chrome path
      profiles: {
        default: {
          dataDir: "~/.openclaw/browser-profiles/default"
        }
      }
    }
  }
}
```

## Canvas System

### Overview

Canvas is an agent-driven visual workspace where the agent can create and manipulate web content.

```
src/canvas-host/
├── server.ts              # Canvas HTTP server
├── a2ui/                  # A2UI (Agent-to-UI) system
│   └── .bundle.hash       # A2UI bundle hash
└── ...

HTTP paths:
/__openclaw__/canvas/       # HTML/CSS/JS edited by the agent
/__openclaw__/a2ui/         # A2UI communication host
```

### A2UI (Agent-to-UI)

A2UI is an innovative concept in OpenClaw — the agent controls the UI directly:

```
Agent                    Canvas Host              User Browser
  │                          │                         │
  ├── canvas.push ─────────→│ Store HTML/CSS/JS ────→│ Render
  │   {html, css, js}       │                         │
  │                          │                         │
  ├── canvas.eval ─────────→│ Inject JS ────────────→│ Execute
  │   {script}              │                         │
  │                          │                         │
  ├── canvas.snapshot ─────→│ Screenshot ←───────────│
  │                          │                         │
  └── canvas.reset ────────→│ Clear ────────────────→│ Blank
```

Example uses:
- The agent generates interactive data visualizations
- Display code execution results in real time
- Create temporary web apps for the user to interact with
- Display maps, charts, tables, etc.

## Node Capability System

### Architecture

```
src/node-host/
├── Node registry (NodeRegistry)
├── Capability routing
└── Command dispatch

Gateway ←── WebSocket ──→ Node device
                           (macOS/iOS/Android)
```

### Node Connection Registration

```typescript
// Capabilities declared when a Node connects
{
  role: "node",
  deviceId: "iPhone-ABC",
  platform: "ios",
  caps: [
    "camera",        // camera
    "screen",        // screen recording
    "location",      // location
    "canvas",        // Canvas rendering
    "notifications", // notifications
    "contacts",      // contacts
    "calendar",      // calendar
    "photos",        // photo library
    "motion",        // motion sensors
    "sms"            // SMS (Android only)
  ],
  commands: [
    "camera.snap",        // take a photo
    "camera.clip",        // record video
    "screen.record",      // screen recording
    "location.get",       // get location
    "canvas.push",        // push Canvas
    "canvas.eval",        // execute Canvas JS
    "canvas.snapshot",    // Canvas screenshot
    "system.notify",      // system notification
    "system.run"          // system command (requires approval)
  ]
}
```

### Invocation Flow

```
Agent invokes camera.snap
    │
    ├── 1. The Gateway looks for an available Node
    │   └── NodeRegistry.findCapable("camera")
    │
    ├── 2. Select the best Node (mobile > desktop)
    │
    ├── 3. Send the command to the Node
    │   └── WS: {type:"req", method:"invoke", params:{cmd:"camera.snap"}}
    │
    ├── 4. The Node executes
    │   ├── iOS: CameraController
    │   └── Android: CameraCaptureManager
    │
    ├── 5. Return the result (image data: base64 or a temporary file URL)
    │
    └── 6. The agent receives the result (added to the context as a tool result)
```

### Platform-Specific Capabilities

```
Shared by iOS + Android:
├── camera.snap / camera.clip
├── screen.record
├── location.get
├── canvas.push / canvas.eval / canvas.snapshot
├── contacts.list
├── calendar.*
├── photos.*
├── motion.*
└── system.notify

Android only:
├── sms.send / sms.list        # SMS
├── calllog.*                   # call log
├── notifications.list          # notification listening
└── device.update               # app update check
```

## Cron System

### Architecture

```
src/cron/
├── Scheduled-task scheduler
├── Task definition and persistence
└── Execution management

Workflow:
1. The agent or user creates a scheduled task via the cron tool
2. The Gateway's cron scheduler manages the schedule
3. On expiry, an isolated agent session is created to execute it
4. The result can optionally be sent to a specified channel

Characteristics:
├── Isolated cron jobs mint a new sessionId on each run (no reuse)
├── The cron lane is independent of the main lane (does not block inbound replies)
└── A different model can be specified
```

### Task Configuration

```json5
{
  // Created via the agent tool
  cron_create: {
    schedule: "0 9 * * *",      // standard cron expression
    prompt: "Check my schedule and give me a morning brief",
    session: "cron:morning-brief",
    channel: "whatsapp",
    target: "+8613800138000"
  },

  // Via the configuration file
  cron: {
    jobs: [
      {
        id: "morning-brief",
        schedule: "0 9 * * *",
        prompt: "Give me today's brief",
        deliverTo: { channel: "telegram", target: "tg:123456" }
      },
      {
        id: "weekly-review",
        schedule: "0 10 * * 1",   // every Monday
        prompt: "Summarize last week's work",
        model: "provider/model-id"           // a model can be specified
      }
    ]
  }
}
```

### Heartbeat vs Cron

```
Cron:
├── Standard cron expressions
├── Creates a new isolated session each time
├── Suited to periodic tasks
└── Independent cron lane

Heartbeat:
├── Fixed-interval heartbeat
├── Can reuse the session
├── Suited to status checks and continuous monitoring
├── Smart defaults:
│   ├── OAuth profiles: heartbeat=1h
│   └── API key profiles: heartbeat=30m
└── Used to keep the prompt cache warm
```

## Skills System

### Load Locations (Highest to Lowest Priority)

```
1. Workspace Skills:  <workspace>/skills/
   └── Workspace level, highest priority (per-agent)

2. Project Agent Skills: <workspace>/.agents/skills/
   └── Project-level agent skills

3. Personal Agent Skills: ~/.agents/skills/
   └── Personal cross-project skills

4. Managed Skills:    ~/.openclaw/skills/
   └── User level, installed via ClawHub (shared across agents)

5. Bundled Skills:    <install>/skills/
   └── Ships with OpenClaw

6. Extra Skill Dirs:  skills.load.extraDirs
   └── Skill directories explicitly appended in the configuration
```

### Skill Definition

```markdown
--- (SKILL.md frontmatter)
name: "Morning Brief"
description: "Generate a morning briefing"
trigger:
  command: "/morning"        # slash-command trigger
  # or schedule: "0 9 * * *"  # scheduled trigger
config:
  model: "provider/model-id"
  thinking: "low"
---

# Morning Brief Skill

Generate a personalized morning briefing including:
1. Today's calendar events
2. Weather forecast
...
```

### Skills Injection in the System Prompt

Skills are injected into the system prompt as a compact list (name + description + path only); the model loads the full SKILL.md on demand using the `read` tool:

```xml
<available_skills>
  <skill>
    <name>Morning Brief</name>
    <description>Generate a morning briefing</description>
    <location>/path/to/skills/morning-brief/SKILL.md</location>
  </skill>
</available_skills>
```

## Webhook System

```json5
{
  webhooks: {
    endpoints: [
      {
        id: "github-push",
        path: "/hooks/github",         // HTTP POST path
        secret: "webhook-secret",       // signature verification
        prompt: "Handle the GitHub push event: {{payload}}",
        session: "hook:github",
        deliverTo: { channel: "discord", target: "channel:123" }
      }
    ]
  }
}

// Workflow:
// 1. An external service sends an HTTP POST to the Gateway at /hooks/github
// 2. Verify the signature (secret)
// 3. Create an agent session to handle the payload (injected into the prompt)
// 4. Send the result to the specified channel
```

## Tool Permission Control

### Per-Agent Tool Policy

```json5
{
  agents: {
    list: [
      {
        id: "main"
        // No restrictions — all tools available
      },
      {
        id: "family",
        tools: {
          allow: ["read", "exec", "sessions_list", "sessions_send"],
          deny: ["write", "edit", "apply_patch", "browser", "canvas", "cron"]
        }
      },
      {
        id: "restricted",
        tools: {
          allow: ["read"],     // can only read files
          deny: ["*"]          // everything else forbidden (* wildcard)
        },
        sandbox: {
          mode: "all",         // all operations run in a Docker sandbox
          scope: "agent"       // a separate container per agent
        }
      }
    ]
  }
}

// Rules:
// ├── tools.allow + tools.deny support the * wildcard
// ├── deny takes precedence (deny wins)
// ├── matching is case-insensitive
// └── an empty allow list = all tools allowed
```

### Globally Elevated Tools

```json5
{
  tools: {
    elevated: {
      // High-privilege tools that only specific senders may use
      senders: ["+8613800138000"],
      tools: ["system.run"]   // system command execution
    }
  }
}
// Note: tools.elevated is global and sender-based; it cannot be configured per-agent
```

## Exec Approvals

### Human-in-the-Loop Mechanism

```
The agent requests to execute a high-risk command (e.g., system.run)
    │
    ├── Check the tool policy (tools.allow / tools.deny)
    │
    ├── When approval is required:
    │   ├── The Gateway creates an approval request
    │   ├── Pushes it to all connected UI clients:
    │   │   ├── macOS App: pops up an approval dialog
    │   │   ├── CLI: terminal prompt
    │   │   ├── WebChat: approval UI
    │   │   └── iOS/Android: push notification
    │   ├── The user approves/denies:
    │   │   ├── Approve → execute the command
    │   │   ├── Deny → return the denial info to the agent
    │   │   └── Timeout → automatically deny
    │   └── Approval can be configured to be bypassed (Node configuration)
    │
    └── When auto-approved:
        └── Execute directly
```

### Configuration

```json5
{
  tools: {
    exec: {
      approval: {
        required: true,                    // approval required by default
        bypassForTrustedNodes: false,      // Node bypass
        timeout: 300                       // timeout in seconds
      }
    }
  }
}
```

## Loop Detection

```
Prevents the agent from getting stuck in infinite tool-call loops:

Detection strategies:
├── Count consecutive identical tool calls
├── Detect repeating output patterns
└── On reaching a threshold → terminate and alert the user

Built-in behavior; no extra configuration needed.
```

## Tool Result Processing

```
The processing pipeline that tool results pass through:

1. Size cleanup: built-in tools have already truncated their own output
2. Image payload cleanup: large images are compressed or referenced
3. tool_result_persist hook: synchronously transforms the result (before writing to the transcript)
4. Session Pruning: old tool results are pruned before the LLM call
   (does not modify the JSONL history on disk)
5. after_tool_call hook: optional processing after the tool executes

"NO_REPLY" handling:
├── Treated as a silent token, filtered out of the outbound payload
├── Duplicate message-tool sends are removed
└── No renderable payload + tool error → fall back to a tool-error reply
```
