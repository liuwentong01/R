# 第 1 阶段：模型调用

## 目标

先跑通 LangChain 最小闭环，理解一个 LLM 应用最基础的输入、调用和输出方式。

需要掌握：

- Chat Model
- System / User / Assistant messages
- Prompt Template
- `invoke`
- `stream`

## Demo 列表

| 文件 | 重点 |
| --- | --- |
| [01_simple_invoke.ts](./01_simple_invoke.ts) | 调用 Chat Model 回答一个问题 |
| [02_system_prompt.ts](./02_system_prompt.ts) | 使用 system、user、assistant 三类消息组织上下文 |
| [03_prompt_template.ts](./03_prompt_template.ts) | 用 Prompt Template 接收变量 |
| [04_streaming.ts](./04_streaming.ts) | 消费流式输出 |

## 运行

在 `AI/LangChain` 目录下执行：

```bash
npm run stage01

# 或逐个运行
npm run stage01:01
npm run stage01:02
npm run stage01:03
npm run stage01:04
```

## Chat Model 和普通 LLM 的区别

普通 LLM 通常接收一个字符串 prompt，然后返回一个字符串。它更像传统文本补全接口。

Chat Model 接收的是一组带角色的 messages，例如 system、user、assistant、tool。它更适合现代对话应用和 Agent，因为它能清楚表达：

- 哪些内容是系统规则。
- 哪些内容是用户输入。
- 哪些内容是历史助手回复。
- 哪些内容是工具调用结果。

所以在 LangChain 新应用里，通常优先使用 Chat Model。

## 为什么 system message 比字符串拼接更清晰

把系统规则直接拼进用户问题里，模型和开发者都很难区分“规则”和“问题”：

```text
你是一个教学助手，回答要简洁。用户问题：什么是 LangChain？
```

使用 system message 后，角色边界更明确：

```text
system: 你是一个教学助手，回答要简洁。
user: 什么是 LangChain？
```

这样有几个好处：

- 代码结构更清晰，不需要手动拼接长字符串。
- 多轮对话中，系统规则可以稳定放在最前面。
- 后续加入历史消息、工具消息时，消息边界不会混乱。
- 更贴近现代 Chat Model 的原生输入格式。

## 本阶段完成标准

完成本阶段后，你应该能：

- 用 `invoke` 调用 Chat Model。
- 用 messages 表达 system、user、assistant 角色。
- 用 Prompt Template 参数化提示词。
- 用 `stream` 消费流式输出。
- 解释 Chat Model 和普通 LLM 的区别。
- 解释 system message 为什么比普通字符串拼接更清晰。
