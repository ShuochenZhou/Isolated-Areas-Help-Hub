// WeChat application tag names and how the web version renders each one.

/** Plain containers: rendered as real custom elements (<wx-view>), styled by WXSS like in WeChat. */
export const NATIVE_TAGS: Record<string, string> = {
  view: 'wx-view',
  text: 'wx-text',
  label: 'wx-label',
  'cover-view': 'wx-cover-view',
  'cover-image': 'wx-cover-image',
  'match-media': 'wx-match-media',
  'page-container': 'wx-page-container',
  'root-portal': 'wx-root-portal'
}

/** Built-in components the web runtime implements as Vue components (src/runtime/components). */
export const COMPONENT_TAGS = new Set([
  'button', 'input', 'textarea', 'picker', 'scroll-view', 'map', 'image', 'icon', 'navigator'
])

/** Built-in components this runtime does not implement yet: compiled as inert elements, with a build warning. */
export const KNOWN_UNIMPLEMENTED = new Set([
  'switch', 'slider', 'checkbox', 'checkbox-group', 'radio', 'radio-group', 'form', 'progress',
  'swiper', 'swiper-item', 'picker-view', 'picker-view-column', 'rich-text', 'video', 'canvas',
  'web-view', 'editor', 'movable-area', 'movable-view', 'page-meta', 'navigation-bar', 'camera',
  'live-player', 'live-pusher', 'audio', 'official-account', 'open-data', 'ad', 'functional-page-navigator'
])

/** WXML features that need a template engine of their own; a page using them fails the build loudly. */
export const UNSUPPORTED_TAGS = new Set(['template', 'import', 'include', 'wxs', 'slot'])

/** Every tag name a WXSS type selector may use, rewritten to its wx-* element name. */
export const WXSS_TYPE_TAGS = new Set([
  ...Object.keys(NATIVE_TAGS), ...COMPONENT_TAGS, ...KNOWN_UNIMPLEMENTED, 'block'
])

export function webTag(tag: string): string {
  if (NATIVE_TAGS[tag]) return NATIVE_TAGS[tag]
  return `wx-${tag}`
}

/** Elements Vue must create as DOM nodes rather than resolve as components. */
export function isCustomElement(tag: string): boolean {
  if (!tag.startsWith('wx-')) return false
  return !COMPONENT_TAGS.has(tag.slice(3))
}
