import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileWxml, datasetKey, parseWxml, valueExpression, wxmlToVueTemplate } from '../src/compiler/wxml'
import { transformSelector, transformWxss } from '../src/compiler/wxss'

const miniapp = resolve(__dirname, '..', '..', 'resident-miniapp')
const app = JSON.parse(readFileSync(join(miniapp, 'app.json'), 'utf8')) as { pages: string[] }
const template = (source: string) => wxmlToVueTemplate(parseWxml(source)).template

describe('every page of the synced WeChat application', () => {
  for (const route of app.pages) {
    it(`compiles ${route}.wxml`, () => {
      const source = readFileSync(join(miniapp, `${route}.wxml`), 'utf8')
      const { code } = compileWxml(source, `${route}.wxml`, route)
      expect(code).toContain('export function render')
    })
    it(`transforms ${route}.wxss`, () => {
      const css = transformWxss(readFileSync(join(miniapp, `${route}.wxss`), 'utf8'), { scope: route })
      expect(css).not.toMatch(/\d+rpx/)
    })
  }
  it('transforms app.wxss', () => {
    const css = transformWxss(readFileSync(join(miniapp, 'app.wxss'), 'utf8'))
    expect(css).toContain('wx-page {')
    expect(css).toContain('max(round(down, calc(28 * var(--rpx) + 0.0001px), 1px), var(--wx-rpx-min))')
    expect(css).toContain('wx-button[disabled]')
  })
})

describe('WXML parsing', () => {
  it('keeps "<" inside mustaches as part of the expression', () => {
    const nodes = parseWxml('<view>{{a < b ? "x" : "y"}}</view>')
    expect(nodes[0]).toMatchObject({ tag: 'view', children: [{ type: 'text', value: '{{a < b ? "x" : "y"}}' }] })
  })
  it('reads boolean, quoted and self-closing attributes', () => {
    const [input] = parseWxml('<input password value=\'{{v}}\' maxlength="6" />') as any[]
    expect(input.attrs).toEqual([
      { name: 'password', value: null, line: 1 },
      { name: 'value', value: '{{v}}', line: 1 },
      { name: 'maxlength', value: '6', line: 1 }
    ])
  })
  it('reports unclosed and mismatched tags with the line', () => {
    expect(() => parseWxml('<view>\n<text></view>', 'x.wxml')).toThrow(/x\.wxml:2/)
    expect(() => parseWxml('<view>', 'x.wxml')).toThrow(/Unclosed tag <view>/)
  })
  it('skips comments', () => {
    expect(template('<!-- hi --><view/>')).toBe('<wx-view></wx-view>')
  })
})

describe('WXML -> Vue template', () => {
  it('keeps a lone mustache typed and joins mixed text as a string', () => {
    expect(valueExpression('{{list}}')).toBe('(list)')
    expect(valueExpression('a {{b}}')).toBe('"a " + $wx.s(b)')
    expect(valueExpression('plain')).toBe('"plain"')
  })
  it('maps conditionals and loops', () => {
    const out = template('<view wx:if="{{a}}">1</view><view wx:elif="{{b}}">2</view><view wx:else>3</view>')
    expect(out).toBe('<wx-view v-if="(a)">1</wx-view><wx-view v-else-if="(b)">2</wx-view><wx-view v-else>3</wx-view>')
    expect(template('<text wx:for="{{rows}}" wx:for-item="row" wx:key="id">{{row.name}}</text>'))
      .toBe('<wx-text v-for="(row, index) in (rows)" :key="$wx.k(row, &quot;id&quot;, index)">{{ $wx.s(row.name) }}</wx-text>')
  })
  it('runs wx:for before wx:if on the same element, as WXML does', () => {
    expect(template('<view wx:for="{{rows}}" wx:if="{{item.ok}}"/>'))
      .toBe('<template v-for="(item, index) in (rows)" ><wx-view v-if="(item.ok)"></wx-view></template>')
  })
  it('unwraps a bare block and keeps directives on a block', () => {
    expect(template('<block><view/></block>')).toBe('<wx-view></wx-view>')
    expect(template('<block wx:if="{{a}}"><view/></block>')).toBe('<template v-if="(a)"><wx-view></wx-view></template>')
  })
  it('binds events with a typed dataset and the element id', () => {
    const out = template('<view id="x" data-id="{{item.id}}" data-url="/pages/a" catchtap="go"/>')
    expect(out).toContain('@click="$wx.e($event, &quot;go&quot;, 1, { &quot;id&quot;: (item.id), &quot;url&quot;: &quot;/pages/a&quot; }, &quot;x&quot;, null)"')
  })
  it('keeps component events by name and blocks scroll-through for catchtouchmove', () => {
    expect(template('<input bindinput="typed"/>')).toContain('@input="$wx.e($event, &quot;typed&quot;, 0')
    expect(template('<view catchtouchmove="noop"/>')).toContain('@wheel="$wx.block($event)"')
  })
  it('names dataset keys like WeChat', () => {
    expect(datasetKey('request-id')).toBe('requestId')
    expect(datasetKey('elementType')).toBe('elementtype')
  })
  it('shows character references literally outside <text decode>', () => {
    expect(template('<view>a &nbsp; b</view>')).toBe('<wx-view>a &amp;nbsp; b</wx-view>')
    expect(template('<text decode>&nbsp;</text>')).toBe('<wx-text decode>&nbsp;</wx-text>')
  })
  it('turns hover-class into the hover directive', () => {
    expect(template('<view hover-class="on"/>')).toBe('<wx-view v-wx-hover="{ cls: &quot;on&quot; }"></wx-view>')
  })
  it('refuses template features the runtime does not implement', () => {
    expect(() => template('<import src="a.wxml"/>')).toThrow(/not supported/)
  })
})

describe('WXSS', () => {
  it('renames tags and scopes page rules without adding specificity', () => {
    expect(transformSelector('.section-title text:first-child', 'pages/home/index'))
      .toBe(':where([data-wx-page="pages/home/index"]) .section-title wx-text:first-child')
    expect(transformSelector('page', 'pages/home/index')).toBe('wx-page:where([data-wx-page="pages/home/index"])')
    expect(transformSelector('.btn[disabled], button[disabled]')).toBe('.btn[disabled], wx-button[disabled]')
  })
  it('converts rpx like WeChat (floored per value, never below a hairline), with an unrounded fallback', () => {
    const css = transformWxss('@keyframes pulse { 0% { opacity: 1 } } .a { margin: -90rpx 0 0 1.5rpx; height: 78vh; background: url(a1rpx.png) }')
    expect(css).toContain('margin: calc(-90 * var(--rpx)) 0 0 calc(1.5 * var(--rpx));')
    expect(css).toContain('margin: calc(-1 * max(round(down, calc(90 * var(--rpx) + 0.0001px), 1px), var(--wx-rpx-min))) 0 0 max(round(down, calc(1.5 * var(--rpx) + 0.0001px), 1px), var(--wx-rpx-min))')
    expect(css).toContain('height: calc(78 * var(--wx-vh))')
    expect(css).toContain('url(a1rpx.png)')
    expect(css).toContain('0% { opacity: 1 }')
  })
})

describe('rpx rounding', () => {
  it('keeps zero as zero and offers an unrounded fallback', async () => {
    const { convertUnits } = await import('../src/compiler/units')
    expect(convertUnits('0rpx')).toBe('0px')
    expect(convertUnits('2rpx 0', 'plain')).toBe('calc(2 * var(--rpx)) 0')
  })
})
