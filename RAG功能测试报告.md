# RAG、知识库、提词器、记忆看板功能测试报告

## 一、架构分析

### 1.1 RAG 向量模型配置

**重要发现**：当前 RAG 系统使用的是 **阿里云 DashScope** 的嵌入模型，而非本地 Ollama 模型。

| 配置项 | 当前值 | 位置 |
|--------|--------|------|
| 嵌入模型 | `text-embedding-v3` | `src/lib/vectorDB.ts:6` |
| 向量维度 | 1024 | `src/lib/vectorDB.ts:7` |
| API 提供商 | 阿里云 DashScope | `src/lib/vectorDB.ts:193` |
| API Key | `DASHSCOPE_API_KEY` | 环境变量 |

**代码片段** (`src/lib/vectorDB.ts`):
```typescript
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || '';
const EMBEDDING_MODEL = 'text-embedding-v3';
const EMBEDDING_DIMENSIONS = 1024;
```

### 1.2 为什么不使用 nomic-embed-text？

当前实现直接调用 DashScope API 进行文本嵌入，而不是通过 Ollama 调用本地模型。这可能是为了：
- 简化部署（无需本地运行 Ollama）
- 使用云端更强大的嵌入模型
- 减少本地计算资源消耗

---

## 二、功能模块测试

### 2.1 知识库功能 (/api/knowledge-structure)

**API 端点**:
- `GET /api/knowledge-structure` - 获取知识库结构
- `GET /api/knowledge-structure?action=getDocuments&kbId=xxx` - 获取文档列表
- `POST /api/knowledge-structure` - 创建知识库/上传文档
- `PUT /api/knowledge-structure` - 更新/重命名/移动
- `DELETE /api/knowledge-structure` - 删除

**支持的文档格式**:
- 文本: `.txt`, `.md`, `.json`, `.csv`, `.html`, `.css`, `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.java`, `.go`, `.rs`
- 二进制: `.pdf`, `.docx`, `.xlsx`, `.xls`, `.pptx` (需要解析工具)

**文档处理流程**:
1. 上传文件 → 解析内容 → 生成嵌入向量 → 存储到 `data/knowledge-base.json`
2. 使用 `src/lib/documentParser.ts` 解析文档
3. 使用 `src/lib/vectorDB.ts` 生成嵌入并存储

### 2.2 RAG 检索功能 (/api/rag)

**API 端点**:
- `POST /api/rag` - RAG 查询

**请求参数**:
```json
{
  "query": "查询内容",
  "type": "hybrid|filtered|knowledge",
  "filter": { ... }
}
```

**检索流程**:
1. 接收查询文本
2. 生成查询嵌入向量 (DashScope API)
3. 计算与知识库文档的余弦相似度
4. 返回 Top-K 相关文档
5. 结合 LLM 生成回答

**降级策略**:
- 如果向量查询失败，自动降级到关键词匹配

### 2.3 提词器功能 (/api/prompts)

**API 端点**:
- `GET /api/prompts` - 获取提词器列表
- `GET /api/prompts?action=list` - 获取模板列表
- `POST /api/prompts` - 创建/更新/删除/设置默认

**数据存储**: `data/prompts.json`

**功能特性**:
- 创建提示词模板
- 支持变量插值
- 分类管理
- 关联知识库文档
- 使用统计 (useCount, successCount, successRate)
- 默认模板设置

### 2.4 记忆看板功能 (/api/memory)

**API 端点**:
- `POST /api/memory/match` - 匹配记忆分支
- `POST /api/memory/duplicate-intent` - 检测重复意图
- `POST /api/memory/cross-branch` - 跨分支检索
- `POST /api/memory/preference` - 偏好学习
- `GET/POST/PUT/DELETE /api/memory/branches` - 分支管理
- `GET/PUT /api/memory/branches/[branchId]` - 分支详情

**核心服务**: `src/services/memorySystem.ts`

**功能特性**:
- 对话分支管理
- 意图匹配
- 记忆检索
- 偏好学习
- 跨分支关联

---

## 三、测试检查清单

### 3.1 知识库功能测试

- [ ] 创建知识库
- [ ] 创建分类
- [ ] 上传文本文件 (.txt, .md)
- [ ] 上传 PDF 文件
- [ ] 上传 Word 文件 (.docx)
- [ ] 获取文档列表
- [ ] 重命名知识库
- [ ] 移动分类
- [ ] 删除文档
- [ ] 删除知识库

### 3.2 RAG 检索功能测试

- [ ] 基础 RAG 查询
- [ ] 混合检索 (hybrid)
- [ ] 过滤检索 (filtered)
- [ ] 向量相似度计算
- [ ] 关键词降级匹配
- [ ] 多文档检索

### 3.3 提词器功能测试

- [ ] 创建提示词模板
- [ ] 编辑提示词
- [ ] 删除提示词
- [ ] 设置默认模板
- [ ] 使用提示词生成内容
- [ ] 查看使用统计

### 3.4 记忆看板功能测试

- [ ] 创建记忆分支
- [ ] 匹配记忆分支
- [ ] 检测重复意图
- [ ] 跨分支检索
- [ ] 偏好学习
- [ ] 更新分支内容
- [ ] 删除分支

---

## 四、RAG 向量模型问题

### 4.1 当前问题

**RAG 没有使用本地 nomic-embed-text 模型**，而是使用阿里云 DashScope 的 text-embedding-v3。

### 4.2 修改建议

如果要使用本地 Ollama 的 nomic-embed-text 模型，需要修改 `src/lib/vectorDB.ts`：

```typescript
// 当前实现（使用 DashScope）
const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${DASHSCOPE_API_KEY}`
  },
  body: JSON.stringify({
    model: EMBEDDING_MODEL,
    input: uncached.map(item => item.text),
    dimensions: EMBEDDING_DIMENSIONS,
    encoding_format: 'float'
  })
});

// 建议修改为（使用本地 Ollama）
const response = await fetch('http://localhost:11434/api/embeddings', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'nomic-embed-text:latest',
    prompt: text
  })
});
```

### 4.3 维度不匹配问题

- DashScope text-embedding-v3: **1024 维**
- Ollama nomic-embed-text: **768 维**

如果切换模型，需要重新生成所有知识库的嵌入向量。

---

## 五、测试执行

请在 Mac 本地执行以下测试命令：

```bash
# 1. 确保 Next.js 在运行
cd /Users/liwei/Desktop/yinxin-rag-stack
npm run dev

# 2. 登录获取 cookie
curl -s -c /tmp/cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"liwei@163.com","password":"12345678a"}'

# 3. 测试知识库结构
curl -s http://localhost:3000/api/knowledge-structure | python3 -m json.tool

# 4. 测试提词器列表
curl -s http://localhost:3000/api/prompts | python3 -m json.tool

# 5. 测试 RAG 查询
curl -s -X POST http://localhost:3000/api/rag \
  -H "Content-Type: application/json" \
  -d '{"query":"测试查询","type":"knowledge"}' | python3 -m json.tool
```

---

## 六、总结

| 功能模块 | 状态 | 说明 |
|----------|------|------|
| 知识库 | ✅ 已实现 | 支持多种格式文档上传、解析、向量化存储 |
| RAG 检索 | ✅ 已实现 | 支持向量检索 + 关键词降级 |
| 提词器 | ✅ 已实现 | 支持模板管理、变量、统计 |
| 记忆看板 | ✅ 已实现 | 支持分支管理、意图匹配、偏好学习 |
| **向量模型** | ⚠️ 注意 | 使用 DashScope 而非本地 Ollama |

**建议**：如果需要使用本地 nomic-embed-text 模型，需要修改 `src/lib/vectorDB.ts` 中的嵌入生成逻辑。
