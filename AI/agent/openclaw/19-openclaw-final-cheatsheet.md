# OpenClaw 面试前速记清单

## 一句话定义

OpenClaw 不是普通聊天机器人，而是一个 **本地优先、支持多渠道接入、支持多 Agent 隔离、支持工具与记忆扩展的个人 AI 助手平台**。

## 面试开场万能版

如果面试官问“你最近研究了什么项目”，可以直接这样答：

> 我最近重点研究了 OpenClaw。它是一个本地优先的 AI Agent 平台，不只是一个聊天框，而是把多渠道接入、会话管理、Agent 运行时、工具调用、记忆系统和插件体系整合到了一起。  
> 我觉得它最大的价值在于工程化做得比较完整，尤其是 Gateway 控制平面、Session 隔离、Tool Loop、Memory 和 Plugin 体系，比较像真实可落地的 AI 助手系统，而不是单轮 Demo。

## 必背关键词

- Local-first
- Multi-channel Unified
- Multi-Agent Isolation
- Plugin-everything
- Gateway Control Plane
- Session Key
- Per-session Queue
- Tool Loop
- Prompt Assembly
- Memory + Context Engine

## 架构三层记忆法

### 1. 控制平面：Gateway

负责：

- 消息接入
- 路由分发
- 会话管理
- 插件加载
- 认证鉴权
- 健康检查
- WebSocket/HTTP 服务

一句话记忆：

> Gateway 是整个系统的中枢和统一入口。

### 2. 执行平面：Agent Runtime

负责：

- 解析请求
- 组装上下文
- 调用模型
- 执行工具循环
- 处理流式输出
- 管理子 Agent

一句话记忆：

> Runtime 不是一次调模型，而是一个有状态的 Agent Loop。

### 3. 扩展平面：Plugins / Memory / Context Engine / Tools

负责：

- 模型 Provider 扩展
- 渠道扩展
- 记忆扩展
- 上下文策略扩展
- 工具扩展

一句话记忆：

> OpenClaw 的扩展能力不是外挂，而是体系化设计。

## 高频必答题短答案

### 1. 为什么要有 Gateway？

因为多渠道、多客户端、多 Agent 共享很多状态，如果不集中管理，session、routing、health、security 都会乱。Gateway 提供统一控制平面，保证状态一致和安全边界统一。

### 2. 为什么同时有 WebSocket 和 HTTP？

WebSocket 适合实时双向事件和控制协议；HTTP 适合 webhook、REST API、OpenAI 兼容接口、健康检查和 UI 服务。两者职责不同，不是重复设计。

### 3. `dmPolicy` 和 `dmScope` 区别是什么？

`dmPolicy` 管“谁能私聊进来”，是访问控制；`dmScope` 管“进来后落到哪个 session”，是上下文隔离。

### 4. 为什么要做 per-session 串行队列？

因为同一会话上下文不能并发乱写，否则工具结果、历史消息和状态统计都会冲突。串行是为了保证 session 一致性。

### 5. Runtime 和普通调模型的区别是什么？

普通调用是单次请求；Runtime 是完整执行引擎，要处理上下文组装、模型调用、工具循环、流式输出、错误恢复和生命周期管理。

### 6. 为什么系统提示要动态组装？

因为不同 Agent、不同工具、不同 workspace、不同运行时环境需要不同 prompt。动态组装更精确、更节省 token，也更利于维护。

### 7. 为什么子 Agent 用 minimal prompt？

因为子 Agent 只需要处理局部任务，不应该继承全部上下文。这样能减少 token 成本，降低噪声，提高聚焦度。

### 8. 为什么要把 Memory 做成文件优先？

因为文件可见、可编辑、可审计，更适合个人助手场景。向量库和索引更像加速层，不是唯一事实来源。

### 9. Pruning 和 Compaction 有什么区别？

Pruning 是每轮调用前的轻量瘦身，主要裁剪大工具结果；Compaction 是长期会话快超 token 时的重压缩，用于维持长会话可持续运行。

### 10. 为什么插件体系很重要？

因为通道、模型、工具、记忆和上下文策略都可能变化。插件化让核心稳定，把变化能力放到边界层。

## 你必须能顺口说出的 8 个亮点

- 它不是聊天机器人，而是长期在线的 AI 助手系统。
- 它是本地优先，不完全依赖云端托管。
- 它统一了 Telegram、WhatsApp、Slack、Discord、CLI、Web UI 等多入口。
- 它支持多 Agent，每个 Agent 都有独立边界。
- 它把 Gateway 做成统一控制平面。
- 它把 Runtime 做成完整 Agent Loop，而不是单次模型调用。
- 它重视 session 隔离、权限边界和高风险操作控制。
- 它把 Memory、Context Engine 和 Plugin 体系做成了可扩展架构。

## 面试官一追问就容易出彩的点

- 不要只说“它支持工具调用”，要说“它有稳定的工具循环和运行时编排”。
- 不要只说“它有记忆”，要说“它把文件记忆作为主表达，向量检索作为增强层”。
- 不要只说“它支持多用户”，要说“它通过 `dmScope` 控制上下文隔离，避免串话”。
- 不要只说“它很安全”，要说“它把认证、配对、限流、工具权限和 session isolation 放在统一安全模型里”。
- 不要只说“它可扩展”，要说“它通过 Plugin SDK、hooks、slots 和导入边界控制来保证扩展有秩序”。

## 容易答虚的地方

- 不要把它讲成“又一个 AI 聊天产品”。
- 不要只讲模型，不讲 Gateway、Session、Runtime。
- 不要把 `dmPolicy` 和 `dmScope` 混为一谈。
- 不要把 Pruning 和 Compaction 说成同一件事。
- 不要把插件理解成简单 npm 包扩展。
- 不要忽视安全和权限边界。

## 30 秒总结模板

> OpenClaw 是一个本地优先的个人 AI 助手平台，它把多渠道接入、会话管理、Agent 运行时、工具调用、记忆系统和插件体系整合在一起。  
> 我觉得它最值得学习的是三点：统一 Gateway 控制平面、工程化的 Agent Runtime，以及清晰的插件和上下文边界设计。

## 3 分钟总结模板

> 我最近研究了 OpenClaw，它不是普通聊天机器人，而是更接近真实落地的 AI Agent 系统。  
> 它的第一大特点是本地优先和多渠道统一，能够同时接 Telegram、WhatsApp、Slack、Discord、CLI 和 Web UI。  
> 第二个特点是它有比较成熟的控制平面，也就是 Gateway，负责消息接入、session 管理、路由分发和安全策略。  
> 第三个特点是它的 Agent Runtime 不是简单调一次模型，而是一个完整执行引擎，支持上下文组装、工具循环、流式输出、子 Agent 和错误恢复。  
> 此外，它的记忆系统、上下文引擎和插件体系也做得比较清晰，说明它不是 Demo，而是能持续演进的架构。  
> 所以我研究它最大的收获，不是某个单点功能，而是学到了 AI Agent 系统在工程化落地时，控制面、执行面和扩展面应该怎么拆。

## 最后 5 分钟看什么

- 先看“一句话定义”
- 再看“架构三层记忆法”
- 再背“高频必答题短答案”
- 最后读一遍“30 秒总结模板”和“3 分钟总结模板”

## 一句话收尾

如果只能记一句，就记这句：

> OpenClaw 的价值不只是功能多，而是它把 AI 助手系统的复杂性，放在了正确的工程边界里。
