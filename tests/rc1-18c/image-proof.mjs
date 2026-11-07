import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { acceptance } from './paths.mjs'

const { project, root } = acceptance
const manifest = JSON.parse(readFileSync(`${root}/source.json`, 'utf8'))
const expected = manifest.files.filter(
  ({ path }) =>
    /^(src|docker|theme-packages)\//.test(path) ||
    ['package.json', 'package-lock.json', 'next.config.ts'].includes(path),
)
const script =
  "const fs=require('fs'),c=require('crypto');const a=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(a.map(x=>({path:x.path,sha256:c.createHash('sha256').update(fs.readFileSync(x.path)).digest('hex')}))))"
const actual = JSON.parse(
  execFileSync('docker', ['exec', '-i', `${project}-renegade-web-1`, 'node', '-e', script], {
    encoding: 'utf8',
    input: JSON.stringify(expected),
  }),
)
assert.deepEqual(actual, expected)
const info = JSON.parse(
  execFileSync('docker', ['inspect', `${project}-renegade-web-1`], { encoding: 'utf8' }),
)[0]
const proof = {
  image: info.Image,
  configuredImage: info.Config.Image,
  user: info.Config.User,
  production: info.Config.Env.includes('NODE_ENV=production'),
  testAuthDisabled: info.Config.Env.includes('LOCAL_E2E_TEST_MODE=false'),
  executableTreeSha256: manifest.executableTreeSha256,
  byteIdenticalShippedFiles: actual.length,
  files: actual,
}
assert.equal(proof.user, 'nextjs')
assert.equal(proof.production, true)
assert.equal(proof.testAuthDisabled, true)
writeFileSync(`${root}/image-source-containment.json`, JSON.stringify(proof, null, 2))
console.log(JSON.stringify({ ...proof, files: undefined }))
