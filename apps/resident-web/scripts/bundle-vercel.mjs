// Builds the Vercel deployment in .vercel-out/: the pages, built to call the API through the
// resident-web gateway on WeChat CloudRun, plus deploy/vercel/vercel.json for the headers.
//
//   browser ──pages──▶ Vercel (this bundle)
//      └──/api──▶ resident-web (CloudRun, nginx: drops X-WX-*, allows only this site's origin)
//                    └──internal network──▶ springboot-t98g (public access closed)
//
// Why the pages are not served by resident-web itself: CloudRun's default domain shows browsers
// a "test domain" warning page when they open it, which only an ICP-filed custom domain
// removes; API calls (fetch, not page visits) are not affected. Why the API is not relayed by
// a Vercel function: the CloudRun gateway stops accepting connections from a cloud data
// centre's address after a burst of them.
//
//   node scripts/bundle-vercel.mjs && npx vercel deploy .vercel-out --prod
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const API = (process.env.API_ORIGIN || 'https://resident-web-319184-5-1495414290.sh.run.tcloudbase.com').replace(/\/+$/, '')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, '.vercel-out')

const config = readFileSync(join(root, 'deploy', 'vercel', 'vercel.json'), 'utf8')
if (!config.includes(`connect-src 'self' ${API}`)) throw new Error(`deploy/vercel/vercel.json: the CSP connect-src must allow ${API}`)

execSync('npm run build', { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_API_ORIGIN: API } })

// Keep the Vercel project link (.vercel/) between deployments; replace everything else.
mkdirSync(out, { recursive: true })
for (const entry of readdirSync(out)) if (entry !== '.vercel') rmSync(join(out, entry), { recursive: true, force: true })
cpSync(join(root, 'dist'), out, { recursive: true })
cpSync(join(root, 'deploy', 'vercel'), out, { recursive: true })
console.log(`Vercel bundle ready in ${out} (API: ${API})`)
