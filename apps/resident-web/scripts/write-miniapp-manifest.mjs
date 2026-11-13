// Regenerate the integrity manifest after a reviewed change to the canonical WeChat application.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(project, '../resident-miniapp')

function listFiles(root) {
  const files = []
  const walk = directory => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name)
      if (statSync(path).isDirectory()) walk(path)
      else files.push(relative(root, path).split(sep).join('/'))
    }
  }
  walk(root)
  return files
}

const textExtensions = new Set(['.js', '.json', '.md', '.wxml', '.wxss'])
const sha256 = path => {
  const content = readFileSync(path)
  const canonical = textExtensions.has(extname(path).toLowerCase())
    ? content.toString('utf8').replace(/\r\n?/g, '\n')
    : content
  return createHash('sha256').update(canonical).digest('hex')
}
const config = readFileSync(join(source, 'config.js'), 'utf8')
const release = (config.match(/releaseId:\s*'([^']+)'/) || [])[1] || 'unknown'
const files = Object.fromEntries(listFiles(source).map(file => [file, sha256(join(source, file))]))

writeFileSync(join(project, 'miniapp.manifest.json'), `${JSON.stringify({ release, files }, null, 2)}\n`)
console.log(`Wrote manifest for WeChat application ${release}: ${Object.keys(files).length} files`)
