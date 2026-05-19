'use client';
import React, { useState, useRef, useEffect } from 'react'
import { checkIfNeedsAgent, generateTaskResultMessage } from '../utils/messageUtils'

interface AgentTaskManagerProps {
  message: string
  loading: boolean
  setLoading: (loading: boolean) => void
  addMessageToCurrentConversation: (message: any) => void
  user: any
}

const AgentTaskManager: React.FC<AgentTaskManagerProps> = ({
  message,
  loading,
  setLoading,
  addMessageToCurrentConversation,
  user
}) => {
  const [pendingAgentPlan, setPendingAgentPlan] = useState<any>(null)
  const pollIntervalsRef = useRef<Set<ReturnType<typeof setInterval>>>(new Set())

  // 组件卸载时清除所有轮询定时器，防止内存泄漏
  useEffect(() => {
    return () => {
      pollIntervalsRef.current.forEach(id => clearInterval(id))
      pollIntervalsRef.current.clear()
    }
  }, [])

  const confirmAgentPlan = async () => {
    if (!pendingAgentPlan) return;

    setLoading(true);
    setPendingAgentPlan(null);

    try {
      // Step 1: Create agent task
      const agentRes = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          userId: user?.id || 'anonymous',
          title: pendingAgentPlan.title || 'Agent 任务',
          description: pendingAgentPlan.description || '',
          plan: pendingAgentPlan.steps,
        }),
      });

      if (agentRes.ok) {
        const agentData = await agentRes.json();
        if (agentData.success && agentData.task) {
          const task = agentData.task;

          // Add confirmation message
          addMessageToCurrentConversation({
            role: 'assistant' as const,
            content: `任务已确认，正在启动执行...\n\n共 ${pendingAgentPlan.steps.length} 个步骤，你可以在工作区面板查看实时进度。`,
          });

          // Step 2: Start the task
          fetch('/api/agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'start', taskId: task.id }),
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.error('Agent task creation failed:', e);
      addMessageToCurrentConversation({
        role: 'assistant' as const,
        content: '任务创建失败，请稍后再试。',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAgentTask = async (content: string) => {
    // Agent 任务检测：先快速意图判断，再让 AI 生成执行计划
    let needsAgent = false;
    try {
      needsAgent = await checkIfNeedsAgent(content);
      console.log('[Agent Intent] needsAgent:', needsAgent, 'for message:', content.substring(0, 50));
    } catch (e) {
      console.error('[Agent Intent] Check failed:', e);
      // 意图判断失败，不阻塞流程
    }

    if (needsAgent) {
      // Step 2: AI analyzes and creates plan
      try {
        // 极简提示，不展示中间过程
        const thinkingMsg = { role: 'assistant' as const, content: '正在处理...' };
        addMessageToCurrentConversation(thinkingMsg);

        const planRes = await fetch('/api/chat/agent-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: content }),
        });

        if (planRes.ok) {
          const planData = await planRes.json();
          console.log('[Agent Plan] API response:', JSON.stringify(planData).substring(0, 500));

          // API 返回 {needsAgent, title, description, steps} 或 {needsAgent, plan: {title, description, steps}}
          const plan = planData.plan || (planData.needsAgent ? {
            title: planData.title,
            description: planData.description,
            steps: planData.steps,
          } : null);

          if (planData.needsAgent && plan && plan.steps && plan.steps.length > 0) {
            // 不再展示任务分析和执行计划，直接静默创建任务
            try {
              const createRes = await fetch('/api/agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'create',
                  userId: user?.id || 'anonymous',
                  title: plan.title || 'Agent 任务',
                  description: plan.description || '',
                  plan: plan.steps,
                }),
              });

              if (createRes.ok) {
                const createData = await createRes.json();
                const task = createData.task;
                if (task) {
                  // 触发事件打开工作区面板（planTask 已自动启动任务）
                  window.dispatchEvent(new CustomEvent('agent-task-start', {
                    detail: { taskId: task.id }
                  }));

                  // 轮询任务状态，完成后将结果反馈给用户
                  const pollInterval = setInterval(async () => {
                    try {
                      const res = await fetch(`/api/agent?action=task&taskId=${task.id}`);
                      if (res.ok) {
                        const data = await res.json();
                        const t = data.task || data;
                        if (t.status === 'completed' || t.status === 'failed') {
                          clearInterval(pollInterval);
                          pollIntervalsRef.current.delete(pollInterval);
                          
                          // 将结果反馈给用户
                          const resultMsg = generateTaskResultMessage(t, content);

                          addMessageToCurrentConversation({
                            role: 'assistant' as const,
                            content: resultMsg,
                          });
                        }
                      }
                    } catch {
                      // 轮询出错，忽略
                    }
                  }, 3000); // 每 3 秒检查一次
                  pollIntervalsRef.current.add(pollInterval);
                }
              }
            } catch (e) {
              console.error('[Agent] Auto-create task failed:', e);
              addMessageToCurrentConversation({
                role: 'assistant' as const,
                content: '任务创建失败，请稍后再试。',
              });
            }

            return true;
          } else {
            // AI says no agent needed, fall through to normal chat
            console.log('[Agent Plan] AI decided no agent needed:', planData.reason || 'no reason');
            // 移除"正在分析"消息
            return false;
          }
        } else {
          console.error('[Agent Plan] API error:', planRes.status);
          addMessageToCurrentConversation({
            role: 'assistant' as const,
            content: '⚠️ 任务规划服务暂时不可用，请稍后再试。',
          });
          return true;
        }
      } catch (e) {
        console.error('[Agent Plan] Analysis failed:', e);
        // 分析失败时，告知用户而不是让 AI 编造答案
        addMessageToCurrentConversation({
          role: 'assistant' as const,
          content: '⚠️ 任务分析失败，请稍后再试或换个说法。',
        });
        return true; // 阻止 fall through 到正常聊天
      }
    }
    return false;
  };

  const handleChatToAgent = async (content: string) => {
    // 极简提示
    addMessageToCurrentConversation({
      role: 'assistant' as const,
      content: '正在处理...',
    });

    // 自动触发 Agent 流程
    try {
      const planRes = await fetch('/api/chat/agent-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content }),
      });

      if (planRes.ok) {
        const planData = await planRes.json();
        const plan = planData.plan || (planData.needsAgent ? {
          title: planData.title,
          description: planData.description,
          steps: planData.steps,
        } : null);

        if (planData.needsAgent && plan && plan.steps && plan.steps.length > 0) {
          // 不展示任务分析过程，直接静默创建任务
          const createRes = await fetch('/api/agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'create',
              userId: user?.id || 'anonymous',
              title: plan.title || 'Agent 任务',
              description: plan.description || '',
              plan: plan.steps,
            }),
          });

          if (createRes.ok) {
            const createData = await createRes.json();
            const task = createData.task;
            if (task) {
              fetch('/api/agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'start', taskId: task.id }),
              }).then(() => {
                // 触发任务开始事件，通知主页面打开Agent工作区
                window.dispatchEvent(new CustomEvent('agent-task-start', {
                  detail: { taskId: task.id }
                }));
              }).catch(() => {});

              // 轮询任务结果
              const pollInterval = setInterval(async () => {
                try {
                  const res = await fetch(`/api/agent?action=task&taskId=${task.id}`);
                  if (res.ok) {
                    const tData = await res.json();
                    const t = tData.task || tData;
                    if (t.status === 'completed' || t.status === 'failed') {
                      clearInterval(pollInterval);
                      pollIntervalsRef.current.delete(pollInterval);
                      const resultMsg = generateTaskResultMessage(t, content);
                      addMessageToCurrentConversation({ role: 'assistant' as const, content: resultMsg });
                    }
                  }
                } catch { /* 轮询出错忽略 */ }
              }, 3000);
              pollIntervalsRef.current.add(pollInterval);
            }
          }
        } else {
          addMessageToCurrentConversation({
            role: 'assistant' as const,
            content: '抱歉，Agent 无法处理这个请求。',
          });
        }
      } else {
        addMessageToCurrentConversation({
          role: 'assistant' as const,
          content: 'Agent 任务分析失败，请稍后再试。',
        });
      }
    } catch (e) {
      console.error('[Chat→Agent] 触发失败:', e);
      addMessageToCurrentConversation({
        role: 'assistant' as const,
        content: 'Agent 启动失败，请稍后再试。',
      });
    }
  };

  return (
    <>
      {/* Agent 执行计划确认卡片 */}
      {pendingAgentPlan && (
        <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-medium text-blue-800 mb-2">确认执行计划</h4>
          <p className="text-sm text-blue-700 mb-1"><strong>{pendingAgentPlan.title}</strong></p>
          <p className="text-sm text-gray-600 mb-3">{pendingAgentPlan.description}</p>
          <div className="text-sm text-gray-700 mb-3">
            {pendingAgentPlan.steps.map((s: any, i: number) => (
              <div key={i} className="flex items-start gap-2 mb-1">
                <span className="text-blue-500 font-mono">{i + 1}.</span>
                <span>{s.title}{s.needsHuman ? ' [需要人工]' : ''}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={confirmAgentPlan}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              确认执行
            </button>
            <button
              onClick={() => setPendingAgentPlan(null)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default AgentTaskManager