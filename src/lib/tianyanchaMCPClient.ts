/**
 * 天眼查 MCP 客户端模块
 * 
 * 使用 JSON-RPC 2.0 Streamable HTTP 协议连接天眼查 MCP 服务
 * 协议流程：POST initialize → 获取 Mcp-Session-Id → 后续请求携带 Session-Id
 */

// ============================================================
// 导入
// ============================================================

// 客户档案存储（静态导入避免动态导入问题）
import { customerArchiveStore, writeCustomerFile } from '../../lib/customerArchiveStore';

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
  phoneNumber?: string;
  email?: string;
  emailList?: string[];
  [key: string]: any;
}

export interface SearchResult {
  data: TianyanchaCompany[];
  total: number;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

// ============================================================
// MCP 会话管理（JSON-RPC 2.0 Streamable HTTP）
// ============================================================

let sessionId: string | null = null;
let requestId = 0;
let initPromise: Promise<void> | null = null;

/**
 * 发送 JSON-RPC 2.0 请求
 */
async function jsonRpcRequest(method: string, params: Record<string, any> = {}): Promise<any> {
  const id = ++requestId;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': TIANYANCHA_MCP_CONFIG.authorization,
    'Accept': 'application/json, text/event-stream',
  };

  // 如果已有 session ID，携带它
  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }

  const response = await fetch(TIANYANCHA_MCP_CONFIG.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id,
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP HTTP ${response.status}: ${response.statusText}`);
  }

  // 保存 session ID（从响应头获取）
  const newSessionId = response.headers.get('mcp-session-id');
  if (newSessionId) {
    sessionId = newSessionId;
  }

  // 解析响应
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('text/event-stream')) {
    // SSE 响应：逐行解析
    const text = await response.text();
    return parseSseResponse(text, id);
  } else {
    // JSON 响应
    const data: JsonRpcResponse = await response.json();
    if (data.error) {
      throw new Error(`MCP Error ${data.error.code}: ${data.error.message}`);
    }
    return data.result;
  }
}

/**
 * 解析 SSE 格式的响应
 */
function parseSseResponse(text: string, expectedId: number): any {
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data:')) {
      const jsonStr = line.slice(5).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;
      try {
        const data: JsonRpcResponse = JSON.parse(jsonStr);
        if (data.id === expectedId) {
          if (data.error) {
            throw new Error(`MCP Error ${data.error.code}: ${data.error.message}`);
          }
          return data.result;
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  throw new Error('MCP SSE 响应中未找到匹配的 JSON-RPC 结果');
}

/**
 * 初始化 MCP 会话
 */
async function ensureInitialized(): Promise<void> {
  if (sessionId) return;

  if (initPromise) return initPromise;

  initPromise = (async () => {
    console.log('[MCP] 正在初始化天眼查 MCP 会话（JSON-RPC 2.0）...');

    try {
      const result = await jsonRpcRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'yinxin-tianyancha-client',
          version: '1.0.0',
        },
      });

      // 发送 initialized 通知（不等待响应，因为通知不需要返回）
      try {
        await jsonRpcRequest('notifications/initialized', {});
      } catch {
        // 通知可能返回错误，忽略
      }

      console.log('[MCP] 天眼查 MCP 会话初始化成功, sessionId:', sessionId?.slice(0, 16) + '...');
    } catch (error: any) {
      console.error('[MCP] 初始化失败:', error.message);
      sessionId = null;
      initPromise = null;
      throw error;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * 重置会话（连接失败时调用）
 */
function resetSession(): void {
  sessionId = null;
  initPromise = null;
}

/**
 * 关闭 MCP 客户端连接
 */
export async function closeMCPClient(): Promise<void> {
  resetSession();
  console.log('[MCP] 天眼查 MCP 会话已重置');
}

// ============================================================
// MCP 工具调用
// ============================================================

/**
 * 调用 MCP 工具
 */
async function callTool(toolName: string, args: Record<string, any> = {}): Promise<any> {
  await ensureInitialized();

  const result = await jsonRpcRequest('tools/call', {
    name: toolName,
    arguments: args,
  });

  // 解析工具返回的内容
  if (result?.content && Array.isArray(result.content)) {
    const textItem = result.content.find((c: any) => c.type === 'text');
    if (textItem && 'text' in textItem) {
      try {
        return JSON.parse(textItem.text);
      } catch {
        return textItem.text;
      }
    }
  }

  return result;
}

/**
 * 列出可用的 MCP 工具
 */
export async function listAvailableTools(): Promise<McpToolInfo[]> {
  await ensureInitialized();

  const result = await jsonRpcRequest('tools/list', {});
  return result?.tools || [];
}

// ============================================================
// 天眼查业务 API
// ============================================================

/**
 * 搜索公司（使用 search_companies 工具）
 */
export async function searchCompany(params: {
  name: string;
  keyword?: string;
  pageSize?: number;
  pageNum?: number;
}): Promise<SearchResult> {
  try {
    const query = params.name || params.keyword;
    if (!query) {
      throw new Error('请提供公司名称或关键词');
    }

    console.log(`[MCP] 搜索公司: ${query}`);

    const result = await callTool('search_companies', {
      searchKey: query,
      pageSize: String(params.pageSize || 10),
      pageNum: String(params.pageNum || 1),
    });

    // 适配返回格式：MCP 返回 { items: [...], total: N }
    if (result?.items) {
      return { data: result.items, total: result.total || result.items.length };
    }
    if (Array.isArray(result)) {
      return { data: result, total: result.length };
    }
    if (result?.data) {
      return { data: result.data, total: result.total || result.data.length };
    }

    return { data: [], total: 0 };
  } catch (error: any) {
    console.error('[MCP] 搜索公司失败:', error.message);
    resetSession();
    return { data: [], total: 0 };
  }
}

/**
 * 按行业和地区搜索公司
 */
export async function searchCompaniesByIndustryRegion(params: {
  industry?: string;
  region?: string;
  keyword?: string;
  pageSize?: number;
  pageNum?: number;
}): Promise<SearchResult> {
  try {
    console.log(`[MCP] 按行业/地区搜索: industry=${params.industry}, region=${params.region}, keyword=${params.keyword}`);

    const args: Record<string, any> = { searchKey: params.keyword || '' };
    if (params.industry) args.industry = params.industry;
    if (params.region) args.region = params.region;
    args.pageSize = String(params.pageSize || 20);
    args.pageNum = String(params.pageNum || 1);

    const result = await callTool('search_companies_by_industry_region', args);

    if (result?.items) {
      return { data: result.items, total: result.total || result.items.length };
    }
    if (Array.isArray(result)) {
      return { data: result, total: result.length };
    }
    if (result?.data) {
      return { data: result.data, total: result.total || result.data.length };
    }

    return { data: [], total: 0 };
  } catch (error: any) {
    console.error('[MCP] 按行业/地区搜索失败:', error.message);
    resetSession();
    return { data: [], total: 0 };
  }
}

/**
 * 获取公司详情（包含社保人数）
 * 使用 get_company_registration_info 工具，返回 socialStaffNum
 */
export async function getCompanyDetail(companyIdOrName: string): Promise<TianyanchaCompany | null> {
  try {
    if (!companyIdOrName) {
      throw new Error('请提供公司 ID 或名称');
    }

    console.log(`[MCP] 获取公司详情: ${companyIdOrName}`);

    const result = await callTool('get_company_registration_info', {
      searchKey: companyIdOrName,
    });

    if (result) {
      // MCP 返回格式：{ _base: {...}, ... } 或直接返回对象
      const company = result._base || result;
      return company as TianyanchaCompany;
    }

    return null;
  } catch (error: any) {
    console.error('[MCP] 获取公司详情失败:', error.message);
    resetSession();
    return null;
  }
}

/**
 * 获取公司员工/社保信息
 * 注意：get_company_registration_info 已包含 socialStaffNum，此方法用于单独查询
 */
export async function getStaffInfo(companyNameOrId: string): Promise<any> {
  try {
    if (!companyNameOrId) {
      throw new Error('请提供公司名称或 ID');
    }

    console.log(`[MCP] 获取员工社保信息: ${companyNameOrId}`);

    const result = await callTool('get_company_registration_info', {
      searchKey: companyNameOrId,
    });

    if (result) {
      const company = result._base || result;
      return {
        socialStaffNum: company.socialStaffNum || 0,
        staffNumRange: company.staffNumRange || '',
        companyScale: company._raw || '',
      };
    }

    return null;
  } catch (error: any) {
    console.error('[MCP] 获取员工社保信息失败:', error.message);
    resetSession();
    return null;
  }
}

// ============================================================
// 批量搜索 + 社保筛选 + 自动归档
// ============================================================

/**
 * 批量搜索并筛选公司（按社保人数）
 */
export async function batchSearchAndArchive(params: {
  city: string;
  keyword?: string;
  industry?: string;
  minSocialStaffNum: number;
  maxResults: number;
  saveToArchive?: boolean;
}): Promise<{
  success: boolean;
  message: string;
  totalSearched: number;
  qualifiedCount: number;
  archivedCount: number;
  companies: Array<{
    company: TianyanchaCompany;
    archived: boolean;
    archiveId?: string;
  }>;
  errors?: string[];
}> {
  const { city, keyword = '', industry, minSocialStaffNum, maxResults, saveToArchive = true } = params;

  const result = {
    success: false,
    message: '',
    totalSearched: 0,
    qualifiedCount: 0,
    archivedCount: 0,
    companies: [] as Array<{ company: TianyanchaCompany; archived: boolean; archiveId?: string }>,
    errors: [] as string[],
  };

  try {
    console.log(`[MCP] 开始批量搜索：城市=${city}, 行业=${industry || '不限'}, 关键词=${keyword || '无'}, 最小社保人数=${minSocialStaffNum}`);

    // 1. 搜索公司列表（优先按行业+地区搜索）
    let searchResult: SearchResult;
    if (industry) {
      searchResult = await searchCompaniesByIndustryRegion({
        industry,
        region: city,
        keyword: keyword || undefined,
        pageSize: 20,
        pageNum: 1,
      });
    } else {
      const searchKey = keyword ? `${city} ${keyword}` : city;
      searchResult = await searchCompany({
        name: searchKey,
        pageSize: 20,
        pageNum: 1,
      });
    }

    result.totalSearched = searchResult.data.length;
    console.log(`[MCP] 找到 ${searchResult.data.length} 家公司`);

    if (searchResult.data.length === 0) {
      result.message = `未找到${city}的相关企业`;
      return result;
    }

    // 2. 逐个获取详情（含社保人数）并筛选
    for (const company of searchResult.data) {
      if (result.companies.length >= maxResults) {
        break;
      }

      const companyName = company.name;

      if (!companyName) {
        result.errors.push(`公司缺少名称，跳过`);
        continue;
      }

      try {
        console.log(`\n[MCP] 查询: ${companyName}`);

        // 获取详情（包含社保人数 socialStaffNum）
        const detail = await getCompanyDetail(companyName);

        let socialStaffNum = 0;

        if (detail) {
          socialStaffNum = detail.socialStaffNum || 0;
          // 合并详情信息到 company
          Object.assign(company, detail);
          console.log(`    社保人数: ${socialStaffNum}`);
        } else {
          console.log(`    获取详情失败，跳过`);
          result.errors.push(`获取 ${companyName} 详情失败`);
          continue;
        }

        if (socialStaffNum >= minSocialStaffNum) {
          result.qualifiedCount++;

          // 归档
          let archived = false;
          let archiveId: string | undefined;

          if (saveToArchive) {
            const archiveResult = await archiveCompany(company, socialStaffNum);
            archived = archiveResult.success;
            archiveId = archiveResult.archiveId;

            if (archived) {
              result.archivedCount++;
            }
          }

          result.companies.push({ company, archived, archiveId });
          console.log(`    ✅ 符合条件! (社保${socialStaffNum}人)`);
        } else {
          console.log(`    ❌ 不符合条件 (社保${socialStaffNum}人, 需要>=${minSocialStaffNum})`);
        }
      } catch (error: any) {
        result.errors.push(`处理 ${companyName} 时出错: ${error.message}`);
      }
    }

    result.success = true;
    result.message = `搜索完成！共搜索 ${result.totalSearched} 家公司，` +
      `其中 ${result.qualifiedCount} 家社保人数≥${minSocialStaffNum}人，` +
      `成功归档 ${result.archivedCount} 家到客户档案。`;

    return result;
  } catch (error: any) {
    result.message = `批量搜索失败: ${error.message}`;
    console.error('[MCP] 错误:', error);
    return result;
  }
}

/**
 * 归档公司到客户档案
 */
async function archiveCompany(company: TianyanchaCompany, socialStaffNum: number): Promise<{ success: boolean; archiveId?: string }> {
  try {
    const companyId = company.id || company.creditCode || `tyc_${Date.now()}`;

    const existing = customerArchiveStore.findByCustomerId(companyId);

    // 提取联系方式
    const contactPhone = company.phoneNumber || company.phoneList?.[0] || '';
    const contactEmail = company.email || company.emailList?.[0] || '';

    const archiveData = {
      companyName: company.name || '未知公司',
      industry: company.industry || company.companyOrgType || '',
      notes: JSON.stringify({
        tianyancha: {
          companyId: company.id,
          creditCode: company.creditCode,
          regCapital: company.regCapital,
          establishTime: company.establishTime,
          address: company.address,
          businessScope: company.businessScope,
          legalPersonName: company.legalPersonName,
          socialStaffNum,
          staffNumRange: company.staffNumRange,
          regStatus: company.regStatus,
          companyOrgType: company.companyOrgType,
          phoneNumber: contactPhone,
          email: contactEmail,
          emailList: company.emailList,
          dataSource: '天眼查',
          updatedAt: new Date().toISOString(),
        }
      }, null, 2),
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      customerArchiveStore.update(existing.id, archiveData);
      return { success: true, archiveId: existing.id };
    } else {
      const archiveId = customerArchiveStore.create({
        customerId: companyId,
        companyName: company.name || '未知公司',
        contactName: company.legalPersonName || '',
        contactEmail,
        contactPhone,
        industry: company.industry || company.companyOrgType || '',
        notes: archiveData.notes,
        tags: ['天眼查', '批量导入', `社保${socialStaffNum}人`],
        status: 'active',
      });

      // 创建档案文件
      const fileContent = `[客户画像]
公司名称：${company.name || '未知公司'}
统一社会信用代码：${company.creditCode || '未知'}
公司ID：${company.id || '未知'}
行业：${company.industry || company.companyOrgType || '未知'}
企业类型：${company.companyOrgType || '未知'}
经营状态：${company.regStatus || '未知'}
注册资本：${company.regCapital || '未知'}
成立时间：${company.establishTime || '未知'}
注册地址：${company.address || '未知'}
法人姓名：${company.legalPersonName || '未知'}
参保人数：${socialStaffNum || '未知'}
人员规模：${company.staffNumRange || '未知'}
联系电话：${contactPhone || '未知'}
联系邮箱：${contactEmail || '未知'}

[经营范围]
${company.businessScope || '暂无'}

[公司信息]
${JSON.stringify(company, null, 2)}

[对话记录]

[待办事项]
- 跟进客户意向
- 了解具体需求
`;

      writeCustomerFile(companyId, fileContent);

      return { success: true, archiveId };
    }
  } catch (error: any) {
    console.error('[MCP] 归档失败:', error);
    return { success: false };
  }
}

// ============================================================
// 导出
// ============================================================

export default {
  searchCompany,
  searchCompaniesByIndustryRegion,
  getCompanyDetail,
  getStaffInfo,
  listAvailableTools,
  batchSearchAndArchive,
  closeMCPClient,
};
