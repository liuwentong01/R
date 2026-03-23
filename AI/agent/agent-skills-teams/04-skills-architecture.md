# 04 - Skills 架构详解

> Tool 是原子操作，Skill 是封装了专业知识的可复用能力单元。理解 Skills 层是理解现代 Agent 架构的关键。

---

## 一、从 Tool 到 Skill: 为什么需要 Skills 层

### 1.1 Tool 的局限

```
场景: Agent 需要进行代码审查

仅有 Tools:
  Agent 需要在 system prompt 中写清楚:
  - 什么是好的代码审查？
  - 关注哪些方面？(性能、安全、可读性、错误处理...)
  - 不同语言的具体规范
  - 输出格式
  - ...
  
  问题:
  1. System prompt 越来越长 → Token 消耗增加
  2. 多种能力混在一个 prompt 中 → 互相干扰
  3. 能力不可复用 → 每个项目都要重新配置
  4. 无法动态加载 → 一次性载入所有能力
```

### 1.2 Skill 的本质

```
Skill = Instructions (指令) + Tools (工具) + Context (上下文)

等价于:
Skill ≈ 一个专精某领域的"迷你 Agent 配置"

┌──────────────────────────────────────────────────────────────┐
│                     Skill 组成                                │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Instructions (指令/提示)                                │  │
│  │ "你是一个代码审查专家。审查时关注以下方面:               │  │
│  │  1. 安全漏洞（SQL注入、XSS、路径遍历）                  │  │
│  │  2. 性能问题（N+1查询、内存泄漏、不必要的计算）          │  │
│  │  3. 代码规范（命名、结构、注释）                         │  │
│  │  输出格式: ..."                                         │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Tools (专用工具集)                                      │  │
│  │ - read_file: 读取待审查文件                             │  │
│  │ - search_pattern: 搜索特定反模式                        │  │
│  │ - check_dependencies: 检查依赖版本                      │  │
│  │ - run_linter: 运行静态分析                              │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Context (上下文/知识)                                   │  │
│  │ - 项目的编码规范文档                                     │  │
│  │ - 常见漏洞模式库                                        │  │
│  │ - 历史审查记录和反馈                                     │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 二、Skills 的三种实现范式

### 2.1 范式一: Prompt-as-Skill (提示即技能)

**代表: Claude Code Skills, Cursor Rules, CLAUDE.md**

这是最简单也最实用的 Skill 实现——用结构化的提示文本定义能力。

```
Claude Code 的 Skill 系统:

~/.claude/skills/
├── code-review/
│   └── SKILL.md          ← Skill 定义文件
├── data-analysis/
│   └── SKILL.md
└── api-design/
    └── SKILL.md

SKILL.md 的结构:
┌──────────────────────────────────────────────────────────────┐
│ # Code Review Skill                                          │
│                                                              │
│ ## 触发条件                                                   │
│ 当用户要求审查代码时使用此 Skill                               │
│                                                              │
│ ## 审查清单                                                   │
│ 1. 安全性                                                     │
│    - 检查输入验证                                              │
│    - 检查 SQL 注入风险                                         │
│    - 检查 XSS 风险                                            │
│    ...                                                        │
│                                                              │
│ ## 输出格式                                                   │
│ - 使用表格列出问题                                            │
│ - 按严重程度分级 (Critical/High/Medium/Low)                   │
│ - 每个问题附带修复建议                                        │
│                                                              │
│ ## 工具使用策略                                               │
│ - 先用 Glob 找到相关文件                                      │
│ - 用 Grep 搜索已知的反模式                                    │
│ - 用 Read 读取文件内容                                        │
│ - 用 Bash 运行 linter                                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘

优势:
✅ 极低门槛 — 写 Markdown 就能创建 Skill
✅ 版本控制友好 — 纯文本，可以用 Git 管理
✅ 可分享 — 团队共享 Skill 库
✅ 可理解 — 人类可以直接阅读和修改

劣势:
❌ 能力有限 — 只能提供指令，不能定义新工具
❌ 无逻辑 — 不能包含条件分支或循环
❌ 依赖 LLM 理解 — Skill 质量取决于 LLM 的理解能力
```

**Cursor Rules 的实现:**

```
.cursor/rules/
├── typescript.mdc      ← 文件类型匹配 (glob: **/*.ts)
├── testing.mdc         ← 手动引用
└── api-conventions.mdc ← 自动应用

每个 .mdc 文件:
  ---
  description: TypeScript 编码规范
  globs: ["**/*.ts", "**/*.tsx"]  ← 自动匹配规则
  ---
  
  - 使用严格模式 (strict: true)
  - 优先使用 interface 而不是 type (除非需要联合类型)
  - 错误处理必须使用自定义 Error 类
  - 异步函数统一使用 async/await，不使用 .then()
  ...

工作原理:
  用户编辑 .ts 文件 → 自动匹配 typescript.mdc → 注入到 system prompt
  → Agent 在生成代码时遵循这些规则
```

### 2.2 范式二: Plugin-as-Skill (插件即技能)

**代表: OpenClaw Plugins, ChatGPT GPTs, OpenAI Assistants**

在 Prompt-as-Skill 基础上增加了自定义工具和代码逻辑。

```
OpenClaw 的 Plugin Skill 系统:

extensions/
├── weather-skill/
│   ├── openclaw.plugin.json   ← 插件清单
│   ├── index.ts               ← 入口，注册钩子和工具
│   └── weather-api.ts         ← 具体实现
│
├── code-executor/
│   ├── openclaw.plugin.json
│   ├── index.ts
│   └── sandbox.ts
│
└── memory-lancedb/
    ├── openclaw.plugin.json
    ├── index.ts
    └── vector-store.ts

Plugin 结构:

  // openclaw.plugin.json
  {
    "name": "weather-skill",
    "version": "1.0.0",
    "description": "天气查询能力",
    "slots": ["weather-provider"],  // 排他性槽位
    "hooks": ["before_agent_run"]   // 使用的生命周期钩子
  }

  // index.ts
  export function register(api: PluginAPI) {
    // 注册工具
    api.registerTool({
      name: "get_weather",
      description: "查询城市天气",
      parameters: { city: { type: "string" } },
      execute: async ({ city }) => {
        const data = await fetchWeather(city);
        return formatWeatherReport(data);
      }
    });
    
    // 注册生命周期钩子
    api.on("before_agent_run", async (context) => {
      // 在 Agent 运行前注入天气相关的 system prompt
      context.systemPrompt += "\n你可以使用 get_weather 工具查询天气...";
    });
  }

OpenAI GPTs 的做法:
  ┌──────────────────────────────────────────────────────────┐
  │ GPT = Instructions + Knowledge + Actions                  │
  │                                                          │
  │ Instructions: 自然语言指令 (类似 Prompt-as-Skill)         │
  │ Knowledge:    上传的文档 (RAG 检索)                       │
  │ Actions:      OpenAPI 定义的外部 API 调用                 │
  │               (类似 ChatGPT Plugins 的现代化版本)          │
  │                                                          │
  │ GPT Store: 用户可以发布和共享 GPTs                        │
  │ → 本质上是一个 Skill 市场                                 │
  └──────────────────────────────────────────────────────────┘
```

### 2.3 范式三: Agent-as-Skill (Agent 即技能)

**代表: OpenAI Agents SDK, Claude Code SubAgents, LangGraph SubGraphs**

最强大的范式——Skill 本身就是一个完整的 Agent。

```
概念:
  不是给 Agent 一条指令（Skill），
  而是给 Agent 一个"同事"（Sub-Agent），
  这个"同事"自己也有推理和工具使用能力。

OpenAI Agents SDK 的实现:

  # 定义一个 "代码审查" Agent-Skill
  code_reviewer = Agent(
      name="CodeReviewer",
      instructions="""你是代码审查专家。
        审查提交的代码变更，关注安全、性能、可读性。
        使用提供的工具分析代码。
        输出结构化的审查报告。""",
      tools=[read_file, search_pattern, run_linter],
      model="gpt-4o"
  )
  
  # 定义一个 "测试编写" Agent-Skill
  test_writer = Agent(
      name="TestWriter",
      instructions="""你是测试编写专家。
        为给定的代码编写全面的单元测试和集成测试。
        遵循 AAA (Arrange-Act-Assert) 模式。""",
      tools=[read_file, write_file, run_tests],
      model="gpt-4o"
  )
  
  # 主 Agent 可以通过 Handoff 委托任务给这些 Agent-Skills
  main_agent = Agent(
      name="ProjectManager",
      instructions="你是项目经理，协调代码审查和测试编写工作。",
      handoffs=[code_reviewer, test_writer]
  )
  
  # 执行时:
  # main_agent 接收用户请求
  # → 分析需求后 handoff 给 code_reviewer
  # → code_reviewer 自主执行审查(可能多步)
  # → 结果返回 main_agent
  # → main_agent handoff 给 test_writer
  # → test_writer 自主编写测试
  # → 最终结果返回用户

Claude Code 的 SubAgent (Task 工具):

  // 主 Agent 调用 Task 工具启动子 Agent
  {
    name: "Task",
    input: {
      description: "审查 PR #123 的安全性",
      prompt: "审查以下文件的安全漏洞...",
      subagent_type: "generalPurpose"
    }
  }
  
  // 子 Agent 在独立的上下文中运行
  // 有自己的工具集和消息历史
  // 完成后将结果返回给主 Agent
```

---

## 三、Skill 的生命周期管理

### 3.1 发现 → 加载 → 注入 → 执行

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Skill 生命周期                                      │
│                                                                      │
│  1. Discovery (发现)                                                 │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 从哪里找到可用的 Skills？                                      │   │
│  │                                                              │   │
│  │ ┌───────────┐  ┌────────────┐  ┌──────────┐  ┌──────────┐  │   │
│  │ │ 本地文件   │  │ 项目目录    │  │ 远程仓库  │  │ 注册中心  │  │   │
│  │ │ ~/.claude/ │  │ .cursor/   │  │ GitHub   │  │ NPM/PyPI │  │   │
│  │ │ skills/    │  │ rules/     │  │ skills/  │  │ registry │  │   │
│  │ └───────────┘  └────────────┘  └──────────┘  └──────────┘  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  2. Selection (选择)                                                 │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 对当前任务，哪些 Skills 是相关的？                              │   │
│  │                                                              │   │
│  │ 策略 A: 静态匹配 — 基于文件类型/项目类型预加载                │   │
│  │         (如: 打开 .ts 文件 → 加载 TypeScript Skill)           │   │
│  │                                                              │   │
│  │ 策略 B: 动态匹配 — LLM 根据用户意图选择 Skill                │   │
│  │         (如: "审查代码" → LLM 选择 Code Review Skill)        │   │
│  │                                                              │   │
│  │ 策略 C: 全部加载 — 将所有 Skill 描述列在 system prompt 中     │   │
│  │         (简单但消耗 tokens)                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  3. Injection (注入)                                                 │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 将 Skill 内容注入到 Agent 的上下文中                           │   │
│  │                                                              │   │
│  │ System Prompt 注入:                                           │   │
│  │ [基础角色定义]                                                 │   │
│  │ [Skill 1 的 instructions]                                     │   │
│  │ [Skill 2 的 instructions]                                     │   │
│  │ [项目级 CLAUDE.md / Rules]                                    │   │
│  │ [工具定义 (包含 Skill 带来的新工具)]                            │   │
│  │                                                              │   │
│  │ 注意: Skill 注入的顺序和优先级很重要!                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  4. Execution (执行)                                                 │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Agent 按照 Skill 的指令执行任务                                │   │
│  │                                                              │   │
│  │ Prompt-as-Skill: LLM 遵循文本指令                             │   │
│  │ Plugin-as-Skill: LLM 调用 Skill 注册的工具                    │   │
│  │ Agent-as-Skill: 主 Agent 将任务 handoff 给 Skill Agent        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  5. Feedback (反馈)                                                  │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Skill 执行结果的评估和改进                                     │   │
│  │                                                              │   │
│  │ - 用户满意度反馈                                               │   │
│  │ - 执行成功率统计                                               │   │
│  │ - Skill 版本迭代                                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 四、Skill 组合策略

### 4.1 串行组合 (Sequential Composition)

```
任务: "写一个新的 API 端点并确保质量"

Skill A: API Design Skill
  → 设计 API 接口规范
  → 输出: API 设计文档

Skill B: Code Generation Skill  
  → 基于设计文档生成代码
  → 输出: 实现代码

Skill C: Testing Skill
  → 为生成的代码编写测试
  → 输出: 测试代码

Skill D: Code Review Skill
  → 审查生成的代码和测试
  → 输出: 审查报告

执行顺序: A → B → C → D (每个 Skill 的输出是下一个的输入)
```

### 4.2 并行组合 (Parallel Composition)

```
任务: "全面分析这个 Pull Request"

并行执行:
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Security     │  │ Performance  │  │ Code Style   │     │
│  │ Review Skill │  │ Review Skill │  │ Review Skill │     │
│  │              │  │              │  │              │     │
│  │ 审查安全漏洞  │  │ 审查性能问题  │  │ 审查代码风格  │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                 │               │
│         ▼                 ▼                 ▼               │
│  ┌──────────────────────────────────────────────────┐      │
│  │              Aggregation (聚合)                    │      │
│  │    合并三份审查报告为一份综合报告                   │      │
│  └──────────────────────────────────────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘

优势: 总耗时 = max(各 Skill 耗时)，而非总和
```

### 4.3 条件组合 (Conditional Composition)

```
任务: "处理用户反馈"

┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ┌──────────────────┐                                   │
│  │ Classify Skill   │ ← 先分类                          │
│  │ 判断反馈类型      │                                   │
│  └──────┬───────────┘                                   │
│         │                                                │
│         ├── Bug Report → ┌─────────────────┐            │
│         │                │ Bug Triage Skill │            │
│         │                └─────────────────┘            │
│         │                                                │
│         ├── Feature Request → ┌─────────────────────┐   │
│         │                     │ Feature Design Skill │   │
│         │                     └─────────────────────┘   │
│         │                                                │
│         └── Question → ┌──────────────────┐             │
│                        │ FAQ Search Skill  │             │
│                        └──────────────────┘             │
│                                                          │
└──────────────────────────────────────────────────────────┘

根据第一个 Skill 的输出，动态选择后续的 Skill
```

---

## 五、各框架的 Skills 实现对比

```
┌──────────────────────────────────────────────────────────────────────────┐
│                  Skills 实现对比                                          │
│                                                                          │
│  框架             Skill 概念名      实现范式         动态加载  组合支持    │
│  ─────            ──────────        ──────────       ──────   ────────    │
│  Claude Code      Skills + Rules    Prompt-as-Skill  ✅       串行        │
│                   CLAUDE.md         (Markdown)                            │
│                                                                          │
│  Cursor           Rules (.mdc)     Prompt-as-Skill  ✅       静态匹配    │
│                                    (文件类型匹配)    (glob)              │
│                                                                          │
│  OpenAI GPTs      Instructions +   Plugin-as-Skill  ❌       单一 Skill  │
│                   Knowledge +      (配置式)          (固定)              │
│                   Actions                                                │
│                                                                          │
│  OpenAI Agents    Agent (子Agent)  Agent-as-Skill   ✅       Handoff     │
│  SDK                               (Agent 委托)              支持编排    │
│                                                                          │
│  LangGraph        SubGraph         Agent-as-Skill   ✅       图编排      │
│                   Node             (图节点)                   DAG/循环   │
│                                                                          │
│  CrewAI           Agent + Task     Agent-as-Skill   ✅       串行/并行   │
│                                    (角色扮演)                 Crew 编排  │
│                                                                          │
│  OpenClaw         Plugin + Skill   Plugin-as-Skill  ✅       钩子系统    │
│                   Workspace files  + Prompt-as-Skill          25个钩子   │
│                                                                          │
│  Codex (OpenAI)   Tasks            Agent-as-Skill   ✅       云端编排    │
│                                    (沙箱 Agent)               Tasks API  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 六、Skill 设计最佳实践

### 6.1 单一职责原则

```
❌ 差: "全能开发 Skill"
   Instructions: "你可以编写代码、做代码审查、写测试、
                  写文档、管理项目、部署应用..."
   → 什么都懂一点，什么都不精

✅ 好: 每个 Skill 聚焦一个领域
   - code-review-skill: 只做代码审查
   - test-writing-skill: 只写测试
   - api-design-skill: 只做 API 设计
   → 每个 Skill 都是该领域的"专家"
```

### 6.2 明确的输入/输出契约

```
❌ 差: 
   "审查代码并给出建议"
   → 输出格式不确定，下游 Skill 无法消费

✅ 好:
   输入: { files: string[], focus: "security" | "performance" | "all" }
   输出: { 
     issues: Array<{
       severity: "critical" | "high" | "medium" | "low",
       file: string,
       line: number,
       description: string,
       suggestion: string
     }>,
     summary: string
   }
   → 结构化、可预测、可组合
```

### 6.3 渐进式增强

```
从简单开始，按需增加复杂度:

Level 1: 纯文本 Skill (SKILL.md)
  "审查代码时关注安全漏洞..."
  → 10 分钟创建，立即可用

Level 2: 带示例的 Skill
  "审查代码时关注安全漏洞。示例:
   输入: function login(user, pass) { db.query(`SELECT * FROM users WHERE name='${user}'`) }
   输出: [Critical] SQL 注入风险，建议使用参数化查询"
  → Few-shot learning 提高准确率

Level 3: 带工具的 Skill (Plugin)
  Skill + 自定义 run_semgrep 工具
  → 结合静态分析工具的结果

Level 4: Agent Skill
  独立的 Security Audit Agent
  自主运行多步审查流程
  → 最强大但也最复杂
```

---

## 七、Skill 与上下文窗口的博弈

```
核心矛盾:
  Skill 越多 → 注入的指令越多 → 消耗的 Context 越多
  Context 有限 → 能同时加载的 Skill 数量有限

┌──────────────────────────────────────────────────────────────────┐
│                    Context 分配示意                                │
│                                                                  │
│  200K Token 窗口:                                                │
│                                                                  │
│  ┌─────────────┐ 10K   基础 System Prompt                       │
│  ├─────────────┤ 15K   工具定义 (10-15 个工具的 JSON Schema)     │
│  ├─────────────┤ 10K   CLAUDE.md / 项目指令                     │
│  ├─────────────┤ 20K   ← Skills 的空间 (可加载 3-5 个 Skill)    │
│  ├─────────────┤ 145K  ← 对话历史 + 工具结果的空间               │
│  └─────────────┘                                                │
│                                                                  │
│  如果每个 Skill 需要 5K tokens:                                   │
│    20K / 5K = 4 个同时加载的 Skill                               │
│                                                                  │
│  如果有 20 个可用的 Skill → 需要动态选择                          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

解决方案:

1. 按需加载 (On-demand Loading)
   只在需要时加载相关 Skill
   Claude Code: 用户说"审查代码" → 动态读取 code-review SKILL.md
   Cursor: 编辑 .ts 文件 → 自动匹配 typescript.mdc

2. 分层加载 (Layered Loading)
   Level 1: 总是加载 (核心 Skill，如项目约定)
   Level 2: 匹配加载 (基于文件类型/任务类型)
   Level 3: 请求加载 (用户显式要求)

3. Skill 摘要 (Skill Summary)
   不加载完整 Skill，只加载摘要描述
   LLM 需要详细信息时再请求加载完整 Skill
   
   "可用 Skills:
    - code-review: 代码审查 (输入: 文件路径，输出: 审查报告)
    - test-writing: 测试编写 (输入: 源代码，输出: 测试代码)
    ...
    需要使用某个 Skill 时，调用 load_skill(name) 获取详细指令"

4. Agent-as-Skill 天然绕过限制
   每个 Skill Agent 有自己独立的上下文窗口
   → 主 Agent 上下文不膨胀
   → 代价是额外的 LLM 调用成本
```

---

## 总结

```
Skills 层的演进:

  Tool (原子操作)
       │
       ▼
  Prompt-as-Skill (文本指令)     ← 最简单，最广泛
       │
       ▼
  Plugin-as-Skill (代码+指令)    ← 更强大，需要开发
       │
       ▼  
  Agent-as-Skill (智能体即技能)  ← 最强大，成本最高

核心价值:
  1. 能力模块化 — 将领域知识封装为独立模块
  2. 可复用     — 跨项目、跨团队共享 Skill
  3. 可组合     — 多个 Skill 串行/并行/条件组合
  4. 渐进增强   — 从简单文本到完整 Agent 逐步升级

这一层为后续的 Multi-Agent Teams 架构奠定了基础:
  如果把 Skill 看作 Agent 的"能力"，
  那么 Multi-Agent 就是多个有不同 Skill 的 Agent 的"协作"。
```
