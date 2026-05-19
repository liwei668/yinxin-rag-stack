'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download, Loader2 } from 'lucide-react';

interface ReportViewerProps {
  period: string;
}

type ReportType = 'trial_balance' | 'balance_sheet' | 'income_statement';

const reportTypes: { key: ReportType; label: string }[] = [
  { key: 'trial_balance', label: '试算平衡表' },
  { key: 'balance_sheet', label: '资产负债表' },
  { key: 'income_statement', label: '利润表' },
];

interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
}

interface BalanceSheetRow {
  item: string;
  amount: number;
  isTotal?: boolean;
  isSection?: boolean;
}

interface IncomeStatementRow {
  item: string;
  amount: number;
  isTotal?: boolean;
  isSection?: boolean;
}

export default function ReportViewer({ period }: ReportViewerProps) {
  const [reportType, setReportType] = useState<ReportType>('trial_balance');
  const [reportPeriod, setReportPeriod] = useState(period);
  const [loading, setLoading] = useState(false);
  const [trialBalanceData, setTrialBalanceData] = useState<TrialBalanceRow[]>([]);
  const [balanceSheetData, setBalanceSheetData] = useState<BalanceSheetRow[]>([]);
  const [incomeStatementData, setIncomeStatementData] = useState<IncomeStatementRow[]>([]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/accounting/reports?type=${reportType}&period=${reportPeriod}`
      );
      if (res.ok) {
        const data = await res.json();
        switch (reportType) {
          case 'trial_balance':
            setTrialBalanceData((data.details || []).map((r: any) => ({
              accountCode: r.account_code,
              accountName: r.account_name,
              openingDebit: r.opening_debit || 0,
              openingCredit: r.opening_credit || 0,
              periodDebit: r.period_debit || 0,
              periodCredit: r.period_credit || 0,
              closingDebit: r.closing_debit || 0,
              closingCredit: r.closing_credit || 0,
            })));
            break;
          case 'balance_sheet': {
            const rows: any[] = [];
            // 资产部分
            rows.push({ item: '资产', amount: 0, isSection: true });
            if (data.assets) {
              data.assets.forEach((a: any) => rows.push({ item: a.name, amount: a.amount }));
            }
            const totalLiab = (data.liabilities || []).reduce((s: number, l: any) => s + l.amount, 0);
            rows.push({ item: '资产合计', amount: data.total_assets || 0, isTotal: true });
            // 负债部分
            rows.push({ item: '负债', amount: 0, isSection: true, _section: 'liability' });
            if (data.liabilities) {
              data.liabilities.forEach((l: any) => rows.push({ item: l.name, amount: l.amount, _section: 'liability' }));
            }
            rows.push({ item: '负债合计', amount: totalLiab, isTotal: true, _section: 'liability' });
            // 权益部分
            rows.push({ item: '所有者权益', amount: 0, isSection: true, _section: 'equity' });
            if (data.equity) {
              data.equity.forEach((e: any) => rows.push({ item: e.name, amount: e.amount, _section: 'equity' }));
            }
            rows.push({ item: '负债和所有者权益合计', amount: data.total_liabilities_equity || 0, isTotal: true, _section: 'equity' });
            setBalanceSheetData(rows as any);
            break;
          }
          case 'income_statement': {
            const rows: IncomeStatementRow[] = [];
            if (data.revenues && data.revenues.length > 0) {
              rows.push({ item: '一、营业收入', amount: 0, isSection: true });
              data.revenues.forEach((r: any) => rows.push({ item: r.name, amount: r.amount }));
              const totalRev = data.revenues.reduce((s: number, r: any) => s + r.amount, 0);
              rows.push({ item: '营业收入合计', amount: totalRev, isTotal: true });
            }
            if (data.costs && data.costs.length > 0) {
              rows.push({ item: '二、营业成本', amount: 0, isSection: true });
              data.costs.forEach((r: any) => rows.push({ item: r.name, amount: r.amount }));
              const totalCost = data.costs.reduce((s: number, r: any) => s + r.amount, 0);
              rows.push({ item: '营业成本合计', amount: totalCost, isTotal: true });
            }
            if (data.expenses && data.expenses.length > 0) {
              rows.push({ item: '三、期间费用', amount: 0, isSection: true });
              data.expenses.forEach((r: any) => rows.push({ item: r.name, amount: r.amount }));
              const totalExp = data.expenses.reduce((s: number, r: any) => s + r.amount, 0);
              rows.push({ item: '期间费用合计', amount: totalExp, isTotal: true });
            }
            rows.push({ item: '四、营业利润', amount: data.operating_profit || 0, isTotal: true });
            rows.push({ item: '五、利润总额', amount: data.total_profit || 0, isTotal: true });
            setIncomeStatementData(rows);
            break;
          }
        }
      }
    } catch (error) {
      console.error('获取报表数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [reportType, reportPeriod]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const formatAmount = (amount: number) => {
    return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const renderTrialBalance = () => (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-3 font-medium text-gray-600">科目编码</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">科目名称</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">期初借方</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">期初贷方</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">本期借方</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">本期贷方</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">期末借方</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">期末贷方</th>
          </tr>
        </thead>
        <tbody>
          {trialBalanceData.length === 0 ? (
            <tr>
              <td colSpan={8} className="text-center py-12 text-gray-400">
                暂无数据
              </td>
            </tr>
          ) : (
            <>
              {trialBalanceData.map((row, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-600 font-mono">{row.accountCode}</td>
                  <td className="px-4 py-2.5 text-gray-800">{row.accountName}</td>
                  <td className="px-4 py-2.5 text-right text-gray-800 font-mono">
                    {row.openingDebit ? formatAmount(row.openingDebit) : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-800 font-mono">
                    {row.openingCredit ? formatAmount(row.openingCredit) : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-800 font-mono">
                    {row.periodDebit ? formatAmount(row.periodDebit) : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-800 font-mono">
                    {row.periodCredit ? formatAmount(row.periodCredit) : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-800 font-mono">
                    {row.closingDebit ? formatAmount(row.closingDebit) : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-800 font-mono">
                    {row.closingCredit ? formatAmount(row.closingCredit) : ''}
                  </td>
                </tr>
              ))}
              {/* Totals row */}
              <tr className="bg-gray-50 border-t-2 border-gray-300 font-medium">
                <td className="px-4 py-3" colSpan={2}>
                  合计
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatAmount(trialBalanceData.reduce((s, r) => s + r.openingDebit, 0))}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatAmount(trialBalanceData.reduce((s, r) => s + r.openingCredit, 0))}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatAmount(trialBalanceData.reduce((s, r) => s + r.periodDebit, 0))}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatAmount(trialBalanceData.reduce((s, r) => s + r.periodCredit, 0))}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatAmount(trialBalanceData.reduce((s, r) => s + r.closingDebit, 0))}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatAmount(trialBalanceData.reduce((s, r) => s + r.closingCredit, 0))}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderBalanceSheet = () => {
    // 使用 _section 标记分组：无标记=资产, 'liability'=负债, 'equity'=权益
    const assetRows = balanceSheetData.filter((row) => !(row as any)._section);
    const liabilityRows = balanceSheetData.filter((row) => (row as any)._section === 'liability');
    const equityRows = balanceSheetData.filter((row) => (row as any)._section === 'equity');

    const renderRows = (rows: BalanceSheetRow[]) => (
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td className="text-center py-12 text-gray-400">暂无数据</td>
          </tr>
        ) : (
          rows.map((row, index) => (
            <tr
              key={index}
              className={`border-b border-gray-100 ${
                row.isTotal ? 'bg-gray-50 font-medium' : row.isSection ? 'bg-gray-50 font-medium text-gray-700' : 'hover:bg-gray-50'
              }`}
            >
              <td className="px-4 py-2.5 text-gray-800">{row.item}</td>
              <td className="px-4 py-2.5 text-right text-gray-800 font-mono">
                {formatAmount(row.amount)}
              </td>
            </tr>
          ))
        )}
      </tbody>
    );

    return (
      <div className="grid grid-cols-2 gap-6">
        {/* Assets */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-medium text-gray-700">
            资产
          </div>
          <table className="w-full text-sm">
            {renderRows(assetRows)}
          </table>
        </div>

        {/* Liabilities & Equity */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-medium text-gray-700">
            负债和所有者权益
          </div>
          <table className="w-full text-sm">
            {renderRows([...liabilityRows, ...equityRows])}
          </table>
        </div>
      </div>
    );
  };

  const renderIncomeStatement = () => (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-3 font-medium text-gray-600">项目</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">金额</th>
          </tr>
        </thead>
        <tbody>
          {incomeStatementData.length === 0 ? (
            <tr>
              <td colSpan={2} className="text-center py-12 text-gray-400">
                暂无数据
              </td>
            </tr>
          ) : (
            incomeStatementData.map((row, index) => (
              <tr
                key={index}
                className={`border-b border-gray-100 ${
                  row.isTotal
                    ? 'bg-gray-50 font-bold'
                    : row.isSection
                    ? 'bg-gray-50 font-medium text-gray-700'
                    : 'hover:bg-gray-50'
                }`}
              >
                <td className="px-4 py-2.5 text-gray-800">{row.item}</td>
                <td className="px-4 py-2.5 text-right text-gray-800 font-mono">
                  {formatAmount(row.amount)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  const renderReport = () => {
    switch (reportType) {
      case 'trial_balance':
        return renderTrialBalance();
      case 'balance_sheet':
        return renderBalanceSheet();
      case 'income_statement':
        return renderIncomeStatement();
      default:
        return null;
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">财务报表</h2>
        <button
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          onClick={() => alert('导出 Excel 功能开发中...')}
        >
          <Download size={16} />
          导出 Excel
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {reportTypes.map((type) => (
            <button
              key={type.key}
              onClick={() => setReportType(type.key)}
              className={`px-4 py-2 text-sm rounded-md transition-colors ${
                reportType === type.key
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">期间：</label>
          <input
            type="month"
            value={reportPeriod}
            onChange={(e) => setReportPeriod(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
        </div>
      </div>

      {/* Report Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="animate-spin mr-2" size={20} />
          加载中...
        </div>
      ) : (
        renderReport()
      )}
    </div>
  );
}
