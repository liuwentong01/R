# OpenClaw 2 分钟口述提纲（对应 36 题）

## 使用方法

- 这份不是完整答案，而是“口述骨架”。
- 每题建议按 `定义 -> 为什么这样设计 -> 怎么实现 -> 优缺点/总结` 的顺序说。
- 配合 `13-openclaw-classic-detailed-interview-qa.md` 一起看，效果最好。

## 一、整体认知与架构总览

### 01. OpenClaw 是什么？
- 开场一句：OpenClaw 不是普通聊天 bot，而是运行在用户设备上的个人 AI 助手平台。
- 先讲四个特征：Local-first、多入口统一、多 Agent、插件化。
- 再讲和普通 bot 的区别：不只回答问题，还接消息渠道、设备能力、长期记忆和工具执行。
- 最后总结：它更像“个人 AI 操作系统”或“个人智能中枢”。

### 02. OpenClaw 整体架构怎么讲？
- 三层讲法：控制平面 Gateway、执行平面 Agent Runtime、扩展平面 Plugins/Memory/Context Engine。
- 再补一条真实消息链路：消息接入 -> 路由 -> session -> runtime -> 工具循环 -> 回复发送。
- 强调它不是模型直连消息平台，而是中间有统一控制层。
- 收尾：这样做的好处是状态统一、安全可控、便于扩展。

### 03. 为什么采用 Gateway 中心化控制平面？
- 先抛核心观点：为了统一状态、统一安全入口、统一编排。
- 展开状态问题：session、routing、presence、health、token usage 不能分散维护。
- 展开安全问题：认证、配对、限流、RBAC、工具权限都适合集中在入口层。
- 总结：代价是有一个核心大模块，但换来一致性和可观测性。

### 04. 为什么同时用 WebSocket 和 HTTP？
- 先讲职责分工：WS 做实时双向控制，HTTP 做接口、兼容层和托管资源。
- WS 例子：connect、presence、health、agent streaming。
- HTTP 例子：webhook、OpenAI 兼容接口、Canvas、Control UI、healthz。
- 总结：不是协议重复，而是控制面和服务面的拆分。

### 05. 为什么强调 Local-first？
- 开场：Local-first 不只是部署方式，而是产品哲学。
- 讲三点：隐私优先、控制权在用户手里、方便接本地工作区和设备能力。
- 举例：默认绑定 `127.0.0.1:18789`，session 和记忆文件都在本地。
- 收尾：本地优先决定了它更像“私人助手”，不是纯云端 bot。

### 06. 为什么支持多 Agent？
- 先讲单助手的问题：职责混乱、记忆污染、权限过大。
- 再讲多 Agent 的隔离点：workspace、session、memory、skills、auth profiles、tools。
- 举例：工作助手和家庭助手分开，消息和权限都隔离。
- 总结：多 Agent 解决的核心不是并发，而是职责和安全边界。

## 二、Gateway、消息链路与路由

### 07. 一条消息的完整链路怎么走？
- 四段式：入站标准化 -> Gateway 控制逻辑 -> Agent Runtime 执行 -> 出站发送。
- 入站控制重点：去重、防抖、DM 策略、bindings 路由、sessionKey、队列。
- Runtime 重点：system prompt、history、tools、模型调用、工具循环。
- 出站重点：streaming、分块、平台格式化、通道发送。

### 08. 为什么路由要“最具体优先”？
- 先讲问题：粗粒度规则容易抢走本应精确命中的消息。
- 再讲思路：peer 精确匹配优先于 account/channel 级兜底。
- 补一句：这是路由规则的层级设计，不是简单顺序匹配。
- 总结：目的是让多 Agent 路由稳定、可预测。

### 09. `dmPolicy` 和 `dmScope` 区别是什么？
- 一句话区分：`dmPolicy` 管“能不能进来”，`dmScope` 管“进来后归哪个会话”。
- `dmPolicy` 讲 pairing / allowlist / open。
- `dmScope` 讲 main / per-peer / per-channel-peer / per-account-channel-peer。
- 最后强调：很多泄露问题不是访问控制问题，而是 session 隔离问题。

### 10. 为什么 `dmScope="main"` 多用户场景有风险？
- 开场：它会把多个 DM 来源折叠进同一个主会话。
- 举风险例子：Alice 的上下文被 Bob 继承。
- 再讲它适合什么场景：单用户自用、多入口统一。
- 收尾：多用户时应改成 `per-channel-peer` 或更细粒度模式。

### 11. 为什么 Gateway 是 Session 的唯一数据源？
- 先纠正误区：session 不只是 JSONL 文件。
- 讲它还包含映射关系、usage、元数据、当前状态。
- 说明为什么客户端不能直接读本地文件：远程模式、不一致、状态不完整。
- 总结：文件是存储介质，Gateway 才是 session 语义持有者。

### 12. 为什么要做去重和防抖？
- 先分开两个问题：去重解决重复投递，防抖解决连续短消息合并。
- 讲渠道重连带来的重复问题。
- 讲用户短时间连续发消息导致的碎片化响应问题。
- 收尾：一个保正确性，一个保体验和资源效率。

## 三、Agent Runtime 与执行模型

### 13. Agent Loop 怎么讲？
- 定义：带工具循环的嵌入式 Agent 执行引擎。
- 按阶段讲：接收请求 -> 上下文准备 -> 模型调用 -> 工具循环 -> 后处理。
- 中间重点突出：模型可能多轮调用，不是一次请求就结束。
- 收尾：这是长期运行的 runtime，不是简单 prompt 调用。

### 14. 为什么要做两级队列？
- 先讲 per-session 串行：避免同一会话并发写上下文。
- 再讲全局并发：避免多个 session 同时跑爆系统资源。
- 点出两者分别对应一致性和吞吐量。
- 总结：这是生产级 Agent 系统必须有的调度能力。

### 15. `collect`、`followup`、`steer` 适合什么场景？
- `followup`：最稳，当前回合结束后再处理新消息。
- `collect`：默认更自然，把排队消息合并成一个 followup。
- `steer`：最灵活，中途检测新消息并尽量转向。
- 收尾：三者不是优劣，而是不同交互风格和任务类型的选择。

### 16. 为什么系统提示要动态组装？
- 先讲固定大 prompt 的问题：不精确、会膨胀。
- 再讲动态注入的内容：工具、工作区、skills、日期、沙箱、bootstrap 文件。
- 补一句：还能更好地维持 prompt cache 稳定前缀。
- 总结：提示词是运行时构造物，不是硬编码文案。

### 17. 为什么子 Agent 常用 `minimal`？
- 先讲子 Agent 的定位：解决局部任务，不需要完整人格包袱。
- 再讲裁剪项：skills、memory、reply tags、heartbeats 等。
- 说明收益：更省 token、噪声更少、执行更聚焦。
- 收尾：子 Agent 的上下文应该按任务边界收缩。

### 18. 为什么要做 auth profile 轮换和 model failover？
- 开场：真实模型调用会遇到限流、失效、账单和 provider 异常。
- 两层恢复：先同 provider 内轮换 profile，再跨 provider fallback。
- 补一句 cooldown：让坏 profile 暂时退后。
- 总结：这是 runtime 容错系统，不只是配置技巧。

### 19. Block Streaming 和 Preview Streaming 区别？
- Block Streaming：正式回复分块发送，偏稳定。
- Preview Streaming：生成中预览，偏交互体验。
- 再讲为什么都要：平台能力不同，场景不同。
- 补细节：代码围栏、字符上限、消息编辑能力都会影响策略。

## 四、Session、上下文与 Memory

### 20. Session 为什么重要？
- 开场：Session 不只是聊天历史，而是对话一致性的最小单元。
- 讲它绑定的内容：消息来源、会话边界、历史、队列、存储位置。
- 再讲高级能力：reset、pruning、compaction、memory flush 都围绕 session。
- 总结：sessionKey 是长期对话状态的主索引。

### 21. Pruning 和 Compaction 区别？
- 先讲层级：pruning 是每轮前的轻量整理，compaction 是接近上限时的重型压缩。
- pruning 重点：优先修剪大工具结果，不改磁盘原始转录。
- compaction 重点：摘要旧历史，更新 session 状态，触发更多后续动作。
- 总结：一个是日常保洁，一个是阶段性搬家。

### 22. 为什么说“记忆首先是文件”？
- 开场：记忆主表达形式是 Markdown 文件。
- 讲优点：可见、可编辑、可解释、便于调试。
- 再讲数据库/向量库的定位：检索加速层，不是记忆本体。
- 总结：这比纯黑盒向量记忆更适合个人助手。

### 23. `memory-core` 和 `memory-lancedb` 区别？
- `memory-core`：基础记忆能力，文件驱动，提供搜索、读取、CLI、flush 等底座。
- `memory-lancedb`：向量搜索、自动召回、自动捕获、去重、forget 等增强能力。
- 讲关系：不是完全替代，更像底座和增强层。
- 总结：一个保基础可用性，一个保智能化和召回质量。

### 24. 为什么混合检索更合理？
- 先讲纯向量的短板：对精确关键词不稳。
- 再讲纯关键词的短板：对语义近似差。
- 说明 OpenClaw 的做法：向量 + BM25 + 权重合并 + MMR + 时间衰减。
- 总结：平衡语义召回和字面命中，更适合真实记忆场景。

### 25. memory flush 为什么巧妙？
- 开场：compaction 之前很多细节会丢。
- 核心动作：先触发一个静默回合，把重要信息写进 memory 文件。
- 讲价值：把短期上下文主动晋升到长期记忆。
- 总结：这是短期记忆和长期记忆之间的迁移桥梁。

### 26. Context Engine 是什么？
- 定义：决定模型看到什么上下文、何时压缩、如何维护转录的策略层。
- 生命周期：Ingest、Assemble、Compact、AfterTurn。
- 强调抽象目的：让上下文管理从硬编码逻辑变成可替换能力。
- 总结：它是 runtime 之外的“上下文策略引擎”。

### 27. `ownsCompaction` 为什么重要？
- 开场：它会改变压缩路径，不只是一个说明字段。
- `false`：继续走内置 compaction，必要时可委托。
- `true`：引擎自己拥有 compaction 语义，生命周期编排都会变化。
- 总结：它决定“谁拥有压缩的控制权”。

## 五、插件系统、工具系统与安全

### 28. 为什么坚持 Plugin Everything？
- 先讲现实：通道、模型、工具、记忆、Canvas、Browser 都高度可变。
- 不插件化的后果：核心膨胀、每次加能力都改核心。
- 插件化的收益：核心变平台，变化被隔离出去。
- 收尾：复杂度增加了，但这是为了规模化可维护。

### 29. 为什么插件导入边界要严格？
- 先讲源码级耦合的风险：核心无法自由演进。
- 再讲插件间耦合的风险：形成伪插件架构。
- 说明 OpenClaw 的做法：通过 `openclaw/plugin-sdk/*` 暴露公共契约。
- 总结：边界控制是平台化的前提。

### 30. Hook 系统为什么要分执行模式？
- 先讲四类语义：通知型、修改型、认领型、热路径同步型。
- 举例：agent_end、before_prompt_build、inbound_claim、tool_result_persist。
- 说明为什么不能都统一成 async 串行：性能和语义都会出问题。
- 总结：成熟平台不仅开放扩展点，还要定义扩展点的运行语义。

### 31. 什么是 Slot 系统？
- 定义：同一类主能力同一时刻只能有一个主实现。
- 举例：memory slot 默认 `memory-core`，contextEngine slot 默认 `legacy`。
- 讲切换时的行为：更新 slot，并在必要时禁用同类插件。
- 总结：它防止多个插件同时接管同一职责。

### 32. 为什么工具系统强调上下文感知工厂？
- 开场：工具可用性本来就和 agent、session、owner、sandbox 强相关。
- 讲工厂返回什么：单工具、多个工具、不可用。
- 讲收益：工具策略可按运行时上下文精细适配。
- 总结：工具不是全局常量，而是运行时能力投影。

### 33. 为什么 per-agent 工具权限和 Exec Approval 是必须的？
- 先讲风险：read/write/exec/browser/system.run 都可能很危险。
- 两层控制：agent 级 allow/deny + 高风险动作人工审批。
- 举例：家庭助手和工作助手的权限绝不能相同。
- 总结：这是 AI Agent 落地的安全底线，不是可选优化。

### 34. 为什么 OpenClaw 的安全模型不是“加个 token”就够？
- 开场：它面对的是现实消息平台和高权限设备能力。
- 列层次：传输安全、认证、设备身份、配对、DM 策略、限流、Origin、RBAC、工具权限、沙箱。
- 强调安全贯穿消息、设备、工具、执行全链路。
- 总结：OpenClaw 的亮点是系统化建模攻击面。

## 六、工程化、可维护性与系统设计总结

### 35. 为什么使用 pnpm monorepo？
- 先讲项目规模：核心、UI、几十个插件、apps、兼容包。
- 讲 monorepo 收益：统一版本、依赖共享、边界清晰。
- 再讲 OpenClaw 的工程特点：统一构建图、全局单例稳定性。
- 总结：它不是简单多包仓库，而是面向平台化的工程结构。

### 36. OpenClaw 最值得学习的三个设计点是什么？
- 第一：Gateway 统一控制平面。
- 第二：Agent Runtime 的工程化执行模型，包括队列、流式、容错、subagent。
- 第三：插件体系和上下文/记忆体系的边界设计。
- 收尾：OpenClaw 的价值不只是功能多，而是“变化被正确安放”。
