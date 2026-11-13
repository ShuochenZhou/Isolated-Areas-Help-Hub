// Vite plugin that turns the canonical WeChat application into web modules:
//   *.js    -> the original CommonJS code wrapped in a module factory (run by src/runtime/modules.ts)
//   *.wxml  -> a Vue render function (src/compiler/wxml.ts)
//   *.wxss  -> one stylesheet, app.wxss global and every page scoped (src/compiler/wxss.ts)
//   virtual:miniapp -> app.json, every page's json, module factories, render functions and images
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import MagicString from 'magic-string'
import { normalizePath, type Plugin, type ViteDevServer } from 'vite'
import { compileWxml } from './wxml'
import { transformWxss } from './wxss'

const VIRTUAL_ID = 'virtual:miniapp'
const RESOLVED_ID = '\0virtual:miniapp'
const META_ID = 'virtual:miniapp-meta'
const RESOLVED_META_ID = '\0virtual:miniapp-meta'
const STYLE_ID = 'virtual:miniapp-styles.css'
const RESOLVED_STYLE_ID = '\0virtual:miniapp-styles.css'

/** The names a WeChat application module sees as free variables; supplied by the runtime. */
export const MODULE_GLOBALS = ['module', 'exports', 'require', 'Page', 'App', 'getApp', 'wx', 'getCurrentPages', 'Component', 'Behavior', 'global'] as const

function listFiles(root: string, accept: (file: string) => boolean): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (accept(path)) files.push(path)
    }
  }
  walk(root)
  return files
}

function readJson(path: string): Record<string, unknown> {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
}

export function miniappPlugin(options: { root?: string } = {}): Plugin {
  let root = ''
  let rootPrefix = ''
  let server: ViteDevServer | undefined

  const relativePath = (file: string) => normalizePath(relative(root, file))
  const inMiniapp = (id: string) => normalizePath(id.split('?')[0]).startsWith(rootPrefix)

  function appJson() {
    return readJson(join(root, 'app.json')) as { pages: string[]; [key: string]: unknown }
  }

  /** The release the WeChat application reports (config.js releaseId), read as text, never executed. */
  function releaseOf(): string {
    const config = readFileSync(join(root, 'config.js'), 'utf8')
    return (config.match(/releaseId:\s*'([^']+)'/) || [])[1] || ''
  }

  function generateEntry(): string {
    const app = appJson()
    const lines: string[] = []
    const modules: string[] = []
    const renders: string[] = []
    const assets: string[] = []
    const pageConfigs: Record<string, unknown> = {}

    listFiles(root, file => file.endsWith('.js')).forEach((file, index) => {
      lines.push(`import m${index} from ${JSON.stringify(normalizePath(file))}`)
      modules.push(`${JSON.stringify(relativePath(file))}: m${index}`)
    })
    app.pages.forEach((route, index) => {
      const wxml = join(root, `${route}.wxml`)
      if (!existsSync(wxml)) throw new Error(`Page ${route} has no ${route}.wxml`)
      lines.push(`import { render as r${index} } from ${JSON.stringify(normalizePath(wxml))}`)
      renders.push(`${JSON.stringify(route)}: r${index}`)
      pageConfigs[route] = readJson(join(root, `${route}.json`))
    })
    listFiles(root, file => /\.(png|jpe?g|gif|svg|webp)$/i.test(file)).forEach((file, index) => {
      lines.push(`import a${index} from ${JSON.stringify(normalizePath(file) + '?url')}`)
      assets.push(`${JSON.stringify('/' + relativePath(file))}: a${index}`)
    })
    lines.push(`export const release = ${JSON.stringify(releaseOf())}`)
    lines.push(`export const appConfig = ${JSON.stringify(app)}`)
    lines.push(`export const pageConfigs = ${JSON.stringify(pageConfigs)}`)
    lines.push(`export const modules = { ${modules.join(', ')} }`)
    lines.push(`export const renders = { ${renders.join(', ')} }`)
    lines.push(`export const assets = { ${assets.join(', ')} }`)
    return lines.join('\n')
  }

  function generateStyles(): string {
    const parts: string[] = []
    const appWxss = join(root, 'app.wxss')
    if (existsSync(appWxss)) parts.push(`/* app.wxss */\n${transformWxss(readFileSync(appWxss, 'utf8'), { from: appWxss })}`)
    for (const route of appJson().pages) {
      const file = join(root, `${route}.wxss`)
      if (existsSync(file)) parts.push(`/* ${route}.wxss */\n${transformWxss(readFileSync(file, 'utf8'), { scope: route, from: file })}`)
    }
    return parts.join('\n')
  }

  return {
    name: 'miniapp',
    enforce: 'pre',
    configResolved(config) {
      root = resolve(config.root, options.root || 'miniapp')
      rootPrefix = normalizePath(root) + '/'
    },
    configureServer(devServer) { server = devServer },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
      if (id === STYLE_ID) return RESOLVED_STYLE_ID
      if (id === META_ID) return RESOLVED_META_ID
      return null
    },
    load(id) {
      if (id === RESOLVED_ID) {
        listFiles(root, file => /\.(json|wxss)$/.test(file)).forEach(file => this.addWatchFile(file))
        return generateEntry()
      }
      if (id === RESOLVED_META_ID) {
        this.addWatchFile(join(root, 'config.js'))
        return `export const release = ${JSON.stringify(releaseOf())}`
      }
      if (id === RESOLVED_STYLE_ID) {
        listFiles(root, file => file.endsWith('.wxss')).forEach(file => this.addWatchFile(file))
        return generateStyles()
      }
      return null
    },
    transform(code, id) {
      if (!inMiniapp(id)) return null
      const file = normalizePath(id.split('?')[0])
      if (file.endsWith('.js') && !id.includes('?url')) {
        // The WeChat application's CommonJS module, unchanged, inside a factory function.
        const source = new MagicString(code)
        source.prepend(`export default function (${MODULE_GLOBALS.join(', ')}) {\n`)
        source.append('\n}\n')
        return { code: source.toString(), map: source.generateMap({ hires: true, source: file, includeContent: true }) }
      }
      if (file.endsWith('.wxml')) {
        const route = relativePath(file).replace(/\.wxml$/, '')
        const compiled = compileWxml(code, relativePath(file), route)
        compiled.warnings.forEach(warning => this.warn(warning))
        return { code: compiled.code, map: null }
      }
      return null
    },
    handleHotUpdate(context) {
      const file = normalizePath(context.file)
      if (!file.startsWith(rootPrefix) || !server) return
      if (file.endsWith('.wxss')) {
        const styles = server.moduleGraph.getModuleById(RESOLVED_STYLE_ID)
        if (styles) return [styles]
      }
      if (file.endsWith('.json')) {
        server.ws.send({ type: 'full-reload' })
        return []
      }
      return undefined
    }
  }
}

export const miniappIds = { VIRTUAL_ID, META_ID, STYLE_ID }
