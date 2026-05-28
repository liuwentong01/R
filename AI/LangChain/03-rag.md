# 03 - RAG 知识库问答

## RAG 是什么

RAG 是 Retrieval-Augmented Generation，中文常译为“检索增强生成”。

它的核心思想是：不要指望模型凭记忆回答所有问题，而是在回答前先从外部知识库检索相关资料，再把资料作为上下文交给模型生成答案。

```
用户问题
  │
  ▼
检索相关文档
  │
  ▼
把文档片段放进 Prompt
  │
  ▼
模型基于上下文回答
```

## 为什么需要 RAG

大模型有几个天然限制：

- 训练数据可能过时。
- 不知道企业内部知识。
- 对具体文档细节容易幻觉。
- 上下文窗口有限，不能一次塞入全部资料。
- 业务系统需要答案可追溯到来源。

RAG 通过“按需检索”缓解这些问题。

## RAG 完整链路

```
离线阶段：

原始资料
  │
  ├── Loader 加载
  ├── Splitter 切分
  ├── Embedding 向量化
  └── Vector Store 存储

在线阶段：

用户问题
  │
  ├── Retriever 检索相关片段
  ├── Prompt 注入上下文
  ├── Chat Model 生成答案
  └── 返回答案和来源
```

## 1. Document Loader

Loader 负责把不同来源的数据加载成 Document。

常见来源：

- Markdown / TXT / HTML / PDF
- 网页
- Notion / Confluence / Google Drive
- 数据库
- Git 仓库

Document 通常包含：

- `page_content`：正文内容
- `metadata`：来源、页码、标题、URL、创建时间等

metadata 不要省略，它是排查检索结果和展示引用来源的关键。

## 2. Text Splitter

文档通常不能整篇塞进向量库，需要切成片段。

切分要平衡两个目标：

- 片段太小：上下文不完整，模型难以理解。
- 片段太大：检索不精准，浪费 token。

常见参数：

| 参数 | 含义 |
| --- | --- |
| `chunk_size` | 每个片段的大致长度 |
| `chunk_overlap` | 相邻片段重叠长度，避免上下文断裂 |
| separator | 按段落、标题、句子或字符切分 |

建议优先按语义结构切分，比如 Markdown 标题、段落、列表，而不是固定字符数暴力切分。

## 3. Embedding

Embedding 模型把文本转换成向量。语义相近的文本，向量距离更近。

RAG 中通常需要两次 embedding：

1. 离线阶段：把文档片段转成向量存入向量库。
2. 在线阶段：把用户问题转成向量，用于相似度检索。

注意：文档 embedding 和 query embedding 应使用兼容的模型。

## 4. Vector Store

Vector Store 用于存储向量和原始 Document，并支持相似度搜索。

常见选择：

- 本地实验：FAISS、Chroma
- 生产服务：Pinecone、Milvus、Weaviate、pgvector、Elastic

选型要考虑：

- 数据规模
- 更新频率
- metadata 过滤能力
- 部署复杂度
- 查询延迟
- 权限隔离

## 5. Retriever

Retriever 是在线检索入口。它根据用户问题返回相关 Document。

常见检索策略：

| 策略 | 说明 |
| --- | --- |
| Similarity Search | 按向量相似度取 top-k |
| MMR | 兼顾相关性和多样性，避免结果重复 |
| Metadata Filter | 按业务字段过滤，如项目、权限、时间 |
| Hybrid Search | 结合关键词检索和向量检索 |
| Rerank | 先粗召回，再用重排模型精选 |

简单 RAG 可以从 top-k similarity search 开始，复杂场景再加 hybrid 和 rerank。

## 6. Generation

生成阶段要把检索结果注入 Prompt。

一个基础 Prompt 模板：

```text
你是一个严谨的知识库问答助手。
请只基于给定上下文回答问题。
如果上下文不足以回答，请说“资料中没有足够信息”。

上下文：
{context}

问题：
{question}
```

关键约束：

- 明确要求“只基于上下文回答”。
- 上下文不足时允许拒答。
- 要求引用来源时，context 中必须带 source metadata。

## 最小代码示例

```python
from langchain.chat_models import init_chat_model
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

model = init_chat_model("gpt-4o-mini", model_provider="openai")

prompt = ChatPromptTemplate.from_template("""
你是一个严谨的知识库问答助手。
请只基于给定上下文回答问题；如果上下文不足，请说明无法从资料中确认。

上下文：
{context}

问题：
{question}
""")

def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

def answer_question(question: str):
    docs = retriever.invoke(question)
    chain = prompt | model | StrOutputParser()
    return chain.invoke({
        "context": format_docs(docs),
        "question": question,
    })
```

这个示例省略了文档加载和向量库构建，但展示了在线问答的核心结构。

## 2-Step RAG 和 Agentic RAG

### 2-Step RAG

固定流程：

```
用户问题 → 检索 → 生成答案
```

优点：

- 简单
- 快
- 成本可控
- 易评测

适合大多数知识库问答。

### Agentic RAG

由 Agent 决定是否检索、检索什么、检索几次：

```
用户问题 → Agent 思考 → 调用检索工具 → 继续思考 → 可能再次检索 → 回答
```

优点：

- 适合复杂问题
- 可以拆解问题
- 可以访问多个知识源

代价：

- 延迟更高
- 成本更高
- 行为更难预测
- 更需要 tracing 和评测

## RAG 常见问题

### 1. 答案幻觉

可能原因：

- Prompt 没有约束只能基于上下文回答。
- 检索结果不相关。
- 上下文片段缺少来源或关键细节。
- 模型把常识和上下文混在一起。

改进方向：

- 加拒答规则。
- 展示引用来源。
- 提升检索质量。
- 使用 rerank。
- 做离线评测集。

### 2. 检索不到

可能原因：

- 文档切分破坏语义。
- embedding 模型不适合领域术语。
- query 和文档表达差异太大。
- top-k 太小。
- metadata 过滤过严。

改进方向：

- 调整 chunk size 和 overlap。
- 增加关键词检索。
- 做 query rewrite。
- 使用 hybrid search。

### 3. 检索太多但答案差

可能原因：

- context 噪声太多。
- 召回结果重复。
- Prompt 中没有清晰组织文档。

改进方向：

- MMR 去重。
- Rerank 精排。
- 对 context 加标题、来源和分隔符。
- 控制 top-k。

## RAG 入门练习

建议按这个顺序练：

1. 用一个 Markdown 文件做问答。
2. 用多个 Markdown 文件构建本地知识库。
3. 给答案加引用来源。
4. 加 metadata filter，比如只查某个目录。
5. 对比不同 chunk size 的效果。
6. 加 rerank 或 hybrid search。
7. 做 20 条问题的手工评测集。
