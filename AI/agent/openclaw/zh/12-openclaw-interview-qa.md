# OpenClaw 高频面试题与答案（92 题）

## 说明

- 本文基于 `AI/agent/openclaw` 目录下已有研究文档，以及 OpenClaw 官方仓库的 `README.md`、`AGENTS.md` 和部分核心源码整理。
- 目标不是罗列冷门 API，而是覆盖面试里**高频、重点、容易追问**的架构题、设计题和源码理解题。
- 答案尽量只写已确认信息，避免凭经验脑补实现细节。

## 一、基础认知与整体架构

### 01. OpenClaw 是什么？
答：OpenClaw 是一个运行在用户自己设备上的个人 AI 助手平台。它可以接入 WhatsApp、Telegram、Slack、Discord 等多种消息渠道，也能接入 macOS、iOS、Android 等设备能力，让同一个助手跨渠道工作。

### 02. 为什么官方会说“Gateway 只是控制平面，真正的产品是 assistant”？
答：因为 Gateway 负责的是控制面能力，比如通道接入、会话、路由、工具、事件分发和控制 UI；但用户真正感知到的，是运行在这些能力之上的助手本身。换句话说，Gateway 是基础设施，assistant 才是最终交互对象。

### 03. OpenClaw 的核心设计理念有哪些？
答：可以概括为四点：本地优先、多通道统一、多 Agent 隔离、插件化扩展。它不是把所有能力都硬编码在核心里，而是尽量把通道、模型、工具、记忆等做成插件。

### 04. OpenClaw 为什么强调 Local-first？
答：因为它处理的往往是真实私聊、设备能力和本地工作区数据。Gateway 默认绑定本机地址，很多状态也保存在本地，这样能降低隐私暴露面，同时让助手更像“运行在我自己机器上的个人系统”。

### 05. OpenClaw 的核心技术栈是什么？
答：核心代码主要是 TypeScript ESM，运行时推荐 Node 24，最低支持 Node 22.19+。工程形态是 pnpm monorepo，测试以 Vitest 为主，Control UI 使用 Lit，插件通过 Plugin SDK 扩展。

### 06. OpenClaw 支持哪些交互面？
答：一类是消息渠道，比如 WhatsApp、Telegram、Slack、Discord、Signal、iMessage、WebChat 等；另一类是设备与客户端，比如 macOS、iOS、Android、CLI、Web UI、Canvas。面试里要抓住一点：它不是单聊天框产品，而是“多入口统一助手”。

### 07. OpenClaw 的大模块可以怎么划分？
答：可以分成 Gateway、Agent Runtime、Session、Routing、Plugins、Context Engine、Memory、Channels、Nodes、Canvas、CLI/UI 几层。面试回答时，先说控制平面，再说执行平面，再说扩展平面，层次会很清楚。

### 08. 为什么说 OpenClaw 是“Plugin Everything”？
答：因为很多能力都不是写死在核心里的，通道、LLM Provider、记忆系统、搜索能力、工具甚至上下文引擎，都可以通过插件注册。这样核心保持精简，扩展能力交给插件生态。

### 09. OpenClaw 为什么对插件导入边界要求很严格？
答：因为插件如果直接深度依赖核心 `src/**`，核心一改就会把插件全部打碎。它要求插件通过 `openclaw/plugin-sdk/*` 这样的公共表面访问能力，本质上是在控制耦合和稳定 ABI。

### 10. OpenClaw 里的 Agent 可以怎么理解？
答：Agent 不是一段 prompt，而是一个隔离的工作单元。它有自己的 workspace、session、auth profiles、skills、memory 和工具权限，所以多个 Agent 可以同时存在，但彼此相对独立。

## 二、Gateway 与控制平面

### 11. Gateway 在 OpenClaw 里主要负责什么？
答：它负责通道连接、WebSocket API、HTTP 服务、会话管理、消息路由、Cron、插件运行时、健康检查、设备配对等。可以把它理解为整个系统的交通枢纽和控制中枢。

### 12. 为什么 OpenClaw 通常是一台机器只跑一个 Gateway？
答：因为很多外部渠道本身就不适合被多个实例同时持有，例如某些聊天平台只允许一个活跃会话。把所有通道和状态集中在一个 Gateway，也能减少状态分裂和竞争问题。

### 13. Gateway 为什么同时使用 WebSocket 和 HTTP？
答：WebSocket 负责实时双向控制，比如连接、事件推送、Agent 流式输出；HTTP 则负责 webhook、OpenAI 兼容接口、Control UI、Canvas 和健康检查。一个偏实时控制，一个偏接口与托管。

### 14. Gateway 默认为什么绑定 `127.0.0.1:18789`？
答：这是安全优先的默认值。先只对本机开放，能显著降低暴露在局域网或公网的风险；如果要远程访问，再通过 TLS、Tailscale、SSH 隧道等方式显式开放。

### 15. OpenClaw 的 WebSocket 协议里，最重要的三类帧是什么？
答：`req`、`res`、`event`。`req` 是客户端请求，`res` 是对应响应，`event` 是 Gateway 主动推送的事件，比如 health、presence、agent streaming 等。

### 16. WebSocket 握手阶段为什么要求第一帧就是 `connect`？
答：因为 Gateway 需要在真正开放业务能力前确认客户端身份、角色和认证信息。这样能把认证放到协议入口，避免“先连上、再慢慢试权限”的松散模型。

### 17. 为什么 WebSocket 会采用 `noServer: true` 这种模式？
答：这样 HTTP 的 `upgrade` 过程可以被 Gateway 自己接管，在握手完成前就做认证、限流和路径分流。另一个好处是可以把 Canvas 的 WS 路径单独分流出去。

### 18. OpenClaw 的认证体系有哪些典型模式？
答：解析后的 Gateway 认证模式主要有 `none`、`token`、`password`、`trusted-proxy`。此外还有设备签名、device token、bootstrap token、Tailscale header 等配套机制，说明它是多层认证而不是单一 token。

### 19. Gateway 的认证限流默认策略是什么？
答：官方源码里的默认值是 1 分钟窗口内最多 10 次失败，超过后锁定 5 分钟，并按 `{scope}:{ip}` 维度记录。它还是内存型滑动窗口限流器，不依赖外部存储。

### 20. 为什么 localhost 默认不参与认证锁定？
答：因为本地 CLI 或本机控制端是最常见使用方式，如果把 loopback 也锁死，用户很容易把自己卡住。OpenClaw 默认豁免本地回环地址，本质上是在安全和可用性之间做本地优待。

### 21. 为什么“缺失凭据”不一定要消耗限流配额？
答：因为“没带 token”和“带了错误 token”在安全语义上不一样。OpenClaw 的做法是，缺失凭据直接拒绝，但不记一次失败；真正的凭据不匹配才记录失败，这样可以减少被探测流量恶意消耗配额。

### 22. Gateway 的 HTTP Pipeline 可以怎么概括？
答：可以概括为多阶段处理链，覆盖 health、hooks、tools invoke、sessions、Slack callback、OpenResponses、chat completions、Canvas、plugin routes、Control UI。核心思想不是“一个大路由表”，而是按处理优先级分阶段决策。

### 23. Channel 连接失败后，OpenClaw 的恢复策略是什么？
答：它会做指数退避重启，而不是无脑死循环重连。文档中给出的策略是初始 5 秒、指数因子 2、最大 5 分钟，并且有最大重试次数限制。

### 24. Gateway 为什么还要做健康监控？
答：因为真实聊天渠道经常会断线、过期或卡死，不能只看“进程活着”。健康监控会结合事件新鲜度、重启次数等信息判断通道是否真的健康，并把结果推送给客户端。

## 三、Agent Runtime 与执行循环

### 25. OpenClaw 的 Agent 执行入口有哪些？
答：至少有两类常见入口：Gateway 的 `agent` / `agent.wait` RPC，以及 CLI 的 `openclaw agent --message ...`。也就是说，它既能被远程控制，也能本地命令式触发。

### 26. OpenClaw 的 Agent Loop 大致怎么走？
答：先接收请求并解析会话，再准备工作区和系统提示，然后调用模型；如果模型返回工具调用，就执行工具并把结果回填，再次调用模型，直到产出最终文本回复。这是典型的 agentic loop。

### 27. 为什么 OpenClaw 要做“每个 session 串行 + 全局并发控制”两级队列？
答：每个 session 串行是为了防止同一个对话里多个回合同步改写上下文；全局并发控制是为了防止整个系统同时跑太多 Agent 把资源打爆。一个解决一致性，一个解决吞吐与资源上限。

### 28. `collect`、`steer`、`followup` 三种队列模式怎么区分？
答：`collect` 是默认模式，会把排队消息合并后再跑下一轮；`followup` 是等当前回合结束后，再把新消息作为下一轮输入；`steer` 更激进，会在工具调用边界尽量把新消息“插入”当前执行过程。面试时要强调：它们的区别不是“排不排队”，而是“如何处理中途新消息”。

### 29. 为什么 `agent.wait` 超时不等于杀死 Agent？
答：因为它只是“等待接口”的超时，不是运行本体的超时。这样调用方可以决定自己等多久，但不会因为一个等待请求超时就误伤后台还在正常跑的 Agent。

### 30. OpenClaw 的系统提示为什么是“组装出来的”，而不是写死一大段？
答：因为不同运行时上下文差异很大，比如工具列表、工作区、技能、沙箱、日期、心跳配置都可能变化。动态组装的方式能做到“同一套框架，不同上下文自动注入”。

### 31. 系统提示里常见会包含哪些部分？
答：常见包括工具说明、安全护栏、Skills 列表、工作目录、文档路径、Bootstrap 文件注入、沙箱信息、日期、Reply Tags、Heartbeats、Runtime 信息和 Reasoning 信息等。面试里不用死背 13 段，但要知道它是结构化拼装的。

### 32. 工作区里的哪些文件会被注入到提示中？
答：典型包括 `AGENTS.md`、`SOUL.md`、`TOOLS.md`、`IDENTITY.md`、`USER.md`、`HEARTBEAT.md`、`BOOTSTRAP.md`、`MEMORY.md`。这些文件让 Agent 的行为更像“带人格和长期上下文的工作体”，而不是一段临时 prompt。

### 33. 为什么 OpenClaw 不把“当前精确时间”直接硬编码进每次 prompt？
答：因为这会破坏 prompt cache 的稳定前缀。它更倾向把日期或时区这种较稳定信息放进系统提示，而把真正的“当前时间戳”交给 `session_status` 之类的工具在需要时获取。

### 34. `full`、`minimal`、`none` 三种 prompt mode 的意义是什么？
答：`full` 适合主 Agent，信息最完整；`minimal` 适合子 Agent，省略大量不必要上下文；`none` 则只保留极简身份信息。它的本质是按任务粒度控制上下文成本。

### 35. 为什么子 Agent 常用 `minimal` 模式？
答：因为子 Agent 往往是为某个局部任务服务，不需要继承主 Agent 的全部人格、技能和记忆。把上下文压缩到最小，可以减少 token 成本，也降低上下文噪声。

### 36. OpenClaw 的模型失败恢复为什么是“两阶段”？
答：第一阶段先在同一 Provider 内轮换 auth profile，第二阶段才跨 Provider 做 model fallback。这样可以优先用“同一家、不同凭据”修复问题，只有这一层也失败了才切换模型来源。

### 37. Auth profile 轮换为什么对 session 做“固定”而不是每次都变？
答：因为固定可以提升 prompt cache 友好性和行为稳定性。只有在 session 重置、压缩完成，或者当前 profile 进入 cooldown / disabled 后，才解除固定。

### 38. OpenClaw 为什么需要 cooldown 机制？
答：因为被限流、计费失败或类似问题时，立刻重复打同一个 profile 通常没有意义。cooldown 能让系统短时间内绕开坏掉的凭据，优先尝试其他可用 profile。

### 39. Block Streaming 和 Preview Streaming 的区别是什么？
答：Block Streaming 是把“完整文本块”分批发给聊天通道；Preview Streaming 更像对临时消息做更新或编辑，让用户先看到生成中的预览。前者偏稳定输出，后者偏实时体验。

### 40. 分块器为什么要尽量避免在代码围栏中间切断？
答：因为那样会破坏 Markdown 和代码块结构，接收端显示会很难看。OpenClaw 的分块策略会尽量在段落、换行、句子、空白边界切分，必要时还会补开补关代码围栏。

### 41. Thinking 模式在 OpenClaw 里是什么？
答：它是对不同 Provider 推理预算的一层统一抽象。比如用户在 OpenClaw 里发 `/think high`，底层会映射到各家 Provider 自己的参数，例如 Anthropic 的扩展思考或 OpenAI 的 reasoning effort。

### 42. 子 Agent 在 OpenClaw 里如何创建？
答：通常通过 `sessions_spawn` 这类工具创建。它可以拥有独立会话、独立工具白名单、独立模型，必要时还可以指向不同工作区。

### 43. 为什么子 Agent 要单独走 `subagent lane`？
答：因为子 Agent 本质上也是资源消耗者。如果和主对话完全共用同一并发池，复杂任务很容易互相阻塞；独立 lane 能把主对话和子任务的资源竞争分开。

## 四、Session、Routing 与消息流

### 44. OpenClaw 里的 sessionKey 有什么作用？
答：它用来唯一标识“这条消息属于哪个会话上下文”。只有 sessionKey 稳定，系统才能把消息正确路由到同一段历史、同一组会话文件和同一条串行执行队列。

### 45. `dmScope` 常见有哪些模式？
答：常见有 `main`、`per-peer`、`per-channel-peer`、`per-account-channel-peer`。它们的区别在于：同一个用户、同一渠道、不同账号之间，到底共享一个 DM 会话，还是拆分成更细粒度的会话。

### 46. 为什么 `dmScope="main"` 在多用户场景有风险？
答：因为不同人的私聊可能被合并到同一个主会话里。这样模型在回答 Bob 时，理论上可能引用 Alice 之前的上下文，所以多用户场景更推荐 `per-channel-peer` 或更细粒度隔离。

### 47. `identityLinks` 是为了解决什么问题？
答：它是用来把“同一个人跨多个渠道”的身份合并起来。比如同一个用户既用 Telegram 又用 Discord 联系助手，就可以通过 identityLinks 把两边映射到同一身份。

### 48. OpenClaw 的会话存储为什么常用 `sessions.json + JSONL transcript`？
答：`sessions.json` 适合保存会话索引、元信息和当前映射关系，JSONL 则适合按时间顺序追加完整转录。一个适合查表，一个适合追溯历史，两者职责清晰。

### 49. Session Reset 常见有哪些策略？
答：最常见的是按天重置和按空闲时间重置，也可以组合使用。思路很简单：有些对话应该按“自然天”切开，有些则应该按“长时间没人说话”切开。

### 50. Pruning 和 Compaction 的区别是什么？
答：Pruning 是在每次调用模型前，优先修剪旧工具结果，减少上下文膨胀；Compaction 是在上下文接近极限时，用摘要或引擎策略把旧历史压缩掉。一个是轻量清理，一个是重型压缩。

### 51. 为什么 Pruning 主要针对工具结果，而不是随便删用户消息？
答：因为用户消息和助手关键回复通常决定了语义主线，删错了会直接破坏对话连贯性；而工具结果往往体积大、冗余高，更适合优先裁剪。这是“优先删大而不删主线”的设计。

### 52. OpenClaw 为什么强调“Gateway 是 Session 的唯一数据源”？
答：因为远程模式下，真实的 session 文件和 token 统计都在 Gateway 所在机器上。客户端如果自己去读本地文件，很容易读到过期状态，甚至根本读不到真实数据。

### 53. DM 策略里的 `pairing`、`allowlist`、`open` 有什么区别？
答：`pairing` 是默认更安全的模式，陌生人先拿配对码，批准后才能聊；`allowlist` 是只有白名单用户能聊；`open` 则是谁都能私聊，安全风险最高。面试里最好明确说：`open` 是显式 opt-in，不应当当成默认值。

### 54. OpenClaw 的多 Agent 路由为什么说是“最具体优先”？
答：因为它不是简单按顺序扫一遍，而是有层级化匹配优先级。比如精确 peer 绑定肯定比 channel 级兜底更具体，所以要优先命中更细粒度的规则。

### 55. OpenClaw 的 bindings 大致有哪些优先级层？
答：可以概括为 peer 精确匹配、线程继承、Discord guild+roles、Discord guild、Slack team、accountId 精确匹配、accountId 通配符，最后才是默认 Agent。面试时不一定要背全 8 层，但要讲清“粒度越细，优先级越高”。

### 56. 同一优先级下如果多个 binding 都匹配，谁赢？
答：配置顺序里第一个匹配项获胜。也就是说，除了“优先级层级”，bindings 本身仍然保留顺序语义。

### 57. 群聊里 OpenClaw 为什么默认用 mention gating？
答：因为群聊消息量大，如果对所有消息都响应，很容易吵屏、跑偏甚至浪费 token。默认只在被 @ 或命中 mentionPatterns 时激活，更符合群聊助手的使用习惯。

### 58. 多账号路由里，`accountId` 省略和写成 `*` 的区别是什么？
答：省略通常只匹配默认账号；写成 `*` 则表示跨所有账号的通道级回退规则。这个差异在多 bot、多号码接入时非常重要。

## 五、插件、工具与扩展

### 59. OpenClaw 的插件一般从哪些来源被发现？
答：常见是四类来源：配置里显式指定的路径、workspace 下的插件目录、OpenClaw 自带 bundled 插件、用户全局目录下安装的插件。这个设计兼顾了本地开发、项目内插件和全局安装。

### 60. 插件为什么必须带 `openclaw.plugin.json`？
答：因为清单文件定义了插件的身份、配置 schema、能力类型、是否默认启用等元信息。没有 manifest，核心就无法安全地发现、校验和注册插件。

### 61. `kind` 字段在插件系统里有什么意义？
答：它决定插件属于哪类能力，比如 memory、context-engine、channel、provider 等。对 memory 和 context-engine 这类类型来说，`kind` 还会影响 slot 排他选择。

### 62. 什么是 Slot 系统？为什么需要它？
答：Slot 系统用来保证某些能力同一时间只有一个“生效实现”，典型就是 memory 和 context engine。否则两个记忆插件同时抢主控权，或者两个上下文引擎同时决定 compaction，就会产生语义冲突。

### 63. OpenClaw 默认的两个核心 slot 值是什么？
答：官方源码里 `memory` 的默认 slot 是 `memory-core`，`contextEngine` 的默认 slot 是 `legacy`。这两个默认值非常适合面试时举例说明“框架有默认实现，但可以被替换”。

### 64. `applyExclusiveSlotSelection` 做了什么？
答：它会把对应 slot 切换到新插件，并自动禁用同类型、但不再拥有其他 slot 的插件。也就是说，切 slot 不只是改一个字符串，还会顺带修正启用状态，避免多个同类插件同时生效。

### 65. OpenClaw 的插件钩子为什么要分执行模式？
答：因为不同钩子的语义不一样。有些适合并行 fire-and-forget，有些需要按顺序修改上下文，有些只能第一个认领者生效，还有些必须同步跑在热路径里。

### 66. 常见的四类钩子执行模式是什么？
答：Void、Modifying、Claiming、Synchronous。面试时可以这样记：通知型、修改型、认领型、热路径同步型。

### 67. 为什么 `before_prompt_build` 这类钩子被视为高风险？
答：因为它可以直接改 prompt，本质上就是“可编程 prompt 注入”。OpenClaw 会把这类能力纳入额外策略控制，只允许显式授权的插件做这件事。

### 68. OpenClaw 的工具为什么常用“上下文感知工厂”注册，而不是直接注册死对象？
答：因为同一个工具在不同 Agent、不同 session、不同 channel 下，可用性和配置都可能不同。工厂模式可以根据当前上下文动态决定返回工具、返回多个工具，或者直接返回不可用。

### 69. Per-agent 工具权限是怎么控制的？
答：通常通过 `tools.allow` 和 `tools.deny` 控制，支持通配符，并且 `deny` 优先。也就是说，它的思路更像策略系统，而不是简单“开/关总开关”。

### 70. OpenClaw 为什么需要 Exec Approval 这种人类审批机制？
答：因为 shell、系统命令、设备控制这类能力风险太高，不能完全交给模型自决。审批流的本质是把高风险动作变成人在回路的受控操作。

### 71. `message` 工具和普通 assistant 文本回复有什么关系？
答：`message` 工具是“主动发消息”的显式动作，而不是普通自然语言输出。OpenClaw 会追踪这类工具发送，避免 assistant 又重复说一遍“我已经发出去了”，从而减少重复消息。

### 72. `session_status` 这个工具为什么很重要？
答：因为它除了会话状态外，还能提供当前时间戳等运行时信息。很多场景下，系统不希望把易变信息直接写死在 prompt 里，所以会让模型按需调用这个工具。

### 73. `memory-core` 现在只是两个简单工具吗？
答：不只是。源码里它除了注册 `memory_search` 和 `memory_get`，还注册了 memory capability、CLI 命令、内置 embedding provider 适配和与 memory flush 相关的能力；只是对 Agent 最直接暴露的核心工具，通常首先关注那两个。

## 六、Context Engine 与 Memory

### 74. Context Engine 在 OpenClaw 里负责什么？
答：它负责“怎么把上下文交给模型”。具体包括消息摄入、上下文组装、压缩、回合后维护，以及在需要时参与子 Agent 生命周期。

### 75. Context Engine 的四阶段生命周期怎么记？
答：最常见的记法是 Ingest、Assemble、Compact、AfterTurn。也就是先收消息，再组装上下文，必要时压缩，最后做回合后的持久化或维护。

### 76. `ownsCompaction` 这个标志为什么重要？
答：它决定压缩是由运行时内置逻辑主导，还是由上下文引擎自己全权接管。这个标志一旦为真，压缩生命周期、hooks 时机和后处理路径都会不同。

### 77. 为什么 OpenClaw 要为旧版上下文引擎做 `sessionKey/prompt` 兼容代理？
答：因为历史上的第三方引擎实现可能不认识新参数。官方源码通过代理包装和错误模式识别，在必要时自动剥离新参数重试，从而尽量保证旧插件不被新接口瞬间打断。

### 78. 上下文引擎注册表为什么用了 `Symbol.for()` 级别的全局单例？
答：因为构建产物可能包含多份 dist chunk，如果只用普通模块变量，不同 chunk 会拿到不同注册表。`Symbol.for()` 可以把状态挂到进程级全局，避免“同一个进程里出现多个注册中心”。

### 79. 公共 SDK 的 `registerContextEngine()` 为什么不能抢占核心 ID？
答：因为核心默认引擎是框架稳定性的基础，不能让普通第三方插件随意覆盖。源码里明确限制了公共注册入口不能声明核心 slot 的默认 ID，比如 `legacy`。

### 80. OpenClaw 为什么说“记忆首先是文件，而不是数据库”？
答：因为它最基础、最可解释的记忆形式就是工作区里的 Markdown 文件，比如 `MEMORY.md` 和 `memory/*.md`。高级搜索、向量索引只是建立在这些可见文件之上的加速层。

### 81. `MEMORY.md` 和 `memory/YYYY-MM-DD.md` 的定位有什么区别？
答：`MEMORY.md` 更适合长期、结构化、跨时间的稳定记忆；`memory/YYYY-MM-DD.md` 更像每日工作日志或阶段性记录。一个偏“长期知识”，一个偏“时间线流水”。

### 82. `memory-core` 和 `memory-lancedb` 的主要区别是什么？
答：`memory-core` 更偏文件型、内置型记忆工具和检索能力；`memory-lancedb` 则在此基础上强化了向量化记忆、自动召回、自动捕获和忘记等能力。可以理解为“基础文件记忆”和“更智能的向量记忆插件”的区别。

### 83. OpenClaw 的记忆检索为什么会做混合搜索？
答：因为只做向量搜索容易漏掉精确关键词，只做关键词搜索又难覆盖语义相近表达。混合搜索把向量相似度和 BM25 文本相关性结合起来，召回质量通常更稳。

### 84. 预压缩的 memory flush 为什么是个好设计？
答：因为一旦进入 compaction，旧上下文会被摘要替换，很多细节可能就不在了。先用一个静默回合提醒 Agent 把值得长期保留的信息写进 memory 文件，相当于先做“知识出仓”，再做“上下文瘦身”。

### 85. 为什么向量记忆的自动捕获更应该优先看用户消息，而不是助手消息？
答：因为自动把模型自己的输出再写回记忆，容易造成自我污染和错误放大。把用户输入作为主要捕获对象，更符合“记住用户偏好、事实和明确指令”的目标。

### 86. 面试时如何一句话总结 OpenClaw 的 Memory 设计？
答：可以说：**OpenClaw 采用“文件可见、索引加速、压缩前回写”的记忆方案，既保留可解释性，又提供语义检索能力。**

## 七、工程化与系统设计追问

### 87. OpenClaw 为什么使用 pnpm monorepo？
答：因为它有核心包、UI、几十个插件、客户端和兼容包，天然适合 workspace 管理。这样既能共享依赖，又能把插件保持为独立包。

### 88. OpenClaw 为什么强调统一构建图？
答：因为核心、Plugin SDK、扩展入口和一些运行时单例需要在一套一致的构建图里被编译，避免重复发射导致单例失效。简单说，就是防止“同一个全局状态被打包成多份”。

### 89. TypeBox 在 OpenClaw 里主要解决什么问题？
答：它把运行时 Schema、TypeScript 类型和部分跨端模型生成串起来了。这样配置校验、协议定义和类型系统能共用一套来源，减少手写重复。

### 90. 为什么 OpenClaw 的配置系统要支持热重载？
答：因为通道、工具、cron、hooks 等配置都可能在运行中调整，完全重启成本高。热重载能让可热更新的部分尽量在线生效，不可热更新的再走重启路径。

### 91. 为什么 OpenClaw 会把 prompt cache 稳定性视为“正确性 + 性能”问题？
答：因为一旦请求前缀频繁变化，缓存命中率就会下降，成本和延迟都会上升。它不仅是优化项，也会影响系统在高频、多轮对话下的实际体验。

### 92. 如果面试官让你总结 OpenClaw 最有代表性的三个设计点，你会怎么答？
答：第一，Gateway 作为统一控制平面，把多渠道、多设备、多会话收束到一个中心；第二，Agent Runtime 通过队列、工具循环和 failover 形成稳定执行内核；第三，Plugin + Context + Memory 让系统既可扩展，又能维持长期个性化能力。

## 复习建议

- 第一轮先背 `01-24`，这是最容易被问到的基础架构题。
- 第二轮重点吃透 `25-58`，这是最容易拉开差距的运行时、会话和插件题。
- 如果面试偏源码或系统设计，再补 `59-92`。
