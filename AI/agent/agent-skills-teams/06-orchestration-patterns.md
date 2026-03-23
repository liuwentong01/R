# 06 - 编排模式深度分析

> 编排 (Orchestration) 是多 Agent 系统的"胶水层"——决定了谁来做什么、按什么顺序做、如何处理异常。本文分析 6 种核心编排模式。

---

## 一、编排模式全景

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      6 种编排模式                                         │
│                                                                          │
│  简单度     模式名          核心思想            适用场景                    │
│  ─────      ──────          ─────────           ──────────                 │
│  ★☆☆☆☆     Prompt Chain    固定顺序的 LLM 调用  简单流水线                 │
│  ★★☆☆☆     Router          条件分发              意图分类+处理             │
│  ★★★☆☆     Pipeline        动态多阶段流水线      数据处理链               │
│  ★★★★☆     DAG Graph       有向无环图            任务依赖编排             │
│  ★★★★☆     State Machine   图+状态+循环          复杂交互流程             │
│  ★★★★★     Swarm           自治 Agent 群体       开放性协作               │
│                                                                          │
│  确定性 ←──────────────────────────────────────────────────→ 灵活性       │
│  Prompt Chain                                              Swarm         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 二、模式 1: Prompt Chain (提示链)

```
最简单的编排: 将一个复杂任务分解为固定顺序的 LLM 调用。

┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Step 1   │───▶│ Step 2   │───▶│ Step 3   │───▶│ Step 4   │
│ 分析需求  │    │ 生成代码  │    │ 审查代码  │    │ 写测试   │
│          │    │          │    │          │    │          │
│ LLM Call │    │ LLM Call │    │ LLM Call │    │ LLM Call │
│ #1       │    │ #2       │    │ #3       │    │ #4       │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
     输出 ────────▶ 输入    输出 ────────▶ 输入

每一步:
- 可以是不同的 LLM 调用 (不同 system prompt)
- 可以在步骤间加入验证逻辑 (Gate)
- 上一步的输出是下一步的输入

代码实现:

  async function promptChain(userInput) {
    // Step 1: 分析需求
    const analysis = await llm.call({
      system: "你是需求分析师。分析以下需求，输出技术方案。",
      user: userInput
    });
    
    // Gate: 验证分析结果
    if (!isValidAnalysis(analysis)) {
      return { error: "分析结果不合格" };
    }
    
    // Step 2: 生成代码
    const code = await llm.call({
      system: "你是开发者。根据以下技术方案编写代码。",
      user: analysis
    });
    
    // Step 3: 审查代码
    const review = await llm.call({
      system: "你是代码审查员。审查以下代码的质量。",
      user: code
    });
    
    return { analysis, code, review };
  }

何时使用:
✅ 步骤固定且可预知
✅ 每步之间有明确的输入/输出接口
✅ 不需要条件分支或循环

何时不用:
❌ 需要根据中间结果动态调整流程
❌ 需要并行处理
❌ 步骤之间有复杂的依赖关系
```

---

## 三、模式 2: Router (路由)

```
根据输入特征，将请求分发到不同的处理 Agent。

                    ┌──────────────┐
                    │              │
    用户输入 ──────▶│   Router     │
                    │  (分类器)    │
                    │              │
                    └──┬───┬───┬──┘
                       │   │   │
          ┌────────────┘   │   └────────────┐
          │                │                │
          ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ Handler A│    │ Handler B│    │ Handler C│
    │ 代码问题  │    │ 配置问题  │    │ 一般咨询  │
    └──────────┘    └──────────┘    └──────────┘

两种 Router 实现:

1. LLM Router (LLM 做分类)
   
   router_agent = Agent(
       name="Router",
       instructions="根据用户问题类型，转交给合适的专家",
       model="gpt-4o-mini",  # 用便宜的模型做分类
       handoffs=[
           code_agent,    # 代码相关问题
           config_agent,  # 配置相关问题
           general_agent  # 一般问题
       ]
   )
   
   优点: 灵活，能处理模糊输入
   缺点: 分类可能出错，增加一轮 LLM 调用延迟

2. Rule Router (规则路由)
   
   function route(input) {
     if (input.includes("代码") || input.includes("函数")) return code_agent;
     if (input.includes("配置") || input.includes("环境")) return config_agent;
     return general_agent;
   }
   
   优点: 快速确定性，零 LLM 成本
   缺点: 不够灵活，需要维护规则

OpenAI Agents SDK 的 Router:
  Router 本质上就是一个 Agent，它的"工具"是 handoff 到其他 Agent。
  当 Router Agent 不自己回答而是选择 handoff 时，就完成了路由。

实际案例: 客服系统
  ┌──────────┐
  │ Triage   │ (分诊 Agent)
  │ Agent    │
  └──┬─┬─┬──┘
     │ │ │
     │ │ └──▶ RefundAgent (退款处理)
     │ └────▶ TechSupportAgent (技术支持)
     └──────▶ SalesAgent (销售咨询)
```

---

## 四、模式 3: Pipeline (流水线)

```
动态的多阶段流水线，每个阶段可能转换、过滤或增强数据。

┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ Extract  │──▶│Transform │──▶│ Validate │──▶│  Output  │
│          │   │          │   │          │   │          │
│ 解析输入  │   │ LLM 处理 │   │ 验证结果  │   │ 格式化   │
│ 提取结构  │   │ 生成内容  │   │ 质量检查  │   │ 输出     │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
   代码逻辑      LLM Call        代码逻辑      代码逻辑

与 Prompt Chain 的区别:
- Pipeline 的每个阶段不一定都是 LLM 调用
- 可以混合 LLM 调用 和 确定性代码逻辑
- 更强调数据的转换和流动

实际案例: 文档翻译流水线

  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
  │ Parse    │──▶│ Chunk    │──▶│Translate │──▶│ Merge    │
  │ Markdown │   │ by       │   │ Each     │   │ & Format │
  │          │   │ Section  │   │ Chunk    │   │          │
  │ 代码逻辑  │   │ 代码逻辑  │   │ LLM ×N  │   │ 代码逻辑  │
  └──────────┘   └──────────┘   │ (并行)    │   └──────────┘
                                └──────────┘

  关键: Translate 阶段可以并行处理多个 chunk → 大幅提速
```

---

## 五、模式 4: DAG Graph (有向无环图)

```
最灵活的静态编排: 任务形成一个有向无环图，自动并行执行无依赖的任务。

实际案例: 全栈功能开发

  ┌─────────────┐
  │ 需求分析     │
  └──────┬──────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│API 设计 │ │UI 设计  │       ← 并行执行
└───┬────┘ └───┬────┘
    │          │
    ▼          ▼
┌────────┐ ┌────────┐
│后端实现 │ │前端实现  │       ← 并行执行 (分别依赖各自的设计)
└───┬────┘ └───┬────┘
    │          │
    └────┬─────┘
         │
         ▼
  ┌─────────────┐
  │  集成测试     │            ← 等待前后端都完成
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  部署准备     │
  └─────────────┘

LangGraph 的 DAG 实现:

  from langgraph.graph import StateGraph
  
  graph = StateGraph(ProjectState)
  
  graph.add_node("analyze", analyze_requirements)
  graph.add_node("api_design", design_api)
  graph.add_node("ui_design", design_ui)
  graph.add_node("backend", implement_backend)
  graph.add_node("frontend", implement_frontend)
  graph.add_node("test", run_integration_tests)
  graph.add_node("deploy", prepare_deployment)
  
  graph.add_edge("analyze", "api_design")
  graph.add_edge("analyze", "ui_design")      # 分叉: 并行
  graph.add_edge("api_design", "backend")
  graph.add_edge("ui_design", "frontend")
  graph.add_edge("backend", "test")
  graph.add_edge("frontend", "test")           # 汇合: 等待两者完成
  graph.add_edge("test", "deploy")
  
  graph.set_entry_point("analyze")
  app = graph.compile()

DAG 的优势:
✅ 自动识别并行机会 — 无依赖的节点自动并行
✅ 依赖管理 — 确保前置条件满足才执行
✅ 可视化 — 图结构天然适合可视化
✅ 可预测 — 执行路径在编译时就确定了

DAG 的局限:
❌ 不支持循环 — "审查不通过 → 返回修改" 无法表达
❌ 静态图 — 不能在运行时动态添加新节点
```

---

## 六、模式 5: State Machine (状态机图)

```
DAG 的增强版: 允许循环、条件分支和动态状态转换。

这是 LangGraph 的核心抽象，也是目前最强大的通用编排模式。

┌──────────────────────────────────────────────────────────────────────┐
│                    状态机编排示例                                      │
│                                                                      │
│  代码审查-修复 循环:                                                  │
│                                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                       │
│  │ Generate │───▶│ Review   │───▶│ Decision │                       │
│  │ Code     │    │ Code     │    │          │                       │
│  └──────────┘    └──────────┘    └──┬───┬───┘                       │
│       ▲                             │   │                           │
│       │              通过 ──────────┘   │                           │
│       │                                 │ 不通过                    │
│       │              ┌──────────┐       │                           │
│       └──────────────│ Fix      │◀──────┘                           │
│          (带修改建议)  │ Issues   │                                   │
│                       └──────────┘                                   │
│                                                                      │
│  关键: Decision 节点可以根据审查结果选择不同的路径                      │
│  → 通过: 进入下一阶段                                                │
│  → 不通过: 回到修复节点，循环直到通过                                  │
│                                                                      │
│  LangGraph 实现:                                                     │
│                                                                      │
│  graph = StateGraph(CodeState)                                       │
│                                                                      │
│  graph.add_node("generate", generate_code)                           │
│  graph.add_node("review", review_code)                               │
│  graph.add_node("fix", fix_issues)                                   │
│                                                                      │
│  graph.add_edge("generate", "review")                                │
│  graph.add_conditional_edges(                                        │
│      "review",                                                       │
│      decide_next_step,  # 路由函数                                    │
│      {                                                               │
│          "pass": END,       # 通过 → 结束                            │
│          "fail": "fix"      # 不通过 → 修复                          │
│      }                                                               │
│  )                                                                   │
│  graph.add_edge("fix", "review")  # 修复后重新审查                    │
│                                                                      │
│  # 状态定义                                                          │
│  class CodeState(TypedDict):                                         │
│      code: str                                                       │
│      review_result: str                                              │
│      review_count: int     # 审查次数（防止无限循环）                  │
│      issues: list[str]                                               │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.1 State Machine 的核心元素

```
State (状态):
  共享的数据结构，所有节点都可以读写
  类似于 Multi-Agent 中的 "黑板"
  
  class AgentState(TypedDict):
      messages: list[Message]    # 对话历史
      plan: str                  # 当前计划
      code: str                  # 生成的代码
      test_results: str          # 测试结果
      iteration: int             # 迭代次数

Node (节点):
  执行单元，可以是:
  - LLM 调用 (Agent)
  - 工具调用 (Tool)
  - 纯代码逻辑 (Function)
  
  每个 Node 接收 State，返回 State 的更新

Edge (边):
  - 普通边: A → B (无条件)
  - 条件边: A → B 或 C (根据条件选择)
  - 终止边: → END (结束执行)

Channel (通道):
  定义 State 属性如何更新
  - 替换: 新值覆盖旧值
  - 追加: 新值追加到列表
  - 自定义: 合并函数
```

---

## 七、模式 6: Swarm (群体智能)

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Swarm 模式                                         │
│                                                                      │
│  核心思想: 多个自治 Agent 通过简单规则涌现出复杂行为                    │
│  类比: 蜂群 — 每只蜜蜂遵循简单规则，但群体表现出智能行为               │
│                                                                      │
│  OpenAI Swarm (2024.10):                                             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │  设计原则:                                                    │   │
│  │  1. 轻量 — 没有复杂的编排框架，仅基于 handoff                 │   │
│  │  2. 自治 — 每个 Agent 独立决策（包括何时 handoff）             │   │
│  │  3. 简单 — 整个框架 ~200 行代码                               │   │
│  │                                                              │   │
│  │  Agent A ←──handoff──→ Agent B                               │   │
│  │    ↑                      ↑                                  │   │
│  │    │        handoff       │                                  │   │
│  │    └─────── Agent C ──────┘                                  │   │
│  │                                                              │   │
│  │  每个 Agent:                                                  │   │
│  │  - 有自己的 instructions 和 tools                             │   │
│  │  - 可以决定 handoff 给谁                                      │   │
│  │  - Handoff 就是一种特殊的 "tool"                              │   │
│  │                                                              │   │
│  │  from swarm import Swarm, Agent                               │   │
│  │                                                              │   │
│  │  def transfer_to_sales():                                     │   │
│  │      """转交给销售专员"""                                      │   │
│  │      return sales_agent                                       │   │
│  │                                                              │   │
│  │  triage = Agent(                                              │   │
│  │      name="Triage",                                           │   │
│  │      instructions="分析客户需求...",                           │   │
│  │      functions=[transfer_to_sales, transfer_to_support]       │   │
│  │  )                                                            │   │
│  │                                                              │   │
│  │  client = Swarm()                                             │   │
│  │  response = client.run(agent=triage, messages=[...])          │   │
│  │                                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Swarm 的哲学:                                                       │
│  "不要过度设计编排。让 Agent 自己决定何时需要帮助，                     │
│   以及向谁寻求帮助。复杂行为从简单规则中涌现。"                        │
│                                                                      │
│  对比:                                                               │
│  Orchestrator 模式: 中心化控制 → 可预测但不灵活                       │
│  Swarm 模式:        去中心化   → 灵活但不可预测                       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 八、编排模式选择指南

```
┌──────────────────────────────────────────────────────────────────┐
│                  如何选择编排模式？                                │
│                                                                  │
│  你的任务特征是？                                                 │
│  │                                                               │
│  ├── 步骤固定、无分支、无循环                                     │
│  │   └── → Prompt Chain                                          │
│  │                                                               │
│  ├── 需要根据输入类型分发到不同处理器                              │
│  │   └── → Router                                                │
│  │                                                               │
│  ├── 数据流经多个转换阶段                                         │
│  │   └── → Pipeline                                              │
│  │                                                               │
│  ├── 多个任务有依赖关系，部分可并行                                │
│  │   └── → DAG Graph                                             │
│  │                                                               │
│  ├── 需要循环（如 审查-修复 循环）                                 │
│  │   └── → State Machine (LangGraph)                             │
│  │                                                               │
│  ├── 多个自治 Agent 灵活协作                                      │
│  │   └── → Swarm / Handoff                                       │
│  │                                                               │
│  └── 不确定                                                      │
│      └── → 从 Prompt Chain 开始，按需升级                         │
│                                                                  │
│  Anthropic 的"升级阶梯":                                         │
│                                                                  │
│  单 LLM 调用                                                     │
│    ↓ (不够用时)                                                   │
│  Prompt Chain                                                    │
│    ↓ (需要条件分支时)                                              │
│  Router                                                          │
│    ↓ (需要并行时)                                                  │
│  DAG / Pipeline                                                  │
│    ↓ (需要循环时)                                                  │
│  State Machine                                                   │
│    ↓ (需要灵活协作时)                                              │
│  Swarm / Multi-Agent                                             │
│                                                                  │
│  核心原则: "使用能满足需求的最简单方案"                            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 九、编排层的可观测性

```
Multi-Agent 系统调试极其困难，可观测性是必须的:

┌──────────────────────────────────────────────────────────────────┐
│                    Tracing (追踪)                                  │
│                                                                  │
│  记录完整的执行链，包括:                                          │
│  - 每个 Agent 的每次 LLM 调用                                    │
│  - 工具调用的输入和输出                                          │
│  - Handoff 的触发和目标                                          │
│  - 状态变更                                                     │
│  - 耗时和 token 消耗                                             │
│                                                                  │
│  OpenAI Agents SDK 内置 Tracing:                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Trace: "用户注册功能开发"                                  │   │
│  │ ├── Span: TriageAgent (120ms, 500 tokens)                │   │
│  │ │   └── handoff → CoderAgent                             │   │
│  │ ├── Span: CoderAgent (5.2s, 8000 tokens)                │   │
│  │ │   ├── tool: read_file("src/routes.ts")                 │   │
│  │ │   ├── tool: write_file("src/routes/register.ts")       │   │
│  │ │   └── handoff → ReviewerAgent                          │   │
│  │ ├── Span: ReviewerAgent (2.1s, 3000 tokens)             │   │
│  │ │   ├── tool: read_file("src/routes/register.ts")        │   │
│  │ │   └── handoff → CoderAgent (需要修改)                   │   │
│  │ ├── Span: CoderAgent (1.8s, 2000 tokens)                │   │
│  │ │   ├── tool: edit_file("src/routes/register.ts")        │   │
│  │ │   └── handoff → ReviewerAgent                          │   │
│  │ └── Span: ReviewerAgent (1.5s, 1500 tokens)             │   │
│  │     └── output: "代码审查通过"                             │   │
│  │                                                          │   │
│  │ 总计: 10.7s, 15000 tokens, 5 个 Agent 切换               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  LangGraph 的状态追踪:                                           │
│  - 每个节点执行前后的完整 State 快照                              │
│  - 支持"时间旅行"调试（回到任意历史状态）                         │
│  - 支持从中间状态恢复执行                                        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 总结

```
编排模式的演进路径:

  Prompt Chain (固定流水线)
       │
       ▼
  Router (条件分发)
       │
       ▼
  DAG (并行+依赖) ─────────────┐
       │                        │
       ▼                        ▼
  State Machine (循环+状态)    Swarm (自治+涌现)
  (LangGraph)                  (OpenAI Swarm → Agents SDK)

当前最佳实践:
  - 大部分场景: Prompt Chain + Router 就够了
  - 复杂场景: State Machine (LangGraph) 是最通用的选择
  - 灵活协作: Handoff/Swarm 是最简洁的 Multi-Agent 方案
  - 混合使用: 高层用 Orchestrator/Router，每个 Worker 内部用 ReAct
```
