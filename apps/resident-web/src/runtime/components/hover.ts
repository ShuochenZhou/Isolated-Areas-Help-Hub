// hover-class: WeChat adds the class shortly after a touch starts (hover-start-time) and keeps
// it a moment after it ends (hover-stay-time); ancestors get theirs too unless one stops it.
import type { Directive } from 'vue'

export interface HoverOptions { cls?: string; start?: number; stay?: number; stop?: boolean }

const STOPPED = Symbol('wx-hover-stopped')

export function attachHover(element: HTMLElement, read: () => HoverOptions & { disabled?: boolean }): () => void {
  let startTimer: ReturnType<typeof setTimeout> | undefined
  let stayTimer: ReturnType<typeof setTimeout> | undefined
  let applied = ''
  const remove = () => { if (applied) element.classList.remove(...applied.split(/\s+/).filter(Boolean)); applied = '' }
  const down = (event: PointerEvent) => {
    const options = read()
    const marked = event as PointerEvent & { [STOPPED]?: boolean }
    if (!options.cls || options.cls === 'none' || options.disabled || marked[STOPPED]) return
    if (options.stop) marked[STOPPED] = true
    clearTimeout(startTimer)
    clearTimeout(stayTimer)
    startTimer = setTimeout(() => {
      remove()
      applied = options.cls!
      element.classList.add(...applied.split(/\s+/).filter(Boolean))
    }, options.start ?? 20)
  }
  const up = () => {
    clearTimeout(startTimer)
    const options = read()
    stayTimer = setTimeout(remove, applied ? (options.stay ?? 70) : 0)
  }
  element.addEventListener('pointerdown', down)
  element.addEventListener('pointerup', up)
  element.addEventListener('pointercancel', up)
  element.addEventListener('pointerleave', up)
  return () => {
    clearTimeout(startTimer)
    clearTimeout(stayTimer)
    element.removeEventListener('pointerdown', down)
    element.removeEventListener('pointerup', up)
    element.removeEventListener('pointercancel', up)
    element.removeEventListener('pointerleave', up)
  }
}

type HoverElement = HTMLElement & { __wxHover?: { options: HoverOptions; detach: () => void } }

export const hoverDirective: Directive<HoverElement, HoverOptions> = {
  mounted(element, binding) {
    const state = { options: binding.value || {}, detach: () => undefined as void }
    state.detach = attachHover(element, () => state.options)
    element.__wxHover = state
  },
  updated(element, binding) {
    if (element.__wxHover) element.__wxHover.options = binding.value || {}
  },
  unmounted(element) {
    element.__wxHover?.detach()
  }
}
