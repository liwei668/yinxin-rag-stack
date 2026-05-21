/**
 * 天眼查 REST API 客户端
 * 
 * 使用天眼查开放平台 REST API 查询企业信息
 * 文档：https://open.tianyancha.com
 */

import { customerArchiveStore, writeCustomerFile } from '../../lib/customerArchiveStore.js';

// ============================================================
// 配置
// ============================================================

const TIANYANCHA_CONFIG = {
  baseUrl: 'https://api.tianyancha.com',
  // 或者使用 open.api.tianyancha.com
  altBaseUrl: 'https://open.api.tianyancha.com',
  apiKey: process.env.TIANYANCHA_API_KEY || '38693361-54b4-4acd-8ca5-b258eade669c',
};

// ============================================================
// 类型定义
// ============================================================

export interface TianyanchaCompany {
  id: string;
  name: string;
  creditCode?: string;
  regCapital?: string;
  estiblishTime?: string;
  regLocation?: string;
  businessScope?: string;
  industry?: string;
  legalPersonName?: string;
  socialStaffNum?: number;
  staffNumRange?: string;
  regStatus?: string;
  companyOrgType?: string;
  [key: string]: any;
}

export interface SearchResult {
  result: {
    total: number;
    items: TianyanchaCompany[];
  };
  reason: string;
  error_code: number;
}

// ============================================================
// API 调用函数
// ============================================================

/**
 * 搜索公司
 */
export async function searchCompany(params: {
  keyword: string;
  pageSize?: number;
  pageNum?: number;
}): Promise<{ items: TianyanchaCompany[]; total: number }> {
  const { keyword, pageSize = 20, pageNum = 1 } = params;

  try {
    console.log(`[天眼查] 搜索公司: ${keyword}`);

    // 尝试主地址
    let url = `${TIANYANCHA_CONFIG.baseUrl}/open/search/v2/company?keyword=${encodeURIComponent(keyword)}&pageSize=${pageSize}&pageNum=${pageNum}`;
    
    let response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TIANYANCHA_CONFIG.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    // 如果主地址失败，尝试备用地址
    if (!response.ok) {
      console.log(`[天眼查] 主地址返回 ${response.status}，尝试备用地址...`);
      url = `${TIANYANCHA_CONFIG.altBaseUrl}/services/open/search/v2/company?keyword=${encodeURIComponent(keyword)}&pageSize=${pageSize}&pageNum=${pageNum}`;
      
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': TIANYANCHA_CONFIG.apiKey,
          'Content-Type': 'application/json',
        },
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[天眼查] 搜索失败: ${response.status}`, errorText);
      return { items: [], total: 0 };
    }

    const data: SearchResult = await response.json();
    
    if (data.error_code !== 0) {
      console.error(`[天眼查] API错误: ${data.reason}`);
      return { items: [], total: 0 };
    }

    console.log(`[天眼查] 找到 ${data.result?.total || 0} 家公司`);
    
    return {
      items: data.result?.items || [],
      total: data.result?.total || 0,
    };
  } catch (error: any) {
    console.error('[天眼查] 搜索请求失败:', error.message);
    return { items: [], total: 0 };
  }
}

/**
 * 获取公司详情
 */
export async function getCompanyDetail(companyId: string): Promise<TianyanchaCompany | null> {
  try {
    console.log(`[天眼查] 获取公司详情: ${companyId}`);

    // 尝试主地址
    let url = `${TIANYANCHA_CONFIG.baseUrl}/open/company/baseinfo/${companyId}`;
    
    let response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TIANYANCHA_CONFIG.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    // 如果主地址失败，尝试备用地址
    if (!response.ok) {
      url = `${TIANYANCHA_CONFIG.altBaseUrl}/services/open/company/baseinfo/${companyId}`;
      
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': TIANYANCHA_CONFIG.apiKey,
          'Content-Type': 'application/json',
        },
      });
    }

    if (!response.ok) {
      console.error(`[天眼查] 获取详情失败: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (data.error_code !== 0) {
      console.error(`[天眼查] API错误: ${data.reason}`);
      return null;
    }

    return data.result || null;
  } catch (error: any) {
    console.error('[天眼查] 获取详情请求失败:', error.message);
    return null;
  }
}

// ============================================================
// 批量搜索功能
// ============================================================

/**
 * 批量搜索并筛选公司
 */
export async function batchSearchAndArchive(params: {
  city: string;
  keyword?: string;
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
  const { city, keyword = '', minSocialStaffNum, maxResults, saveToArchive = true } = params;

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
    console.log(`[天眼查] 开始批量搜索：城市=${city}, 关键词=${keyword || '无'}, 最小社保人数=${minSocialStaffNum}`);

    // 1. 搜索公司列表
    const searchKey = keyword ? `${city} ${keyword}` : city;
    const searchResult = await searchCompany({
      keyword: searchKey,
      pageSize: 20,
      pageNum: 1,
    });

    result.totalSearched = searchResult.items.length;
    console.log(`[天眼查] 找到 ${searchResult.items.length} 家公司`);

    if (searchResult.items.length === 0) {
      result.message = `未找到${city}的相关企业`;
      return result;
    }

    // 2. 逐个获取详情并筛选
    for (const company of searchResult.items) {
      if (result.companies.length >= maxResults) {
        break;
      }

      const companyId = company.id;
      const companyName = company.name;

      if (!companyId) {
        result.errors.push(`公司 ${companyName} 缺少ID，跳过`);
        continue;
      }

      try {
        console.log(`\n[天眼查] 查询: ${companyName}`);
        
        const detail = await getCompanyDetail(companyId);

        if (!detail) {
          result.errors.push(`获取 ${companyName} 详情失败`);
          continue;
        }

        const socialStaffNum = detail.socialStaffNum || 0;
        console.log(`    社保人数: ${socialStaffNum}`);

        if (socialStaffNum >= minSocialStaffNum) {
          result.qualifiedCount++;

          // 归档
          let archived = false;
          let archiveId: string | undefined;

          if (saveToArchive) {
            const archiveResult = await archiveCompany(detail);
            archived = archiveResult.success;
            archiveId = archiveResult.archiveId;

            if (archived) {
              result.archivedCount++;
            }
          }

          result.companies.push({ company: detail, archived, archiveId });
          console.log(`    ✅ 符合条件!`);
        } else {
          console.log(`    ❌ 不符合条件(需要>=${minSocialStaffNum})`);
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
    console.error('[天眼查] 错误:', error);
    return result;
  }
}

/**
 * 归档公司到客户档案
 */
async function archiveCompany(company: TianyanchaCompany): Promise<{ success: boolean; archiveId?: string }> {
  try {
    const { customerArchiveStore, writeCustomerFile } = await import('../../lib/customerArchiveStore.js');
    
    const companyId = company.id || company.creditCode || `tyc_${Date.now()}`;

    const existing = customerArchiveStore.findByCustomerId(companyId);

    const archiveData = {
      companyName: company.name || '未知公司',
      industry: company.industry || company.companyOrgType || '',
      notes: JSON.stringify({
        tianyancha: {
          companyId: company.id,
          creditCode: company.creditCode,
          regCapital: company.regCapital,
          establishTime: company.estiblishTime,
          address: company.regLocation,
          businessScope: company.businessScope,
          legalPersonName: company.legalPersonName,
          socialStaffNum: company.socialStaffNum,
          staffNumRange: company.staffNumRange,
          regStatus: company.regStatus,
          companyOrgType: company.companyOrgType,
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
        contactEmail: '',
        industry: company.industry || company.companyOrgType || '',
        notes: archiveData.notes,
        tags: ['天眼查', '批量导入', `社保${company.socialStaffNum || 0}人`],
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
成立时间：${company.estiblishTime || '未知'}
注册地址：${company.regLocation || '未知'}
法人姓名：${company.legalPersonName || '未知'}
参保人数：${company.socialStaffNum || '未知'}
人员规模：${company.staffNumRange || '未知'}

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
    console.error('[天眼查] 归档失败:', error);
    return { success: false };
  }
}

// ============================================================
// 工具注册配置
// ============================================================

export const tianyanchaBatchSearchToolConfig = {
  name: 'tianyancha_batch_search',
  description: '通过天眼查API批量搜索企业信息，按社保人数筛选并自动归档到客户档案。支持指定城市、关键词、最小社保人数和最大结果数量。',
  category: '搜索',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { name: 'city', type: 'string', description: '城市名称（如：成都、北京、上海）', required: true },
    { name: 'keyword', type: 'string', description: '搜索关键词（如：科技、网络、贸易），可选', required: false },
    { name: 'min_social_staff_num', type: 'number', description: '最小社保人数（如：20）', required: true },
    { name: 'max_results', type: 'number', description: '最大结果数量（如：5）', required: true },
    { name: 'save_to_archive', type: 'boolean', description: '是否自动保存到客户档案（默认true）', required: false, default: true },
  ],
  executor: async (params: any) => {
    const result = await batchSearchAndArchive({
      city: params.city,
      keyword: params.keyword,
      minSocialStaffNum: params.min_social_staff_num,
      maxResults: params.max_results,
      saveToArchive: params.save_to_archive !== false,
    });

    return {
      success: result.success,
      message: result.message,
      data: {
        total_searched: result.totalSearched,
        qualified_count: result.qualifiedCount,
        archived_count: result.archivedCount,
        companies: result.companies.map(c => ({
          name: c.company.name,
          social_staff_num: c.company.socialStaffNum,
          industry: c.company.industry,
          archived: c.archived,
          archive_id: c.archiveId,
        })),
        errors: result.errors,
      },
    };
  },
};

export default {
  searchCompany,
  getCompanyDetail,
  batchSearchAndArchive,
  tianyanchaBatchSearchToolConfig,
};
