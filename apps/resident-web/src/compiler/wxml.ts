// WXML -> Vue template. The WeChat application's own templates are parsed as they are and turned
// into an equivalent Vue template, which the Vue compiler then turns into a render function
// (see compileWxml). Data references resolve against the page's `data`, exactly like WXML.
import { compileTemplate } from 'vue/compiler-sfc'
import { convertUnits } from './units'
import { COMPONENT_TAGS, KNOWN_UNIMPLEMENTED, UNSUPPORTED_TAGS, isCustomElement, webTag } from './tags'

export interface WxmlAttr { name: string; value: string | null; line: number }
export interface WxmlElement { type: 'element'; tag: string; attrs: WxmlAttr[]; children: WxmlNode[]; line: number }
export interface WxmlText { type: 'text'; value: string; line: number }
export type WxmlNode = WxmlElement | WxmlText

export class WxmlError extends Error {
  constructor(message: string, readonly file: string, readonly line: number) {
    super(`${file}:${line} ${message}`)
  }
}

// Components WeChat closes on its own when they are written without a closing tag.
const VOID_TAGS = new Set(['input', 'image', 'icon', 'import', 'include'])

export function parseWxml(source: string, file = 'template.wxml'): WxmlNode[] {
  const root: WxmlElement = { type: 'element', tag: '#root', attrs: [], children: [], line: 1 }
  const stack: WxmlElement[] = [root]
  let pos = 0
  let line = 1
  const length = source.length
  const advance = (count: number) => {
    for (let i = 0; i < count && pos < length; i++, pos++) if (source[pos] === '\n') line++
  }
  const fail = (message: string): never => { throw new WxmlError(message, file, line) }
  const top = () => stack[stack.length - 1]

  while (pos < length) {
    if (source.startsWith('<!--', pos)) {
      const end = source.indexOf('-->', pos + 4)
      if (end < 0) fail('Unclosed comment')
      advance(end + 3 - pos)
      continue
    }
    if (source.startsWith('</', pos)) {
      const match = /^<\/\s*([A-Za-z][\w\-:.]*)\s*>/.exec(source.slice(pos, pos + 200))
      if (!match) fail('Malformed closing tag')
      const tag = match![1]
      if (top().tag !== tag) fail(`Closing tag </${tag}> does not match <${top().tag}>`)
      stack.pop()
      advance(match![0].length)
      continue
    }
    if (source[pos] === '<' && /[A-Za-z]/.test(source[pos + 1] || '')) {
      const startLine = line
      advance(1)
      const nameMatch = /^[A-Za-z][\w\-:.]*/.exec(source.slice(pos, pos + 100))!
      const tag = nameMatch[0]
      advance(tag.length)
      const attrs: WxmlAttr[] = []
      let selfClosing = false
      for (;;) {
        while (pos < length && /\s/.test(source[pos])) advance(1)
        if (pos >= length) fail(`Unclosed tag <${tag}>`)
        if (source.startsWith('/>', pos)) { selfClosing = true; advance(2); break }
        if (source[pos] === '>') { advance(1); break }
        const attrLine = line
        const name = /^[^\s=/>]+/.exec(source.slice(pos, pos + 200))
        if (!name) fail(`Malformed attribute in <${tag}>`)
        advance(name![0].length)
        while (pos < length && /\s/.test(source[pos])) advance(1)
        let value: string | null = null
        if (source[pos] === '=') {
          advance(1)
          while (pos < length && /\s/.test(source[pos])) advance(1)
          const quote = source[pos]
          if (quote === '"' || quote === "'") {
            const end = source.indexOf(quote, pos + 1)
            if (end < 0) fail(`Unclosed attribute value for ${name![0]}`)
            value = source.slice(pos + 1, end)
            advance(end + 1 - pos)
          } else {
            const raw = /^[^\s>]+/.exec(source.slice(pos))
            value = raw ? raw[0] : ''
            advance(value.length)
          }
        }
        attrs.push({ name: name![0], value, line: attrLine })
      }
      const element: WxmlElement = { type: 'element', tag, attrs, children: [], line: startLine }
      top().children.push(element)
      if (!selfClosing && !VOID_TAGS.has(tag)) stack.push(element)
      continue
    }
    // Text up to the next tag; a mustache may itself contain "<" (e.g. {{a < b}}).
    const startLine = line
    const start = pos
    while (pos < length) {
      if (source.startsWith('{{', pos)) {
        const end = source.indexOf('}}', pos + 2)
        if (end < 0) fail('Unclosed {{')
        advance(end + 2 - pos)
        continue
      }
      if (source[pos] === '<' && /[A-Za-z/!]/.test(source[pos + 1] || '')) break
      advance(1)
    }
    top().children.push({ type: 'text', value: source.slice(start, pos), line: startLine })
  }
  if (stack.length > 1) throw new WxmlError(`Unclosed tag <${top().tag}>`, file, top().line)
  return root.children
}

interface Segment { expr?: string; text?: string }

/** Splits "a {{b}} c" into literal and expression parts. */
export function splitMustache(value: string): Segment[] {
  const parts: Segment[] = []
  let pos = 0
  while (pos < value.length) {
    const start = value.indexOf('{{', pos)
    if (start < 0) { parts.push({ text: value.slice(pos) }); break }
    if (start > pos) parts.push({ text: value.slice(pos, start) })
    const end = value.indexOf('}}', start + 2)
    if (end < 0) { parts.push({ text: value.slice(start) }); break }
    parts.push({ expr: value.slice(start + 2, end).trim() })
    pos = end + 2
  }
  return parts
}

/**
 * A JS expression for an attribute value: "{{x}}" keeps x's own type (WXML passes arrays,
 * numbers and booleans through); mixed text becomes a string, with undefined shown as "".
 */
export function valueExpression(value: string | null): string {
  if (value === null) return 'true'
  const parts = splitMustache(value)
  if (parts.length === 1 && parts[0].expr !== undefined) return `(${parts[0].expr || 'undefined'})`
  if (!parts.some(part => part.expr !== undefined)) return JSON.stringify(value)
  return parts.map(part => part.expr !== undefined ? `$wx.s(${part.expr || 'undefined'})` : JSON.stringify(part.text)).join(' + ') || '""'
}

const hasMustache = (value: string | null) => value !== null && value.includes('{{')

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

// WXML shows character references literally (only <text decode> decodes them).
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

/** WeChat's dataset naming: data-element-type -> elementType; other capitals are lowered. */
export function datasetKey(attr: string): string {
  return attr.toLowerCase().replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase())
}

const EVENT_ATTR = /^(bind|catch|capture-bind|capture-catch|mut-bind):?([A-Za-z]+)$/

// Touch events WeChat names differently from the DOM.
const DOM_EVENT_NAMES: Record<string, string> = {
  tap: 'click', longpress: 'contextmenu', longtap: 'contextmenu'
}

// Inline rpx in a static style attribute is converted at build time (dynamic styles at runtime by $wx.style).
export { convertUnits }

export interface CodegenResult { template: string; warnings: string[] }

export function wxmlToVueTemplate(nodes: WxmlNode[], file = 'template.wxml'): CodegenResult {
  const warnings: string[] = []

  const genChildren = (children: WxmlNode[], decode: boolean): string => children.map(child => genNode(child, decode)).join('')

  function genText(node: WxmlText, decode: boolean): string {
    return splitMustache(node.value).map(part => part.expr !== undefined
      ? `{{ $wx.s(${part.expr || 'undefined'}) }}`
      : decode ? part.text! : escapeText(part.text!)).join('')
  }

  function genNode(node: WxmlNode, decode: boolean): string {
    return node.type === 'text' ? genText(node, decode) : genElement(node, decode)
  }

  function genElement(node: WxmlElement, inheritedDecode: boolean): string {
    const { tag } = node
    if (UNSUPPORTED_TAGS.has(tag)) {
      throw new WxmlError(`<${tag}> is not supported by the web runtime yet`, file, node.line)
    }
    if (KNOWN_UNIMPLEMENTED.has(tag)) warnings.push(`${file}:${node.line} <${tag}> is rendered as an inert element on the web`)
    const isBlock = tag === 'block'
    const outTag = isBlock ? 'template' : webTag(tag)
    const isComponent = COMPONENT_TAGS.has(tag)

    let wxIf: string | null = null
    let wxElif: string | null = null
    let wxElse = false
    let wxFor: string | null = null
    let forItem = 'item'
    let forIndex = 'index'
    let wxKey: string | null = null
    const dataset: string[] = []
    const marks: string[] = []
    const events: { kind: string; type: string; handler: string | null }[] = []
    const out: string[] = []
    let idExpr = '""'
    let hover: { cls?: string; start?: string; stay?: string; stop?: string } | null = null

    for (const attr of node.attrs) {
      const { name, value } = attr
      if (name === 'wx:if') { wxIf = valueExpression(value); continue }
      if (name === 'wx:elif') { wxElif = valueExpression(value); continue }
      if (name === 'wx:else') { wxElse = true; continue }
      if (name === 'wx:for' || name === 'wx:for-items') { wxFor = valueExpression(value); continue }
      if (name === 'wx:for-item') { forItem = (value || 'item').trim(); continue }
      if (name === 'wx:for-index') { forIndex = (value || 'index').trim(); continue }
      if (name === 'wx:key') { wxKey = value; continue }
      if (name.startsWith('wx:')) throw new WxmlError(`Unknown directive ${name}`, file, attr.line)
      const event = EVENT_ATTR.exec(name)
      if (event) { events.push({ kind: event[1], type: event[2].toLowerCase(), handler: value }); continue }
      if (name.startsWith('data-')) {
        dataset.push(`${JSON.stringify(datasetKey(name.slice(5)))}: ${valueExpression(value)}`)
      }
      if (name.startsWith('mark:')) { marks.push(`${JSON.stringify(name.slice(5))}: ${valueExpression(value)}`); continue }
      if (name === 'id') idExpr = valueExpression(value)
      if (!isComponent && !isBlock && (name === 'hover-class' || name === 'hover-start-time' || name === 'hover-stay-time' || name === 'hover-stop-propagation')) {
        hover = hover || {}
        const key = name === 'hover-class' ? 'cls' : name === 'hover-start-time' ? 'start' : name === 'hover-stay-time' ? 'stay' : 'stop'
        hover[key as 'cls'] = valueExpression(value)
        continue
      }
      if (isBlock) continue
      if (name === 'style') {
        if (hasMustache(value)) out.push(`:style="${escapeAttr(`$wx.style(${valueExpression(value)})`)}"`)
        else if (value) out.push(`style="${escapeAttr(convertUnits(value))}"`)
        continue
      }
      if (value === null) { out.push(name); continue }
      if (hasMustache(value)) out.push(`:${name}="${escapeAttr(valueExpression(value))}"`)
      else out.push(`${name}="${escapeAttr(value)}"`)
    }

    if (hover) {
      const fields = Object.entries(hover).map(([key, expr]) => `${key}: ${expr}`).join(', ')
      out.push(`v-wx-hover="${escapeAttr(`{ ${fields} }`)}"`)
    }

    const datasetExpr = `{ ${dataset.join(', ')} }`
    const markExpr = marks.length ? `{ ${marks.join(', ')} }` : 'null'
    for (const event of events) {
      if (isBlock) continue
      const handler = hasMustache(event.handler) ? valueExpression(event.handler) : JSON.stringify((event.handler || '').trim())
      const catches = event.kind === 'catch' || event.kind === 'capture-catch'
      const flags = (catches ? 1 : 0) | (event.kind === 'mut-bind' ? 4 : 0)
      const domName = isComponent ? event.type : (DOM_EVENT_NAMES[event.type] || event.type)
      const modifiers = event.kind.startsWith('capture') ? '.capture' : ''
      const call = `$wx.e($event, ${handler}, ${flags}, ${datasetExpr}, ${idExpr}, ${markExpr})`
      out.push(`@${domName}${modifiers}="${escapeAttr(call)}"`)
      // catchtouchmove blocks scrolling behind an overlay; the mouse wheel is its desktop twin.
      if (catches && event.type === 'touchmove' && !isComponent) out.push(`@wheel="${escapeAttr('$wx.block($event)')}"`)
    }

    const decode = inheritedDecode || (tag === 'text' && node.attrs.some(attr => attr.name === 'decode' && attr.value !== 'false' && attr.value !== '{{false}}'))
    const children = genChildren(node.children, decode)

    const conditional = wxIf !== null ? `v-if="${escapeAttr(wxIf)}"`
      : wxElif !== null ? `v-else-if="${escapeAttr(wxElif)}"`
        : wxElse ? 'v-else' : ''
    const keyExpr = (item: string, index: string) => {
      if (wxKey === null) return ''
      if (hasMustache(wxKey)) return `:key="${escapeAttr(valueExpression(wxKey))}"`
      return `:key="${escapeAttr(`$wx.k(${item}, ${JSON.stringify(wxKey.trim())}, ${index})`)}"`
    }
    const forAttr = wxFor !== null ? `v-for="${escapeAttr(`(${forItem}, ${forIndex}) in ${wxFor}`)}"` : ''

    const open = (attrs: string[]) => `<${outTag}${attrs.filter(Boolean).map(attr => ' ' + attr).join('')}>`
    const close = `</${outTag}>`

    if (isBlock) {
      // A bare <block> only groups its children.
      if (!wxFor && !conditional) return children
      if (wxFor && conditional) {
        return `<template ${forAttr} ${keyExpr(forItem, forIndex)}><template ${conditional}>${children}</template></template>`
      }
      return `<template ${[conditional, forAttr, keyExpr(forItem, forIndex)].filter(Boolean).join(' ')}>${children}</template>`
    }
    // WXML evaluates wx:for before wx:if on the same element; Vue does the opposite, so split them.
    if (wxFor && conditional) {
      return `<template ${forAttr} ${keyExpr(forItem, forIndex)}>${open([conditional, ...out])}${children}${close}</template>`
    }
    return `${open([conditional, forAttr, keyExpr(forItem, forIndex), ...out])}${children}${close}`
  }

  return { template: genChildren(nodes, false), warnings }
}

export interface CompiledWxml { code: string; warnings: string[] }

/** Compiles a page's WXML to an ES module exporting render(_ctx, _cache), wrapped in <wx-page>. */
export function compileWxml(source: string, file: string, route: string): CompiledWxml {
  const { template, warnings } = wxmlToVueTemplate(parseWxml(source, file), file)
  const wrapped = `<wx-page data-wx-page="${escapeAttr(route)}">${template}</wx-page>`
  const result = compileTemplate({
    source: wrapped,
    filename: file,
    id: `wx-${route}`,
    transformAssetUrls: false,
    compilerOptions: {
      whitespace: 'condense',
      comments: false,
      isCustomElement,
      hoistStatic: true,
      cacheHandlers: true
    }
  })
  if (result.errors.length) {
    const first = result.errors[0]
    const message = typeof first === 'string' ? first : first.message
    throw new Error(`${file}: ${message}\n--- generated template ---\n${wrapped}`)
  }
  return { code: result.code, warnings: warnings.concat(result.tips) }
}

