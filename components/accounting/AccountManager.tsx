'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Search, Pencil, Check, X, AlertCircle,
  ChevronRight, ChevronDown, Loader2, Save,
} from 'lucide-react';

/* ========== 类型定义 ========== */

interface AccountManagerProps {
  period: string;
}

interface Account {
  code: string;
  name: string;
  level: number;
  parent_code: string | null;
  category: string;
  balance_direction: string;
  is_system: boolean;
  is_active: boolean;
}

interface OpeningBalance {
  account_code: string;
  debit_amount: number;
  credit_amount: number;
}

/* ========== 常量 ========== */

// 类别配置
const categoryOptions = [
  { value: '', label: '全部' },
  { value: 'asset', label: '资产' },
  { value: 'liability', label: '负债' },
  { value: 'equity', label: '权益' },
  { value: 'cost', label: '成本' },
  { value: 'profit_loss', label: '损益' },
] as const;

// 类别中文映射
const categoryLabel: Record<string, string> = {
  asset: '资产',
  liability: '负债',
  equity: '权益',
  cost: '成本',
  profit_loss: '损益',
};

// 方向中文映射
const directionLabel: Record<string, string> = {
  debit: '借',
  credit: '贷',
};

/* ========== 主组件 ========== */

export default function AccountManager({ period }: AccountManagerProps) {
  /* ----- 状态 ----- */
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'balance'>('list');

  // 搜索与筛选
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // 新增科目弹窗
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    parent_code: '',
    code: '',
    name: '',
    category: '',
    direction: 'debit',
  });
  const [addSubmitting, setAddSubmitting] = useState(false);

  // 编辑科目名称
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // 期初余额
  const [balances, setBalances] = useState<OpeningBalance[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceSaving, setBalanceSaving] = useState(false);
  const [balanceEditing, setBalanceEditing] = useState(false);
  const [editedBalances, setEditedBalances] = useState<OpeningBalance[]>([]);

  // 展开的一级科目
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());

  // 提示消息
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const toastTimer = useRef<NodeJS.Timeout | null>(null);

  /* ----- 工具函数 ----- */

  // 显示提示
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  // 一级科目列表（用于新增下拉）
  const level1Accounts = accounts.filter((a) => a.level === 1);

  // 按一级科目分组的树形结构
  const buildTree = useCallback(() => {
    const keyword = searchText.trim().toLowerCase();
    const cat = categoryFilter;

    // 过滤
    let filtered = accounts;
    if (cat) {
      filtered = filtered.filter((a) => a.category === cat);
    }
    if (keyword) {
      filtered = filtered.filter(
        (a) =>
          a.code.toLowerCase().includes(keyword) ||
          a.name.toLowerCase().includes(keyword)
      );
    }

    // 分组
    const parents = filtered.filter((a) => a.level === 1);
    return parents.map((p) => ({
      parent: p,
      children: filtered.filter((a) => a.parent_code === p.code),
    }));
  }, [accounts, searchText, categoryFilter]);

  const tree = buildTree();

  // 切换展开
  const toggleExpand = (code: string) => {
    setExpandedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  /* ----- 数据获取 ----- */

  // 获取科目列表
  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const params = categoryFilter ? `?category=${categoryFilter}` : '';
      const res = await fetch(`/api/accounting/accounts${params}`);
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
      }
    } catch (err) {
      console.error('获取科目列表失败:', err);
      showToast('获取科目列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, showToast]);

  // 获取期初余额
  const fetchBalances = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const res = await fetch(`/api/accounting/opening-balance?period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setBalances(data.balances || []);
        setEditedBalances(data.balances || []);
      }
    } catch (err) {
      console.error('获取期初余额失败:', err);
      showToast('获取期初余额失败', 'error');
    } finally {
      setBalanceLoading(false);
    }
  }, [period, showToast]);

  useEffect(() => {
    if (activeTab === 'list') fetchAccounts();
  }, [activeTab, fetchAccounts]);

  useEffect(() => {
    if (activeTab === 'balance') fetchBalances();
  }, [activeTab, fetchBalances]);

  /* ----- 新增科目 ----- */

  const handleAdd = async () => {
    if (!addForm.parent_code || !addForm.code.trim() || !addForm.name.trim()) {
      showToast('请填写完整信息', 'error');
      return;
    }
    setAddSubmitting(true);
    try {
      const res = await fetch('/api/accounting/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: addForm.code.trim(),
          name: addForm.name.trim(),
          parent_code: addForm.parent_code,
          category: addForm.category,
          direction: addForm.direction,
        }),
      });
      if (res.ok) {
        showToast('科目创建成功');
        setShowAddModal(false);
        setAddForm({ parent_code: '', code: '', name: '', category: '', direction: 'debit' });
        fetchAccounts();
      } else {
        const data = await res.json();
        showToast(data.error || '创建失败', 'error');
      }
    } catch (err) {
      console.error('创建科目失败:', err);
      showToast('创建科目失败', 'error');
    } finally {
      setAddSubmitting(false);
    }
  };

  // 选择父科目时自动填充类别和方向
  const handleParentChange = (parentCode: string) => {
    const parent = accounts.find((a) => a.code === parentCode);
    setAddForm((prev) => ({
      ...prev,
      parent_code: parentCode,
      category: parent?.category || '',
      direction: parent?.balance_direction || 'debit',
    }));
  };

  /* ----- 编辑科目名称 ----- */

  const startEdit = (account: Account) => {
    if (account.is_system) {
      showToast('系统科目不可编辑', 'error');
      return;
    }
    setEditingCode(account.code);
    setEditName(account.name);
  };

  const cancelEdit = () => {
    setEditingCode(null);
    setEditName('');
  };

  const saveEdit = async () => {
    if (!editingCode || !editName.trim()) return;
    setEditSubmitting(true);
    try {
      const res = await fetch('/api/accounting/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: editingCode, name: editName.trim() }),
      });
      if (res.ok) {
        showToast('修改成功');
        setEditingCode(null);
        fetchAccounts();
      } else {
        const data = await res.json();
        showToast(data.error || '修改失败', 'error');
      }
    } catch (err) {
      console.error('修改科目失败:', err);
      showToast('修改科目失败', 'error');
    } finally {
      setEditSubmitting(false);
    }
  };

  /* ----- 期初余额 ----- */

  const handleBalanceChange = (
    code: string,
    field: 'debit_amount' | 'credit_amount',
    value: string
  ) => {
    const num = value === '' ? 0 : parseFloat(value) || 0;
    setEditedBalances((prev) =>
      prev.map((b) => (b.account_code === code ? { ...b, [field]: num } : b))
    );
  };

  const saveBalances = async () => {
    setBalanceSaving(true);
    try {
      const res = await fetch('/api/accounting/opening-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, balances: editedBalances }),
      });
      if (res.ok) {
        showToast('期初余额保存成功');
        setBalanceEditing(false);
        setBalances(editedBalances);
      } else {
        const data = await res.json();
        showToast(data.error || '保存失败', 'error');
      }
    } catch (err) {
      console.error('保存期初余额失败:', err);
      showToast('保存期初余额失败', 'error');
    } finally {
      setBalanceSaving(false);
    }
  };

  // 期初余额按一级科目分组
  const buildBalanceTree = useCallback(() => {
    const parents = accounts.filter((a) => a.level === 1);
    return parents.map((p) => ({
      parent: p,
      children: accounts.filter((a) => a.parent_code === p.code),
    }));
  }, [accounts]);

  const balanceTree = buildBalanceTree();

  /* ========== 渲染 ========== */

  return (
    <div className="flex flex-col h-full text-xs">
      {/* 提示消息 */}
      {toast && (
        <div
          className={`absolute top-3 right-3 z-50 px-3 py-1.5 rounded shadow text-xs text-white transition-all ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-500'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* 标签页切换 */}
      <div className="flex items-center border-b border-gray-200 px-4 pt-2 flex-shrink-0">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'list'
              ? 'border-green-600 text-green-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          科目列表
        </button>
        <button
          onClick={() => setActiveTab('balance')}
          className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'balance'
              ? 'border-green-600 text-green-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          期初余额
        </button>
      </div>

      {/* ===== 科目列表标签页 ===== */}
      {activeTab === 'list' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* 工具栏 */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 flex-shrink-0">
            {/* 搜索框 */}
            <div className="relative flex-1 max-w-[200px]">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="搜索编码或名称"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full pl-7 pr-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            {/* 类别筛选 */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2 py-1 text-xs border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              {categoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* 新增按钮 */}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-white bg-green-600 rounded hover:bg-green-700 transition-colors"
            >
              <Plus size={13} />
              新增科目
            </button>
          </div>

          {/* 表格 */}
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-gray-400">
                <Loader2 size={16} className="animate-spin mr-1" />
                加载中...
              </div>
            ) : tree.length === 0 ? (
              <div className="text-center py-10 text-gray-400">暂无科目数据</div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="pb-1.5 pr-2 font-medium w-[30px]"></th>
                    <th className="pb-1.5 pr-2 font-medium w-[80px]">编码</th>
                    <th className="pb-1.5 pr-2 font-medium">名称</th>
                    <th className="pb-1.5 pr-2 font-medium w-[40px]">级别</th>
                    <th className="pb-1.5 pr-2 font-medium w-[50px]">类别</th>
                    <th className="pb-1.5 pr-2 font-medium w-[40px]">方向</th>
                    <th className="pb-1.5 font-medium w-[60px]">标记</th>
                  </tr>
                </thead>
                <tbody>
                  {tree.map(({ parent, children }) => {
                    const isExpanded = expandedCodes.has(parent.code);
                    return (
                      <AccountGroup
                        key={parent.code}
                        parent={parent}
                        children={children}
                        isExpanded={isExpanded}
                        onToggle={() => toggleExpand(parent.code)}
                        editingCode={editingCode}
                        editName={editName}
                        editSubmitting={editSubmitting}
                        onEditNameChange={setEditName}
                        onStartEdit={startEdit}
                        onCancelEdit={cancelEdit}
                        onSaveEdit={saveEdit}
                      />
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ===== 期初余额标签页 ===== */}
      {activeTab === 'balance' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* 工具栏 */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 flex-shrink-0">
            <span className="text-xs text-gray-500">
              期间：{period}
            </span>
            <div className="flex items-center gap-2">
              {balanceEditing ? (
                <>
                  <button
                    onClick={() => {
                      setEditedBalances([...balances]);
                      setBalanceEditing(false);
                    }}
                    className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={saveBalances}
                    disabled={balanceSaving}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {balanceSaving ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Save size={13} />
                    )}
                    保存
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setBalanceEditing(true)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs text-white bg-green-600 rounded hover:bg-green-700 transition-colors"
                >
                  <Pencil size={13} />
                  编辑
                </button>
              )}
            </div>
          </div>

          {/* 余额表格 */}
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {balanceLoading ? (
              <div className="flex items-center justify-center py-10 text-gray-400">
                <Loader2 size={16} className="animate-spin mr-1" />
                加载中...
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="pb-1.5 pr-2 font-medium w-[80px]">编码</th>
                    <th className="pb-1.5 pr-2 font-medium">科目名称</th>
                    <th className="pb-1.5 pr-2 font-medium w-[120px] text-right">借方金额</th>
                    <th className="pb-1.5 font-medium w-[120px] text-right">贷方金额</th>
                  </tr>
                </thead>
                <tbody>
                  {balanceTree.map(({ parent, children }) => (
                    <BalanceGroup
                      key={parent.code}
                      parent={parent}
                      children={children}
                      balances={balanceEditing ? editedBalances : balances}
                      isEditing={balanceEditing}
                      onChange={handleBalanceChange}
                    />
                  ))}
                </tbody>
                {/* 合计行 */}
                <tfoot>
                  <tr className="border-t border-gray-300 font-medium text-gray-700">
                    <td colSpan={2} className="py-1.5 text-right pr-2">
                      合计
                    </td>
                    <td className="py-1.5 text-right pr-2">
                      {(balanceEditing ? editedBalances : balances)
                        .reduce((s, b) => s + (b.debit_amount || 0), 0)
                        .toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right">
                      {(balanceEditing ? editedBalances : balances)
                        .reduce((s, b) => s + (b.credit_amount || 0), 0)
                        .toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ===== 新增科目弹窗 ===== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-xl w-[360px]">
            {/* 弹窗标题 */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
              <span className="text-sm font-medium text-gray-800">新增二级科目</span>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>

            {/* 表单 */}
            <div className="px-4 py-3 space-y-2.5">
              {/* 父科目 */}
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">上级科目</label>
                <select
                  value={addForm.parent_code}
                  onChange={(e) => handleParentChange(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  <option value="">请选择一级科目</option>
                  {level1Accounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} {a.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 科目编码 */}
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">科目编码</label>
                <input
                  type="text"
                  value={addForm.code}
                  onChange={(e) => setAddForm((p) => ({ ...p, code: e.target.value }))}
                  placeholder="如 100201"
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              {/* 科目名称 */}
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">科目名称</label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="输入科目名称"
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              {/* 类别（自动填充，只读展示） */}
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">类别</label>
                <input
                  type="text"
                  value={categoryLabel[addForm.category] || addForm.category}
                  readOnly
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-gray-50 text-gray-500"
                />
              </div>

              {/* 方向 */}
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">余额方向</label>
                <select
                  value={addForm.direction}
                  onChange={(e) => setAddForm((p) => ({ ...p, direction: e.target.value }))}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  <option value="debit">借方</option>
                  <option value="credit">贷方</option>
                </select>
              </div>
            </div>

            {/* 按钮 */}
            <div className="flex justify-end gap-2 px-4 py-2 border-t border-gray-100">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAdd}
                disabled={addSubmitting}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {addSubmitting ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Plus size={13} />
                )}
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== 科目分组行组件 ========== */

interface AccountGroupProps {
  parent: Account;
  children: Account[];
  isExpanded: boolean;
  onToggle: () => void;
  editingCode: string | null;
  editName: string;
  editSubmitting: boolean;
  onEditNameChange: (v: string) => void;
  onStartEdit: (a: Account) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
}

function AccountGroup({
  parent,
  children,
  isExpanded,
  onToggle,
  editingCode,
  editName,
  editSubmitting,
  onEditNameChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}: AccountGroupProps) {
  return (
    <>
      {/* 一级科目行 */}
      <tr className="border-b border-gray-100 hover:bg-gray-50">
        <td className="py-1 pr-2">
          <button onClick={onToggle} className="text-gray-400 hover:text-gray-600">
            {children.length > 0 &&
              (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
          </button>
        </td>
        <td className="py-1 pr-2 font-mono text-gray-700">{parent.code}</td>
        <td className="py-1 pr-2 font-medium text-gray-800">{parent.name}</td>
        <td className="py-1 pr-2 text-gray-500">{parent.level}</td>
        <td className="py-1 pr-2 text-gray-500">{categoryLabel[parent.category]}</td>
        <td className="py-1 pr-2 text-gray-500">{directionLabel[parent.balance_direction]}</td>
        <td className="py-1">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500">
            系统
          </span>
        </td>
      </tr>

      {/* 二级科目行 */}
      {isExpanded &&
        children.map((child) => (
          <tr
            key={child.code}
            className="border-b border-gray-50 hover:bg-blue-50/40"
          >
            <td className="py-1 pr-2"></td>
            <td className="py-1 pr-2 font-mono text-gray-600 pl-2">{child.code}</td>

            {/* 名称列：可编辑 */}
            <td className="py-1 pr-2">
              {editingCode === child.code ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => onEditNameChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onSaveEdit();
                      if (e.key === 'Escape') onCancelEdit();
                    }}
                    autoFocus
                    className="w-full px-1 py-0.5 text-xs border border-green-500 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                  {editSubmitting ? (
                    <Loader2 size={12} className="animate-spin text-green-600" />
                  ) : (
                    <>
                      <button
                        onClick={onSaveEdit}
                        className="text-green-600 hover:text-green-700"
                        title="保存"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        onClick={onCancelEdit}
                        className="text-gray-400 hover:text-gray-600"
                        title="取消"
                      >
                        <X size={13} />
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div
                  className="flex items-center gap-1 cursor-pointer group"
                  onClick={() => onStartEdit(child)}
                  title={child.is_system ? '系统科目不可编辑' : '点击编辑'}
                >
                  <span className="text-gray-700 group-hover:text-green-700 transition-colors">
                    {child.name}
                  </span>
                  {child.is_system ? (
                    <AlertCircle size={11} className="text-gray-300" />
                  ) : (
                    <Pencil size={11} className="text-gray-300 group-hover:text-green-600 transition-colors" />
                  )}
                </div>
              )}
            </td>

            <td className="py-1 pr-2 text-gray-500">{child.level}</td>
            <td className="py-1 pr-2 text-gray-500">{categoryLabel[child.category]}</td>
            <td className="py-1 pr-2 text-gray-500">{directionLabel[child.balance_direction]}</td>
            <td className="py-1">
              {child.is_system ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500">
                  系统
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-600">
                  自定义
                </span>
              )}
            </td>
          </tr>
        ))}
    </>
  );
}

/* ========== 期初余额分组行组件 ========== */

interface BalanceGroupProps {
  parent: Account;
  children: Account[];
  balances: OpeningBalance[];
  isEditing: boolean;
  onChange: (code: string, field: 'debit_amount' | 'credit_amount', value: string) => void;
}

function BalanceGroup({ parent, children, balances, isEditing, onChange }: BalanceGroupProps) {
  // 获取某科目的余额
  const getBalance = (code: string) =>
    balances.find((b) => b.account_code === code);

  return (
    <>
      {/* 一级科目行 */}
      <BalanceRow
        account={parent}
        balance={getBalance(parent.code)}
        isEditing={isEditing}
        onChange={onChange}
        isParent
      />
      {/* 二级科目行 */}
      {children.map((child) => (
        <BalanceRow
          key={child.code}
          account={child}
          balance={getBalance(child.code)}
          isEditing={isEditing}
          onChange={onChange}
        />
      ))}
    </>
  );
}

/* ========== 期初余额行组件 ========== */

interface BalanceRowProps {
  account: Account;
  balance: OpeningBalance | undefined;
  isEditing: boolean;
  onChange: (code: string, field: 'debit_amount' | 'credit_amount', value: string) => void;
  isParent?: boolean;
}

function BalanceRow({ account, balance, isEditing, onChange, isParent }: BalanceRowProps) {
  const debit = balance?.debit_amount || 0;
  const credit = balance?.credit_amount || 0;

  return (
    <tr className={`border-b border-gray-50 ${isParent ? 'bg-gray-50/60' : ''}`}>
      <td className={`py-1 pr-2 font-mono ${isParent ? 'font-medium text-gray-700' : 'text-gray-600 pl-2'}`}>
        {account.code}
      </td>
      <td className={`py-1 pr-2 ${isParent ? 'font-medium text-gray-800' : 'text-gray-700'}`}>
        {account.name}
      </td>
      <td className="py-1 pr-2 text-right">
        {isEditing ? (
          <input
            type="number"
            step="0.01"
            min="0"
            value={debit || ''}
            onChange={(e) => onChange(account.code, 'debit_amount', e.target.value)}
            className="w-full text-right px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        ) : (
          <span className={debit ? 'text-gray-800' : 'text-gray-300'}>{debit.toFixed(2)}</span>
        )}
      </td>
      <td className="py-1 text-right">
        {isEditing ? (
          <input
            type="number"
            step="0.01"
            min="0"
            value={credit || ''}
            onChange={(e) => onChange(account.code, 'credit_amount', e.target.value)}
            className="w-full text-right px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        ) : (
          <span className={credit ? 'text-gray-800' : 'text-gray-300'}>{credit.toFixed(2)}</span>
        )}
      </td>
    </tr>
  );
}
