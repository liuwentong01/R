# 03 - 工具使用机制的演进

> 工具是 Agent 从"只会说"到"能做事"的关键跃迁。本文追踪 Tool Use 从 ChatGPT Plugins 到 MCP 协议的完整演进。

---

## 一、工具使用的四代演进

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        Tool Use 四代演进                                    │
│                                                                            │
│  Generation 1         Generation 2         Generation 3       Generation 4 │
│  ─────────────        ─────────────        ─────────────      ───────────  │
│  Prompt Hack          Function Calling      Assistants+MCP     Universal   │
│  (2023.02)            (2023.06)            (2024)              Protocol    │
│                                                                (2025-)     │
│  在提示词中           LLM 原生输出          有状态工具 +         标准化      │
│  描述工具格式         结构化调用参数         标准化协议           Agent 互联  │
│  正则解析输出         API 层保证格式                                        │
│                                                                            │
│  可靠性: 60%          可靠性: 95%           可靠性: 99%         可靠性: 99% │
│  工具数: 3-5          工具数: 10-30         工具数: 50-100+     工具数: ∞   │
│  生态: 无             生态: 碎片化          生态: 平台化         生态: 开放  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、Generation 1: Prompt Hacking (2023.02)

### 2.1 ChatGPT Plugins 的做法

ChatGPT Plugins 是历史上第一次将 "LLM + 外部工具" 推向大众。

```
工作原理:
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  1. 开发者编写 OpenAPI 规范 (openapi.json)                       │
│     描述 API 的 endpoints、参数、返回值                           │
│                                                                  │
│  2. ChatGPT 将 OpenAPI 规范转化为 system prompt 的一部分          │
│     "你可以使用以下工具:                                          │
│      - search_web(query: string): 搜索网页                       │
│      - get_weather(city: string): 获取天气                       │
│      当你需要使用工具时，输出格式为:                               │
│      ```json                                                     │
│      {"tool": "search_web", "params": {"query": "..."}}          │
│      ```"                                                        │
│                                                                  │
│  3. LLM 在回复中输出工具调用格式                                  │
│     (但格式不一定正确——LLM 只是在"模仿"格式)                     │
│                                                                  │
│  4. 后端代码用正则/JSON 解析提取工具调用                          │
│     (经常解析失败，需要大量容错逻辑)                               │
│                                                                  │
│  5. 执行 API 调用，将结果喂回 LLM                                 │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 问题与局限

```
1. 格式不可靠
   LLM 可能输出:
   ✅ {"tool": "search", "params": {"query": "天气"}}     // 正确
   ❌ 我来搜索一下: search("天气")                         // 自然语言混入
   ❌ {"tool": "search", "params": {"query": 天气}}       // JSON 格式错误
   ❌ ```json\n{"tool": "search"...}\n```                  // 多余的 markdown

2. 多工具调用困难
   一个回复中调用多个工具？LLM 很难一次性输出多个格式正确的 JSON

3. 参数类型无保证
   你说 age 是 number，LLM 可能输出 "age": "25" (字符串)

4. 安全性差
   Prompt injection: 恶意网页内容可能注入工具调用指令
```

### 2.3 开源社区的 Prompt Hacking 方案

在 Function Calling 出现之前，开源社区发明了各种 prompt 技巧：

```python
# LangChain 早期的做法 (2023 初)
AGENT_PROMPT = """
You have access to the following tools:
{tools}

Use the following format:
Thought: I need to think about what to do
Action: the tool name
Action Input: the input to the tool
Observation: the result of the action
... (this Thought/Action/Action Input/Observation can repeat N times)
Thought: I now know the final answer
Final Answer: the final answer

Question: {input}
"""

# 然后用正则解析:
action_match = re.search(r"Action: (.+)", response)
input_match = re.search(r"Action Input: (.+)", response)
```

---

## 三、Generation 2: Native Function Calling (2023.06)

### 3.1 技术突破

OpenAI 在 2023 年 6 月发布了原生 Function Calling，这是一个**里程碑式**的突破。

```
核心变化: 工具调用从 "提示词黑魔法" 变成了 "API 原生支持"

Before (Prompt Hacking):
  提示词 → LLM → 自由文本输出 → 正则解析 → 可能解析失败 → 重试

After (Function Calling):
  工具定义(JSON Schema) → LLM → 结构化输出(保证格式) → 直接使用
```

### 3.2 API 协议对比

**OpenAI Function Calling (2023.06):**

```javascript
// 请求: 定义可用工具
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "北京今天天气怎么样？" }],
  tools: [{
    type: "function",
    function: {
      name: "get_weather",
      description: "获取指定城市的天气信息",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "城市名称" },
          unit: { type: "string", enum: ["celsius", "fahrenheit"] }
        },
        required: ["city"]
      }
    }
  }]
});

// 响应: LLM 返回结构化工具调用
// response.choices[0].message.tool_calls:
[{
  id: "call_abc123",
  type: "function",
  function: {
    name: "get_weather",
    arguments: '{"city": "北京", "unit": "celsius"}'
  }
}]

// 参数是 JSON 字符串，但格式由 API 层保证
// 开发者只需要 JSON.parse(arguments) 即可
```

**Anthropic Tool Use (2023.11, 2024 正式):**

```javascript
// 请求: 定义工具 (注意与 OpenAI 的细微差异)
const response = await anthropic.messages.create({
  model: "claude-3-sonnet",
  messages: [{ role: "user", content: "北京今天天气怎么样？" }],
  tools: [{
    name: "get_weather",
    description: "获取指定城市的天气信息",
    input_schema: {  // Anthropic 用 input_schema 而非 parameters
      type: "object",
      properties: {
        city: { type: "string", description: "城市名称" },
        unit: { type: "string", enum: ["celsius", "fahrenheit"] }
      },
      required: ["city"]
    }
  }]
});

// 响应: 工具调用作为 content block 返回
// response.content:
[
  { type: "text", text: "让我查看一下北京的天气。" },
  {
    type: "tool_use",
    id: "toolu_abc123",
    name: "get_weather",
    input: { city: "北京", unit: "celsius" }  // 直接是对象，不是字符串!
  }
]

// 将结果返回给 LLM:
messages.push({
  role: "user",  // Anthropic 中 tool_result 以 user 角色发送
  content: [{
    type: "tool_result",
    tool_use_id: "toolu_abc123",
    content: '{"temp": 22, "condition": "晴"}'
  }]
});
```

### 3.3 两家协议的关键差异

```
┌──────────────────────────────────────────────────────────────────────────┐
│                  OpenAI vs Anthropic 工具调用协议对比                      │
│                                                                          │
│  维度              OpenAI                    Anthropic                    │
│  ───────           ──────                    ─────────                    │
│  工具定义字段       parameters                input_schema                 │
│  返回格式          tool_calls (顶层字段)      content blocks (tool_use)    │
│  参数格式          JSON 字符串               JSON 对象 (已解析)            │
│  结果返回角色       tool                      user (with tool_result)      │
│  并行调用          支持                       支持                         │
│  思考+调用混合      分离                       混合 (text + tool_use)       │
│  调用 ID           call_{id}                 toolu_{id}                   │
│  停止原因          "tool_calls"              "tool_use" (stop_reason)      │
│                                                                          │
│  核心理念差异:                                                            │
│  - OpenAI: tool_calls 是一个独立的消息结构                                │
│  - Anthropic: tool_use 是消息内容块的一部分，可以和文本混合                 │
│    → Anthropic 的方式更自然（Agent 可以边说边调用工具）                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Parallel Tool Calls

2024 年，OpenAI 和 Anthropic 都支持了并行工具调用：

```
串行调用 (早期):
  Turn 1: LLM → 调用 Tool A → 等待结果
  Turn 2: LLM → 调用 Tool B → 等待结果
  Turn 3: LLM → 调用 Tool C → 等待结果
  总耗时: 3 轮 LLM 调用 + 3 次工具执行 (串行)

并行调用 (2024+):
  Turn 1: LLM → 同时调用 Tool A, B, C → 并行等待所有结果
  Turn 2: LLM → 看到所有结果 → 给出回答
  总耗时: 2 轮 LLM 调用 + 1 次工具执行 (并行)
  → 速度提升 2-3x，成本降低 50%+

示例 (Anthropic):
  response.content = [
    { type: "text", text: "我来同时获取三个城市的天气..." },
    { type: "tool_use", id: "t1", name: "get_weather", input: {city: "北京"} },
    { type: "tool_use", id: "t2", name: "get_weather", input: {city: "上海"} },
    { type: "tool_use", id: "t3", name: "get_weather", input: {city: "广州"} }
  ]
```

---

## 四、Generation 3: 有状态工具与 MCP 协议 (2024)

### 4.1 从无状态到有状态

早期的工具是无状态的——每次调用都是独立的。但很多场景需要有状态的工具。

```
无状态工具:
  search_web("AI news") → 结果  (调用间没有关联)
  search_web("更多")    → 不知道"更多"指什么

有状态工具:
  browser_navigate("https://example.com")  → 打开页面
  browser_click("#login-button")            → 点击登录按钮 (知道当前在哪个页面)
  browser_type("#email", "user@ex.com")     → 输入邮箱 (浏览器状态持续存在)

有状态工具的代表:
  OpenAI Code Interpreter — 持续运行的 Python 沙箱，变量和文件跨调用保持
  Claude Computer Use — 持续运行的桌面环境，屏幕状态跨调用保持
  Claude Code Bash — 持续运行的 Shell 会话，目录和环境变量跨调用保持
```

### 4.2 MCP 协议: 工具生态的标准化

**问题背景：**

```
2024 年之前的工具生态:

  ┌─────────┐    自定义协议    ┌─────────┐
  │ Claude  │──────────────▶│ Tool A  │
  └─────────┘                └─────────┘
  
  ┌─────────┐    另一个协议    ┌─────────┐
  │ GPT-4   │──────────────▶│ Tool B  │
  └─────────┘                └─────────┘
  
  ┌─────────┐    又一个协议    ┌─────────┐
  │ Gemini  │──────────────▶│ Tool C  │
  └─────────┘                └─────────┘

问题:
- 每个 LLM 平台的工具格式不同
- 工具开发者需要为每个平台适配
- 工具不能跨平台复用
- 缺乏资源访问的标准方式
```

**MCP (Model Context Protocol) 的解决方案：**

```
┌──────────────────────────────────────────────────────────────────────┐
│                    MCP 协议架构                                       │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                      MCP Host (客户端)                        │   │
│  │                   Claude Code / Cursor / IDE                  │   │
│  │                                                              │   │
│  │  ┌──────────────────────────────────────────────────────┐    │   │
│  │  │                  MCP Client                           │    │   │
│  │  │      (每个 MCP Server 对应一个 Client 实例)            │    │   │
│  │  └──────┬───────────────────┬──────────────────┬────────┘    │   │
│  └─────────┼───────────────────┼──────────────────┼─────────────┘   │
│            │ stdio/SSE          │ stdio/SSE        │ stdio/SSE      │
│            ▼                   ▼                  ▼                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐            │
│  │ MCP Server A │   │ MCP Server B │   │ MCP Server C │            │
│  │ (GitHub)     │   │ (Database)   │   │ (Confluence) │            │
│  │              │   │              │   │              │            │
│  │ 提供:        │   │ 提供:        │   │ 提供:        │            │
│  │ - Tools      │   │ - Tools      │   │ - Tools      │            │
│  │ - Resources  │   │ - Resources  │   │ - Resources  │            │
│  │ - Prompts    │   │ - Prompts    │   │ - Prompts    │            │
│  └──────────────┘   └──────────────┘   └──────────────┘            │
│                                                                      │
│  MCP 协议定义了三种核心能力:                                          │
│                                                                      │
│  1. Tools (工具)    — Agent 可以执行的操作                            │
│     如: create_issue, run_query, send_message                        │
│                                                                      │
│  2. Resources (资源) — Agent 可以读取的数据                           │
│     如: file://project/README.md, db://users/schema                  │
│                                                                      │
│  3. Prompts (提示)  — 预定义的提示模板                                │
│     如: code_review_template, bug_report_template                    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**MCP 的技术细节：**

```
传输层:
  - stdio: 子进程方式运行，通过 stdin/stdout 通信（本地）
  - SSE (Server-Sent Events): HTTP 方式，支持远程连接
  - Streamable HTTP: 2025 新增，替代 SSE 的更灵活方案

消息格式: JSON-RPC 2.0
  请求:  {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
  响应:  {"jsonrpc": "2.0", "id": 1, "result": {"tools": [...]}}

生命周期:
  1. initialize (握手，交换能力信息)
  2. notifications/initialized (确认初始化完成)
  3. tools/list, resources/list (发现可用能力)
  4. tools/call (调用工具)
  5. resources/read (读取资源)
  6. ... (持续交互)

MCP Server 示例 (TypeScript):

  import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
  
  const server = new McpServer({ name: "my-server", version: "1.0.0" });
  
  // 注册工具
  server.tool(
    "search_database",
    { query: z.string(), limit: z.number().optional() },
    async ({ query, limit = 10 }) => {
      const results = await db.search(query, limit);
      return { content: [{ type: "text", text: JSON.stringify(results) }] };
    }
  );
  
  // 注册资源
  server.resource(
    "db://schema",
    "数据库表结构",
    async () => ({
      contents: [{ uri: "db://schema", text: schemaText, mimeType: "text/plain" }]
    })
  );
```

### 4.3 MCP 的生态影响

```
MCP 发布 4 个月后 (2025.03):
  - 4000+ 开源 MCP Server（GitHub、Slack、Jira、Database、浏览器...）
  - 所有主流 IDE 支持（Cursor、Windsurf、VS Code、JetBrains）
  - Claude Code 原生集成
  - OpenAI 也在 Responses API 中支持了 MCP

MCP 解决了什么:
  Before: 每个 Agent 平台各自实现工具集成 → 生态碎片化
  After:  统一协议 → 写一次 MCP Server，所有 Agent 平台都能用

MCP 没解决什么:
  - 认证和安全 (每个 Server 自行处理)
  - 发现和注册 (没有统一的"MCP 商店")
  - 版本管理 (Server 升级可能破坏兼容性)
  - 远程调用的可靠性 (超时、重试等需要 Host 处理)
```

---

## 五、Generation 4: Agent 互联与 A2A (2025-)

### 5.1 从 Tool Use 到 Agent Use

```
思维跃迁:

  Gen 1-3: LLM 使用 Tools (工具)
           "我需要搜索一下" → search_tool("query")
           Tool 是被动的、原子的

  Gen 4:   Agent 使用 Agents (代理)
           "让安全审计 Agent 检查这段代码" → security_agent.run(code)
           Agent 是主动的、智能的

本质变化:
  Tool: 给定输入，确定性地产生输出 (函数)
  Agent: 给定任务，自主规划和执行 (智能体)
  
  Tool call:  f(x) → y  (确定性)
  Agent call: agent.run(task) → 自主执行 N 步 → 最终结果 (非确定性)
```

### 5.2 A2A (Agent-to-Agent) 协议

Google 在 2025 年牵头提出了 A2A 协议，试图标准化 Agent 之间的通信：

```
┌──────────────────────────────────────────────────────────────────────┐
│                    A2A vs MCP 的定位差异                               │
│                                                                      │
│  MCP: Agent 与 Tool 之间的协议                                       │
│       Agent ──→ Tool (原子操作)                                      │
│       同步、简单、确定性                                              │
│                                                                      │
│  A2A: Agent 与 Agent 之间的协议                                      │
│       Agent ←──→ Agent (协作任务)                                    │
│       异步、复杂、非确定性                                            │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    你的 Agent                                 │   │
│  │                                                              │   │
│  │            MCP ↓              A2A ↓                          │   │
│  │     ┌──────────────┐   ┌──────────────┐                     │   │
│  │     │   MCP Tools  │   │  Other Agents │                     │   │
│  │     │  (确定性操作)  │   │  (自主执行)   │                     │   │
│  │     │ search, read  │   │ code_reviewer │                     │   │
│  │     │ write, query  │   │ test_writer   │                     │   │
│  │     └──────────────┘   └──────────────┘                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  A2A 协议核心概念:                                                    │
│                                                                      │
│  1. Agent Card — 描述 Agent 能力的元数据                              │
│     {                                                                │
│       "name": "CodeReviewer",                                        │
│       "description": "审查代码质量、安全性和最佳实践",                  │
│       "skills": ["code_review", "security_audit"],                   │
│       "input_modes": ["text", "file"],                               │
│       "output_modes": ["text", "structured"]                         │
│     }                                                                │
│                                                                      │
│  2. Task — Agent 间的工作单元                                         │
│     状态机: submitted → working → completed/failed                   │
│     支持流式更新 (SSE)                                                │
│                                                                      │
│  3. Message — Agent 间的通信消息                                      │
│     支持多种内容类型 (文本、文件、结构化数据)                           │
│                                                                      │
│  4. Artifact — 任务产出的附件                                         │
│     代码文件、报告、测试结果等                                        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 六、工具设计最佳实践

经过三年的实践，工具设计形成了一些共识：

### 6.1 工具粒度

```
太粗 (God Tool):
  ❌ manage_project(action, params) 
     — 一个工具做所有事，LLM 容易混淆参数

太细 (Micro Tool):
  ❌ open_file(path)
  ❌ read_line(file_handle, line_number)  
  ❌ close_file(file_handle)
     — 三步才能读一行，效率极低

恰好 (Right Granularity):
  ✅ read_file(path, start_line?, end_line?)
     — 一个工具完成一个有意义的操作
```

### 6.2 工具描述质量

```
差的描述:
  name: "search"
  description: "搜索东西"
  → LLM 不知道搜什么、在哪搜、返回什么格式

好的描述:
  name: "search_codebase"
  description: "在当前项目的代码库中搜索匹配正则表达式的内容。
                返回匹配的文件路径、行号和上下文。
                适用于查找函数定义、变量引用、特定模式等。
                对于文件名搜索请使用 glob_files 工具。"
  → 清楚地告诉 LLM: 用途、输入、输出、何时使用、何时不使用
```

### 6.3 Claude Code 的工具设计哲学

```
Claude Code 的核心工具集只有 ~10 个，但设计精妙:

┌─────────────────────────────────────────────────────────────────────┐
│ 工具        粒度      为什么这样设计                                  │
│ ─────       ─────     ────────────────                               │
│ Read        文件级    一次读取整个文件/指定范围，避免反复打开关闭       │
│ Write       文件级    创建/覆写整个文件（大变更用这个）                │
│ Edit        diff级    精确修改文件的某部分（小变更用这个）             │
│ Bash        命令级    执行 shell 命令，适合测试/构建/git 操作         │
│ Grep        搜索级    按内容搜索，适合找函数/变量引用                  │
│ Glob        搜索级    按文件名搜索，适合找特定类型文件                  │
│ WebFetch    URL级     获取网页内容，适合查文档                        │
│ Task        Agent级   启动子 Agent，适合并行处理独立任务               │
│                                                                     │
│ 设计原则:                                                            │
│ 1. 最小但完备 — 少量工具覆盖所有开发场景                             │
│ 2. 正交性 — 每个工具做一件事，不重叠                                 │
│ 3. 描述丰富 — 包含使用场景、限制、与其他工具的关系                    │
│ 4. 结果可预测 — 相同输入总是产生类似格式的输出                       │
│ 5. 错误友好 — 错误信息包含足够信息让 LLM 自行修正                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 七、工具与能力的层次模型

```
总结: 工具使用的演进，本质上是从"原子操作"到"智能协作"的扩展

Level 1: Atomic Tools (原子工具)
  read_file, write_file, run_command
  → 单一操作，无状态，即用即弃

Level 2: Stateful Tools (有状态工具)
  browser (持久页面状态), code_interpreter (持久运行环境)
  → 工具有"记忆"，可以跨调用保持状态

Level 3: Smart Tools / Skills (智能工具/技能)
  code_review_skill, data_analysis_skill
  → 工具内部可能包含自己的 LLM 调用和决策逻辑

Level 4: Agent Tools (Agent 工具)
  sub_agent("审查这段代码")
  → 工具本身就是一个完整的 Agent，具备自主规划能力

Level 5: Cross-Organization Agent (跨组织 Agent)
  A2A 调用另一个组织的 Agent
  → Agent 互联，形成 Agent 网络

当前 (2026): 大部分产品在 Level 2-3，先进产品探索 Level 4
```
