/**
 * 天眼查批量搜索工具
 * 
 * 功能：
 * 1. 按城市+关键词搜索公司
 * 2. 逐个查询详情获取社保人数
 * 3. 筛选符合条件的公司
 * 4. 批量归档到客户档案
 */

import { callAPI } from '../api/apiManager';
import { customerArchiveStore, writeCustomerFile } from '../../lib/customerArchiveStore';

// ============================================================
// 类型定义
// ============================================================

export interface BatchSearchParams {
  city: string;                    // 城市名称（如：成都）
  keyword?: string;                // 搜索关键词（如：科技、网络）
  minSocialStaffNum: number;       // 最小社保人数（如：20）
  maxResults: number;              // 最大结果数量（如：5）
  saveToArchive?: boolean;         // 是否保存到客户档案（默认true）
}

export interface CompanyDetail {
  id: string;
  name: string;
  creditCode?: string;
  regCapital?: string;
  establishTime?: string;
  address?: string;
  businessScope?: string;
  industry?: string;
  legalPersonName?: string;
  socialStaffNum?: number;         // 社保人数
  staffNumRange?: string;          // 人员规模范围
  regStatus?: string;
  companyOrgType?: string;
  [key: string]: any;
}

export interface BatchSearchResult {
  success: boolean;
  message: string;
  totalSearched: number;           // 总共搜索了多少家
  qualifiedCount: number;          // 符合条件的有多少家
  archivedCount: number;           // 成功归档多少家
  companies: Array<{
    company: CompanyDetail;
    archived: boolean;
    archiveId?: string;
  }>;
  errors?: string[];
}

// ============================================================
// 核心函数
// ============================================================

/**
 * 批量搜索并筛选公司
 * 
 * 执行流程：
 * 1. 搜索城市+关键词的公司列表
 * 2. 逐个获取公司详情
 * 3. 检查社保人数是否达标
 * 4. 收集达标公司直到满足数量
 * 5. 批量归档到客户档案
 */
export async function batchSearchAndArchive(
  params: BatchSearchParams
): Promise<BatchSearchResult> {
  const {
    city,
    keyword = '',
    minSocialStaffNum,
    maxResults,
    saveToArchive = true,
  } = params;

  const result: BatchSearchResult = {
    success: false,
    message: '',
    totalSearched: 0,
    qualifiedCount: 0,
    archivedCount: 0,
    companies: [],
    errors: [],
  };

  try {
    console.log(`[BatchSearch] 开始搜索：城市=${city}, 关键词=${keyword || '无'}, 最小社保人数=${minSocialStaffNum}`);

    // 1. 搜索公司列表
    const searchKeyword = keyword ? `${city} ${keyword}` : city;
    const searchResult = await callAPI('tianyancha-company-api', 'searchCompany', {
      name: searchKeyword,
      pageSize: 20,  // 先搜索20家
      pageNum: 1,
    });

    if (!searchResult.data || searchResult.data.length === 0) {
      result.message = `未找到${city}的相关企业`;
      return result;
    }

    const companyList = searchResult.data;
    result.totalSearched = companyList.length;
    console.log(`[BatchSearch] 找到 ${companyList.length} 家公司，开始逐个检查社保人数...`);

    // 2. 逐个获取详情并筛选
    for (const company of companyList) {
      // 如果已收集足够数量，停止
      if (result.companies.length >= maxResults) {
        break;
      }

      const companyId = company.id || company.companyId;
      const companyName = company.name || company.companyName;

      if (!companyId) {
        result.errors?.push(`公司 ${companyName} 缺少ID，跳过`);
        continue;
      }

      try {
        // 获取公司详情
        const detail = await callAPI('tianyancha-company-api', 'getCompanyDetail', {
          companyId,
        });

        if (!detail) {
          result.errors?.push(`获取 ${companyName} 详情失败`);
          continue;
        }

        // 检查社保人数
        const socialStaffNum = detail.socialStaffNum || 0;
        
        console.log(`[BatchSearch] ${companyName} - 社保人数: ${socialStaffNum}`);

        if (socialStaffNum >= minSocialStaffNum) {
          // 符合条件
          result.qualifiedCount++;
          
          // 归档到客户档案
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

          result.companies.push({
            company: detail,
            archived,
            archiveId,
          });
        }
      } catch (error: any) {
        result.errors?.push(`处理 ${companyName} 时出错: ${error.message}`);
      }
    }

    // 3. 生成结果报告
    result.success = true;
    result.message = `搜索完成！共搜索 ${result.totalSearched} 家公司，` +
      `其中 ${result.qualifiedCount} 家社保人数≥${minSocialStaffNum}人，` +
      `成功归档 ${result.archivedCount} 家到客户档案。`;

    console.log(`[BatchSearch] ${result.message}`);

    return result;
  } catch (error: any) {
    result.success = false;
    result.message = `批量搜索失败: ${error.message}`;
    console.error('[BatchSearch] 错误:', error);
    return result;
  }
}

/**
 * 归档单个公司到客户档案
 */
async function archiveCompany(company: CompanyDetail): Promise<{ success: boolean; archiveId?: string }> {
  try {
    const companyId = company.id || company.creditCode || `tyc_${Date.now()}`;
    
    // 检查是否已存在
    const existing = customerArchiveStore.findByCustomerId(companyId);
    
    if (existing) {
      // 更新现有档案
      customerArchiveStore.update(existing.id, {
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
            socialStaffNum: company.socialStaffNum,      // 社保人数
            staffNumRange: company.staffNumRange,        // 人员规模
            regStatus: company.regStatus,
            companyOrgType: company.companyOrgType,
            dataSource: '天眼查',
            updatedAt: new Date().toISOString(),
          }
        }, null, 2),
        updatedAt: new Date().toISOString(),
      });
      
      // 更新档案文件
      await updateCustomerFile(companyId, company);
      
      return { success: true, archiveId: existing.id };
    } else {
      // 创建新档案
      const archiveId = customerArchiveStore.create({
        customerId: companyId,
        companyName: company.name || '未知公司',
        contactName: company.legalPersonName || '',
        contactEmail: '',
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
            socialStaffNum: company.socialStaffNum,      // 社保人数
            staffNumRange: company.staffNumRange,        // 人员规模
            regStatus: company.regStatus,
            companyOrgType: company.companyOrgType,
            dataSource: '天眼查',
            createdAt: new Date().toISOString(),
          }
        }, null, 2),
        tags: ['天眼查', '批量导入', `社保${company.socialStaffNum}人`],
        status: 'active',
      });
      
      // 创建档案文件
      await updateCustomerFile(companyId, company);
      
      return { success: true, archiveId };
    }
  } catch (error: any) {
    console.error('[BatchSearch] 归档失败:', error);
    return { success: false };
  }
}

/**
 * 更新/创建客户档案文件
 */
async function updateCustomerFile(companyId: string, company: CompanyDetail): Promise<void> {
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
}

// ============================================================
// 工具注册（用于Agent系统）
// ============================================================

/**
 * 注册到Agent工具系统的配置
 * 
 * 将此配置添加到 src/services/agent/toolRegistry.ts 中
 */
export const tianyanchaBatchSearchToolConfig = {
  name: 'tianyancha_batch_search',
  description: '批量搜索天眼查企业信息，按社保人数筛选并自动归档到客户档案。支持指定城市、关键词、最小社保人数和最大结果数量。',
  category: '搜索',
  riskLevel: 'safe',
  requiresApproval: false,
  parameters: [
    { 
      name: 'city', 
      type: 'string', 
      description: '城市名称（如：成都、北京、上海）', 
      required: true 
    },
    { 
      name: 'keyword', 
      type: 'string', 
      description: '搜索关键词（如：科技、网络、贸易），可选', 
      required: false 
    },
    { 
      name: 'min_social_staff_num', 
      type: 'number', 
      description: '最小社保人数（如：20），只保留社保人数大于等于此值的公司', 
      required: true 
    },
    { 
      name: 'max_results', 
      type: 'number', 
      description: '最大结果数量（如：5），最多归档多少家公司', 
      required: true 
    },
    { 
      name: 'save_to_archive', 
      type: 'boolean', 
      description: '是否自动保存到客户档案（默认true）', 
      required: false, 
      default: true 
    },
  ],
  executor: async (params: {
    city: string;
    keyword?: string;
    min_social_staff_num: number;
    max_results: number;
    save_to_archive?: boolean;
  }) => {
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

// ============================================================
// 导出
// ============================================================

export default {
  batchSearchAndArchive,
  tianyanchaBatchSearchToolConfig,
};
