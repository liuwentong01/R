# RAG 知识库问答

RAG 的离线链路是 Loader 加载资料、Splitter 切分文档、Embedding 向量化、Vector Store 存储索引。

RAG 的在线链路是用户提问、Retriever 检索相关片段、Context Prompt 注入上下文、Chat Model 基于上下文回答，并返回来源。

检索质量通常比 Prompt 花活更重要。检索不到关键资料时，模型再会写也只能猜；检索到错误资料时，模型会基于错误上下文生成看似合理的答案。
