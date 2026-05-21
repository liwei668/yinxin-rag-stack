# MCP 客户端安装和配置指南

## 问题
天眼查配置为 MCP 服务，但项目没有安装 MCP 客户端，导致 API 调用返回 404。

## 解决方案

### 第1步：安装 MCP SDK

```bash
npm install @modelcontextprotocol/sdk
```

### 第2步：创建 MCP 客户端模块

创建文件 `src/lib/mcpClient.ts`：

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// 天眼查 MCP 配置
const TIANYANCHA_MCP_CONFIG = {
  url: 'https://mcp.tianyancha.com/v1',
  headers: {
    'Authorization': '38693361-54b4-4acd-8ca5-b258eade669c'
  }
};

/**
 * 创建天眼查 MCP 客户端
 */
export async function createTianyanchaMCPClient() {
  const client = new Client(
    {
      name: 'yinxin-tianyancha-client',
      version: '1.0.0',
    },
    {
      capabilities: {
        prompts: {},
        resources: {},
        tools: {},
      },
    }
  );

  // 连接到 MCP 服务器
  const transport = new SSEClientTransport(
    new URL(TIANYANCHA_MCP_CONFIG.url),
    {
      headers: TIANYANCHA_MCP_CONFIG.headers,
    }
  );

  await client.connect(transport);
  
  return client;
}

/**
 * 调用天眼查搜索工具
 */
export async function searchCompanyWithMCP(params: {
  name: string;
  pageSize?: number;
  pageNum?: number;
}) {
  const client = await createTianyanchaMCPClient();
  
  try {
    const result = await client.callTool('searchCompany', {
      name: params.name,
      pageSize: params.pageSize || 10,
      pageNum: params.pageNum || 1,
    });
    
    return result;
  } finally {
    await client.close();
  }
}

/**
 * 调用天眼查详情工具
 */
export async function getCompanyDetailWithMCP(companyId: string) {
  const client = await createTianyanchaMCPClient();
  
  try {
    const result = await client.callTool('getCompanyDetail', {
      companyId,
    });
    
    return result;
  } finally {
    await client.close();
  }
}
```

### 第3步：修改批量搜索工具使用 MCP

修改 `tianyancha_batch_search.ts`，将：
```typescript
import { callAPI } from '../api/apiManager';
```

改为：
```typescript
import { searchCompanyWithMCP, getCompanyDetailWithMCP } from '../../lib/mcpClient';
```

并将调用方式从：
```typescript
await callAPI('tianyancha-company-api', 'searchCompany', {...})
```

改为：
```typescript
await searchCompanyWithMCP({...})
```

### 第4步：重启项目

```bash
npm run dev
```

## 备选方案

如果 MCP 方式也失败，可能需要：

1. **联系天眼查技术支持**，确认 MCP 服务是否正常运行
2. **使用天眼查 OpenAPI**（非 MCP 版本），需要申请不同的 API Key
3. **使用浏览器自动化** 直接访问天眼查网站（已配置 Playwright）

## 参考资料

- MCP 协议文档：https://modelcontextprotocol.io
- MCP SDK：https://github.com/modelcontextprotocol/typescript-sdk
