// Verify that the canonical WeChat application source matches the manifest used by the web compiler.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(project, '../resident-miniapp')
const manifest = JSON.parse(readFileSync(join(project, 'miniapp.manifest.json'), 'utf8'))

function listFiles(root) {
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
const textExtensions = new Set(['.js', '.json', '.md', '.wxml', '.wxss'])
const sha256 = path => {
  const content = readFileSync(path)
  const canonical = textExtensions.has(extname(path).toLowerCase())
    ? content.toString('utf8').replace(/\r\n?/g, '\n')
    : content
  return createHash('sha256').update(canonical).digest('hex')
}

const problems = []
const actual = listFiles(target)
for (const file of actual) {
  if (!(file in manifest.files)) problems.push(`added: ${file}`)
  else if (sha256(join(target, file)) !== manifest.files[file]) problems.push(`modified: ${file}`)
}
for (const file of Object.keys(manifest.files)) {
  if (!actual.includes(file)) problems.push(`missing: ${file}`)
}
if (problems.length) {
  console.error('The canonical WeChat application no longer matches its manifest:\n  ' + problems.join('\n  '))
  console.error('Run `npm run manifest` after reviewing an intentional WeChat application change.')
  process.exit(1)
}
console.log(`WeChat application verified: release ${manifest.release}, ${actual.length} files`)
