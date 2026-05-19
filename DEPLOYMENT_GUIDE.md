# 🚀 GitHub + Vercel 部署指南

## 一、创建 GitHub 公开仓库

### 步骤1：创建新仓库

1. 访问 [GitHub](https://github.com) 并登录
2. 点击右上角 **"+"** 按钮，选择 **"New repository"**
3. 填写仓库信息：
   - **Repository name**: `yinxin-rag-stack`
   - **Description**: `小微企业私有AI员工 —— 能赚钱、更安全、零门槛`
   - **选择 Public**（公开）
   - ✅ 勾选 **"Add a README file"**
   - 选择 **MIT License**
   - 选择 **.gitignore template**: `Node`

4. 点击 **"Create repository"**

### 步骤2：本地初始化并推送

```bash
# 进入项目目录
cd /Users/liwei/Desktop/yinxin-rag-stack

# 初始化 Git（如果还没有）
git init

# 添加所有文件（排除敏感文件）
git add .

# 提交
git commit -m "feat: 初始化 Yinxin.AGI - 小微企业私有AI员工

🔥 核心功能：
- AI Agent 智能助手
- RAG 知识库
- 智能财税记账
- 浏览器自动化

✨ 差异化优势：
- 全行业独有的智能财税功能
- 真实浏览器自动化（Dify/FastGPT 无此功能）
- 数据完全私有，安全可靠
- 零技术门槛，一键部署"

# 添加远程仓库
git remote add origin https://github.com/liwei668/yinxin-rag-stack.git

# 推送到 GitHub
git branch -M main
git push -u origin main
```

### 步骤3：验证仓库

访问 `https://github.com/你的用户名/yinxin-rag-stack` 查看你的仓库

---

## 二、Vercel 部署演示站

### 方式一：直接部署（最简单）

1. 访问 [Vercel](https://vercel.com) 并登录（可用 GitHub 账号）
2. 点击 **"Add New..."** → **"Project"**
3. 选择 **"Import Git Repository"**
4. 选择你刚创建的 `yinxin-rag-stack` 仓库
5. 点击 **"Import"**

### 方式二：从 Vercel 导入

1. 访问：[https://vercel.com/new/clone?repository-url=你的仓库地址](https://vercel.com/new/clone)
2. 会自动打开 Vercel 导入页面

### 步骤4：配置环境变量

在 Vercel 项目设置中添加：

1. 进入 **"Environment Variables"**
2. 添加以下变量：

```env
# AI 模型 API Key（必须）
DASHSCOPE_API_KEY=sk-你的通义千问API Key

# 其他可选
OPENAI_API_KEY=sk-你的OpenAI API Key（如果有）
```

> ⚠️ **重要**：API Key 是敏感信息，请务必添加到环境变量中，不要硬编码到代码里

### 步骤5：部署

1. 点击 **"Deploy"**
2. 等待部署完成（约 2-3 分钟）
3. 获得一个 URL，如：`https://yinxin-rag-stack.vercel.app`

### 步骤6：绑定自定义域名（可选）

1. 在 Vercel 项目设置 → **Domains**
2. 添加你的域名（如：`demo.yinxin-agi.com`）
3. 按提示配置 DNS 记录

---

## 三、后续维护

### 更新代码后自动部署

只要推送到 GitHub，Vercel 会自动检测并重新部署！

```bash
# 修改代码后
git add .
git commit -m "fix: 修复 XXX 问题"
git push
# Vercel 自动重新部署 ✨
```

### 查看部署日志

1. 进入 Vercel 项目
2. 点击 **"Deployments"**
3. 选择任意一次部署查看日志

---

## 四、常见问题

### Q1: Vercel 部署失败？

**检查项**：
- ✅ 是否添加了 `DASHSCOPE_API_KEY` 环境变量？
- ✅ Node.js 版本是否 >= 18？
- ✅ `npm install` 是否成功？

**解决方案**：
```bash
# 本地测试构建
npm run build

# 查看错误信息
npm run build 2>&1 | head -50
```

### Q2: 演示站显示空白？

**可能原因**：
- API Key 未配置
- 环境变量未生效

**解决方案**：
1. 进入 Vercel → Settings → Environment Variables
2. 确保添加了 `DASHSCOPE_API_KEY`
3. 重新部署（Redeploy）

### Q3: 部署后功能不正常？

**检查项**：
- ✅ API Key 是否正确？
- ✅ 是否配置了数据库？（SQLite 需要持久化）
- ✅ 浏览器自动化是否可用？（Vercel 服务器环境限制）

**注意**：Vercel 服务器环境可能不支持 Playwright 浏览器自动化，本地运行功能更完整。

---

## 五、成本估算

| 项目 | 费用 | 说明 |
| :--- | :--- | :--- |
| GitHub 仓库 | 免费 | 公开仓库无限量 |
| Vercel Hobby | 免费 | 每月 100GB 带宽 |
| API Key | 按量计费 | 阿里云/腾讯云 |

**总成本：0 元**（不含 API 调用费用）

---

## 六、下一步

1. ✅ 创建 GitHub 仓库
2. ✅ 部署 Vercel 演示站
3. 🔄 配置 API Key
4. 🔄 测试完整功能
5. 🔄 开始获客！

---

## 📞 获取帮助

- GitHub Issues：[创建 Issue](https://github.com/你的用户名/yinxin-rag-stack/issues/new/choose)
- 文档：[查看 README](README.md)
- 演示站：`https://yinxin-rag-stack.vercel.app`（部署后替换）

---

**祝你商业化成功！🚀**
