// Agent任务处理服务
import { checkIfNeedsAgent, generateTaskResultMessage } from '../../utils/messageUtils'

class AgentTaskService {
  /**
   * 处理Agent任务
   * @param content 任务内容
   * @param addMessageToCurrentConversation 添加消息的函数
   * @param user 用户信息
   * @returns 是否由Agent处理
   */
  async handleAgentTask(
    content: string,
    addMessageToCurrentConversation: (message: any) => void,
    user: any
  ): Promise<boolean> {
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
        // Show "thinking" message
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
            // 不展示任务分析过程，直接静默创建任务
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
  }

  /**
   * 处理从聊天到Agent的转换
   * @param content 任务内容
   * @param addMessageToCurrentConversation 添加消息的函数
   * @param user 用户信息
   */
  async handleChatToAgent(
    content: string,
    addMessageToCurrentConversation: (message: any) => void,
    user: any
  ) {
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
                      const resultMsg = generateTaskResultMessage(t, content);
                      addMessageToCurrentConversation({ role: 'assistant' as const, content: resultMsg });
                    }
                  }
                } catch { /* 轮询出错忽略 */ }
              }, 3000);
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
  }
}

export default new AgentTaskService()