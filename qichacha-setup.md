# 企查查API配置指南

## 已完成的修改

已将批量搜索工具从**天眼查MCP**切换为**企查查REST API**。

---

## 需要您完成的配置

### 第1步：申请企查查API账号

1. 访问企查查开放平台：https://openapi.qichacha.com/
2. 注册账号并实名认证
3. 申请API接口权限（需要申请以下接口）：
   - `FuzzySearch/GetList` - 企业模糊搜索
   - `ECI/GetBasicDetailsByName` - 企业基本信息详情

### 第2步：获取API密钥

申请通过后会获得：
- **AppKey**: 您的应用标识
- **AppSecret**: 您的应用密钥（用于签名）

### 第3步：配置环境变量

在项目的 `.env.local` 文件中添加：

```bash
# 企查查API配置
QICHACHA_APP_KEY=您的AppKey
QICHACHA_APP_SECRET=您的AppSecret
```

### 第4步：部署代码

1. 将 `qichacha_batch_search.ts` 复制到项目：
   ```
   src/services/agent/qichacha_batch_search.ts
   ```

2. 在 `toolRegistry.ts` 中注册新工具：
   ```typescript
   import { qichachaBatchSearchToolConfig } from './qichacha_batch_search';
   
   toolRegistry.register(qichachaBatchSearchToolConfig);
   ```

3. 重启项目：
   ```bash
   npm run dev
   ```

---

## API接口说明

### 使用的接口

| 接口 | 地址 | 功能 |
|------|------|------|
| 模糊搜索 | `GET /FuzzySearch/GetList` | 按关键词搜索企业列表 |
| 详情查询 | `GET /ECI/GetBasicDetailsByName` | 获取企业详情（含年报社保数据） |

### 签名算法

企查查使用 MD5 签名：
```
Sign = MD5(AppKey + Timespan + AppSecret).toUpperCase()
```

代码中已实现此签名逻辑。

---

## 使用方式

配置完成后，您可以通过AI下达指令：

> "帮我搜索成都社保人数超过20人的科技企业，找5家并归档到客户档案"

系统会自动：
1. 调用企查查API搜索成都科技企业
2. 逐个查询详情获取年报中的社保人数
3. 筛选出社保人数≥20人的公司
4. 自动归档到客户档案

---

## 注意事项

1. **API调用限制**：企查查API有调用频率限制，请查看官方文档
2. **社保数据来源**：社保人数来自企业年报，可能存在延迟
3. **数据覆盖**：不是所有企业都会披露社保人数
4. **费用**：企查查API是收费的，请根据需求选择合适的套餐

---

## 备选方案

如果企查查API申请不顺利，还可以考虑：

1. **爱企查**（百度旗下）：https://aiqicha.baidu.com/
2. **启信宝**：https://www.qixin.com/
3. **使用浏览器自动化**直接访问这些平台（无需API）

需要我帮您实现其他方案吗？
