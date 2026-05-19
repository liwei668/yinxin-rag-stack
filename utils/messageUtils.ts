// 消息相关的工具函数

/**
 * 转换并下载内容为指定格式
 * @param content 要转换的内容
 * @param format 目标格式
 */
export const convertAndDownload = async (content: string, format: string) => {
  try {
    const response = await fetch('/api/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content, format }),
    })
    
    if (response.ok) {
      const data = await response.json()
      // 创建下载链接
      const link = document.createElement('a')
      link.href = data.url
      link.download = data.filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } else {
      throw new Error('转换失败')
    }
  } catch (error) {
    console.error('转换失败:', error)
    alert('转换失败，请稍后再试')
  }
}

/**
 * 检查消息是否需要Agent处理
 * @param message 消息内容
 * @returns 是否需要Agent处理
 */
export const checkIfNeedsAgent = async (message: string): Promise<boolean> => {
  try {
    const intentRes = await fetch('/api/chat/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    if (intentRes.ok) {
      const intentData = await intentRes.json();
      return intentData.needsAgent === true;
    }
    return false;
  } catch (e) {
    console.error('[Agent Intent] Check failed:', e);
    return false;
  }
}

/**
 * 生成任务结果消息
 * @param task 任务对象
 * @returns 任务结果消息
 */
export const generateTaskResultMessage = (task: any, originalQuery?: string): string => {
  const result = task.result || {};
  const failCount = (task.plan || []).filter((s: any) => s.status === 'failed').length;
  
  // 任务失败：生成友好提示
  if (task.status === 'failed' || !result.summary) {
    const queryHint = originalQuery ? `关于「${originalQuery}」的` : '';
    return `抱歉，${queryHint}查询未成功，请稍后再试或换个说法。`;
  }
  
  // 部分步骤失败但有结果
  const taskTitle = task.title || '查询结果';
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  
  let resultMsg = `为您查询到以下${taskTitle}（${dateStr}）：\n\n`;
  if (failCount > 0) {
    resultMsg += `⚠ 部分步骤失败，以下为已获取的结果：\n\n`;
  }
  resultMsg += result.summary;
  
  return resultMsg;
}