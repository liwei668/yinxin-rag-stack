// 天眼查 API 服务
// 文档：https://open.tianyancha.com/api

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

// 天眼查 API Token（从环境变量读取）
const TIANYANCHA_TOKEN = process.env.TIANYANCHA_API_TOKEN || '';

/**
 * 天眼查企业搜索
 * @param keyword 搜索关键词（公司名、人名、品牌等）
 * @param pageSize 返回数量（默认20）
 */
export async function searchCompanies(
  keyword: string,
  pageSize: number = 20
): Promise<TianyanchaSearchResult> {
  if (!TIANYANCHA_TOKEN) {
    return {
      success: false,
      companies: [],
      total: 0,
      error: '天眼查 API Token 未配置，请在 .env 中设置 TIANYANCHA_API_TOKEN',
    };
  }

  try {
    // 天眼查搜索 API
    const url = `https://open.api.tianyancha.com/services/open/search/2.0?word=${encodeURIComponent(keyword)}&pageSize=${pageSize}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': TIANYANCHA_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        companies: [],
        total: 0,
        error: `API 请求失败: ${response.status} ${errorText}`,
      };
    }

    const data = await response.json();
    
    if (data.errorCode !== 0) {
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
      address: item.regLocation,
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
      error: `请求异常: ${error.message}`,
    };
  }
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
  if (!TIANYANCHA_TOKEN) {
    return {
      success: false,
      error: '天眼查 API Token 未配置',
    };
  }

  try {
    const url = `https://open.api.tianyancha.com/services/open/company/baseinfo/normal?companyId=${companyId}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': TIANYANCHA_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `API 请求失败: ${response.status}`,
      };
    }

    const data = await response.json();
    
    if (data.errorCode !== 0) {
      return {
        success: false,
        error: data.reason || '获取详情失败',
      };
    }

    const item = data.result;
    const company: TianyanchaCompany = {
      id: item.id,
      name: item.name,
      creditCode: item.creditCode,
      regCapital: item.regCapital,
      establishTime: item.estiblishTime,
      address: item.regLocation,
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
      error: `请求异常: ${error.message}`,
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
  // 构建搜索关键词
  let keyword = city;
  if (industry) {
    keyword = `${city} ${industry}`;
  }
  
  return searchCompanies(keyword, pageSize);
}

// 导出类型
export type { TianyanchaCompany, TianyanchaSearchResult };
