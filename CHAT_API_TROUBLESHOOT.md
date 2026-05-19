# 聊天API错误诊断指南

## 错误信息
```
Error: fetch failed
    at handleSend (components/TaskInput.tsx:385:29)
```

## 可能原因

### 1. API路由内部错误
检查 `/api/chat` 路由是否有问题：

```bash
# 测试API端点
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"测试"}]}'
```

### 2. 外部AI服务未运行
聊天功能依赖外部AI服务（如Ollama或DeepSeek API）：

```bash
# 检查Ollama是否运行
curl http://localhost:11434/api/tags

# 检查环境变量
grep -E "DEEPSEEK|OLLAMA" .env.local
```

### 3. 常见解决方案

#### 方案A: 启动Ollama服务
```bash
ollama serve
```

#### 方案B: 配置DeepSeek API
确保 `.env.local` 文件包含：
```
DEEPSEEK_API_KEY=your_api_key_here
```

#### 方案C: 查看详细错误日志
在终端查看服务器输出，搜索具体错误信息。

## 快速修复步骤

### 步骤1: 检查服务器日志
```bash
# 在终端查看实时日志
cd /Users/liwei/Desktop/yinxin-rag-stack
npm run dev
```

### 步骤2: 测试API响应
```bash
curl -v http://localhost:3000/api/version
```

### 步骤3: 检查AI服务配置
```bash
# 查看当前使用的模型
cat data/models.json
```

## 这个问题与我们刚修复的功能无关

刚才修复的是**客户档案管理功能**：
- ✅ 修复了数据格式兼容性问题
- ✅ 添加了空值检查
- ✅ 已通过构建和测试

聊天功能的错误需要单独排查AI服务配置。
