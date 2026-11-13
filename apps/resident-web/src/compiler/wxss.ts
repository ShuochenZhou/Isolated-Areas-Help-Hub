// WXSS -> CSS. Units WeChat resolves against the screen (rpx, and vh/vw of the page viewport)
// become CSS variables the runtime keeps up to date; tag selectors are renamed to the wx-*
// elements the web runtime renders; a page's own styles are scoped to that page with a
// zero-specificity :where(), so page rules still override app.wxss by source order as in WeChat.
import postcss, { type AtRule, type Rule } from 'postcss'
import selectorParser from 'postcss-selector-parser'
import { WXSS_TYPE_TAGS } from './tags'
import { convertUnits, hasRpx } from './units'

export interface WxssOptions {
  /** Page route ("pages/home/index"); omitted for app.wxss. */
  scope?: string
  from?: string
}

function insideKeyframes(rule: Rule): boolean {
  const parent = rule.parent
  return !!parent && parent.type === 'atrule' && /keyframes$/i.test((parent as AtRule).name)
}

export function transformSelector(selector: string, scope?: string): string {
  const where = scope ? `:where([data-wx-page="${scope}"])` : ''
  const ast = selectorParser().astSync(selector)
  const out: string[] = []
  ast.each(sel => {
    sel.walkTags(tag => {
      const name = tag.value.toLowerCase()
      if (name === 'page') tag.value = 'wx-page'
      else if (WXSS_TYPE_TAGS.has(name)) tag.value = `wx-${name}`
    })
    const text = sel.toString().trim()
    if (!scope) out.push(text)
    else if (/^wx-page(?![\w-])/.test(text)) out.push(text.replace(/^wx-page/, `wx-page${where}`))
    else out.push(`${where} ${text}`)
  })
  return out.join(', ')
}

export function transformWxss(css: string, options: WxssOptions = {}): string {
  const root = postcss.parse(css, { from: options.from })
  root.walkRules(rule => {
    if (insideKeyframes(rule)) return
    rule.selector = transformSelector(rule.selector, options.scope)
  })
  root.walkDecls(decl => {
    if (/url\(/i.test(decl.value)) return
    // Browsers without CSS round() keep the first (unrounded) declaration and skip the second.
    if (hasRpx(decl.value)) decl.cloneBefore({ value: convertUnits(decl.value, 'plain') })
    decl.value = convertUnits(decl.value, 'exact')
  })
  return root.toString()
}
