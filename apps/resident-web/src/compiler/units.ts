// rpx and the page viewport's vh/vw as CSS variables the runtime keeps current. Shared by the
// build-time compiler and the runtime (inline styles bound in WXML).
//
// WeChat converts every rpx value on its own (base library, css unit transformer):
//   px = floor(|rpx| / 750 × windowWidth + 1e-4); 0 becomes 0.5 (iOS, DPR ≠ 1) or 1; sign restored.
// "exact" reproduces that with CSS round(); "plain" is the unrounded fallback for browsers
// without round(), which WXSS output declares first.
const NUMBER_UNIT = /(-?(?:\d+\.\d+|\d+|\.\d+))(rpx|vh|vw)\b/g

function rpx(number: string, exact: boolean): string {
  const value = Number(number)
  if (value === 0) return '0px'
  if (!exact) return `calc(${number} * var(--rpx))`
  const magnitude = `max(round(down, calc(${Math.abs(value)} * var(--rpx) + 0.0001px), 1px), var(--wx-rpx-min))`
  return value < 0 ? `calc(-1 * ${magnitude})` : magnitude
}

export function convertUnits(value: string, mode: 'exact' | 'plain' = 'exact'): string {
  return value.replace(NUMBER_UNIT, (_, number: string, unit: string) => {
    if (unit === 'rpx') return rpx(number, mode === 'exact')
    return `calc(${number} * var(${unit === 'vh' ? '--wx-vh' : '--wx-vw'}))`
  })
}

export const hasRpx = (value: string) => /\drpx\b/.test(value)
