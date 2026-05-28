# 02 - 核心组件

## 总览

LangChain 的核心不是某一个类，而是一组可以组合的组件。入门时先掌握以下概念：

```
Prompt / Messages
      │
      ▼
Chat Model
      │
      ▼
Output Parser

再往外扩展：

Documents → Embeddings → Vector Store → Retriever
Tools → Agent
Runnable / LCEL → 统一组合方式
```

## Models

模型是 LangChain 应用的推理和生成核心，常见有三类：

| 类型 | 作用 | 示例 |
| --- | --- | --- |
| Chat Model | 接收消息列表，返回消息 | 对话、Agent、工具调用 |
| LLM | 接收字符串，返回字符串 | 传统补全场景 |
| Embedding Model | 把文本转成向量 | RAG、语义搜索、相似度匹配 |

现代应用通常优先使用 Chat Model，因为它天然支持 system/user/assistant/tool messages，也更适合工具调用。

### 最小示例

```python
from langchain.chat_models import init_chat_model

model = init_chat_model("deepseek-v4-flash", model_provider="deepseek")

response = model.invoke("用一句话解释 LangChain")
print(response.content)
```

## Messages

聊天模型的输入不是普通字符串，而是一组消息：

| 消息类型 | 作用 |
| --- | --- |
| SystemMessage | 定义角色、边界、行为准则 |
| HumanMessage | 用户输入 |
| AIMessage | 模型回复 |
| ToolMessage | 工具执行结果 |

消息结构让应用可以明确区分“规则”“用户问题”“历史回复”“工具结果”，这比拼接字符串更可靠。

```python
from langchain_core.messages import HumanMessage, SystemMessage

messages = [
    SystemMessage("你是一个耐心的前端教学助手。"),
    HumanMessage("什么是闭包？"),
]

response = model.invoke(messages)
```

## Prompt Templates

Prompt Template 用来把变量填入提示词模板，避免到处手写字符串拼接。

```python
from langchain_core.prompts import ChatPromptTemplate

prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个{role}。回答要简洁。"),
    ("human", "{question}"),
])

messages = prompt.invoke({
    "role": "JavaScript 面试官",
    "question": "解释事件循环",
})
```

好的 Prompt Template 应该把可变信息参数化，把稳定规则固化下来。

## Output Parsers

模型输出默认是自然语言，但业务系统常需要结构化数据。Output Parser 用于把模型输出解析成指定格式。

常见策略：

- 简单文本：直接读取 `response.content`。
- JSON 输出：约束模型返回 JSON，再解析。
- Pydantic 结构化输出：用 schema 约束字段。
- 函数调用输出：让模型以工具参数形式返回结构。

结构化输出越严格，越要考虑失败重试和错误提示。

## Runnable

Runnable 是 LangChain 的统一执行接口。很多组件都实现了 Runnable：

- Prompt 可以 `invoke`
- Model 可以 `invoke`
- Parser 可以 `invoke`
- 组合后的链路也可以 `invoke`

这带来统一的调用方式：

```python
result = runnable.invoke(input)
```

常见方法：

| 方法 | 作用 |
| --- | --- |
| `invoke` | 单次同步调用 |
| `ainvoke` | 单次异步调用 |
| `batch` | 批量调用 |
| `stream` | 流式输出 |

## LCEL

LCEL 是 LangChain Expression Language，用管道式语法把多个 Runnable 组合起来。

```python
from langchain_core.output_parsers import StrOutputParser

chain = prompt | model | StrOutputParser()

answer = chain.invoke({
    "role": "前端教学助手",
    "question": "用例子解释防抖和节流的区别",
})
```

可以把 `|` 理解成 Unix 管道：前一步输出作为后一步输入。

## Documents

Document 是 LangChain 处理外部知识的基本单位：

```python
Document(
    page_content="文档正文",
    metadata={"source": "xxx.pdf", "page": 3}
)
```

RAG 应用中，metadata 很重要，因为它用于引用来源、过滤检索范围、排查错误答案。

## Retrievers

Retriever 的职责是：给定一个自然语言 query，返回相关 Document。

```python
docs = retriever.invoke("LangChain 的 Runnable 是什么？")
```

Retriever 不负责生成答案，只负责找资料。生成答案是 Chat Model 的职责。

## Tools

Tool 是给模型使用的外部能力。它可以是普通 Python 函数，也可以是数据库查询、HTTP API、搜索接口、文件读取器。

```python
from langchain.tools import tool

@tool
def add(a: int, b: int) -> int:
    """计算两个整数之和。"""
    return a + b
```

工具描述非常关键。模型会根据函数名、参数类型和 docstring 判断什么时候调用工具。

## Memory / State

LangChain 中的记忆通常不是“让模型真的记住”，而是把必要历史或状态重新放进上下文。

常见方式：

- 消息历史：保留最近几轮对话。
- 摘要记忆：把长历史压缩成摘要。
- 外部存储：把用户偏好、业务状态保存到数据库。
- Checkpoint：在 Agent 或 LangGraph 中恢复上下文。

记忆的本质是上下文管理，不是魔法。

## Middleware

在新版 Agent 体系中，Middleware 是扩展 Agent 行为的重要机制。它可以介入模型调用、工具选择、上下文压缩、重试、fallback、日志记录、安全校验等环节。

可以把 Agent 理解成循环，把 Middleware 理解成这个循环周围的拦截器和增强器。

## 组件选择建议

| 需求 | 优先组件 |
| --- | --- |
| 调模型回答问题 | Chat Model + Prompt |
| 固定流程处理文本 | LCEL / Runnable |
| 返回结构化数据 | Output Parser / Structured Output |
| 私有知识问答 | Loader + Splitter + Retriever + Model |
| 连接外部动作 | Tool |
| 模型自主多步执行 | Agent |
| 复杂状态工作流 | LangGraph |
