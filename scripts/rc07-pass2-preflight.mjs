import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim()
const inspect = (name) => JSON.parse(run('docker', ['inspect', name]))[0]
const names = ['renegadeparty', 'myhigherpower']
const instances = names.map((name) => {
  const web = inspect(`${name}-renegade-web-1`)
  const worker = inspect(`${name}-renegade-worker-1`)
  const postgres = inspect(`${name}-postgres-1`)
  const env = Object.fromEntries(
    web.Config.Env.map((entry) => {
      const split = entry.indexOf('=')
      return [entry.slice(0, split), entry.slice(split + 1)]
    }),
  )
  return {
    name,
    image: web.Image,
    buildSha: env.BUILD_SHA,
    appVersion: env.APP_VERSION,
    origin: env.APP_URL,
    project: web.Config.Labels['com.docker.compose.project'],
    health: {
      web: web.State.Health?.Status,
      worker: worker.State.Health?.Status,
      postgres: postgres.State.Health?.Status,
    },
    mounts: [web, worker, postgres].map((container) => ({
      container: container.Name,
      mounts: container.Mounts.map(({ Name, Destination }) => ({
        name: Name,
        destination: Destination,
      })),
      networks: Object.keys(container.NetworkSettings.Networks),
    })),
    readiness: JSON.parse(
      run('docker', [
        'exec',
        `${name}-renegade-web-1`,
        'node',
        '-e',
        "fetch('http://127.0.0.1:3000/health/ready').then(async r=>console.log(JSON.stringify({status:r.status,body:await r.json()})))",
      ]),
    ),
  }
})
const envFor = (name) =>
  Object.fromEntries(
    inspect(`${name}-renegade-web-1`).Config.Env.map((entry) => {
      const split = entry.indexOf('=')
      return [entry.slice(0, split), entry.slice(split + 1)]
    }),
  )
const [a, b] = names.map(envFor)
const secretComparison = Object.fromEntries(
  ['PAYLOAD_SECRET', 'DATABASE_URL'].map((key) => [
    key,
    { bothPresent: Boolean(a[key] && b[key]), distinct: a[key] !== b[key] },
  ]),
)
const evidence = {
  inspectedHead: run('git', ['rev-parse', 'HEAD']),
  workingTreeClean: !run('git', ['status', '--porcelain']),
  instances,
  secretComparison,
  verdict: 'BLOCKED',
  firstFailure:
    'Both deployed images report BUILD_SHA=unknown; exact candidate provenance cannot be established.',
  customerUpgradeStatus: 'CUSTOMER-UPGRADE-PROOF: UNAVAILABLE FOR rc.1',
}
writeFileSync(
  'docs/rc/evidence/rc-07-pass2/preflight.json',
  JSON.stringify(evidence, null, 2) + '\n',
)
console.log(JSON.stringify({ verdict: evidence.verdict, firstFailure: evidence.firstFailure }))
