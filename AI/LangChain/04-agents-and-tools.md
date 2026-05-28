# 04 - Agent 与工具调用

## Agent 是什么

在 LangChain 中，Agent 可以理解为“模型驱动的工具调用循环”。

普通 Chain 的流程由开发者固定，而 Agent 的下一步由模型决定：

```
用户任务
  │
  ▼
模型判断是否需要工具
  │
  ├── 不需要：直接回答
  │
  └── 需要：生成工具调用参数
          │
          ▼
       执行工具
          │
          ▼
       工具结果回到模型
          │
          ▼
       继续判断，直到完成任务
```

官方对 Agent 的核心定义很朴素：模型在循环中调用工具，直到任务完成。

## Agent 适合什么场景

适合：

- 用户问题开放，无法提前固定流程。
- 需要多步推理和多次工具调用。
- 需要根据中间结果决定下一步。
- 需要访问多个外部系统。
- 任务有探索性，比如研究、排障、数据分析。

不适合：

- 固定分类、摘要、翻译。
- 简单 RAG 问答。
- 强确定性的审批流程。
- 成本和延迟非常敏感的路径。

经验法则：先用固定流程，固定流程表达不了再用 Agent。

## Tool 是什么

Tool 是 Agent 可调用的外部能力。

它可以是：

- HTTP API
- 数据库查询
- 搜索引擎
- 文件系统
- 计算函数
- 业务服务
- 检索器

一个工具包含三类信息：

| 信息 | 用途 |
| --- | --- |
| 名称 | 模型选择工具时识别用途 |
| 描述 | 告诉模型什么时候该调用 |
| 参数 schema | 告诉模型如何构造参数 |

## 工具设计原则

### 1. 工具要小而清晰

坏例子：

```text
business_tool: 处理业务问题
```

好例子：

```text
get_order_status: 根据订单 ID 查询订单状态
refund_order: 根据订单 ID 和退款原因发起退款
search_policy_docs: 查询售后政策文档
```

模型越容易理解工具边界，调用越稳定。

### 2. 参数要明确

不要让工具接收一个大而模糊的字符串参数。尽量使用结构化参数：

```python
@tool
def get_order_status(order_id: str) -> str:
    """根据订单 ID 查询订单当前状态。"""
    ...
```

### 3. 工具描述要写调用时机

工具 docstring 不只是给人看，也是给模型看的。

```python
@tool
def search_docs(query: str) -> str:
    """当需要查询项目文档、API 说明或历史决策时使用。输入应是具体搜索问题。"""
    ...
```

### 4. 工具结果要短而有用

不要把大量原始 JSON 直接塞回模型。工具结果应提取关键字段，并保留必要来源。

### 5. 有副作用的工具要谨慎

例如发邮件、下单、退款、删除数据。建议增加：

- 人工确认
- dry-run 模式
- 权限校验
- 幂等 key
- 操作日志

## 最小 Agent 示例

```python
from langchain.agents import create_agent
from langchain.tools import tool

@tool
def get_weather(city: str) -> str:
    """查询指定城市的天气。"""
    return f"{city} 今天晴，温度 20 到 28 摄氏度。"

agent = create_agent(
    model="gpt-4o-mini",
    tools=[get_weather],
    system_prompt="你是一个简洁的生活助手。",
)

result = agent.invoke({
    "messages": [
        {"role": "user", "content": "北京今天天气怎么样？"}
    ]
})
```

真实应用中，工具通常会访问外部 API 或数据库，而不是返回硬编码字符串。

## Agent Harness

可以把 Agent Harness 理解成包住 agent loop 的运行时环境。它包括：

- 模型
- 系统提示词
- 工具列表
- 状态
- 上下文
- 中间件
- 检查点
- 观测和日志

LangChain 的 `create_agent` 提供了高层入口，适合快速创建一个可调用工具的 Agent。

## State 和 Context

Agent 不只是“输入一句话，输出一句话”。它通常需要两类信息：

### State

State 是 Agent 执行过程中会被更新的状态，例如：

- messages
- 当前任务计划
- 工具调用结果
- 已检索文档
- 中间结论

### Runtime Context

Runtime Context 是每次运行传入的外部上下文，例如：

- user_id
- tenant_id
- API token
- feature flag
- 当前环境

State 更像“任务内部状态”，Runtime Context 更像“调用这次任务的外部配置”。

## Memory

Agent 的记忆常见有两层：

| 类型 | 作用 |
| --- | --- |
| 短期记忆 | 当前 thread 的消息历史和中间状态 |
| 长期记忆 | 跨会话保存用户偏好、事实、历史决策 |

不要把所有历史都塞给模型。更好的方式是：

- 最近消息直接保留。
- 旧消息压缩成摘要。
- 重要事实写入外部存储。
- 需要时检索回来。

## Middleware

Middleware 是 Agent 工程化的关键扩展点。它可以用于：

- 动态选择模型
- 动态裁剪工具列表
- 注入系统提示词
- 上下文压缩
- 工具调用前校验
- 工具调用后清洗结果
- 模型 fallback
- 成本统计
- 日志 tracing
- 安全 guardrails

可以把 Middleware 理解为 Agent Loop 周围的一组拦截器。

## Agent 的可靠性问题

Agent 强大，但天然有不确定性。常见问题：

- 调错工具
- 参数填错
- 调用次数过多
- 在没有信息时编答案
- 被工具返回内容 prompt injection
- 有副作用操作缺少确认
- token 和成本失控

改进方式：

- 工具数量不要太多。
- 工具描述写清楚。
- 工具参数 schema 严格。
- 对高风险工具加人工确认。
- 对工具结果做清洗。
- 给 Agent 设置最大迭代次数。
- 使用 LangSmith 或日志系统观察每一步。

## Agent 和 LangGraph

LangChain Agent 适合快速搭建通用工具调用循环。LangGraph 适合把 Agent 放进更明确的工作流里。

例如一个研究助手：

```
LangChain Agent:
用户问题 → 模型自行搜索/读取/总结 → 输出报告

LangGraph Workflow:
规划节点 → 检索节点 → 分析节点 → 人工审核节点 → 写报告节点
```

如果你发现自己需要显式控制“下一步必须去哪、什么时候暂停、失败后怎么恢复”，就该考虑 LangGraph。

## 入门练习

1. 写一个只会调用计算器工具的 Agent。
2. 写一个能查询本地文档的 Agent。
3. 给工具加入参数校验和错误返回。
4. 限制 Agent 最多调用 3 次工具。
5. 给一个“删除数据”工具增加人工确认流程。
6. 用 LangSmith 或日志记录每次工具调用。
