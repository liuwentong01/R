# Agent / Skills / Teams 架构演进全景

> 从聊天机器人到多智能体协作：AI Agent 架构的完整演进路径
> 撰写时间：2026-03-23

## 为什么写这篇

2023-2026 年是 AI Agent 架构爆发式发展的三年。从最初的 ChatGPT 对话式交互，到 AutoGPT 的全自主 Agent 实验，再到 OpenAI Swarm、Anthropic Claude Code、LangGraph、CrewAI 等成熟框架的落地——**Agent 架构经历了从 "单体对话" → "工具增强" → "技能组合" → "团队协作" 的四阶段演进**。

本系列文档系统梳理这一演进过程，既有理论分析也有架构设计，帮助理解：
- 每一代架构解决了什么问题？创造了什么新问题？
- 不同框架的设计哲学差异在哪？
- 当下 Agent 架构的最佳实践是什么？

## 演进时间线

```
2022.11  ChatGPT 发布
    │    "对话式 AI" 时代开启
    │
2023.02  ChatGPT Plugins
    │    首次引入 Tool Use 概念
    │
2023.03  AutoGPT / BabyAGI
    │    "全自主 Agent" 实验，引爆行业想象
    │
2023.06  OpenAI Function Calling
    │    Tool Use 标准化，Agent 开发有了稳定基础
    │
2023.10  OpenAI Assistants API
    │    有状态 Agent + 内置工具（Code Interpreter, Retrieval）
    │
2023.11  Anthropic Tool Use Beta
    │    Claude 获得工具调用能力
    │
2024.01  CrewAI 发布
    │    Multi-Agent Role-Playing 框架
    │
2024.01  LangGraph 发布
    │    图状态机驱动的 Agent 编排
    │
2024.03  Devin (Cognition AI)
    │    首个 "AI 软件工程师"，长任务自主执行
    │
2024.06  Claude Code 发布
    │    Agentic Loop + 本地文件系统 + 权限模型
    │
2024.10  OpenAI Swarm (实验性)
    │    轻量 Multi-Agent 编排，Handoff 模式
    │
2024.11  Anthropic MCP 协议
    │    工具/资源标准化协议，Agent 生态互联
    │
2025.01  OpenAI Agents SDK
    │    生产级 Multi-Agent + Guardrails + Tracing
    │
2025.03  OpenAI Responses API
    │    融合 Tools/Skills 的新一代 Agent API
    │
2025.06  Anthropic Claude Code 开源
    │    Agent 架构最佳实践公开
    │
2025.09  Agent-to-Agent (A2A) 协议
    │    Google 牵头的跨 Agent 通信标准
    │
2025.12  Claude Teams / Cursor Background Agents
    │    多 Agent 持续运行 + 人机协作
    │
2026.01  OpenAI Codex (Cloud Agent)
    │    云端沙箱 Agent，Tasks API
    │
2026.03  ← 你在这里
    │    Agent 架构趋于成熟，"Skills + Teams" 成为主流范式
```

## 架构演进四阶段

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AI Agent 架构演进四阶段                                │
│                                                                             │
│  Phase 1          Phase 2          Phase 3          Phase 4                │
│  ─────────        ─────────        ─────────        ─────────              │
│  对话式 AI         工具增强 Agent    Skills 组合      Multi-Agent Teams     │
│  (2022-2023)      (2023-2024)      (2024-2025)      (2025-2026)           │
│                                                                             │
│  ┌───────┐        ┌───────┐        ┌───────┐        ┌───────────────┐     │
│  │       │        │  LLM  │        │  LLM  │        │  Orchestrator │     │
│  │  LLM  │        │   +   │        │   +   │        │     LLM       │     │
│  │       │        │ Tools │        │Skills │        │  ┌───┐┌───┐   │     │
│  └───────┘        └───────┘        │  +    │        │  │A1 ││A2 │   │     │
│  纯文本             函数调用          │Tools │        │  └───┘└───┘   │     │
│  输入/输出          读写世界          └───────┘        │  ┌───┐┌───┐   │     │
│                                     模块化能力         │  │A3 ││A4 │   │     │
│                                                       │  └───┘└───┘   │     │
│  能力边界:          能力边界:         能力边界:         └───────────────┘     │
│  语言理解           +外部操作         +可扩展           协作式智能             │
│  语言生成           +信息获取         +领域专精         分工 + 通信 + 共识     │
│                                                                             │
│  代表:              代表:            代表:             代表:                  │
│  ChatGPT           Function Call    Claude Code      OpenAI Agents SDK     │
│  Claude Chat       Assistants API   Cursor Agent     CrewAI / AutoGen      │
│                    ReAct 模式       Skills/Plugins    A2A 协议              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 文档索引

| 文件 | 内容 | 重点级别 |
|------|------|----------|
| [01-chatbot-to-agent.md](./01-chatbot-to-agent.md) | 从聊天机器人到智能代理：范式转变的深层逻辑 | 入门必读 |
| [02-single-agent-patterns.md](./02-single-agent-patterns.md) | 单 Agent 核心架构模式（ReAct、Plan-and-Execute、Reflexion） | 核心 |
| [03-tool-use-evolution.md](./03-tool-use-evolution.md) | 工具使用机制演进（Plugins → Function Calling → MCP） | 核心 |
| [04-skills-architecture.md](./04-skills-architecture.md) | Skills 架构详解（能力封装、动态加载、组合策略） | 核心 |
| [05-multi-agent-teams.md](./05-multi-agent-teams.md) | Multi-Agent Teams 架构（角色、通信、协作模式） | 核心 |
| [06-orchestration-patterns.md](./06-orchestration-patterns.md) | 编排模式深度分析（Router、Pipeline、Graph、Swarm） | 核心 |
| [07-framework-comparison.md](./07-framework-comparison.md) | 主流框架架构对比（Agents SDK、LangGraph、CrewAI、Claude Code） | 重要 |
| [08-future-trends.md](./08-future-trends.md) | 未来趋势：Agent 原生应用与操作系统 | 参考 |

## 核心概念速查

| 概念 | 定义 | 首次出现 |
|------|------|----------|
| **Agentic Loop** | LLM 在循环中交替 "思考" 和 "行动"，直到任务完成 | ReAct (2022) |
| **Tool Use** | LLM 通过结构化 API 调用外部函数/工具 | ChatGPT Plugins (2023) |
| **Function Calling** | LLM 原生输出结构化函数调用参数 | OpenAI (2023.06) |
| **Skill** | 可复用的、有明确接口的 Agent 能力单元 | Claude Code Skills |
| **Handoff** | 一个 Agent 将控制权转移给另一个 Agent | OpenAI Swarm (2024) |
| **Guardrail** | 对 Agent 输入/输出的验证和安全约束 | OpenAI Agents SDK |
| **MCP** | Model Context Protocol，工具和资源的标准化协议 | Anthropic (2024.11) |
| **A2A** | Agent-to-Agent Protocol，跨 Agent 通信标准 | Google (2025) |
| **Orchestrator** | 协调多个 Agent 协作的中心调度器 | Multi-Agent 系统 |
| **Context Window** | LLM 单次能处理的最大 token 数，Agent 架构的根本约束 | 始终存在 |
