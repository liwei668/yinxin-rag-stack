'use client';

import { useState, useEffect } from 'react';
import { Database, Download, Upload, Loader2, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { storageManager } from '../../services/storageManager';

const StorageManagement = () => {
  const [storageMode, setStorageMode] = useState<'local' | 'cloud' | 'hybrid'>('hybrid');
  const [autoSync, setAutoSync] = useState(true);
  const [storageLoading, setStorageLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<any>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  useEffect(() => {
    const loadStoragePreferences = async () => {
      try {
        setStorageLoading(true);
        const prefs = await storageManager.getPreferences();
        setStorageMode(prefs.mode);
        setAutoSync(prefs.autoSync);
        if (prefs.lastSyncTime) {
          setLastSyncTime(prefs.lastSyncTime);
        }
      } catch (error) {
        console.error('加载存储偏好失败:', error);
      } finally {
        setStorageLoading(false);
      }
    };
    loadStoragePreferences();
  }, []);

  const handleStorageModeChange = async (mode: 'local' | 'cloud' | 'hybrid') => {
    setStorageMode(mode);
    try {
      setStorageLoading(true);
      await storageManager.setPreferences({ mode });
      setMessage(`存储模式已切换为${mode === 'local' ? '仅本地' : mode === 'cloud' ? '仅云端' : '混合模式'}`);
      setSuccess(true);
    } catch (error) {
      console.error('切换存储模式失败:', error);
      setMessage('切换存储模式失败');
      setSuccess(false);
    } finally {
      setStorageLoading(false);
    }
  };

  const handleAutoSyncChange = async (enabled: boolean) => {
    setAutoSync(enabled);
    try {
      setStorageLoading(true);
      await storageManager.setPreferences({ autoSync: enabled });
      setMessage(`自动同步已${enabled ? '开启' : '关闭'}`);
      setSuccess(true);
    } catch (error) {
      console.error('切换自动同步失败:', error);
      setMessage('切换自动同步失败');
      setSuccess(false);
    } finally {
      setStorageLoading(false);
    }
  };

  const handleManualSync = async () => {
    try {
      setSyncing(true);
      setMessage('正在同步...');
      await storageManager.syncData();
      const now = new Date().toLocaleString('zh-CN');
      setLastSyncTime(now);
      await storageManager.setPreferences({ lastSyncTime: now });
      setMessage('同步完成');
      setSuccess(true);
    } catch (error) {
      console.error('同步失败:', error);
      setMessage('同步失败，请重试');
      setSuccess(false);
    } finally {
      setSyncing(false);
    }
  };

  const handleExportData = async () => {
    try {
      setDataLoading(true);
      setShowExportConfirm(false);
      const conversations = await storageManager.getLocalConversations();
      const prefs = await storageManager.getPreferences();
      const knowledgeBase = await storageManager.getKnowledgeBase?.() || [];
      
      const exportData = {
        version: '2.0',
        exportDate: new Date().toISOString(),
        conversations,
        preferences: prefs,
        knowledgeBase,
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yinxin-backup-v2-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage('导出成功，文件已下载');
      setSuccess(true);
    } catch (error) {
      console.error('导出数据失败:', error);
      setMessage('导出数据失败');
      setSuccess(false);
    } finally {
      setDataLoading(false);
    }
  };

  const handleImportData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setDataLoading(true);
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data.version || !data.conversations) {
        throw new Error('文件格式不正确，请导入本系统导出的 JSON 备份文件');
      }
      
      if (data.version === '1.0') {
        setMessage('检测到旧版本数据（v1.0），部分功能可能不兼容');
        setSuccess(false);
      }
      
      setPendingImportData(data);
      setShowImportConfirm(true);
    } catch (error: any) {
      console.error('导入数据失败:', error);
      setMessage(error.message || '导入数据失败，请检查文件格式');
      setSuccess(false);
    } finally {
      setDataLoading(false);
      event.target.value = '';
    }
  };

  const confirmImport = async () => {
    if (!pendingImportData) return;
    
    try {
      setDataLoading(true);
      setShowImportConfirm(false);
      
      const originalConversations = await storageManager.getLocalConversations();
      const originalPrefs = await storageManager.getPreferences();
      
      try {
        for (const conv of pendingImportData.conversations) {
          await storageManager.saveLocalConversation(conv);
        }
        
        if (pendingImportData.preferences) {
          await storageManager.setPreferences(pendingImportData.preferences);
        }
        
        if (pendingImportData.knowledgeBase && storageManager.importKnowledgeBase) {
          await storageManager.importKnowledgeBase(pendingImportData.knowledgeBase);
        }
        
        const prefs = await storageManager.getPreferences();
        setStorageMode(prefs.mode);
        setAutoSync(prefs.autoSync);
        
        setMessage('导入成功，页面将自动刷新');
        setSuccess(true);
        
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } catch (importError) {
        console.error('导入失败，恢复原数据:', importError);
        setMessage('导入失败，已恢复原有数据');
        setSuccess(false);
      }
    } catch (error) {
      console.error('导入数据失败:', error);
      setMessage('导入数据失败，请检查文件格式');
      setSuccess(false);
    } finally {
      setDataLoading(false);
      setPendingImportData(null);
    }
  };

  return (
    <div className="space-y-4">
      {message && (
        <div className={`p-3 rounded-lg ${success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          <div className="flex items-center gap-2">
            {success ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
            {message}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="text-sm font-medium text-gray-900">数据存储</h3>
        </div>
        <div className="p-4">
          {storageLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin h-5 w-5 text-blue-600" />
              <span className="ml-2 text-gray-600 text-sm">加载中...</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => handleStorageModeChange('local')}
                    className={`p-3 border rounded-lg text-left transition-all min-w-[180px] ${
                      storageMode === 'local' 
                        ? 'border-blue-500 bg-blue-50 shadow-sm' 
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-medium text-gray-900 text-sm">仅本地</div>
                    <div className="text-xs text-gray-500 mt-1">清理缓存、换设备会丢失</div>
                  </button>
                  <button
                    onClick={() => handleStorageModeChange('cloud')}
                    className={`p-3 border rounded-lg text-left transition-all min-w-[180px] ${
                      storageMode === 'cloud' 
                        ? 'border-blue-500 bg-blue-50 shadow-sm' 
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-medium text-gray-900 text-sm">仅云端</div>
                    <div className="text-xs text-gray-500 mt-1">断网不可用</div>
                  </button>
                  <button
                    onClick={() => handleStorageModeChange('hybrid')}
                    className={`p-3 border rounded-lg text-left transition-all min-w-[180px] ${
                      storageMode === 'hybrid' 
                        ? 'border-blue-500 bg-blue-50 shadow-sm' 
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-medium text-gray-900 text-sm">混合模式</div>
                    <div className="text-xs text-gray-500 mt-1">本地+云端双存储，以云端为准</div>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="autoSync"
                      checked={autoSync}
                      onChange={(e) => handleAutoSyncChange(e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="autoSync" className="ml-2 block text-sm text-gray-700">
                      启用自动同步
                    </label>
                  </div>
                  {storageMode === 'hybrid' && (
                    <button
                      onClick={handleManualSync}
                      disabled={syncing || dataLoading}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
                    >
                      {syncing ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <RefreshCw size={12} />
                      )}
                      立即同步
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 ml-6">
                  开启后，本地修改会自动上传云端，云端数据会覆盖本地
                </p>
              </div>

              {storageMode === 'hybrid' && lastSyncTime && (
                <div className="text-xs text-gray-400">
                  上次同步：{lastSyncTime}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="text-sm font-medium text-gray-900">数据导入导出</h3>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowExportConfirm(true)}
              disabled={dataLoading}
              className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {dataLoading ? (
                <Loader2 className="animate-spin h-4 w-4 mr-2" />
              ) : (
                <Download size={16} className="mr-2" />
              )}
              导出全部数据
            </button>
            <label className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {dataLoading ? (
                <Loader2 className="animate-spin h-4 w-4 mr-2" />
              ) : (
                <Upload size={16} className="mr-2" />
              )}
              导入备份数据
              <input
                type="file"
                accept=".json"
                onChange={handleImportData}
                disabled={dataLoading}
                className="hidden"
              />
            </label>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            导出包含对话历史、设置和知识库数据
          </p>
        </div>
      </div>

      {showExportConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-5">
              <h3 className="text-lg font-medium text-gray-900 mb-2">确认导出</h3>
              <p className="text-sm text-gray-600 mb-4">
                确定要导出所有数据吗？导出文件将包含对话历史、设置和知识库数据
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowExportConfirm(false)}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  取消
                </button>
                <button
                  onClick={handleExportData}
                  className="px-4 py-2 text-sm text-white bg-green-600 rounded-md hover:bg-green-700"
                >
                  确认导出
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImportConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={20} className="text-amber-600" />
                <h3 className="text-lg font-medium text-gray-900">导入确认</h3>
              </div>
              <p className="text-sm text-gray-600 mb-1">
                导入将覆盖当前所有数据（对话、设置、知识库）
              </p>
              <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded mb-4">
                建议先导出当前数据备份
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowImportConfirm(false); setPendingImportData(null); }}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  取消
                </button>
                <button
                  onClick={confirmImport}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  确认导入
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StorageManagement;
