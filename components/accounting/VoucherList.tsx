'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Eye, Pencil, Trash2, CheckCircle, Loader2 } from 'lucide-react';
import VoucherEditor from './VoucherEditor';

interface VoucherListProps {
  period: string;
}

interface Voucher {
  id: string;
  number: string;
  date: string;
  summary: string;
  entry_count: number;
  status: 'draft' | 'confirmed';
}

const statusConfig = {
  draft: { label: '草稿', className: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: '已审核', className: 'bg-green-100 text-green-800' },
};

export default function VoucherList({ period }: VoucherListProps) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingVoucherId, setEditingVoucherId] = useState<string | undefined>();
  const [viewingVoucherId, setViewingVoucherId] = useState<string | undefined>();

  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/accounting/vouchers?period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setVouchers(Array.isArray(data) ? data : (data.vouchers || []));
      }
    } catch (error) {
      console.error('获取凭证列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  const handleCreate = () => {
    setEditingVoucherId(undefined);
    setViewingVoucherId(undefined);
    setEditorOpen(true);
  };

  const handleEdit = (id: string) => {
    setEditingVoucherId(id);
    setViewingVoucherId(undefined);
    setEditorOpen(true);
  };

  const handleView = (id: string) => {
    setViewingVoucherId(id);
    setEditingVoucherId(id);
    setEditorOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除该凭证吗？')) return;
    try {
      const res = await fetch(`/api/accounting/vouchers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchVouchers();
      } else {
        const data = await res.json();
        alert(data.error || '删除失败');
      }
    } catch (error) {
      console.error('删除凭证失败:', error);
    }
  };

  const handleConfirm = async (id: string) => {
    if (!confirm('确定要审核该凭证吗？')) return;
    try {
      const res = await fetch(`/api/accounting/vouchers/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: 'admin' }),
      });
      if (res.ok) {
        fetchVouchers();
      } else {
        const data = await res.json();
        alert(data.error || '审核失败');
      }
    } catch (error) {
      console.error('审核凭证失败:', error);
    }
  };

  const handleEditorSaved = () => {
    setEditorOpen(false);
    setEditingVoucherId(undefined);
    setViewingVoucherId(undefined);
    fetchVouchers();
  };

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800">凭证列表</h2>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-xs font-medium"
        >
          <Plus size={14} />
          新建凭证
        </button>
      </div>

      {/* Period Display */}
      <div className="mb-3">
        <span className="text-xs text-gray-500">
          当前期间：<span className="font-medium text-gray-700">{period}</span>
        </span>
      </div>

      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 font-medium text-gray-600">编号</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">日期</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">摘要</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">分录数</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">状态</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">
                  <Loader2 className="inline-block animate-spin mr-2" size={16} />
                  加载中...
                </td>
              </tr>
            ) : vouchers.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">
                  暂无凭证数据
                </td>
              </tr>
            ) : (
              vouchers.map((voucher) => (
                <tr
                  key={voucher.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-3 py-2 text-gray-800 font-medium">{voucher.number}</td>
                  <td className="px-3 py-2 text-gray-600">{voucher.date}</td>
                  <td className="px-3 py-2 text-gray-600">{voucher.summary}</td>
                  <td className="px-3 py-2 text-center text-gray-600">{voucher.entry_count}</td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        statusConfig[voucher.status].className
                      }`}
                    >
                      {statusConfig[voucher.status].label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleView(voucher.id)}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="查看"
                      >
                        <Eye size={14} />
                      </button>
                      {voucher.status === 'draft' && (
                        <>
                          <button
                            onClick={() => handleEdit(voucher.id)}
                            className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                            title="编辑"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleConfirm(voucher.id)}
                            className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                            title="审核"
                          >
                            <CheckCircle size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(voucher.id)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="删除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Voucher Editor Modal */}
      <VoucherEditor
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingVoucherId(undefined);
          setViewingVoucherId(undefined);
        }}
        voucherId={editingVoucherId}
        period={period}
        onSaved={handleEditorSaved}
        readOnly={!!viewingVoucherId}
      />
    </div>
  );
}
