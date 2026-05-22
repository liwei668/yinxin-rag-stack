/**
 * 方案三：浏览器注入脚本
 * 常驻页面内，实时监听滚动、窗口大小变化、DOM动态刷新
 * 提供原生元素捕获能力，天然兼容滚动/缩放/动态渲染/ShadowDOM
 */

export const INJECT_SCRIPT = `
(function() {
  // 防止重复注入
  if (window.__yinxinAgentInjected) return;
  window.__yinxinAgentInjected = true;

  // ====== 页面状态实时维护 ======
  const state = {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    pageWidth: document.documentElement.scrollWidth,
    pageHeight: document.documentElement.scrollHeight,
    lastUpdated: Date.now(),
  };

  // 更新状态
  function updateState() {
    state.scrollX = window.scrollX;
    state.scrollY = window.scrollY;
    state.viewportWidth = window.innerWidth;
    state.viewportHeight = window.innerHeight;
    state.pageWidth = document.documentElement.scrollWidth;
    state.pageHeight = document.documentElement.scrollHeight;
    state.lastUpdated = Date.now();
  }

  // 监听滚动
  window.addEventListener('scroll', updateState, { passive: true });
  // 监听窗口大小变化
  window.addEventListener('resize', updateState, { passive: true });
  // 监听 DOM 变化（动态渲染、懒加载、弹窗等）
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      updateState();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  }

  // ====== 核心功能：原生元素捕获 ======

  /**
   * 在指定视口坐标获取元素信息（在浏览器上下文内执行，天然准确）
   * @param {number} x - 视口 X 坐标
   * @param {number} y - 视口 Y 坐标
   * @returns {object|null} 元素信息
   */
  window.__yinxinGetElementAtPoint = function(x, y) {
    updateState();
    const el = document.elementFromPoint(x, y);
    if (!el) return null;

    const rect = el.getBoundingClientRect();
    const info = {
      tag: el.tagName,
      text: (el.innerText || '').trim().substring(0, 100),
      ariaLabel: el.getAttribute('aria-label') || '',
      role: el.getAttribute('role') || '',
      placeholder: (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) ? (el.placeholder || '') : '',
      href: el instanceof HTMLAnchorElement ? (el.href || '') : '',
      src: (el instanceof HTMLImageElement) ? (el.src || '') : '',
      type: el.getAttribute('type') || '',
      value: (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) ? (el.value || '').substring(0, 50) : '',
      id: el.id || '',
      className: (el.className && typeof el.className === 'string') ? el.className.split(' ').filter(Boolean).slice(0, 5).join('.') : '',
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      // 父级特征（复合容错选择器）
      parent: null,
      // 是否可交互
      isInteractive: false,
      // ShadowDOM 检测
      isShadowHost: !!el.shadowRoot,
    };

    // 判断是否可交互元素
    const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'DETAILS', 'OPTION', 'LABEL'];
    info.isInteractive = interactiveTags.includes(el.tagName) ||
      el.getAttribute('onclick') !== null ||
      el.getAttribute('role') === 'button' ||
      el.getAttribute('role') === 'link' ||
      el.getAttribute('role') === 'tab' ||
      el.getAttribute('tabindex') !== null ||
      window.getComputedStyle(el).cursor === 'pointer';

    // 父级特征
    const parent = el.parentElement;
    if (parent && parent !== document.body && parent !== document.documentElement) {
      const parentRect = parent.getBoundingClientRect();
      info.parent = {
        tag: parent.tagName,
        className: (parent.className && typeof parent.className === 'string') ? parent.className.split(' ').filter(Boolean).slice(0, 3).join('.') : '',
        id: parent.id || '',
        nthChild: Array.from(parent.children).indexOf(el) + 1,
        rect: { x: parentRect.x, y: parentRect.y, width: parentRect.width, height: parentRect.height },
      };
    }

    // 如果是 ShadowHost，尝试获取内部元素
    if (el.shadowRoot) {
      const shadowEl = el.shadowRoot.elementFromPoint(x - rect.x, y - rect.y);
      if (shadowEl && shadowEl !== el) {
        info.shadowChild = {
          tag: shadowEl.tagName,
          text: (shadowEl.innerText || '').trim().substring(0, 50),
          className: (shadowEl.className && typeof shadowEl.className === 'string') ? shadowEl.className.split(' ').filter(Boolean).slice(0, 3).join('.') : '',
        };
      }
    }

    return info;
  };

  /**
   * 在指定坐标执行点击（原生浏览器行为）
   * @param {number} x - 视口 X 坐标
   * @param {number} y - 视口 Y 坐标
   * @returns {object} 点击结果
   */
  window.__yinxinClickAt = function(x, y) {
    updateState();
    const el = document.elementFromPoint(x, y);
    if (!el) return { success: false, message: '坐标处没有元素' };

    // 触发完整的鼠标事件链（和真实用户点击一致）
    const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    for (const eventType of events) {
      el.dispatchEvent(new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button: 0,
      }));
    }

    // 如果是 input/textarea，自动聚焦
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus();
    }

    return { success: true, tag: el.tagName, text: (el.innerText || '').trim().substring(0, 50) };
  };

  /**
   * 获取当前页面状态
   */
  window.__yinxinGetState = function() {
    updateState();
    return { ...state };
  };

  /**
   * 在当前焦点元素输入文字
   */
  window.__yinxinTypeAtFocus = function(text) {
    const el = document.activeElement;
    if (!el) return { success: false, message: '没有焦点元素' };
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement) && !el.isContentEditable) {
      return { success: false, message: '焦点元素不可输入' };
    }

    // 使用 InputEvent 模拟真实输入
    for (const char of text) {
      el.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        data: char,
        inputType: 'insertText',
      }));
      if (el.isContentEditable) {
        document.execCommand('insertText', false, char);
      } else {
        el.value += char;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));

    return { success: true, message: '输入完成' };
  };

  console.log('[YinxinAgent] 注入脚本已加载 ✓');
})();
`;
