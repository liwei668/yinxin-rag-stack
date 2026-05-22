// 天眼查 MCP 服务
// 通过 MCP 协议调用天眼查 API

const MCP_BASE_URL = 'https://mcp.tianyancha.com/v1';
const MCP_TOKEN = '38693361-54b4-4acd-8ca5-b258eade669c';

interface TianyanchaCompany {
  id: number;
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
}

interface TianyanchaSearchResult {
  success: boolean;
  companies: TianyanchaCompany[];
  total: number;
  error?: string;
}

/**
 * MCP 调用封装
 */
async function mcpCall(endpoint: string, params: Record<string, any>): Promise<any> {
  const url = `${MCP_BASE_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': MCP_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MCP 请求失败: ${response.status} ${errorText}`);
    }

    return await response.json();
  } catch (error: any) {
    throw new Error(`MCP 调用异常: ${error.message}`);
  }
}

/**
 * 天眼查企业搜索
 * @param keyword 搜索关键词
 * @param pageSize 返回数量
 */
export async function searchCompanies(
  keyword: string,
  pageSize: number = 20
): Promise<TianyanchaSearchResult> {
  try {
    const data = await mcpCall('/search', {
      word: keyword,
      pageSize: Math.min(pageSize, 20),
    });

    if (data.errorCode !== 0 && data.errorCode !== undefined) {
      return {
        success: false,
        companies: [],
        total: 0,
        error: data.reason || '搜索失败',
      };
    }

    const companies: TianyanchaCompany[] = (data.result?.items || data.items || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      creditCode: item.creditCode,
      regCapital: item.regCapital,
      establishTime: item.estiblishTime || item.establishTime,
      address: item.regLocation || item.address,
      businessScope: item.businessScope,
      industry: item.industry,
      legalPersonName: item.legalPersonName,
      socialStaffNum: item.socialStaffNum,
      staffNumRange: item.staffNumRange,
      regStatus: item.regStatus,
      companyOrgType: item.companyOrgType,
      phoneNumber: item.phone || item.phoneNumber,
      email: item.email,
    }));

    return {
      success: true,
      companies,
      total: data.result?.total || data.total || companies.length,
    };
  } catch (error: any) {
    return {
      success: false,
      companies: [],
      total: 0,
      error: error.message,
    };
  }
}

/**
 * 按地区和行业搜索企业
 * @param city 城市
 * @param industry 行业
 * @param pageSize 返回数量
 */
export async function searchByRegion(
  city: string,
  industry?: string,
  pageSize: number = 20
): Promise<TianyanchaSearchResult> {
  let keyword = city;
  if (industry) {
    keyword = `${city} ${industry}`;
  }
  
  return searchCompanies(keyword, pageSize);
}

/**
 * 获取企业详细信息
 * @param companyId 天眼查企业ID
 */
export async function getCompanyDetail(companyId: number): Promise<{
  success: boolean;
  company?: TianyanchaCompany;
  error?: string;
}> {
  try {
    const data = await mcpCall('/company/baseinfo', {
      companyId: companyId,
    });

    if (data.errorCode !== 0 && data.errorCode !== undefined) {
      return {
        success: false,
        error: data.reason || '获取详情失败',
      };
    }

    const item = data.result || data;
    const company: TianyanchaCompany = {
      id: item.id,
      name: item.name,
      creditCode: item.creditCode,
      regCapital: item.regCapital,
      establishTime: item.estiblishTime || item.establishTime,
      address: item.regLocation || item.address,
      businessScope: item.businessScope,
      industry: item.industry,
      legalPersonName: item.legalPersonName,
      socialStaffNum: item.socialStaffNum,
      staffNumRange: item.staffNumRange,
      regStatus: item.regStatus,
      companyOrgType: item.companyOrgType,
      phoneNumber: item.phone || item.phoneNumber,
      email: item.email,
    };

    return {
      success: true,
      company,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// 导出类型
export type { TianyanchaCompany, TianyanchaSearchResult };
