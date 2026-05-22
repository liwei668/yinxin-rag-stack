// 浏览器工具函数 - 从 browserManager.ts 拆分
import path from 'path';

// 动态导入 playwright（使用绝对路径绕过 Turbopack 模块解析问题）
// eslint-disable-next-line no-new-func
const _importPlaywright = new Function('mod', 'return import(mod)');

export async function getChromium() {
  // 直接拼接 node_modules 中 playwright 的绝对路径，完全绕过模块解析
  const projectRoot = process.cwd();
  const playwrightPath = path.join(projectRoot, 'node_modules', 'playwright', 'index.mjs');
  const pw = await _importPlaywright(playwrightPath);
  return pw.chromium;
}

/* ========== 拟人化工具函数 ========== */

/** 随机延迟（模拟人类反应时间） */
export function humanDelay(min = 100, max = 400): Promise<void> {
  const delay = min + Math.random() * (max - min);
  return new Promise(resolve => setTimeout(resolve, delay));
}

/** 随机偏移坐标（模拟手抖） */
export function jitter(value: number, range = 3): number {
  return value + (Math.random() - 0.5) * range * 2;
}

/** CDP 虚拟键码映射 */
export function getVirtualKeyCode(key: string): number {
  const map: Record<string, number> = {
    'Enter': 13, 'Tab': 9, 'Escape': 27, 'Backspace': 8, 'Delete': 46,
    'ArrowUp': 38, 'ArrowDown': 40, 'ArrowLeft': 37, 'ArrowRight': 39,
    'PageUp': 33, 'PageDown': 34, 'Home': 36, 'End': 35,
    'F1': 112, 'F5': 116, 'F12': 123,
    'Control': 17, 'Shift': 16, 'Alt': 18,
  };
  return map[key] || 0;
}
