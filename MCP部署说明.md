# 天眼查MCP支持部署说明

## 方案A：自动部署（推荐）

### 步骤

1. **复制部署脚本到项目根目录**
   ```bash
   cp deploy-mcp-support.sh /Users/liwei/Desktop/yinxin-rag-stack/
   ```

2. **运行脚本**
   ```bash
   cd /Users/liwei/Desktop/yinxin-rag-stack
   chmod +x deploy-mcp-support.sh
   ./deploy-mcp-support.sh
   ```

3. **重启项目**
   ```bash
   npm run dev
   ```

---

## 方案B：手动部署

如果自动脚本运行失败，请按以下步骤手动操作：

### 步骤1：安装MCP SDK

```bash
cd /Users/liwei/Desktop/yinxin-rag-stack
npm install @modelcontextprotocol/sdk --save
```

### 步骤2：复制MCP客户端文件

将 `tianyanchaMCPClient.ts` 复制到项目的 `src/lib/` 目录：

```bash
cp tianyanchaMCPClient.ts /Users/liwei/Desktop/yinxin-rag-stack/src/lib/
```

### 步骤3：修改 apiManager.ts

打开 `src/api/apiManager.ts`，在文件顶部添加：

```typescript
import { searchCompany, getCompanyDetail } from '../lib/tianyanchaMCPClient';
```

然后找到 `TianyanchaAPIClient` 类，修改 `searchCompany` 和 `getCompanyDetail` 方法：

```typescript
class TianyanchaAPIClient {
  // ... 其他代码 ...

  async searchCompany(params: {
    name: string;
    keyword?: string;
    pageSize?: number;
    pageNum?: number;
  }) {
    // 改为使用MCP调用
    return await searchCompany({
      name: params.name,
      pageSize: params.pageSize,
      pageNum: params.pageNum,
    });
  }

  async getCompanyDetail(params: { companyId: string }) {
    // 改为使用MCP调用
    return await getCompanyDetail(params.companyId);
  }
}
```

### 步骤4：重启项目

```bash
npm run dev
```

---

## 测试

部署完成后，在AI对话中输入：

> "帮我查一下成都科技有限公司的基本信息"

如果成功，AI会返回企业信息。

---

## 故障排查

### 问题1：MCP连接失败

**现象**：控制台显示 `[MCP] 连接失败`

**解决**：
1. 检查API Key是否正确
2. 检查网络是否能访问 `https://mcp.tianyancha.com`
3. 查看天眼查MCP服务是否正常运行

### 问题2：编译错误

**现象**：TypeScript编译报错

**解决**：
1. 确保 `@modelcontextprotocol/sdk` 已安装
2. 检查 `tsconfig.json` 是否包含 `src/lib/tianyanchaMCPClient.ts`

### 问题3：恢复原状

如果部署后出现问题，可以恢复备份：

```bash
cp src/api/apiManager.ts.bak src/api/apiManager.ts
rm src/lib/tianyanchaMCPClient.ts
npm uninstall @modelcontextprotocol/sdk
```

---

## 文件清单

部署后会创建/修改以下文件：

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/tianyanchaMCPClient.ts` | 创建 | MCP客户端实现 |
| `src/api/apiManager.ts` | 修改 | 使用MCP调用天眼查 |
| `src/api/apiManager.ts.bak` | 备份 | 原文件备份 |

---

## 需要帮助？

如果部署过程中遇到问题，请告诉我：
1. 您使用的是哪个步骤（自动/手动）
2. 具体的错误信息
3. 项目的路径（确认文件位置正确）
