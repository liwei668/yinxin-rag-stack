/**
 * 企查查批量搜索工具
 * 
 * 功能：
 * 1. 按城市+关键词搜索公司
 * 2. 逐个查询详情获取社保人数（通过企业年报）
 * 3. 筛选符合条件的公司
 * 4. 批量归档到客户档案
 */

import { customerArchiveStore, writeCustomerFile } from '../../lib/customerArchiveStore';

// ============================================================
// 配置
// ============================================================

const QICHACHA_CONFIG = {
  baseUrl: 'https://api.qichacha.com',
  // 请替换为您的实际Key
  appKey: process.env.QICHACHA_APP_KEY || 'YOUR_APP_KEY',
  appSecret: process.env.QICHACHA_APP_SECRET || 'YOUR_APP_SECRET',
};

// ============================================================
// 类型定义
// ============================================================

export interface BatchSearchParams {
  city: string;
  keyword?: string;
  minSocialStaffNum: number;
  maxResults: number;
  saveToArchive?: boolean;
}

export interface QichachaCompany {
  KeyNo: string;
  Name: string;
  CreditCode?: string;
  RegCapital?: string;
  EstablishTime?: string;
  Address?: string;
  BusinessScope?: string;
  Industry?: string;
  LegalPerson?: string;
  Status?: string;
  CompanyType?: string;
  // 年报中的社保信息
  SocialStaffNum?: number;
  StaffNumRange?: string;
  [key: string]: any;
}

export interface BatchSearchResult {
  success: boolean;
  message: string;
  totalSearched: number;
  qualifiedCount: number;
  archivedCount: number;
  companies: Array<{
    company: QichachaCompany;
    archived: boolean;
    archiveId?: string;
  }>;
  errors?: string[];
}

// ============================================================
// API调用函数
// ============================================================

/**
 * 生成企查查API签名
 */
function generateSignature(timestamp: string): string {
  // 企查查签名算法：MD5(AppKey + Timespan + AppSecret)
  const crypto = require('crypto');
  const signStr = QICHACHA_CONFIG.appKey + timestamp + QICHACHA_CONFIG.appSecret;
  return crypto.createHash('md5').update(signStr).digest('hex').toUpperCase();
}

/**
 * 搜索公司列表
 */
async function searchCompanies(params: {
  searchKey: string;
  pageSize?: number;
  pageIndex?: number;
}): Promise<{ result: any; status: string }> {
  const { searchKey, pageSize = 20, pageIndex = 1 } = params;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sign = generateSignature(timestamp);

  const url = new URL(`${QICHACHA_CONFIG.baseUrl}/FuzzySearch/GetList`);
  url.searchParams.append('key', QICHACHA_CONFIG.appKey);
  url.searchParams.append('searchKey', searchKey);
  url.searchParams.append('pageSize', pageSize.toString());
  url.searchParams.append('pageIndex', pageIndex.toString());
  url.searchParams.append('timestamp', timestamp);
  url.searchParams.append('sign', sign);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`搜索失败: ${response.status}`);
  }

  return await response.json();
}

/**
 * 获取公司详情（包含年报社保信息）
 */
async function getCompanyDetail(companyName: string): Promise<QichachaCompany | null> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sign = generateSignature(timestamp);

  const url = new URL(`${QICHACHA_CONFIG.baseUrl}/ECI/GetBasicDetailsByName`);
  url.searchParams.append('key', QICHACHA_CONFIG.appKey);
  url.searchParams.append('companyName', companyName);
  url.searchParams.append('timestamp', timestamp);
  url.searchParams.append('sign', sign);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error(`获取详情失败: ${response.status}`);
    return null;
  }

  const data = await response.json();
  
  if (data.Status !== '200') {
    console.error(`API错误: ${data.Message}`);
    return null;
  }

  // 解析社保人数（从年报数据中）
  const result = data.Result || {};
  
  // 尝试从年报中获取社保人数
  if (result.AnnualReports && result.AnnualReports.length > 0) {
    const latestReport = result.AnnualReports[0];
    result.SocialStaffNum = latestReport.SocialSecurityStaffNum || 0;
    result.StaffNumRange = latestReport.TotalAssets || '';
  }

  return result;
}

// ============================================================
// 核心功能
// ============================================================

/**
 * 批量搜索并筛选公司
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
    console.log(`[QichachaBatch] 开始搜索：城市=${city}, 关键词=${keyword || '无'}, 最小社保人数=${minSocialStaffNum}`);

    // 1. 搜索公司列表
    const searchKey = keyword ? `${city} ${keyword}` : city;
    const searchResult = await searchCompanies({
      searchKey,
      pageSize: 20,
      pageIndex: 1,
    });

    if (searchResult.Status !== '200') {
      result.message = `搜索失败: ${searchResult.Message}`;
      return result;
    }

    const companyList = searchResult.Result?.Data || [];
    result.totalSearched = companyList.length;
    console.log(`[QichachaBatch] 找到 ${companyList.length} 家公司，开始逐个检查社保人数...`);

    // 2. 逐个获取详情并筛选
    for (const company of companyList) {
      if (result.companies.length >= maxResults) {
        break;
      }

      const companyName = company.Name;
      const keyNo = company.KeyNo;

      if (!companyName) {
        result.errors?.push(`公司缺少名称，跳过`);
        continue;
      }

      try {
        console.log(`\n[${result.companies.length + 1}] 查询: ${companyName}`);
        
        // 获取详情（包含年报社保信息）
        const detail = await getCompanyDetail(companyName);

        if (!detail) {
          result.errors?.push(`获取 ${companyName} 详情失败`);
          continue;
        }

        // 检查社保人数
        const socialStaffNum = detail.SocialStaffNum || 0;
        console.log(`    社保人数: ${socialStaffNum}`);

        if (socialStaffNum >= minSocialStaffNum) {
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

          console.log(`    ✅ 符合条件并已归档!`);
        } else {
          console.log(`    ❌ 不符合条件(需要>=${minSocialStaffNum})`);
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

    console.log(`\n[QichachaBatch] ${result.message}`);

    return result;
  } catch (error: any) {
    result.success = false;
    result.message = `批量搜索失败: ${error.message}`;
    console.error('[QichachaBatch] 错误:', error);
    return result;
  }
}

/**
 * 归档单个公司到客户档案
 */
async function archiveCompany(company: QichachaCompany): Promise<{ success: boolean; archiveId?: string }> {
  try {
    const companyId = company.KeyNo || company.CreditCode || `qcc_${Date.now()}`;

    // 检查是否已存在
    const existing = customerArchiveStore.findByCustomerId(companyId);

    const archiveData = {
      companyName: company.Name || '未知公司',
      industry: company.Industry || company.CompanyType || '',
      notes: JSON.stringify({
        qichacha: {
          keyNo: company.KeyNo,
          creditCode: company.CreditCode,
          regCapital: company.RegCapital,
          establishTime: company.EstablishTime,
          address: company.Address,
          businessScope: company.BusinessScope,
          legalPerson: company.LegalPerson,
          socialStaffNum: company.SocialStaffNum,
          staffNumRange: company.StaffNumRange,
          status: company.Status,
          companyType: company.CompanyType,
          dataSource: '企查查',
          updatedAt: new Date().toISOString(),
        }
      }, null, 2),
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      customerArchiveStore.update(existing.id, archiveData);
      await updateCustomerFile(companyId, company);
      return { success: true, archiveId: existing.id };
    } else {
      const archiveId = customerArchiveStore.create({
        customerId: companyId,
        companyName: company.Name || '未知公司',
        contactName: company.LegalPerson || '',
        contactEmail: '',
        industry: company.Industry || company.CompanyType || '',
        notes: archiveData.notes,
        tags: ['企查查', '批量导入', `社保${company.SocialStaffNum || 0}人`],
        status: 'active',
      });

      await updateCustomerFile(companyId, company);
      return { success: true, archiveId };
    }
  } catch (error: any) {
    console.error('[QichachaBatch] 归档失败:', error);
    return { success: false };
  }
}

/**
 * 更新/创建客户档案文件
 */
async function updateCustomerFile(companyId: string, company: QichachaCompany): Promise<void> {
  const fileContent = `[客户画像]
公司名称：${company.Name || '未知公司'}
统一社会信用代码：${company.CreditCode || '未知'}
企业编号：${company.KeyNo || '未知'}
行业：${company.Industry || company.CompanyType || '未知'}
企业类型：${company.CompanyType || '未知'}
经营状态：${company.Status || '未知'}
注册资本：${company.RegCapital || '未知'}
成立时间：${company.EstablishTime || '未知'}
注册地址：${company.Address || '未知'}
法人姓名：${company.LegalPerson || '未知'}
参保人数：${company.SocialStaffNum || '未知'}
人员规模：${company.StaffNumRange || '未知'}

[经营范围]
${company.BusinessScope || '暂无'}

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
// 工具注册配置
// ============================================================

export const qichachaBatchSearchToolConfig = {
  name: 'qichacha_batch_search',
  description: '通过企查查API批量搜索企业信息，按社保人数筛选并自动归档到客户档案。支持指定城市、关键词、最小社保人数和最大结果数量。',
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
          name: c.company.Name,
          social_staff_num: c.company.SocialStaffNum,
          industry: c.company.Industry,
          archived: c.archived,
          archive_id: c.archiveId,
        })),
        errors: result.errors,
      },
    };
  },
};

export default {
  batchSearchAndArchive,
  qichachaBatchSearchToolConfig,
};
