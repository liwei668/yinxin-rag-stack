// 天眼查官方 API 服务
// 文档：https://open.tianyancha.com/

const API_BASE_URL = 'https://open.api.tianyancha.com/services/open';
const API_TOKEN = '38693361-54b4-4acd-8ca5-b258eade669c';

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
 * API 调用封装
 */
async function apiCall(endpoint: string, params: Record<string, any>): Promise<any> {
  // 构建查询字符串
  const queryString = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  
  const url = `${API_BASE_URL}${endpoint}?${queryString}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': API_TOKEN,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败: ${response.status} ${errorText}`);
    }

    return await response.json();
  } catch (error: any) {
    throw new Error(`API 调用异常: ${error.message}`);
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
    const data = await apiCall('/search/2.0', {
      word: keyword,
      pageSize: Math.min(pageSize, 20),
    });

    if (data.error_code !== 0 && data.error_code !== undefined) {
      return {
        success: false,
        companies: [],
        total: 0,
        error: data.reason || '搜索失败',
      };
    }

    const companies: TianyanchaCompany[] = (data.result?.items || []).map((item: any) => ({
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
      total: data.result?.total || companies.length,
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
    const data = await apiCall('/company/baseinfo/normal', {
      id: companyId,
    });

    if (data.error_code !== 0 && data.error_code !== undefined) {
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
