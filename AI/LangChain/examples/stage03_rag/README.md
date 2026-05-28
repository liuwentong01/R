# 第 3 阶段：RAG

## 目标

做出第一个知识库问答，理解离线索引和在线问答两条链路。

需要掌握：

- Document
- Loader
- Splitter
- Embedding
- Vector Store
- Retriever
- Context Prompt

## Demo 列表

| 文件 | 重点 |
| --- | --- |
| [01_single_markdown_qa.ts](./01_single_markdown_qa.ts) | 用一个 Markdown 文件做问答 |
| [02_directory_qa_with_sources.ts](./02_directory_qa_with_sources.ts) | 用目录下多个 Markdown 文件问答，并返回来源 |
| [03_chunk_size_comparison.ts](./03_chunk_size_comparison.ts) | 调整 chunk size，对比检索片段 |
| [04_manual_eval_20_questions.ts](./04_manual_eval_20_questions.ts) | 用 20 个问题做手工评测 |

## 运行

```bash
npm run stage03

# 或逐个运行
npm run stage03:01
npm run stage03:02
npm run stage03:03
npm run stage03:04
```

## RAG 链路

```text
离线阶段：
Markdown 文件
  │
  ├── Loader 读取为 Document
  ├── Splitter 切成 chunk
  ├── Embedding 转成向量
  └── Vector Store 保存 chunk 和向量

在线阶段：
用户问题
  │
  ├── Retriever 找相关 chunk
  ├── Context Prompt 注入上下文
  ├── Chat Model 基于上下文回答
  └── 返回答案和来源
```

## 为什么检索质量比 Prompt 花活更重要

Prompt 只能约束模型如何使用上下文，不能凭空补回缺失资料。检索不到关键资料时，模型只能猜；检索到错误资料时，模型会基于错误上下文生成看似合理但不可靠的答案。

优先排查顺序：

- Loader 是否读到了正确文件。
- Splitter 是否把关键信息切碎。
- Embedding 是否能表达查询和文档语义。
- Retriever top-k 是否过小或 metadata 过滤是否过严。
- Context Prompt 是否明确要求“只基于上下文回答”。
