# 02 - 单 Agent 核心架构模式

> 所有多 Agent 系统的基础，都是一个设计良好的单 Agent。本文深入分析单 Agent 的四种核心架构模式。

---

## 一、模式总览

```
┌────────────────────────────────────────────────────────────────────────┐
│                    单 Agent 四种核心模式                                 │
│                                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │   ReAct      │  │ Plan-and-    │  │  Reflexion   │  │  LATS     │  │
│  │              │  │ Execute      │  │              │  │           │  │
│  │ 推理+行动    │  │ 先规划再执行  │  │ 自我反思纠错  │  │ 搜索+反思 │  │
│  │ 交替进行     │  │ 两阶段解耦   │  │ 从错误中学习  │  │ 树状探索  │  │
│  │              │  │              │  │              │  │           │  │
│  │ 2022.10      │  │ 2023.05      │  │ 2023.03      │  │ 2023.10   │  │
│  │ Yao et al.   │  │ Wang et al.  │  │ Shinn et al. │  │ Zhou et al│  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └───────────┘  │
│                                                                        │
│  复杂度:  ★★☆☆☆      ★★★☆☆          ★★★☆☆          ★★★★☆         │
│  适用性:  ★★★★★      ★★★★☆          ★★★☆☆          ★★☆☆☆         │
│  工业采用: 最广泛       较广泛           部分采用         研究为主       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 二、ReAct 模式：推理与行动的交织

### 2.1 核心思想

ReAct (Reasoning + Acting) 是 2022 年由 Yao 等人提出的，也是**目前所有主流 Agent 系统的基础模式**。

```
核心公式:

  Think → Act → Observe → Think → Act → Observe → ... → Answer

  每一步中:
  - Think (推理): LLM 分析当前状态，决定下一步
  - Act (行动):   LLM 选择并执行一个工具/动作
  - Observe (观察): 系统将执行结果反馈给 LLM
```

### 2.2 执行流程详解

```
┌──────────────────────────────────────────────────────────────────────┐
│                      ReAct 执行流程                                   │
│                                                                      │
│  用户输入: "找到项目中所有未处理的 TODO 注释并创建 GitHub issues"       │
│                                                                      │
│  ┌──── Iteration 1 ─────────────────────────────────────────────┐   │
│  │ Think: 我需要先搜索项目中所有包含 TODO 的注释                  │   │
│  │ Act:   grep -r "TODO" --include="*.ts" src/                  │   │
│  │ Observe: 找到 15 个 TODO 注释，分布在 8 个文件中               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌──── Iteration 2 ─────────────────────────────────────────────┐   │
│  │ Think: 有 15 个 TODO，我需要逐个分析内容，判断哪些需要创建     │   │
│  │        issue，让我先看看具体内容                               │   │
│  │ Act:   读取第一个文件 src/auth/login.ts                       │   │
│  │ Observe: TODO: 实现 OAuth 登录（高优先级）                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌──── Iteration 3 ─────────────────────────────────────────────┐   │
│  │ Think: 这个 TODO 是一个明确的功能需求，应该创建 issue          │   │
│  │ Act:   gh issue create --title "实现 OAuth 登录"              │   │
│  │        --body "文件: src/auth/login.ts ..."                   │   │
│  │ Observe: 成功创建 Issue #42                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│                          ... (继续处理剩余 TODO)                     │
│                              │                                      │
│                              ▼                                      │
│  ┌──── Iteration N ─────────────────────────────────────────────┐   │
│  │ Think: 所有 TODO 都已分析完毕，创建了 8 个 issue，             │   │
│  │        跳过了 7 个已解决/低优先级的 TODO                       │   │
│  │ Act:   (无工具调用 — 输出文本回复)                             │   │
│  │ Answer: "已完成。扫描了 15 个 TODO，创建了 8 个 Issues..."     │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.3 ReAct 在主流框架中的实现

**Claude Code 的实现（简化版）：**

```javascript
async function agenticLoop(messages, tools) {
  while (true) {
    // Think + Act: LLM 同时进行推理和工具选择
    const response = await llm.call({
      messages,
      tools,
      // Claude 的 extended thinking 机制
      // 让 LLM 先在内部进行长链推理，再决定行动
    });

    // 收集所有工具调用
    const toolCalls = response.content.filter(b => b.type === 'tool_use');

    if (toolCalls.length === 0) {
      // 没有工具调用 → Agent 认为任务完成
      return response;
    }

    // 执行每个工具调用
    for (const call of toolCalls) {
      // 权限检查
      const allowed = await checkPermission(call.name, call.input);
      
      // Act: 执行工具
      const result = allowed 
        ? await executeTool(call.name, call.input)
        : { error: "Permission denied" };
      
      // Observe: 将结果加入消息历史
      messages.push({
        role: 'assistant',
        content: [call]
      });
      messages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: call.id,
          content: JSON.stringify(result)
        }]
      });
    }
    // 循环继续 → LLM 看到工具结果后进行下一轮 Think
  }
}
```

**OpenAI Agents SDK 的实现（简化版）：**

```python
class Agent:
    def __init__(self, name, instructions, tools, model="gpt-4o"):
        self.name = name
        self.instructions = instructions
        self.tools = tools
        self.model = model
    
    async def run(self, input_messages):
        messages = [
            {"role": "system", "content": self.instructions},
            *input_messages
        ]
        
        while True:
            # Think + Act
            response = await openai.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=[t.to_schema() for t in self.tools],
            )
            
            choice = response.choices[0]
            
            if choice.finish_reason == "stop":
                # 没有工具调用，任务完成
                return choice.message.content
            
            if choice.finish_reason == "tool_calls":
                # Act + Observe
                for tool_call in choice.message.tool_calls:
                    tool = self.find_tool(tool_call.function.name)
                    result = await tool.execute(
                        json.loads(tool_call.function.arguments)
                    )
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": str(result)
                    })
```

### 2.4 ReAct 的优缺点

```
优点:
┌──────────────────────────────────────────────────────────────┐
│ ✅ 简单直观 — 实现容易，调试方便                              │
│ ✅ 灵活性强 — 不需要预定义执行计划，动态适应                   │
│ ✅ 可观察性好 — 每一步的思考和行动都可记录和审计               │
│ ✅ 通用性广 — 适用于几乎所有 Agent 场景                       │
│ ✅ 自然纠错 — 观察到错误后可以自动调整策略                     │
└──────────────────────────────────────────────────────────────┘

缺点:
┌──────────────────────────────────────────────────────────────┐
│ ❌ 短视 — 只看眼前一步，缺乏长期规划                         │
│ ❌ 效率低 — 可能走弯路（搜索不到就换个关键词再搜）            │
│ ❌ 错误累积 — 长任务链中，前期错误会影响后续所有步骤           │
│ ❌ Token 消耗高 — 每次循环都需要发送完整上下文                 │
│ ❌ 重复劳动 — 可能反复执行类似的工具调用                       │
└──────────────────────────────────────────────────────────────┘
```

---

## 三、Plan-and-Execute 模式：先想后做

### 3.1 核心思想

将规划和执行解耦为两个阶段，解决 ReAct "走一步看一步" 的短视问题。

```
Phase 1: Plan (规划)
  LLM 接收任务 → 分析需求 → 生成完整的执行计划（步骤列表）

Phase 2: Execute (执行)  
  按照计划逐步执行 → 每步执行后可以修订计划

关键区别:
  ReAct:           想一步做一步，想一步做一步 ...
  Plan-and-Execute: 先想好所有步骤，然后逐步执行（可动态调整）
```

### 3.2 执行流程

```
┌──────────────────────────────────────────────────────────────────────┐
│                  Plan-and-Execute 执行流程                            │
│                                                                      │
│  用户输入: "为这个 Express 项目添加用户认证功能"                       │
│                                                                      │
│  ═══ Phase 1: Planning ═══════════════════════════════════════════   │
│                                                                      │
│  Planner LLM 生成计划:                                               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Step 1: 分析当前项目结构和依赖                                │   │
│  │ Step 2: 安装认证相关依赖 (passport, bcrypt, jsonwebtoken)     │   │
│  │ Step 3: 创建 User 数据模型                                   │   │
│  │ Step 4: 实现注册接口 (POST /auth/register)                   │   │
│  │ Step 5: 实现登录接口 (POST /auth/login)                      │   │
│  │ Step 6: 实现 JWT 中间件                                      │   │
│  │ Step 7: 为需要认证的路由添加中间件                            │   │
│  │ Step 8: 编写测试                                             │   │
│  │ Step 9: 运行测试并修复问题                                    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ═══ Phase 2: Execution ════════════════════════════════════════════ │
│                                                                      │
│  ┌──── Execute Step 1 ──────────────────────────────────────────┐   │
│  │ Executor Agent (可以是独立的 ReAct Agent):                    │   │
│  │   ls src/ → 读取 package.json → 读取 src/routes/             │   │
│  │ Result: Express + MongoDB (Mongoose)，已有 /api/products 路由  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌──── Re-plan Check ──────────────────────────────────────────┐   │
│  │ 计划是否需要调整？                                            │   │
│  │ → 是的，发现使用 Mongoose，Step 3 需要调整为 Mongoose Schema  │   │
│  │ → 更新计划                                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌──── Execute Step 2 ──────────────────────────────────────────┐   │
│  │ npm install passport passport-local bcrypt jsonwebtoken       │   │
│  │ Result: 依赖安装成功                                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│                          ... (继续执行后续步骤)                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.3 Plan-and-Execute 的变体

```
1. 静态计划 (Static Plan):
   ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐
   │Plan  │──▶│Exec 1│──▶│Exec 2│──▶│Exec 3│──▶ Done
   └──────┘   └──────┘   └──────┘   └──────┘
   
   特点: 计划制定后不再修改
   适合: 步骤明确、低不确定性的任务

2. 动态重规划 (Dynamic Re-planning):
   ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐
   │Plan  │──▶│Exec 1│──▶│Re-   │──▶│Exec 2│──▶ ...
   └──────┘   └──────┘   │plan  │   └──────┘
                          └──────┘
   
   特点: 每步执行后评估是否需要调整计划
   适合: 探索性任务，执行中可能发现新信息

3. 层次化规划 (Hierarchical Planning):
   ┌────────────────────────────────────────────┐
   │ High-level Plan: 3 个主要阶段              │
   │  Phase 1: 基础设施                         │
   │    └── Sub-plan: 4 个具体步骤              │
   │  Phase 2: 核心功能                         │
   │    └── Sub-plan: 6 个具体步骤              │
   │  Phase 3: 测试与优化                       │
   │    └── Sub-plan: 3 个具体步骤              │
   └────────────────────────────────────────────┘
   
   特点: 高层计划粗略，执行到某阶段时再细化
   适合: 大型复杂任务
```

### 3.4 优缺点

```
优点:
┌──────────────────────────────────────────────────────────────┐
│ ✅ 全局视野 — 执行前就考虑到所有步骤，避免遗漏               │
│ ✅ 可预测性 — 用户可以在执行前审查和修改计划                  │
│ ✅ 任务分解 — 自然地将大任务分解为小步骤                      │
│ ✅ 进度追踪 — 清楚知道当前在第几步，总共几步                  │
│ ✅ 并行可能 — 独立步骤可以并行执行                            │
└──────────────────────────────────────────────────────────────┘

缺点:
┌──────────────────────────────────────────────────────────────┐
│ ❌ 计划可能不准确 — 信息不足时，初始计划质量低                │
│ ❌ 额外开销 — 规划本身消耗 tokens 和时间                     │
│ ❌ 重规划成本 — 频繁重规划可能比 ReAct 更贵                  │
│ ❌ 灵活性降低 — 有了计划后容易"按计划执行"而忽略更好的路径   │
│ ❌ 实现复杂 — 需要额外的规划逻辑和状态管理                   │
└──────────────────────────────────────────────────────────────┘
```

---

## 四、Reflexion 模式：从失败中学习

### 4.1 核心思想

Reflexion 在 ReAct 的基础上增加了**自我反思**机制，让 Agent 能从失败中学习。

```
标准 ReAct:
  失败 → 重试（可能重复同样的错误）

Reflexion:
  失败 → 反思("为什么失败了？") → 生成经验教训 → 重试（带着教训）

关键创新: 
  将"失败经验"显式地存储并在后续尝试中使用
  本质上是一种 "短期经验记忆" 机制
```

### 4.2 执行流程

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Reflexion 执行流程                                  │
│                                                                      │
│  任务: "优化 SQL 查询，将响应时间从 5s 降到 500ms 以下"               │
│                                                                      │
│  ═══ Trial 1 ════════════════════════════════════════════════════    │
│  │                                                                   │
│  │  [ReAct Loop]                                                     │
│  │  Think: 添加索引应该能加速查询                                     │
│  │  Act: 分析 EXPLAIN 输出 → 添加 B-tree 索引                        │
│  │  Observe: 响应时间 5s → 3.2s                                      │
│  │                                                                   │
│  │  [Evaluate]                                                       │
│  │  结果: 3.2s > 500ms → 失败 ❌                                     │
│  │                                                                   │
│  │  [Reflect] ← 这一步是 Reflexion 的核心创新                        │
│  │  "添加索引只减少了 36%，不够。分析发现查询中有                      │
│  │   N+1 问题和不必要的 JOIN。下次应该：                               │
│  │   1. 先优化查询结构（消除 N+1）                                    │
│  │   2. 再考虑索引优化                                                │
│  │   3. 考虑使用子查询替代 LEFT JOIN"                                 │
│  │                                                                   │
│  │  → 反思结论存入"经验记忆"                                          │
│  │                                                                   │
│  ═══ Trial 2 (带着 Trial 1 的反思) ════════════════════════════════  │
│  │                                                                   │
│  │  [ReAct Loop] (消息中包含之前的反思)                               │
│  │  Think: 根据上次的经验，我应该先解决 N+1 问题...                    │
│  │  Act: 使用 JOIN 改写为单查询 → 添加复合索引                        │
│  │  Observe: 响应时间 3.2s → 800ms                                   │
│  │                                                                   │
│  │  [Evaluate]                                                       │
│  │  结果: 800ms > 500ms → 还没达标 ❌                                 │
│  │                                                                   │
│  │  [Reflect]                                                        │
│  │  "查询结构优化效果好（-75%），但 800ms 还不够。                     │
│  │   观察到返回了 5000 行数据但只显示 20 行。                          │
│  │   下次应该：添加分页 + 只 SELECT 需要的列"                         │
│  │                                                                   │
│  ═══ Trial 3 (带着 Trial 1+2 的反思) ══════════════════════════════  │
│  │                                                                   │
│  │  [ReAct Loop]                                                     │
│  │  Think: 根据之前的经验，添加分页和列投影...                         │
│  │  Act: 添加 LIMIT/OFFSET + 精简 SELECT 列                          │
│  │  Observe: 响应时间 800ms → 120ms                                  │
│  │                                                                   │
│  │  [Evaluate]                                                       │
│  │  结果: 120ms < 500ms → 成功 ✅                                    │
│  │                                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.3 实现要点

```javascript
class ReflexionAgent {
  constructor(tools, evaluator) {
    this.tools = tools;
    this.evaluator = evaluator;
    this.reflections = []; // 经验记忆
    this.maxTrials = 3;
  }
  
  async run(task) {
    for (let trial = 0; trial < this.maxTrials; trial++) {
      // 构建包含历史反思的上下文
      const context = this.buildContext(task, this.reflections);
      
      // 执行 ReAct Loop
      const result = await this.reactLoop(context);
      
      // 评估结果
      const evaluation = await this.evaluator.evaluate(task, result);
      
      if (evaluation.success) {
        return result; // 成功
      }
      
      // 反思失败原因
      const reflection = await this.reflect(task, result, evaluation);
      this.reflections.push(reflection);
    }
    
    return this.bestAttempt(); // 返回最好的一次尝试
  }
  
  async reflect(task, result, evaluation) {
    // 让 LLM 分析失败原因并总结经验
    return await llm.call({
      messages: [{
        role: 'system',
        content: '分析上一次尝试的失败原因，总结经验教训...'
      }, {
        role: 'user',
        content: `任务: ${task}\n结果: ${result}\n评估: ${evaluation}`
      }]
    });
  }
}
```

---

## 五、ReWOO 与 LATS: 更高级的变体

### 5.1 ReWOO (Reasoning WithOut Observation)

```
核心思想: 一次性规划所有工具调用，而不是交替执行

标准 ReAct:
  Think → Act → Observe → Think → Act → Observe → ...
  (每次 Act 后都要等 Observe，再发一次 LLM 调用)

ReWOO:
  Plan: Think + 列出所有需要的工具调用（包含依赖关系）
  Execute: 批量执行所有工具调用（尽可能并行）
  Solve: LLM 看到所有结果后一次性给出答案

优势: 减少 LLM 调用次数（从 N 次降到 2-3 次）
劣势: 无法根据中间结果动态调整策略
```

### 5.2 LATS (Language Agent Tree Search)

```
核心思想: 将 Agent 执行看作搜索树，用 Monte Carlo Tree Search 探索最优路径

                         [初始状态]
                        /     |     \
                    [行动A]  [行动B]  [行动C]
                    /    \      |
              [行动D] [行动E] [行动F]
               ✅       ❌      |
              成功!    失败→   [行动G]
                      回溯       ✅
                                成功!

每个节点都有:
- value: 评估当前状态到目标的距离
- visits: 被探索的次数
- reflection: 如果失败，记录反思

选择策略: UCT (Upper Confidence bounds for Trees)
  选择 value 高且 visits 少的节点（平衡利用与探索）

优势: 能系统地探索多种策略，找到最优解
劣势: 计算成本高（需要多次 LLM 调用探索不同分支）
```

---

## 六、当前工业实践中的模式选择

### 6.1 模式选择决策树

```
你的 Agent 需要做什么？
│
├── 简单的工具调用（1-5 步）
│   └── → 直接用 ReAct，不需要更复杂的模式
│
├── 中等复杂任务（5-20 步）
│   ├── 任务步骤可以预知？
│   │   ├── 是 → Plan-and-Execute
│   │   └── 否 → ReAct（可能加 Extended Thinking）
│   │
│   └── 需要多次尝试？
│       ├── 是 → Reflexion
│       └── 否 → ReAct
│
└── 复杂长任务（20+ 步）
    └── → Plan-and-Execute + ReAct 混合
        (高层用 Plan，每步执行用 ReAct)
```

### 6.2 主流产品的模式选择

```
┌──────────────────────────────────────────────────────────────────┐
│ 产品/框架            模式                     备注               │
│ ─────────            ─────                    ─────              │
│ Claude Code          ReAct                    纯 Agentic Loop    │
│                      + Extended Thinking      思考链增强推理      │
│                                                                  │
│ Cursor Agent         ReAct                    IDE 集成优化        │
│                      + Parallel Tool Calls    并行工具调用        │
│                                                                  │
│ OpenAI Codex         Plan-and-Execute 变体    先规划再执行        │
│                      + ReAct (执行阶段)       分步执行            │
│                                                                  │
│ Devin                Plan-and-Execute         复杂开发任务        │
│                      + 层次化规划             分阶段细化          │
│                                                                  │
│ LangGraph            可配置                   支持所有模式        │
│                      (图状态机)               用户自定义流程       │
│                                                                  │
│ CrewAI               ReAct (每个 Agent)       多 Agent 协作       │
│                      + Plan (Crew 层面)       Crew 级别规划       │
│                                                                  │
│ OpenAI Agents SDK    ReAct                    基础 Loop           │
│                      + Handoff (多 Agent)     Agent 间切换        │
└──────────────────────────────────────────────────────────────────┘
```

### 6.3 Extended Thinking: 现代 ReAct 的增强

2024-2025 年，"Extended Thinking"（扩展思考 / Chain-of-Thought）成为增强 ReAct 的关键技术：

```
传统 ReAct:
  Think: "我应该搜索 UserService 文件"  (简短推理)
  Act: grep "UserService" ...

Extended Thinking ReAct:
  Think (内部长链推理，不一定对用户可见):
    "用户要求重构 UserService。让我分析一下:
     1. 首先需要了解当前的依赖关系
     2. UserService 可能被多个地方引用
     3. 如果直接改接口，可能破坏下游调用者
     4. 应该先搜索所有引用者，再决定重构策略
     5. 另外要注意测试覆盖情况...
     
     决定: 先搜索所有引用，再读取文件内容"
  Act: grep "UserService" --include="*.ts" src/

Claude 的 Extended Thinking:
- 在 API 响应中增加 thinking 块
- 内部推理 token 数可达数千
- 显著提高复杂任务的成功率
- 本质上是让 LLM "多想一会儿" 再行动

OpenAI 的 Reasoning Models (o1/o3):
- 类似思路，模型内部进行长链推理
- 对规划类任务效果显著提升
- 推理 token 通常不对用户可见
```

---

## 七、Agentic Loop 的工程挑战

### 7.1 循环终止问题

```
问题: Agent 什么时候应该停止？

情况 1: LLM 自行决定停止
  → 标准方式，LLM 返回纯文本（不请求工具调用）时停止
  → 问题: LLM 可能过早停止（"我觉得差不多了"）或不停止（无限循环）

情况 2: 外部约束
  ┌──────────────────────────────────────────────────────────┐
  │ 保护机制:                                                 │
  │                                                          │
  │ 1. 最大迭代次数   — 超过 N 轮强制停止                     │
  │    Claude Code: 默认无硬限制，但有 token 预算              │
  │    Agents SDK: 可配置 max_turns                           │
  │                                                          │
  │ 2. Token 预算     — 总消耗超过阈值时停止                   │
  │    Claude Code: 自动提醒用户 token 消耗                    │
  │                                                          │
  │ 3. 时间限制       — 运行时间超过阈值时停止                  │
  │    Codex: 每个任务有时间限制                               │
  │                                                          │
  │ 4. 用户中断       — 用户主动取消                           │
  │    所有 Agent 系统都支持                                   │
  │                                                          │
  │ 5. 错误阈值       — 连续失败次数超过阈值时停止              │
  │    避免无限重试                                           │
  └──────────────────────────────────────────────────────────┘
```

### 7.2 上下文管理

```
问题: 长任务链会导致上下文窗口溢出

消息列表增长示意:
  Iteration 1:  [系统提示 4K] + [用户消息 0.5K] + [工具定义 3K]
  Iteration 5:  + [5轮对话 5K] + [5个工具结果 10K] = ~22.5K
  Iteration 20: + [20轮对话 20K] + [20个工具结果 40K] = ~67.5K
  Iteration 50: + [50轮对话 50K] + [50个工具结果 100K] = ~157.5K ← 接近 200K 限制!

解决方案:
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│ 1. 上下文压缩 (Context Compression)                          │
│    定期让 LLM 总结之前的对话历史，用摘要替代原始消息           │
│    Claude Code: 自动检测并压缩过长的上下文                    │
│                                                              │
│ 2. 滑动窗口 (Sliding Window)                                 │
│    只保留最近 N 轮对话，丢弃早期消息                          │
│    简单但可能丢失重要上下文                                   │
│                                                              │
│ 3. 工具结果截断 (Result Truncation)                           │
│    对过长的工具返回结果进行截断                                │
│    Claude Code: 自动截断过长的文件内容和命令输出               │
│                                                              │
│ 4. 分层记忆 (Hierarchical Memory)                            │
│    短期: 当前对话消息                                         │
│    中期: 本次任务摘要                                         │
│    长期: 向量数据库存储的历史信息                              │
│    OpenClaw: 实现了这种三层记忆架构                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 7.3 错误恢复

```
Agent 执行中的错误类型:

1. 工具执行错误
   bash 命令返回非零退出码、文件不存在、权限不足...
   → 通常: 将错误信息反馈给 LLM，让它自行修正

2. LLM 格式错误  
   返回了无效的工具调用参数、JSON 格式错误...
   → 通常: 自动重试，将格式错误提示反馈给 LLM

3. 逻辑错误
   Agent 的推理出现偏差，走入死胡同...
   → 最难处理: 需要 Reflexion 机制或人类干预

4. 资源耗尽
   Token 用完、超时、内存不足...
   → 通常: 强制终止，保存当前状态，可从断点恢复

错误恢复策略:
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  错误 → 分类 → ┌→ 可重试错误: 自动重试（最多 N 次）          │
│                │                                             │
│                ├→ 可恢复错误: 调整策略，换种方式               │
│                │  (例: 命令不存在 → 用其他命令替代)           │
│                │                                             │
│                ├→ 需要人类干预: 暂停，请求用户输入             │
│                │  (例: 需要密码或 API Key)                    │
│                │                                             │
│                └→ 致命错误: 安全终止，报告失败原因             │
│                   (例: 磁盘满了)                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 总结

```
单 Agent 架构模式的演进:

  ReAct (基础)
    │
    ├── + 规划能力 → Plan-and-Execute
    │
    ├── + 自我反思 → Reflexion
    │
    ├── + 树搜索 → LATS
    │
    └── + 扩展思考 → Extended Thinking ReAct (当前最佳实践)

当前工业最佳实践:
  ReAct + Extended Thinking + 上下文管理 + 错误恢复

这是所有后续高级架构（Skills、Multi-Agent、Teams）的基础。
```
