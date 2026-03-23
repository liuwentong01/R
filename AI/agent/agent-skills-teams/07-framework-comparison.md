# 07 - 主流框架架构对比

> 站在 2026 年 Q1，对比分析 Agent 框架生态中最具代表性的六个框架/产品的架构设计哲学。

---

## 一、对比框架概览

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        2026 年主流 Agent 框架                             │
│                                                                          │
│  产品/框架          公司        定位          首发         语言            │
│  ──────────        ──────      ──────        ──────       ──────          │
│  Claude Code       Anthropic   开发者 CLI    2024.06      TS (打包)       │
│  OpenAI Agents SDK OpenAI      通用框架      2025.01      Python          │
│  LangGraph         LangChain   编排引擎      2024.01      Python/TS       │
│  CrewAI            CrewAI      角色协作      2024.01      Python          │
│  Cursor Agent      Cursor      IDE 集成      2024.03      TS              │
│  OpenAI Codex      OpenAI      云端 Agent    2026.01      Python (API)    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 二、架构哲学对比

### 2.1 Claude Code: 极简 Agentic Loop

```
设计哲学: "一个精炼的循环 + 一组精选的工具 + 层级化的提示"

┌──────────────────────────────────────────────────────────────────┐
│                    Claude Code 架构                                │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                System Prompt (层级构建)                   │    │
│  │  基础角色 + CLAUDE.md + Skills + 工具描述 + 上下文        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Agentic Loop (核心循环)                      │    │
│  │                                                         │    │
│  │  while (true) {                                         │    │
│  │    response = await claude.call(messages, tools);       │    │
│  │    if (noToolCalls(response)) break;                    │    │
│  │    results = await executeTools(response.toolCalls);    │    │
│  │    messages.push(response, results);                    │    │
│  │  }                                                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                     │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐     │
│  │ ~10 核心   │  │ Permission   │  │ SubAgent (Task)    │     │
│  │ 工具       │  │ System       │  │ 并行子任务          │     │
│  │            │  │ 多层权限模型  │  │                    │     │
│  └────────────┘  └──────────────┘  └────────────────────┘     │
│                                                                  │
│  关键特征:                                                       │
│  ✅ 极简核心 — 核心循环只有几十行逻辑                             │
│  ✅ 本地运行 — 直接操作文件系统和终端                              │
│  ✅ 权限安全 — 多层级权限模型 (只读自动允许、写入需确认)           │
│  ✅ 上下文工程 — CLAUDE.md + Skills 的层级化 prompt 构建           │
│  ✅ SubAgent — Task 工具实现 Orchestrator 模式                    │
│  ✅ 开源 — 2025.06 开源，社区可以学习和扩展                       │
│                                                                  │
│  架构取舍:                                                       │
│  - 不做复杂编排（没有 DAG/State Machine）                        │
│  - 不做多模型支持（只用 Claude）                                  │
│  - 不做 UI（纯 CLI + Headless）                                  │
│  → 极度聚焦于"CLI 开发工具"这一垂直场景                          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 OpenAI Agents SDK: 生产级 Multi-Agent

```
设计哲学: "生产级的 Multi-Agent 框架，内置 Guardrails + Tracing"

┌──────────────────────────────────────────────────────────────────┐
│                 OpenAI Agents SDK 架构                             │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Agent 定义                                   │    │
│  │  Agent(name, instructions, tools, handoffs, guardrails)  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Runner (执行引擎)                            │    │
│  │                                                         │    │
│  │  管理 Agent 的执行循环:                                   │    │
│  │  1. 调用当前 Agent 的 LLM                                │    │
│  │  2. 执行工具调用                                         │    │
│  │  3. 如果是 handoff → 切换到目标 Agent                    │    │
│  │  4. 如果完成 → 返回结果                                  │    │
│  │  5. 运行 Guardrails 验证                                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                     │
│  ┌─────────────┐ ┌───────────────┐ ┌─────────────────────┐    │
│  │ Handoffs    │ │ Guardrails    │ │ Tracing             │    │
│  │ Agent 间    │ │ 输入/输出     │ │ 完整执行链           │    │
│  │ 控制权转移  │ │ 验证和约束    │ │ 追踪记录             │    │
│  └─────────────┘ └───────────────┘ └─────────────────────┘    │
│                                                                  │
│  关键特征:                                                       │
│  ✅ Handoff — 优雅的 Agent 间控制权转移                          │
│  ✅ Guardrails — 内置输入/输出验证 (tripwire 和 filter)          │
│  ✅ Tracing — 内置完整的执行链追踪                               │
│  ✅ Context — 类型安全的 Agent 间上下文传递                       │
│  ✅ Streaming — 支持流式输出                                     │
│  ✅ 多模型 — 每个 Agent 可以用不同的 OpenAI 模型                  │
│                                                                  │
│  代码示例:                                                       │
│                                                                  │
│  from agents import Agent, Runner, InputGuardrail                │
│                                                                  │
│  # 定义 Guardrail                                                │
│  safety_check = InputGuardrail(                                  │
│      agent=Agent(                                                │
│          name="Safety",                                          │
│          instructions="检测恶意输入",                              │
│      ),                                                          │
│      tripwire_or_filter="tripwire"                               │
│  )                                                               │
│                                                                  │
│  # 定义 Agent                                                    │
│  agent = Agent(                                                  │
│      name="Helper",                                              │
│      instructions="帮助用户解决问题",                              │
│      tools=[search, calculate],                                  │
│      input_guardrails=[safety_check],                            │
│      handoffs=[specialist_agent]                                 │
│  )                                                               │
│                                                                  │
│  # 执行                                                          │
│  result = await Runner.run(agent, input="...")                   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 2.3 LangGraph: 图状态机引擎

```
设计哲学: "用图来表达 Agent 编排的所有可能性"

┌──────────────────────────────────────────────────────────────────┐
│                    LangGraph 架构                                  │
│                                                                  │
│  核心抽象:                                                       │
│  - State: 共享状态对象（黑板）                                    │
│  - Node: 执行单元（LLM / Tool / Code）                          │
│  - Edge: 连接（普通 / 条件）                                     │
│  - Graph: 节点和边组成的图                                       │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 StateGraph                                │    │
│  │                                                         │    │
│  │  class State(TypedDict):                                │    │
│  │      messages: Annotated[list, add_messages]            │    │
│  │      plan: str                                          │    │
│  │      code: str                                          │    │
│  │                                                         │    │
│  │  graph = StateGraph(State)                              │    │
│  │  graph.add_node("planner", planner_node)                │    │
│  │  graph.add_node("coder", coder_node)                    │    │
│  │  graph.add_node("reviewer", reviewer_node)              │    │
│  │                                                         │    │
│  │  graph.add_edge("planner", "coder")                     │    │
│  │  graph.add_conditional_edges("reviewer", route_fn, ...) │    │
│  │  graph.add_edge("coder", "reviewer")                    │    │
│  │                                                         │    │
│  │  app = graph.compile(checkpointer=MemorySaver())        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  关键特征:                                                       │
│  ✅ 图表达力 — DAG、循环、条件、并行全支持                       │
│  ✅ 状态管理 — 内置状态持久化和恢复                              │
│  ✅ 时间旅行 — 可以回到任意历史状态                              │
│  ✅ 人机交互 — interrupt_before/after 节点暂停                    │
│  ✅ SubGraph — 图的嵌套组合                                      │
│  ✅ 可视化 — 图可以直接渲染为流程图                              │
│                                                                  │
│  适合场景:                                                       │
│  - 复杂的多步骤 workflow（需要循环、条件）                        │
│  - 需要精确控制执行流程的场景                                    │
│  - 需要状态持久化和恢复的长任务                                  │
│                                                                  │
│  学习曲线:                                                       │
│  较陡 — 需要理解图编程模型、State 管理、Channel 概念             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 2.4 CrewAI: 角色扮演协作

```
设计哲学: "模拟真实团队——每个 Agent 扮演一个角色"

┌──────────────────────────────────────────────────────────────────┐
│                    CrewAI 架构                                     │
│                                                                  │
│  核心抽象:                                                       │
│  - Agent: 有角色(role)、目标(goal)、背景(backstory)的智能体      │
│  - Task: 具体的工作任务，分配给特定 Agent                        │
│  - Crew: Agent 团队，管理任务执行                                │
│  - Process: 执行策略 (sequential / hierarchical)                 │
│                                                                  │
│  from crewai import Agent, Task, Crew, Process                   │
│                                                                  │
│  # 定义 Agent (角色)                                              │
│  researcher = Agent(                                             │
│      role="技术研究员",                                           │
│      goal="深入研究技术方案并给出专业建议",                        │
│      backstory="你是资深技术研究员，擅长分析技术趋势...",           │
│      tools=[search_web, read_docs],                              │
│      llm="gpt-4o"                                                │
│  )                                                               │
│                                                                  │
│  developer = Agent(                                              │
│      role="高级开发者",                                           │
│      goal="编写高质量、可维护的代码",                              │
│      backstory="你是 10 年经验的全栈开发者...",                    │
│      tools=[write_code, run_tests],                              │
│      llm="claude-3.5-sonnet"                                     │
│  )                                                               │
│                                                                  │
│  # 定义 Task                                                     │
│  research_task = Task(                                           │
│      description="研究最佳的认证方案",                             │
│      expected_output="技术方案报告",                               │
│      agent=researcher                                            │
│  )                                                               │
│                                                                  │
│  dev_task = Task(                                                │
│      description="根据研究报告实现认证模块",                       │
│      expected_output="可运行的代码",                               │
│      agent=developer,                                            │
│      context=[research_task]  # 依赖研究结果                      │
│  )                                                               │
│                                                                  │
│  # 组建 Crew                                                     │
│  crew = Crew(                                                    │
│      agents=[researcher, developer],                             │
│      tasks=[research_task, dev_task],                             │
│      process=Process.sequential                                  │
│  )                                                               │
│                                                                  │
│  result = crew.kickoff()                                         │
│                                                                  │
│  关键特征:                                                       │
│  ✅ 直觉化 — 角色、任务、团队，贴近人类组织理解                   │
│  ✅ 低门槛 — API 设计简洁，快速上手                              │
│  ✅ 多 LLM — 不同 Agent 可以用不同的 LLM                        │
│  ✅ 内存 — Agent 有长短期记忆                                     │
│  ✅ 委托 — Agent 可以将子任务委托给其他 Agent                     │
│                                                                  │
│  局限:                                                           │
│  ❌ 编排能力有限 — 只有 sequential/hierarchical 两种模式           │
│  ❌ 状态管理弱 — 没有 LangGraph 那样精细的状态控制                │
│  ❌ 企业级功能弱 — Tracing、Guardrails 不如 Agents SDK            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 2.5 Cursor Agent: IDE 深度集成

```
设计哲学: "Agent 不应该是独立的工具，而是 IDE 的一部分"

┌──────────────────────────────────────────────────────────────────┐
│                    Cursor Agent 架构                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   IDE 上下文层                              │   │
│  │                                                          │   │
│  │  自动收集:                                                 │   │
│  │  - 当前打开的文件                                          │   │
│  │  - 光标位置和选中内容                                      │   │
│  │  - 最近编辑历史                                            │   │
│  │  - Linter 错误                                             │   │
│  │  - 终端输出                                                │   │
│  │  - Git 状态                                                │   │
│  │  - .cursor/rules/ 匹配的规则                               │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Agent Loop (ReAct)                            │   │
│  │  + 并行工具调用                                            │   │
│  │  + SubAgent (Task)                                        │   │
│  │  + 多模型支持 (Claude/GPT-4o/Gemini)                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌─────────────┐  ┌────────────────┐  ┌───────────────────┐    │
│  │ Diff 编辑   │  │ Multi-file     │  │ Background        │    │
│  │ 精准展示    │  │ 协同编辑       │  │ Agents            │    │
│  │ 变更        │  │               │  │ 持续运行子任务     │    │
│  └─────────────┘  └────────────────┘  └───────────────────┘    │
│                                                                  │
│  Cursor 的独特创新:                                               │
│  1. Apply 机制 — Agent 生成 diff → 用户审查 → 一键应用            │
│  2. 上下文推断 — 自动判断哪些文件和代码与当前任务相关              │
│  3. Rules 系统 — .cursor/rules/*.mdc 自动匹配注入                │
│  4. Background Agent — 独立 git 分支上异步执行长任务              │
│  5. MCP 集成 — 支持所有 MCP Server 作为工具源                     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 2.6 OpenAI Codex: 云端沙箱 Agent

```
设计哲学: "Agent 在云端安全沙箱中自主运行，完成后交付成果"

┌──────────────────────────────────────────────────────────────────┐
│                    Codex 架构                                      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Tasks API                                │   │
│  │  用户提交任务 → Codex 创建云端 Agent → 异步执行              │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Cloud Sandbox (云端沙箱)                      │   │
│  │                                                          │   │
│  │  ┌──────────────────────────────────────────────────┐    │   │
│  │  │  microVM (隔离环境)                                │    │   │
│  │  │  - 克隆用户的 Git 仓库                             │    │   │
│  │  │  - 安装依赖                                        │    │   │
│  │  │  - Agent 自主执行 (ReAct + 工具调用)               │    │   │
│  │  │  - 完成后创建 PR                                   │    │   │
│  │  └──────────────────────────────────────────────────┘    │   │
│  │                                                          │   │
│  │  安全策略:                                                │   │
│  │  - 仅允许访问指定的 Git 仓库                              │   │
│  │  - 网络访问受限 (通过 AGENTS.md 配置)                      │   │
│  │  - 只读外部 API (默认)                                    │   │
│  │  - 所有操作可审计                                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  关键特征:                                                       │
│  ✅ 异步执行 — 提交任务后不需要等待，完成后通知                   │
│  ✅ 安全沙箱 — microVM 级别的隔离                                │
│  ✅ Git 集成 — 自动创建分支和 PR                                 │
│  ✅ AGENTS.md — 项目级 Agent 配置（类似 CLAUDE.md）              │
│  ✅ 多任务并行 — 同时执行多个独立任务                             │
│                                                                  │
│  与 Claude Code 的关键差异:                                       │
│  - Claude Code: 本地运行、交互式、用户监督                       │
│  - Codex: 云端运行、异步、全自主                                 │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 三、多维度对比总览

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    框架多维度对比                                          │
│                                                                          │
│  维度              Claude   Agents   LangGraph  CrewAI  Cursor  Codex    │
│                    Code     SDK                                          │
│  ──────            ──────   ──────   ────────   ──────  ──────  ──────   │
│  运行位置          本地     服务端   服务端     服务端   本地    云端     │
│  交互方式          CLI      API      API        API     IDE     API     │
│  Agent 模式        ReAct    ReAct    图状态机   ReAct   ReAct   ReAct   │
│  Multi-Agent       SubAgent Handoff  SubGraph   Crew    SubAgent Tasks  │
│  编排能力          弱       中       强         中      弱      中      │
│  工具标准          内置     自定义   自定义     自定义  内置+MCP 内置    │
│  MCP 支持          ✅       ✅       ❌         ❌      ✅      ❌       │
│  Guardrails        权限模型  内置     自定义     基础    权限模型 沙箱    │
│  Tracing           日志     内置     内置       基础    基础    内置     │
│  LLM 绑定          Claude   OpenAI   多 LLM    多 LLM  多 LLM  OpenAI  │
│  开源              ✅       ✅       ✅         ✅      ❌      ❌       │
│  Skills 系统       SKILL.md Prompt   Node      Role    Rules   AGENTS  │
│  学习曲线          低       低       高         低      低      低      │
│  生产就绪度        高       高       高         中      高      高      │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 四、选型建议

```
┌──────────────────────────────────────────────────────────────────┐
│                    框架选型决策树                                  │
│                                                                  │
│  你要做什么？                                                     │
│  │                                                               │
│  ├── 个人/团队开发提效                                            │
│  │   ├── 偏好 CLI → Claude Code                                  │
│  │   ├── 偏好 IDE → Cursor Agent                                 │
│  │   └── 需要异步/批量 → Codex                                   │
│  │                                                               │
│  ├── 构建 Agent 应用/SaaS                                        │
│  │   ├── OpenAI 生态 → Agents SDK                                │
│  │   ├── 需要复杂编排 → LangGraph                                │
│  │   ├── 需要快速原型 → CrewAI                                   │
│  │   └── 多模型支持 → LangGraph / CrewAI                         │
│  │                                                               │
│  └── 研究/实验                                                    │
│      ├── 多 Agent 交互 → LangGraph (最灵活)                       │
│      └── 角色扮演实验 → CrewAI (最直觉)                           │
│                                                                  │
│                                                                  │
│  关键决策因素:                                                    │
│                                                                  │
│  1. 本地 vs 云端？                                                │
│     本地: Claude Code, Cursor (隐私、速度)                        │
│     云端: Codex (安全沙箱、异步执行)                               │
│                                                                  │
│  2. 需要多复杂的编排？                                            │
│     简单: Claude Code, Agents SDK                                │
│     复杂: LangGraph (DAG、循环、条件)                             │
│                                                                  │
│  3. LLM 绑定？                                                    │
│     只用 Claude: Claude Code                                     │
│     只用 OpenAI: Agents SDK, Codex                               │
│     多 LLM: LangGraph, CrewAI                                   │
│                                                                  │
│  4. 团队规模和场景？                                              │
│     个人开发者: Claude Code + Cursor                              │
│     小团队: Agents SDK + Codex                                   │
│     平台团队: LangGraph (构建自定义编排)                           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 五、架构趋势共识

尽管各框架设计理念不同，但在以下方面形成了共识：

```
1. ReAct 是基础
   所有框架的 Agent 执行核心都是 ReAct 变体
   差异在于 ReAct 之上的编排和组合方式

2. Tool Use 标准化
   OpenAI function calling 和 Anthropic tool use 成为事实标准
   MCP 正在统一工具的定义和分发

3. Multi-Agent > Single Agent (对复杂任务)
   从 2024 到 2026，所有主流框架都增加了 Multi-Agent 支持
   但"只在需要时使用"是共识

4. 安全不可选
   Guardrails (Agents SDK)、Permission Model (Claude Code)、
   Sandbox (Codex) — 每个框架都有自己的安全机制

5. Tracing 是必须的
   Multi-Agent 调试极难，可观测性工具是刚需

6. Skills/Instructions 层的重要性
   CLAUDE.md、.cursor/rules、AGENTS.md — 
   项目级 Agent 配置成为标配
```
