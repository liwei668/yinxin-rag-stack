'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Loader2, Save } from 'lucide-react';

interface VoucherEditorProps {
  isOpen: boolean;
  onClose: () => void;
  voucherId?: string;
  period: string;
  onSaved?: () => void;
  readOnly?: boolean;
}

interface Account {
  id: string;
  code: string;
  name: string;
}

interface Entry {
  accountId: string;
  summary: string;
  debit: number;
  credit: number;
}

interface VoucherData {
  id?: string;
  date: string;
  summary: string;
  entries: Entry[];
}

export default function VoucherEditor({
  isOpen,
  onClose,
  voucherId,
  period,
  onSaved,
  readOnly = false,
}: VoucherEditorProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState<VoucherData>({
    date: period ? `${period}-01` : '',
    summary: '',
    entries: [
      { accountId: '', summary: '', debit: 0, credit: 0 },
      { accountId: '', summary: '', debit: 0, credit: 0 },
    ],
  });

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounting/accounts');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.accounts || []);
        setAccounts(list.map((a: any) => ({ id: a.code, code: a.code, name: a.name })));
      }
    } catch (error) {
      console.error('获取科目列表失败:', error);
    }
  }, []);

  const fetchVoucher = useCallback(async () => {
    if (!voucherId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/accounting/vouchers/${voucherId}`);
      if (res.ok) {
        const data = await res.json();
        setFormData({
          id: data.id,
          date: data.date,
          summary: data.summary,
          entries: (data.entries || []).map((e: any) => ({
            accountId: e.account_code,
            summary: e.summary || '',
            debit: e.debit_amount || 0,
            credit: e.credit_amount || 0,
          })),
        });
      }
    } catch (error) {
      console.error('获取凭证数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [voucherId]);

  useEffect(() => {
    if (isOpen) {
      fetchAccounts();
      if (voucherId) {
        fetchVoucher();
      } else {
        setFormData({
          date: period ? `${period}-01` : '',
          summary: '',
          entries: [
            { accountId: '', summary: '', debit: 0, credit: 0 },
            { accountId: '', summary: '', debit: 0, credit: 0 },
          ],
        });
      }
      setError('');
    }
  }, [isOpen, voucherId, period, fetchAccounts, fetchVoucher]);

  const handleAddEntry = () => {
    setFormData((prev) => ({
      ...prev,
      entries: [...prev.entries, { accountId: '', summary: '', debit: 0, credit: 0 }],
    }));
  };

  const handleRemoveEntry = (index: number) => {
    if (formData.entries.length <= 2) return;
    setFormData((prev) => ({
      ...prev,
      entries: prev.entries.filter((_, i) => i !== index),
    }));
  };

  const handleEntryChange = (
    index: number,
    field: keyof Entry,
    value: string | number
  ) => {
    setFormData((prev) => {
      const newEntries = [...prev.entries];
      const entry = { ...newEntries[index] };

      if (field === 'debit') {
        entry.debit = Number(value) || 0;
        if (entry.debit > 0) {
          entry.credit = 0;
        }
      } else if (field === 'credit') {
        entry.credit = Number(value) || 0;
        if (entry.credit > 0) {
          entry.debit = 0;
        }
      } else {
        (entry as Record<string, string | number>)[field] = value;
      }

      newEntries[index] = entry;
      return { ...prev, entries: newEntries };
    });
  };

  const debitTotal = formData.entries.reduce((sum, e) => sum + (Number(e.debit) || 0), 0);
  const creditTotal = formData.entries.reduce((sum, e) => sum + (Number(e.credit) || 0), 0);
  const diff = debitTotal - creditTotal;
  const isBalanced = diff === 0 && debitTotal > 0;

  const handleSave = async () => {
    setError('');

    if (!formData.date) {
      setError('请选择日期');
      return;
    }

    if (!formData.summary.trim()) {
      setError('请填写摘要');
      return;
    }

    const validEntries = formData.entries.filter(
      (e) => e.accountId && (e.debit > 0 || e.credit > 0)
    );

    if (validEntries.length < 2) {
      setError('至少需要两条有效分录');
      return;
    }

    if (!isBalanced) {
      setError('借贷不平衡，请检查分录金额');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        date: formData.date,
        period: period,
        summary: formData.summary,
        entries: validEntries.map(e => ({
          account_code: e.accountId,
          summary: e.summary,
          debit_amount: e.debit,
          credit_amount: e.credit,
        })),
      };

      const url = voucherId
        ? `/api/accounting/vouchers/${voucherId}`
        : '/api/accounting/vouchers';
      const method = voucherId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        onSaved?.();
      } else {
        const data = await res.json();
        setError(data.error || '保存失败');
      }
    } catch (error) {
      setError('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const formatAmount = (amount: number) => {
    return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-800">
            {voucherId ? (readOnly ? '查看凭证' : '编辑凭证') : '新建凭证'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 className="animate-spin mr-2" size={20} />
              加载中...
            </div>
          ) : (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">日期</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                    disabled={readOnly}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">摘要</label>
                  <input
                    type="text"
                    value={formData.summary}
                    onChange={(e) => setFormData((prev) => ({ ...prev, summary: e.target.value }))}
                    disabled={readOnly}
                    placeholder="请输入凭证摘要"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
              </div>

              {/* Entries Table */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">分录明细</label>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-3 py-2 font-medium text-gray-600 w-[30%]">
                          科目
                        </th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600 w-[25%]">
                          摘要
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600 w-[18%]">
                          借方金额
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600 w-[18%]">
                          贷方金额
                        </th>
                        <th className="text-center px-3 py-2 font-medium text-gray-600 w-[9%]">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.entries.map((entry, index) => (
                        <tr key={index} className="border-b border-gray-100 last:border-b-0">
                          <td className="px-3 py-2">
                            <select
                              value={entry.accountId}
                              onChange={(e) =>
                                handleEntryChange(index, 'accountId', e.target.value)
                              }
                              disabled={readOnly}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 disabled:text-gray-500"
                            >
                              <option value="">请选择科目</option>
                              {accounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.code} - {account.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={entry.summary}
                              onChange={(e) =>
                                handleEntryChange(index, 'summary', e.target.value)
                              }
                              disabled={readOnly}
                              placeholder="摘要"
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 disabled:text-gray-500"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={entry.debit || ''}
                              onChange={(e) =>
                                handleEntryChange(index, 'debit', e.target.value)
                              }
                              disabled={readOnly}
                              placeholder="0.00"
                              min="0"
                              step="0.01"
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 disabled:text-gray-500"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={entry.credit || ''}
                              onChange={(e) =>
                                handleEntryChange(index, 'credit', e.target.value)
                              }
                              disabled={readOnly}
                              placeholder="0.00"
                              min="0"
                              step="0.01"
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 disabled:text-gray-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            {!readOnly && formData.entries.length > 2 && (
                              <button
                                onClick={() => handleRemoveEntry(index)}
                                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200 font-medium">
                        <td className="px-3 py-2" colSpan={2}>
                          <button
                            onClick={handleAddEntry}
                            disabled={readOnly}
                            className="flex items-center gap-1 text-green-600 hover:text-green-700 text-sm disabled:opacity-50"
                          >
                            <Plus size={14} />
                            添加分录
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right text-gray-800 font-mono">
                          {formatAmount(debitTotal)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-800 font-mono">
                          {formatAmount(creditTotal)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Balance Info */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-6 text-sm">
                  <span className="text-gray-600">
                    借方合计：<span className="font-mono font-medium text-gray-800">{formatAmount(debitTotal)}</span>
                  </span>
                  <span className="text-gray-600">
                    贷方合计：<span className="font-mono font-medium text-gray-800">{formatAmount(creditTotal)}</span>
                  </span>
                  <span
                    className={`font-medium ${
                      diff === 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {diff === 0
                      ? '借贷平衡'
                      : `借贷差额：${formatAmount(Math.abs(diff))}`}
                  </span>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!readOnly && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Save size={16} />
              )}
              保存
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
