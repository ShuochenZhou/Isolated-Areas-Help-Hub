import { describe, expect, it } from 'vitest'
import { parsePath, setPath } from '../src/runtime/page'
import { parseUrl } from '../src/runtime/router'
import { resolveModule } from '../src/runtime/modules'
import { gcj02ToWgs84, wgs84ToGcj02 } from '../src/runtime/geo'
import { wxApi } from '../src/runtime/wx/callback'
import { systemText, systemLanguage } from '../src/runtime/system-text'
import { setItem, removeItem } from '../src/runtime/storage'

describe('system text', () => {
  it('follows the language chosen in the WeChat application, not only the browser', () => {
    setItem('language', 'en')
    expect(systemLanguage()).toBe('en')
    expect([systemText('share'), systemText('copyLink'), systemText('cancel')]).toEqual(['Share', 'Copy link', 'Cancel'])
    setItem('language', 'zh')
    expect([systemText('share'), systemText('copyLink'), systemText('cancel')]).toEqual(['分享', '复制链接', '取消'])
    removeItem('language')
  })
})

describe('setData paths', () => {
  it('parses WeChat key paths', () => {
    expect(parsePath('a.b[2].c')).toEqual(['a', 'b', 2, 'c'])
    expect(parsePath('list[0]')).toEqual(['list', 0])
    expect(parsePath('plain')).toEqual(['plain'])
  })
  it('sets nested values on copies, so renderers see new references', () => {
    const inner = { items: [{ name: 'a' }, { name: 'b' }] }
    const data: Record<string, unknown> = { inner }
    setPath(data, 'inner.items[1].name', 'B')
    expect((data.inner as typeof inner).items[1].name).toBe('B')
    expect(data.inner).not.toBe(inner)
    expect(inner.items[1].name).toBe('b')
  })
  it('creates missing containers', () => {
    const data: Record<string, unknown> = {}
    setPath(data, 'a.list[1]', 'x')
    expect(data).toEqual({ a: { list: [undefined, 'x'] } })
  })
})

describe('page urls', () => {
  it('reads absolute and relative urls with their query', () => {
    expect(parseUrl('/pages/feedback/index?requestId=12&number=3')).toEqual({ route: 'pages/feedback/index', query: { requestId: '12', number: '3' } })
    expect(parseUrl('../place/index', 'pages/home/index')).toEqual({ route: 'pages/place/index', query: {} })
    expect(parseUrl('/pages/a/index?q=%E9%82%BB')).toEqual({ route: 'pages/a/index', query: { q: '邻' } })
  })
})

describe('require()', () => {
  it('resolves like WeChat: relative, extensionless, from the root', () => {
    expect(resolveModule('pages/home/index.js', '../../utils/request')).toBe('utils/request.js')
    expect(resolveModule('app.js', './config')).toBe('config.js')
    expect(resolveModule('utils/place.js', './request')).toBe('utils/request.js')
    expect(resolveModule('pages/home/index.js', '/utils/i18n.js')).toBe('utils/i18n.js')
    expect(() => resolveModule('app.js', './missing')).toThrow(/not defined/)
  })
})

describe('coordinates', () => {
  it('converts GCJ-02 and back to well under a metre', () => {
    const [lat, lng] = wgs84ToGcj02(31.1665, 121.1111)
    expect(Math.abs(lat - 31.1665) + Math.abs(lng - 121.1111)).toBeGreaterThan(0.002)
    const [backLat, backLng] = gcj02ToWgs84(lat, lng)
    expect(Math.abs(backLat - 31.1665)).toBeLessThan(1e-6)
    expect(Math.abs(backLng - 121.1111)).toBeLessThan(1e-6)
  })
})

describe('wx API calling convention', () => {
  const echo = wxApi<Record<string, unknown>, { value: unknown }>('echo', options => {
    if (options.fail === undefined && options.boom) throw new Error('boom')
    if (options.boom) throw new Error('boom')
    return { value: options.value }
  })
  it('returns a promise when no callback is given', async () => {
    await expect(echo({ value: 1 })).resolves.toEqual({ errMsg: 'echo:ok', value: 1 })
    await expect(echo({ boom: true })).rejects.toEqual({ errMsg: 'echo:fail boom' })
  })
  it('calls success/fail/complete otherwise', async () => {
    const calls: string[] = []
    const result = echo({ value: 2, success: () => calls.push('success'), complete: () => calls.push('complete') })
    expect(result).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 0))
    echo({ boom: true, fail: (error: unknown) => calls.push((error as { errMsg: string }).errMsg) })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(calls).toEqual(['success', 'complete', 'echo:fail boom'])
  })
})
