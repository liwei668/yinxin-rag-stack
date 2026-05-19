'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Building2,
  Save,
  Loader2,
  BookOpen,
  Receipt,
  Coins,
  CalendarDays,
  CalendarCheck,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

/** 账套信息接口 */
interface AccountSet {
  id: string;
  company_name: string;
  accounting_standard: string;
  taxpayer_type: string;
  currency: string;
  start_period: string;
  current_period: string;
  created_at: string;
  updated_at: string;
}

/** 会计准则选项 */
const accountingStandardOptions = [
  { value: 'small', label: '小企业会计准则' },
  { value: 'enterprise', label: '企业会计准则' },
];

/** 纳税人类型选项 */
const taxpayerTypeOptions = [
  { value: 'general', label: '一般纳税人' },
  { value: 'small_scale', label: '小规模纳税人' },
];

/** 格式化显示值 */
const formatStandard = (val: string) =>
  accountingStandardOptions.find((o) => o.value === val)?.label ?? val;

const formatTaxpayer = (val: string) =>
  taxpayerTypeOptions.find((o) => o.value === val)?.label ?? val;

export default function AccountSetSettings() {
  // 账套是否存在
  const [exists, setExists] = useState(false);
  // 当前账套信息（只读展示用）
  const [accountSet, setAccountSet] = useState<AccountSet | null>(null);
  // 表单字段
  const [companyName, setCompanyName] = useState('');
  const [accountingStandard, setAccountingStandard] = useState('small');
  const [taxpayerType, setTaxpayerType] = useState('general');
  const [startPeriod, setStartPeriod] = useState('');
  // 加载与保存状态
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  /** 获取账套信息 */
  const fetchAccountSet = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/accounting/account-set');
      if (res.ok) {
        const data = await res.json();
        setExists(data.exists);
        if (data.exists && data.account_set) {
          const as = data.account_set as AccountSet;
          setAccountSet(as);
          // 同步到表单
          setCompanyName(as.company_name);
          setAccountingStandard(as.accounting_standard);
          setTaxpayerType(as.taxpayer_type);
          setStartPeriod(as.start_period);
        }
      }
    } catch (error) {
      console.error('获取账套信息失败:', error);
      setMessage({ type: 'error', text: '获取账套信息失败' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccountSet();
  }, [fetchAccountSet]);

  /** 保存账套信息 */
  const handleSave = async () => {
    // 表单校验
    if (!companyName.trim()) {
      setMessage({ type: 'error', text: '请输入公司名称' });
      return;
    }
    if (!startPeriod) {
      setMessage({ type: 'error', text: '请选择启用期间' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/accounting/account-set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName.trim(),
          accounting_standard: accountingStandard,
          taxpayer_type: taxpayerType,
          start_period: startPeriod,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.account_set) {
          setAccountSet(data.account_set);
          setExists(true);
          setMessage({ type: 'success', text: '账套信息保存成功' });
        }
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || '保存失败' });
      }
    } catch (error) {
      console.error('保存账套信息失败:', error);
      setMessage({ type: 'error', text: '保存失败，请重试' });
    } finally {
      setSaving(false);
    }
  };

  /** 加载中状态 */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="animate-spin mr-2" size={20} />
        加载中...
      </div>
    );
  }

  return (
    <div className="p-5">
      {/* 页面标题 */}
      <div className="flex items-center gap-2 mb-5">
        <Settings size={20} className="text-green-600" />
        <h2 className="text-lg font-semibold text-gray-800">账套设置</h2>
      </div>

      {/* 提示消息 */}
      {message && (
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm mb-4 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 左侧：当前账套信息（只读展示） */}
        <div className="border border-gray-200 rounded-lg">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 rounded-t-lg">
            <Building2 size={16} className="text-green-600" />
            <span className="text-sm font-medium text-gray-700">账套信息</span>
          </div>
          {exists && accountSet ? (
            <div className="p-4 space-y-3">
              <InfoRow icon={<Building2 size={14} />} label="公司名称" value={accountSet.company_name} />
              <InfoRow icon={<BookOpen size={14} />} label="会计准则" value={formatStandard(accountSet.accounting_standard)} />
              <InfoRow icon={<Receipt size={14} />} label="纳税人类型" value={formatTaxpayer(accountSet.taxpayer_type)} />
              <InfoRow icon={<Coins size={14} />} label="币种" value={accountSet.currency || 'CNY'} />
              <InfoRow icon={<CalendarDays size={14} />} label="启用期间" value={accountSet.start_period} />
              <InfoRow icon={<CalendarCheck size={14} />} label="当前期间" value={accountSet.current_period} />
              {accountSet.updated_at && (
                <p className="text-xs text-gray-400 pt-1 border-t border-gray-100">
                  最后更新：{accountSet.updated_at}
                </p>
              )}
            </div>
          ) : (
            <div className="p-6 text-center text-gray-400 text-sm">
              <Building2 size={32} className="mx-auto mb-2 text-gray-300" />
              尚未创建账套，请在右侧填写信息并保存
            </div>
          )}
        </div>

        {/* 右侧：编辑表单 */}
        <div className="border border-gray-200 rounded-lg">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 rounded-t-lg">
            <Settings size={16} className="text-green-600" />
            <span className="text-sm font-medium text-gray-700">
              {exists ? '编辑账套' : '创建账套'}
            </span>
          </div>
          <div className="p-4 space-y-3">
            {/* 公司名称 */}
            <FormField label="公司名称" required>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="请输入公司名称"
                className="w-full text-sm px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
              />
            </FormField>

            {/* 会计准则 */}
            <FormField label="会计准则" required>
              <select
                value={accountingStandard}
                onChange={(e) => setAccountingStandard(e.target.value)}
                className="w-full text-sm px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 bg-white"
              >
                {accountingStandardOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FormField>

            {/* 纳税人类型 */}
            <FormField label="纳税人类型" required>
              <select
                value={taxpayerType}
                onChange={(e) => setTaxpayerType(e.target.value)}
                className="w-full text-sm px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 bg-white"
              >
                {taxpayerTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FormField>

            {/* 启用期间 */}
            <FormField label="启用期间" required>
              <input
                type="month"
                value={startPeriod}
                onChange={(e) => setStartPeriod(e.target.value)}
                className="w-full text-sm px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
              />
            </FormField>

            {/* 保存按钮 */}
            <div className="pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Save size={16} />
                )}
                {exists ? '保存修改' : '创建账套'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 信息行组件：左侧图标+标签，右侧值 */
function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-1.5 text-gray-500 shrink-0">
        {icon}
        {label}
      </span>
      <span className="text-gray-800 font-medium text-right ml-4">{value}</span>
    </div>
  );
}

/** 表单字段组件：标签 + 子元素（输入框等） */
function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-600 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
