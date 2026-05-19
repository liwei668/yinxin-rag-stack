'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle, Circle, FileText, RefreshCw,
  ShieldCheck, Lock, Unlock, Loader2,
} from 'lucide-react';

interface ClosingPanelProps {
  period: string;
}

/* 后端结账状态 */
interface ClosingStatus {
  period: string;
  status: 'open' | 'closed';
  closed_by: string | null;
  closed_at: string | null;
}

/* 税金计提预览 */
interface TaxPreview {
  voucher: unknown;
  vat_amount: number;
  city_tax: number;
  education_surcharge: number;
  local_education_surcharge: number;
  totalSurcharge: number;
}

/* 损益结转预览 */
interface ProfitPreview {
  voucher: unknown;
  total_revenue: number;
  total_expense: number;
  net_profit: number;
}

/* 试算平衡 */
interface TrialBalance {
  balanced: boolean;
  debitTotal: number;
  creditTotal: number;
}

const fmt = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ClosingPanel({ period }: ClosingPanelProps) {
  /* ---- 状态 ---- */
  const [closingStatus, setClosingStatus] = useState<ClosingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // 当前操作的 action 标识

  // 前端自行跟踪各步骤完成情况
  const [taxDone, setTaxDone] = useState(false);
  const [profitDone, setProfitDone] = useState(false);
  const [balanceOk, setBalanceOk] = useState(false);
  const [balanceChecked, setBalanceChecked] = useState(false);

  // 预览数据
  const [taxPreview, setTaxPreview] = useState<TaxPreview | null>(null);
  const [profitPreview, setProfitPreview] = useState<ProfitPreview | null>(null);
  const [trialData, setTrialData] = useState<TrialBalance | null>(null);

  // 纳税人类型
  const [taxpayerType, setTaxpayerType] = useState<'general' | 'small'>('general');

  const isClosed = closingStatus?.status === 'closed';

  /* ---- 获取结账状态 ---- */
  const fetchClosingStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/accounting/closing?period=${period}`);
      if (res.ok) setClosingStatus(await res.json());
    } catch (e) {
      console.error('获取结账状态失败:', e);
    }
  }, [period]);

  /* ---- 获取试算平衡 ---- */
  const fetchTrialBalance = useCallback(async () => {
    try {
      const res = await fetch(`/api/accounting/reports?type=trial_balance&period=${period}`);
      if (res.ok) {
        const data = await res.json();
        const balanced = data.debitTotal === data.creditTotal;
        setTrialData({ balanced, debitTotal: data.debitTotal, creditTotal: data.creditTotal });
        setBalanceOk(balanced);
        setBalanceChecked(true);
      }
    } catch (e) {
      console.error('获取试算平衡失败:', e);
    }
  }, [period]);

  /* ---- 初始化 ---- */
  useEffect(() => {
    (async () => {
      await Promise.all([fetchClosingStatus(), fetchTrialBalance()]);
      setLoading(false);
    })();
  }, [fetchClosingStatus, fetchTrialBalance]);

  /* ---- 通用 POST 请求 ---- */
  const post = async (body: Record<string, string>) => {
    const res = await fetch('/api/accounting/closing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '操作失败');
    return data;
  };

  /* ---- 税金计提：预览 ---- */
  const handleTaxPreview = async () => {
    setBusy('tax_preview');
    try {
      const data = await post({ action: 'tax_provision', period, taxpayerType });
      setTaxPreview(data.preview);
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /* ---- 税金计提：确认 ---- */
  const handleTaxConfirm = async () => {
    if (!confirm('确认生成税金计提凭证？')) return;
    setBusy('tax_confirm');
    try {
      await post({ action: 'confirm_tax', period, taxpayerType });
      setTaxDone(true);
      setTaxPreview(null);
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /* ---- 损益结转：预览 ---- */
  const handleProfitPreview = async () => {
    setBusy('profit_preview');
    try {
      const data = await post({ action: 'profit_transfer', period });
      setProfitPreview(data.preview);
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /* ---- 损益结转：确认 ---- */
  const handleProfitConfirm = async () => {
    if (!confirm('确认生成损益结转凭证？')) return;
    setBusy('profit_confirm');
    try {
      await post({ action: 'confirm_profit', period });
      setProfitDone(true);
      setProfitPreview(null);
      // 损益结转后重新检查试算平衡
      await fetchTrialBalance();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /* ---- 结账 ---- */
  const handleClose = async () => {
    if (!confirm(`确定要结账 ${period} 吗？结账后将无法修改该期间的凭证。`)) return;
    setBusy('close');
    try {
      await post({ action: 'close', period });
      await fetchClosingStatus();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /* ---- 反结账 ---- */
  const handleReopen = async () => {
    if (!confirm(`确定要反结账 ${period} 吗？反结账后该期间凭证将恢复可编辑状态。`)) return;
    setBusy('reopen');
    try {
      await post({ action: 'reopen', period });
      await fetchClosingStatus();
      // 重置前端步骤状态
      setTaxDone(false);
      setProfitDone(false);
      setBalanceOk(false);
      setBalanceChecked(false);
      setTaxPreview(null);
      setProfitPreview(null);
      setTrialData(null);
      await fetchTrialBalance();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /* ---- 刷新试算平衡 ---- */
  const handleRefreshBalance = async () => {
    setBusy('balance');
    await fetchTrialBalance();
    setBusy(null);
  };

  /* ---- 结账前置条件 ---- */
  const canClose = taxDone && profitDone && balanceOk;

  /* ---- 加载态 ---- */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 className="animate-spin mr-2" size={20} />
        加载中...
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">期末处理</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">当前期间：</span>
          <span className="text-sm font-medium text-gray-700">{period}</span>
          {isClosed && (
            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              已结账
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* 步骤 1：税金计提 */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {taxDone ? (
                <CheckCircle size={22} className="text-green-500" />
              ) : (
                <Circle size={22} className="text-gray-300" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <FileText size={16} className="text-gray-600" />
                <h3 className="font-medium text-gray-800">税金计提</h3>
              </div>

              {taxDone ? (
                <p className="text-sm text-green-600">已完成税金计提</p>
              ) : taxPreview ? (
                /* 预览结果 */
                <div className="space-y-1 mb-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">增值税</span>
                    <span className="font-mono">{fmt(taxPreview.vat_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">城市维护建设税</span>
                    <span className="font-mono">{fmt(taxPreview.city_tax)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">教育费附加</span>
                    <span className="font-mono">{fmt(taxPreview.education_surcharge)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">地方教育附加</span>
                    <span className="font-mono">{fmt(taxPreview.local_education_surcharge)}</span>
                  </div>
                  <div className="flex justify-between font-medium pt-1 border-t border-gray-100">
                    <span className="text-gray-700">附加税合计</span>
                    <span className="font-mono text-green-600">{fmt(taxPreview.totalSurcharge)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 mb-3">计提当期应交税费，生成税金计提凭证</p>
              )}

              {/* 操作按钮 */}
              {!taxDone && !isClosed && (
                <div className="flex items-center gap-3 flex-wrap">
                  {/* 纳税人类型选择 */}
                  {!taxPreview && (
                    <select
                      value={taxpayerType}
                      onChange={(e) => setTaxpayerType(e.target.value as 'general' | 'small')}
                      className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white"
                    >
                      <option value="general">一般纳税人</option>
                      <option value="small">小规模纳税人</option>
                    </select>
                  )}
                  {taxPreview ? (
                    <button
                      onClick={handleTaxConfirm}
                      disabled={busy === 'tax_confirm'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      {busy === 'tax_confirm' ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle size={14} />}
                      确认计提
                    </button>
                  ) : (
                    <button
                      onClick={handleTaxPreview}
                      disabled={busy === 'tax_preview'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {busy === 'tax_preview' ? <Loader2 className="animate-spin" size={14} /> : <FileText size={14} />}
                      预览计提
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 步骤 2：损益结转 */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {profitDone ? (
                <CheckCircle size={22} className="text-green-500" />
              ) : (
                <Circle size={22} className="text-gray-300" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <RefreshCw size={16} className="text-gray-600" />
                <h3 className="font-medium text-gray-800">损益结转</h3>
              </div>

              {profitDone ? (
                <p className="text-sm text-green-600">已完成损益结转</p>
              ) : profitPreview ? (
                <div className="space-y-1 mb-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">收入合计</span>
                    <span className="font-mono">{fmt(profitPreview.total_revenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">费用合计</span>
                    <span className="font-mono">{fmt(profitPreview.total_expense)}</span>
                  </div>
                  <div className="flex justify-between font-medium pt-1 border-t border-gray-100">
                    <span className="text-gray-700">净利润</span>
                    <span className={`font-mono ${profitPreview.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmt(profitPreview.net_profit)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 mb-3">结转当期损益科目余额至本年利润</p>
              )}

              {!profitDone && !isClosed && (
                <div className="flex items-center gap-2">
                  {profitPreview ? (
                    <button
                      onClick={handleProfitConfirm}
                      disabled={busy === 'profit_confirm'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      {busy === 'profit_confirm' ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle size={14} />}
                      确认结转
                    </button>
                  ) : (
                    <button
                      onClick={handleProfitPreview}
                      disabled={busy === 'profit_preview'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {busy === 'profit_preview' ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                      预览结转
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 步骤 3：试算平衡 */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {!balanceChecked ? (
                <Circle size={22} className="text-gray-300" />
              ) : balanceOk ? (
                <CheckCircle size={22} className="text-green-500" />
              ) : (
                <CheckCircle size={22} className="text-red-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck size={16} className="text-gray-600" />
                <h3 className="font-medium text-gray-800">试算平衡</h3>
              </div>

              {balanceChecked && trialData ? (
                <div className="space-y-1 mb-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">借方合计</span>
                    <span className="font-mono">{fmt(trialData.debitTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">贷方合计</span>
                    <span className="font-mono">{fmt(trialData.creditTotal)}</span>
                  </div>
                  <p className={`text-sm mt-1 ${balanceOk ? 'text-green-600' : 'text-red-600'}`}>
                    {balanceOk ? '试算平衡，借贷方金额一致' : '试算不平衡，请检查凭证数据'}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-500 mb-3">校验本期试算平衡，确保借贷方金额一致</p>
              )}

              <button
                onClick={handleRefreshBalance}
                disabled={busy === 'balance'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
              >
                {busy === 'balance' ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                重新检查
              </button>
            </div>
          </div>
        </div>

        {/* 步骤 4：期末结账 / 反结账 */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {isClosed ? (
                <CheckCircle size={22} className="text-green-500" />
              ) : (
                <Circle size={22} className="text-gray-300" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Lock size={16} className="text-gray-600" />
                <h3 className="font-medium text-gray-800">期末结账</h3>
              </div>

              {isClosed ? (
                <>
                  <p className="text-sm text-green-600 mb-1">本期已结账，所有凭证已锁定。</p>
                  {closingStatus?.closed_at && (
                    <p className="text-xs text-gray-400 mb-3">
                      操作人：{closingStatus.closed_by} | 时间：{closingStatus.closed_at}
                    </p>
                  )}
                  <button
                    onClick={handleReopen}
                    disabled={busy === 'reopen'}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-orange-500 rounded hover:bg-orange-600 disabled:opacity-50"
                  >
                    {busy === 'reopen' ? <Loader2 className="animate-spin" size={14} /> : <Unlock size={14} />}
                    反结账
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-500 mb-2">
                    确认完成以上步骤后，执行期末结账。结账后该期间凭证将不可修改。
                  </p>
                  {!canClose && (
                    <p className="text-xs text-yellow-600 mb-2">请先完成税金计提、损益结转，并确保试算平衡后再结账</p>
                  )}
                  <button
                    onClick={handleClose}
                    disabled={!canClose || busy === 'close'}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {busy === 'close' ? <Loader2 className="animate-spin" size={14} /> : <Lock size={14} />}
                    确认结账
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
