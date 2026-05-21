# 天眼查批量搜索工具使用说明

## 功能概述

这个工具可以帮您：
1. **按城市搜索企业**（如：成都）
2. **筛选社保人数**（如：≥20人）
3. **自动归档到客户档案**

---

## 使用方式

### 方式一：通过AI对话下达指令（推荐）

在您的AI对话窗口中，直接说：

> "帮我搜索成都社保人数超过20人的科技企业，找5家并归档到客户档案"

AI会自动调用工具，参数映射：
- `city`: 成都
- `keyword`: 科技
- `min_social_staff_num`: 20
- `max_results`: 5

### 方式二：精确指令

> "使用天眼查批量搜索工具，搜索成都的网络公司，社保人数至少30人，找10家归档"

### 方式三：代码调用

```typescript
import { batchSearchAndArchive } from '@/services/agent/tianyancha_batch_search';

const result = await batchSearchAndArchive({
  city: '成都',
  keyword: '科技',
  minSocialStaffNum: 20,
  maxResults: 5,
  saveToArchive: true,
});

console.log(result.message);
// 输出：搜索完成！共搜索 20 家公司，其中 8 家社保人数≥20人，成功归档 5 家到客户档案。
```

---

## 工具参数说明

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `city` | string | ✅ | 城市名称 | "成都" |
| `keyword` | string | ❌ | 搜索关键词 | "科技"、"网络"、"贸易" |
| `min_social_staff_num` | number | ✅ | 最小社保人数 | 20 |
| `max_results` | number | ✅ | 最大结果数 | 5 |
| `save_to_archive` | boolean | ❌ | 是否归档（默认true） | true |

---

## 集成步骤

### 第1步：复制文件

将 `tianyancha_batch_search.ts` 复制到项目：
```
src/services/agent/tianyancha_batch_search.ts
```

### 第2步：注册到Agent工具系统

在 `src/services/agent/toolRegistry.ts` 中添加：

```typescript
// 导入工具配置
import { tianyanchaBatchSearchToolConfig } from './tianyancha_batch_search';

// 在文件末尾注册工具（在其他 toolRegistry.register 之后）
toolRegistry.register(tianyanchaBatchSearchToolConfig);
```

### 第3步：重启项目

```bash
npm run dev
```

---

## 返回结果示例

```json
{
  "success": true,
  "message": "搜索完成！共搜索 20 家公司，其中 8 家社保人数≥20人，成功归档 5 家到客户档案。",
  "data": {
    "total_searched": 20,
    "qualified_count": 8,
    "archived_count": 5,
    "companies": [
      {
        "name": "成都某某科技有限公司",
        "social_staff_num": 50,
        "industry": "软件和信息技术服务业",
        "archived": true,
        "archive_id": "abc-123"
      },
      // ... 更多公司
    ],
    "errors": []
  }
}
```

---

## 客户档案存储格式

归档后的客户档案包含：

### 1. 基础信息（customer-archives.json）
```json
{
  "id": "uuid",
  "customerId": "天眼查公司ID",
  "companyName": "成都某某科技有限公司",
  "contactName": "法人姓名",
  "contactEmail": "",
  "industry": "软件和信息技术服务业",
  "notes": "{天眼查完整数据，包含社保人数等}",
  "tags": ["天眼查", "批量导入", "社保50人"],
  "status": "active"
}
```

### 2. 详细档案文件（data/customers/{customerId}.txt）
```
[客户画像]
公司名称：成都某某科技有限公司
参保人数：50
人员规模：50-99人
行业：软件和信息技术服务业
...

[公司信息]
{完整天眼查数据}

[对话记录]

[待办事项]
- 跟进客户意向
- 了解具体需求
```

---

## 注意事项

1. **API限制**：天眼查API可能有调用频率限制，批量搜索会逐个查询详情，请控制 `max_results` 数量
2. **社保人数字段**：依赖天眼查API返回的 `socialStaffNum` 字段，部分公司可能没有此数据
3. **数据更新**：天眼查数据可能不是实时最新的，建议定期更新
4. **重复处理**：同一公司再次归档时会更新现有档案，不会重复创建

---

## 故障排查

### 问题：找不到公司
- 检查 `city` 和 `keyword` 是否正确
- 尝试不加 `keyword`，只搜索城市

### 问题：社保人数都是0
- 部分公司天眼查没有社保人数数据
- 尝试降低 `min_social_staff_num` 阈值

### 问题：归档失败
- 检查 `data/customer-archives.json` 文件是否存在且可写
- 检查 `data/customers/` 目录是否存在
