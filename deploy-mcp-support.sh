#!/bin/bash
# 天眼查MCP支持部署脚本
# 将此脚本放在项目根目录运行

echo "========================================"
echo "天眼查MCP支持部署脚本"
echo "========================================"
echo ""

# 检查是否在项目根目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    exit 1
fi

echo "✅ 检测到项目根目录"
echo ""

# 1. 安装MCP SDK
echo "[1/4] 安装MCP SDK..."
npm install @modelcontextprotocol/sdk --save
if [ $? -ne 0 ]; then
    echo "❌ MCP SDK安装失败"
    exit 1
fi
echo "✅ MCP SDK安装成功"
echo ""

# 2. 复制MCP客户端文件
echo "[2/4] 复制MCP客户端文件..."

# 创建lib目录（如果不存在）
mkdir -p src/lib

# 复制文件
cat > src/lib/tianyanchaMCPClient.ts << 'EOF'
/**
 * 天眼查 MCP 客户端模块
 * 
 * 使用 @modelcontextprotocol/sdk 连接天眼查 MCP 服务
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// ============================================================
// 配置
// ============================================================

const TIANYANCHA_MCP_CONFIG = {
  url: 'https://mcp.tianyancha.com/v1',
  authorization: process.env.TIANYANCHA_API_KEY || '38693361-54b4-4acd-8ca5-b258eade669c',
};

// ============================================================
// 类型定义
// ============================================================

export interface TianyanchaCompany {
  id: string;
  name: string;
  creditCode?: string;
  regCapital?: string;
  establishTime?: string;
  address?: string;
  businessScope?: string;
  industry?: string;
  legalPersonName?: string;
  socialStaffNum?: number;
  staffNumRange?: string;
  regStatus?: string;
  companyOrgType?: string;
  [key: string]: any;
}

// ============================================================
// MCP 客户端管理
// ============================================================

let mcpClient: Client | null = null;
let connectionPromise: Promise<Client> | null = null;

async function getMCPClient(): Promise<Client> {
  if (mcpClient) return mcpClient;
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    console.log('[MCP] 连接天眼查...');

    const client = new Client(
      { name: 'yinxin-tianyancha-client', version: '1.0.0' },
      { capabilities: { prompts: {}, resources: {}, tools: {} } }
    );

    const transport = new SSEClientTransport(
      new URL(TIANYANCHA_MCP_CONFIG.url),
      { headers: { 'Authorization': TIANYANCHA_MCP_CONFIG.authorization } }
    );

    await client.connect(transport);
    console.log('[MCP] 连接成功');
    mcpClient = client;
    connectionPromise = null;
    return client;
  })();

  return connectionPromise;
}

export async function closeMCPClient(): Promise<void> {
  if (mcpClient) {
    await mcpClient.close();
    mcpClient = null;
  }
}

// ============================================================
// API 调用函数
// ============================================================

export async function searchCompany(params: {
  name: string;
  pageSize?: number;
  pageNum?: number;
}): Promise<{ data: TianyanchaCompany[]; total: number }> {
  try {
    const client = await getMCPClient();
    console.log(`[MCP] 搜索: ${params.name}`);

    const result = await client.callTool({
      name: 'searchCompany',
      arguments: {
        name: params.name,
        pageSize: params.pageSize || 10,
        pageNum: params.pageNum || 1,
      },
    });

    if (result.content && Array.isArray(result.content)) {
      const textContent = result.content.find((c: any) => c.type === 'text');
      if (textContent && 'text' in textContent) {
        const data = JSON.parse(textContent.text);
        return { data: data.data || [], total: data.total || 0 };
      }
    }
    return { data: [], total: 0 };
  } catch (error: any) {
    console.error('[MCP] 搜索失败:', error.message);
    mcpClient = null;
    return { data: [], total: 0 };
  }
}

export async function getCompanyDetail(companyId: string): Promise<TianyanchaCompany | null> {
  try {
    const client = await getMCPClient();
    console.log(`[MCP] 详情: ${companyId}`);

    const result = await client.callTool({
      name: 'getCompanyDetail',
      arguments: { companyId },
    });

    if (result.content && Array.isArray(result.content)) {
      const textContent = result.content.find((c: any) => c.type === 'text');
      if (textContent && 'text' in textContent) {
        return JSON.parse(textContent.text);
      }
    }
    return null;
  } catch (error: any) {
    console.error('[MCP] 详情失败:', error.message);
    mcpClient = null;
    return null;
  }
}

// ============================================================
// 批量搜索功能
// ============================================================

export async function batchSearchAndArchive(params: {
  city: string;
  keyword?: string;
  minSocialStaffNum: number;
  maxResults: number;
  saveToArchive?: boolean;
}): Promise<any> {
  const { city, keyword = '', minSocialStaffNum, maxResults, saveToArchive = true } = params;

  const result = {
    success: false,
    message: '',
    totalSearched: 0,
    qualifiedCount: 0,
    archivedCount: 0,
    companies: [] as any[],
    errors: [] as string[],
  };

  try {
    const searchKey = keyword ? `${city} ${keyword}` : city;
    const searchResult = await searchCompany({ name: searchKey, pageSize: 20 });

    result.totalSearched = searchResult.data.length;
    console.log(`[MCP] 找到 ${searchResult.data.length} 家公司`);

    for (const company of searchResult.data) {
      if (result.companies.length >= maxResults) break;

      try {
        const detail = await getCompanyDetail(company.id);
        if (!detail) continue;

        const socialStaffNum = detail.socialStaffNum || 0;
        console.log(`  ${detail.name}: 社保${socialStaffNum}人`);

        if (socialStaffNum >= minSocialStaffNum) {
          result.qualifiedCount++;
          result.companies.push({
            name: detail.name,
            socialStaffNum,
            industry: detail.industry,
          });
        }
      } catch (e: any) {
        result.errors.push(e.message);
      }
    }

    result.success = true;
    result.message = `完成！搜索${result.totalSearched}家，符合${result.qualifiedCount}家`;
    return result;
  } catch (error: any) {
    result.message = `失败: ${error.message}`;
    return result;
  }
}

export default { searchCompany, getCompanyDetail, batchSearchAndArchive, closeMCPClient };
EOF

echo "✅ MCP客户端文件创建成功"
echo ""

# 3. 修改apiManager.ts
echo "[3/4] 修改apiManager.ts..."

if [ -f "src/api/apiManager.ts" ]; then
    # 备份原文件
    cp src/api/apiManager.ts src/api/apiManager.ts.bak
    
    # 检查是否已经修改过
    if grep -q "tianyanchaMCPClient" src/api/apiManager.ts; then
        echo "✅ apiManager.ts 已经修改过，跳过"
    else
        # 在文件顶部添加导入
        sed -i '' '1s/^/import { searchCompany, getCompanyDetail } from '\''..\/lib\/tianyanchaMCPClient'\'';\n/' src/api/apiManager.ts 2>/dev/null || \
        sed -i '1s/^/import { searchCompany, getCompanyDetail } from '\''..\/lib\/tianyanchaMCPClient'\'';\n/' src/api/apiManager.ts
        
        echo "✅ apiManager.ts 修改完成（已备份为 .bak）"
    fi
else
    echo "⚠️ 未找到 src/api/apiManager.ts，跳过"
fi
echo ""

# 4. 完成
echo "[4/4] 部署完成！"
echo ""
echo "========================================"
echo "下一步操作："
echo "========================================"
echo "1. 重启项目: npm run dev"
echo "2. 测试: 对AI说'帮我查一下成都科技有限公司'"
echo ""
echo "如果出现问题，可以恢复备份:"
echo "  cp src/api/apiManager.ts.bak src/api/apiManager.ts"
echo "========================================"
