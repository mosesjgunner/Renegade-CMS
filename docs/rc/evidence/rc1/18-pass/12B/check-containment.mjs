import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
const out = 'docs/rc/evidence/rc1/18-pass/12B'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const journey = JSON.parse(await readFile(`${out}/journey-source-tree.json`, 'utf8'))
const restart = JSON.parse(await readFile(`${out}/source-tree.json`, 'utf8'))
const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(path => /^(src\/|tests\/|scripts\/|patches\/)/.test(path) || /^(package(-lock)?\.json|next\.config\.ts|tsconfig\.json|next-env\.d\.ts|AGENTS\.md|eslint\.config\.mjs|vitest\.config\.ts)$/.test(path)).sort()
const files = await Promise.all(paths.map(async path => ({ path, sha256: hash(await readFile(path)) })))
const diff = (a,b) => {
  const left = new Map(a.map(file => [file.path,file.sha256])), right = new Map(b.map(file => [file.path,file.sha256]))
  return [...new Set([...left.keys(),...right.keys()])].filter(path => left.get(path) !== right.get(path)).map(path => ({path,tested:left.get(path)??null,current:right.get(path)??null}))
}
const nextEnv = await readFile('next-env.d.ts','utf8')
const generated = difference => difference.path === 'next-env.d.ts' && ['.next-rc112a','.next-rc112b','.next-rc112c'].some(dir => hash(Buffer.from(nextEnv.replace(/\.next-rc112[a-c]/g, dir))) === difference.tested)
const unrelated = difference => difference.path.startsWith('tests/rc1-12c/') || difference.path.startsWith('tests/unit/rc1-12c-') || generated(difference)
const journeyDifferences = diff(journey.files,restart.files), currentDifferences = diff(restart.files,files)
const verifierPath = 'tests/rc1-12b/journey.ts'
const archivedMatches = hash(await readFile(`${out}/journey-verifier.ts.txt`)) === journey.files.find(file=>file.path===verifierPath).sha256
const stableRuntime = journeyDifferences.every(d => unrelated(d) || (d.path===verifierPath && archivedMatches))
const restartCurrent = currentDifferences.every(unrelated)
const result = {baseCommit:restart.baseCommit, journeyTestedTreeHash:journey.treeHash,restartTestedTreeHash:restart.treeHash,currentTreeHash:hash(JSON.stringify(files)),allRuntimeUnchangedAcrossProofs:stableRuntime,restartVerifierCurrent:restartCurrent,journeyVerifierArchivedMatches:archivedMatches,strictWholeTreeEqual:currentDifferences.length===0,journeyDifferences,currentDifferences,boundary:'43 journey assertions retain their exact archived verifier and manifest. Restart verifier selects the contract by ID and additionally observes fresh browser billing. Runtime is identical across both runs. Concurrent 12C verifier and generated Next type-pointer differences carry no acceptance.'}
await writeFile(`${out}/containment.json`,JSON.stringify(result,null,2))
if (!stableRuntime || !restartCurrent || !archivedMatches) throw new Error('Runtime or unaccounted verifier drift requires affected acceptance rerun.')
console.log('PASS: identical runtime across journey/restart; exact journey verifier archived; current restart verifier matches.')
