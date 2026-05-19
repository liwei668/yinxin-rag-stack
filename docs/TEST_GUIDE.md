# Yinxin.AGI.ai - 知识库系统测试指南

## 🚀 快速开始

### 1. 启动开发服务器

```bash
# 在项目根目录执行

# 启动开发服务器（HTTP）
npm run dev

# 或启动 HTTPS 开发服务器
npm run dev:https
```

服务器启动后，访问 http://localhost:3000

---

## 🧪 API 接口测试

### 2.1 知识库 CRUD

```bash
# 创建知识库
curl -X POST http://localhost:3000/api/knowledge \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试知识库",
    "description": "这是一个测试知识库"
  }'

# 获取知识库列表
curl http://localhost:3000/api/knowledge

# 更新知识库
curl -X PUT http://localhost:3000/api/knowledge/:id \
  -H "Content-Type: application/json" \
  -d '{"name": "新名称"}'

# 删除知识库
curl -X DELETE http://localhost:3000/api/knowledge/:id
```

### 2.2 文档管理

```bash
# 获取文档列表
curl http://localhost:3000/api/knowledge/documents

# 上传文档（需要使用 FormData）
curl -X POST http://localhost:3000/api/knowledge/documents \
  -F "file=@/path/to/document.pdf" \
  -F "knowledgeBaseId=test-kb-id"

# 批量操作
curl -X POST http://localhost:3000/api/knowledge/documents/batch \
  -H "Content-Type: application/json" \
  -d '{
    "action": "delete",
    "docIds": ["doc1", "doc2"]
  }'
```

### 2.3 权限设置

```bash
# 获取权限信息
curl "http://localhost:3000/api/knowledge/permission?knowledgeBaseId=test-kb-id"

# 更新权限
curl -X POST http://localhost:3000/api/knowledge/permission \
  -H "Content-Type: application/json" \
  -d '{
    "knowledgeBaseId": "test-kb-id",
    "visibility": "team",
    "teamId": "team-1"
  }'
```

### 2.4 RAG 检索

```bash
# 带权限的检索
curl -X POST http://localhost:3000/api/knowledge/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "query": "如何配置系统",
    "k": 5,
    "userId": "default-user",
    "mode": "semantic"
  }'

# 简单检索
curl "http://localhost:3000/api/knowledge/retrieve?query=配置&k=3"
```

### 2.5 导出功能

```bash
# 导出为 JSON
curl -X POST http://localhost:3000/api/knowledge/export \
  -H "Content-Type: application/json" \
  -d '{"format": "json"}' \
  -o export.json

# 导出为 CSV
curl -X POST http://localhost:3000/api/knowledge/export \
  -H "Content-Type: application/json" \
  -d '{"format": "csv"}' \
  -o export.csv
```

### 2.6 任务队列

```bash
# 获取队列状态
curl "http://localhost:3000/api/knowledge/jobs?action=stats"

# 获取管道状态
curl "http://localhost:3000/api/knowledge/jobs?action=pipelines&userId=default-user"

# 重试失败任务
curl -X POST http://localhost:3000/api/knowledge/jobs \
  -H "Content-Type: application/json" \
  -d '{"action": "retryAll"}'
```

---

## 🎨 前端功能测试

### 3.1 知识库管理界面

访问：http://localhost:3000

1. **查看知识库列表**
   - 左侧栏显示两级知识库结构
   - 可以看到"未分类"虚拟节点
   - 每个知识库显示可见性图标（🔒私有/👥团队/🌐公开）

2. **创建知识库**
   - 点击左侧栏的 "+" 按钮
   - 输入知识库名称
   - 选择父级分类（可选）

3. **权限设置**
   - 点击知识库右侧的 🛡️ 图标
   - 选择可见性：私有/团队/公开
   - 保存设置

4. **上传文档**
   - 在知识库内找到上传区域
   - 选择文件或拖拽上传
   - 查看上传进度和结果

5. **文档管理**
   - 查看文档列表（表格/卡片视图）
   - 使用搜索功能筛选文档
   - 点击文档查看详情（右侧抽屉）
   - 使用批量操作（选中多个文档）

### 3.2 抽屉功能

1. **打开抽屉**
   - 点击任意文档
   - 右侧滑出详情抽屉

2. **抽屉控制**
   - 📌 钉住：固定抽屉为常驻模式
   - ➖ 最小化：收缩抽屉
   - ↔️ 拖拽：调整抽屉宽度

3. **快捷操作**
   - 重命名文档
   - 移动到其他分类
   - 重新解析
   - 删除文档

### 3.3 高级功能

1. **批量操作**
   - 点击 "批量操作" 按钮
   - 选择多个文档
   - 批量删除/移动/更新分类

2. **版本历史**
   - 打开文档详情抽屉
   - 点击 "历史" 查看版本
   - 可以恢复到历史版本

3. **导入导出**
   - 点击 "导出" 选择格式（JSON/CSV/ZIP）
   - 点击 "导入" 上传文件
   - 支持 ZIP 和 JSON 格式

4. **回收站**
   - 删除的文档进入回收站
   - 可以恢复或永久删除
   - 30天后自动清理

---

## 🔍 测试清单

### 功能测试清单

- [ ] 知识库创建/编辑/删除
- [ ] 文档上传/预览/删除
- [ ] 抽屉钉住/最小化/拖拽
- [ ] 权限设置（私有/团队/公开）
- [ ] 两级知识库结构
- [ ] 未分类虚拟节点
- [ ] 文档搜索和筛选
- [ ] 批量操作
- [ ] 版本历史
- [ ] 导入导出
- [ ] 回收站
- [ ] 团队管理
- [ ] 评论系统
- [ ] RAG 检索
- [ ] 任务队列状态

---

## 🐛 常见问题

### 4.1 MongoDB 连接失败

如果遇到数据库连接错误：
1. 确保 MongoDB 服务正在运行
2. 检查 `.env` 文件中的连接字符串
3. 查看服务器日志

### 4.2 文件上传失败

1. 检查文件大小限制
2. 确认存储目录权限
3. 查看服务器错误日志

### 4.3 权限不生效

1. 确认用户 ID 正确
2. 检查团队成员状态
3. 验证可见性设置

---

## 📊 性能测试

### 基准测试

```bash
# 文档数量测试
- 100 个文档：响应时间 < 500ms
- 1000 个文档：响应时间 < 2s
- 10000 个文档：响应时间 < 10s

# 并发测试
- 10 个并发用户：无错误
- 50 个并发用户：可接受延迟
- 100 个并发用户：需要优化
```

---

## 🎯 下一步

1. **基础功能测试** → 完成基本操作
2. **集成测试** → 测试完整流程
3. **性能测试** → 验证系统性能
4. **安全测试** → 验证权限系统

---

## 🌐 访问方式

开发服务器启动后，可以通过以下地址访问：

- **本地访问**：http://localhost:3000 或 https://localhost:3000
- **内网访问**：http://<本机IP>:3000
- **公网访问**：通过花生壳等内网穿透服务映射

### HTTPS 配置

项目支持 HTTPS 开发环境，已提供自签名证书：
- `localhost.pem` - 证书文件
- `localhost-key.pem` - 私钥文件

---

**提示**：测试过程中注意查看浏览器控制台和服务器日志，可以帮助快速定位问题！

---

*文档版本：v1.0 | 更新日期：2026年5月*  
*© 2026 引信（中国）技术有限公司 版权所有*

