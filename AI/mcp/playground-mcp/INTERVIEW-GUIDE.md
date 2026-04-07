# Playground MCP Server 面试讲解提纲

## 一句话定位

这是一个用于教学和面试演示的最小可运行 MCP Server，我用它把 MCP 的 3 类核心能力一次讲清楚：`Tools`、`Resources`、`Prompts`。

## 适合怎么开场

可以先这样讲：

> 我没有一上来就做复杂业务插件，而是先做了一个 `playground-mcp`。它的作用是把 MCP 最小闭环跑通，让我能清楚解释一个 MCP Server 是怎么启动、怎么注册能力、怎么被客户端发现和调用的。

## 2 分钟讲解提纲

1. 先讲目标
   这个服务不是为了接业务，而是为了把协议本身讲透。

2. 再讲 3 类能力
   - `Tools`：提供动作能力，比如 `echo`、`sum_numbers`
   - `Resources`：提供只读上下文，比如 `playground://notes/mcp-core`
   - `Prompts`：提供模板化提示，比如 `mcp-interview-answer`

3. 再讲运行流程
   - 入口文件解析 CLI 参数
   - 通过 `StdioServerTransport` 启动 stdio 通信
   - `server.ts` 注册 `tools/list`、`tools/call`、`resources/list`、`resources/read`、`prompts/list`、`prompts/get`
   - Cursor 或 Claude Code 作为 Host 连接后，先发现能力，再按需调用

4. 最后讲价值
   这个服务让我把 MCP 从“概念理解”变成“可运行理解”，后面做文件类和 HTTP 类插件时就只是往这个骨架里填能力。

## 5 分钟展开讲法

### 1. 为什么先做 Playground

- 如果一开始就做 Confluence、数据库、HTTP 这类真实插件，容易把注意力放在业务细节上
- 但面试官很多时候先问的是：你真的理解 MCP 协议本身吗
- 所以我先做了一个最小教学型服务，把协议流程拆开讲

### 2. 我是怎么设计 Tools 的

- `echo`
  最简单，用来演示一次最小的 `tools/call`
- `sum_numbers`
  用来演示结构化输入和结构化输出
- `explain_json_schema`
  用来演示服务端如何做参数解析、异常兜底和可读结果输出

这里可以强调一点：

> Tool 的重点不只是“能执行”，而是 description 和 input schema 要写清楚，因为 LLM 是否能正确使用它，很大程度取决于工具描述。

### 3. 我是怎么设计 Resources 的

- 我用了两个静态资源 URI
- 一个讲 MCP 核心概念，一个讲 Tool 设计清单
- 这样可以清楚区分：Resource 是只读数据，不是动作能力

### 4. 我是怎么设计 Prompts 的

- 我提供了一个 `mcp-interview-answer`
- 它不是直接替模型回答，而是返回一段结构化提示词
- 这样就能讲清楚 Prompt 在 MCP 里的定位：它是“可复用模板”，不是普通工具函数

### 5. 为什么选择 stdio

- 本地调试最简单
- Host 直接拉起子进程即可
- 不需要额外部署 HTTP 服务
- 对 Cursor、Claude Code 这种桌面或本地 Agent 集成很友好

## 高频追问与回答

### 1. 你为什么把 `Tools`、`Resources`、`Prompts` 放在一个服务里？

因为这个服务的目标是教学，不是业务隔离。把三类能力放在同一个最小项目里，面试时可以在一个例子里把 MCP 的能力边界讲完整。如果是生产场景，我会根据权限域和业务域拆分。

### 2. `Tools` 和 `Resources` 的本质区别是什么？

`Tools` 更像函数调用，适合执行动作，可能有副作用；`Resources` 更像只读文件或数据源，重点是提供上下文，不应该承担动作语义。这个区分对模型使用方式和安全边界都很重要。

### 3. `Prompts` 为什么不是普通 Tool？

因为 Prompt 的职责是返回一段可复用的提示模板，而不是执行业务动作。它更像“预制指令”，适合沉淀固定问法、审查模板、分析模板这类场景。

### 4. 为什么说 Tool 的 `description` 很重要？

因为 Host 最终会把工具描述和 schema 暴露给模型。模型是否会选对工具、是否会传对参数，和 `description` 的质量强相关。很多工具“不会用”，问题其实不在实现，而在描述不清。

### 5. 这个服务里最想展示的工程点是什么？

我最想展示的是：MCP 不只是一个协议名词，而是一套能力注册和调用机制。我能把它做成真实可运行的服务，并清楚区分不同能力类型的职责边界。

### 6. 如果继续扩展这个 Playground，你会怎么做？

我会加两类内容：一类是更复杂的 Prompt 模板；另一类是带分页或动态生成的 Resource。这样可以继续练习协议能力，但仍保持它是教学型项目，而不是变成业务型插件。

## 面试时可以顺手补的一句话

> `playground-mcp` 解决的是“把 MCP 讲明白”的问题，而不是“把业务做复杂”的问题。它是我后面所有 MCP 插件的认知底座。
