// Replace the canonical WeChat application source from a reviewed release and record a SHA-256 manifest.
//
//   node scripts/sync-miniapp.mjs [path/to/resident-miniapp]
import { createHash } from 'node:crypto'
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const project = resolve(here, '..')
const target = resolve(project, '../resident-miniapp')
const requestedSource = process.argv[2] || process.env.MINIAPP_SOURCE

if (!requestedSource) {
  console.error('Usage: npm run sync -- <path-to-reviewed-wechat-application>')
  process.exit(1)
}

const source = resolve(requestedSource)

if (!existsSync(join(source, 'app.json'))) {
  console.error(`No WeChat application at ${source} (app.json missing).`)
  process.exit(1)
}
if (source === target) {
  console.error('The source and canonical WeChat application directories must be different.')
  process.exit(1)
}

export function listFiles(root) {
  const files = []
  const walk = dir => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else files.push(relative(root, path).split(sep).join('/'))
    }
  }
  walk(root)
  return files
}

export function sha256(path) {
  const content = readFileSync(path)
  const canonical = new Set(['.js', '.json', '.md', '.wxml', '.wxss']).has(extname(path).toLowerCase())
    ? content.toString('utf8').replace(/\r\n?/g, '\n')
    : content
  return createHash('sha256').update(canonical).digest('hex')
}

rmSync(target, { recursive: true, force: true })
cpSync(source, target, {
  recursive: true,
  filter: path => basename(path) !== 'project.private.config.json'
})

const config = readFileSync(join(target, 'config.js'), 'utf8')
const release = (config.match(/releaseId:\s*'([^']+)'/) || [])[1] || 'unknown'
const files = Object.fromEntries(listFiles(target).map(file => [file, sha256(join(target, file))]))
writeFileSync(join(project, 'miniapp.manifest.json'), JSON.stringify({
  release,
  syncedAt: new Date().toISOString(),
  files
}, null, 2) + '\n')
console.log(`Synced WeChat application ${release}: ${Object.keys(files).length} files from ${source}`)
