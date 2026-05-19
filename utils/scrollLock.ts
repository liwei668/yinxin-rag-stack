/**
 * 全局滚动锁管理器
 * 使用引用计数，避免多个组件互相覆盖 overflow 状态
 */

let scrollLockCount = 0

export function lockScroll(): void {
  if (typeof document === 'undefined') return
  scrollLockCount++
  if (scrollLockCount === 1) {
    document.body.style.overflow = 'hidden'
  }
}

export function unlockScroll(): void {
  if (typeof document === 'undefined') return
  scrollLockCount = Math.max(0, scrollLockCount - 1)
  if (scrollLockCount === 0) {
    document.body.style.overflow = ''
  }
}
