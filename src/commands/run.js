import { mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { findExperimentsDir, resolveExperiment, listRunDirs, utcStamp } from '../tree.js'

function gitInfo(cwd) {
  try {
    const commit = execSync('git rev-parse HEAD', { cwd, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim()
    const dirty = execSync('git status --porcelain', { cwd, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim() !== ''
    return { commit, dirty }
  } catch {
    return { commit: 'UNKNOWN', dirty: false }
  }
}

export function newRun(args) {
  const ref = args[0]
  if (!ref) {
    console.error('usage: aladdin run <exp-id> [--scene <scene>] [--host rig|runpod|local] [--command "<cmd>"]')
    process.exit(1)
  }
  const opts = {}
  for (let i = 1; i < args.length; i += 2) {
    if (args[i].startsWith('--')) opts[args[i].slice(2)] = args[i + 1]
  }
  const experimentsDir = findExperimentsDir('.')
  const expDir = resolveExperiment(experimentsDir, ref)
  const expId = path.basename(expDir).slice(0, 8)
  const next = listRunDirs(expDir).reduce((max, d) => {
    const n = parseInt(path.basename(d).slice(4), 10)
    return n > max ? n : max
  }, 0) + 1
  const id = `run-${String(next).padStart(3, '0')}`
  const dir = path.join(expDir, 'runs', id)
  mkdirSync(path.join(dir, 'evidence'), { recursive: true })
  const { commit, dirty } = gitInfo(path.dirname(experimentsDir))
  const run = {
    id,
    experiment: expId,
    created: utcStamp(),
    commit,
    dirty,
    config: null,
    scene: opts.scene ?? 'FILL_ME',
    host: { type: opts.host ?? 'local' },
    command: opts.command ?? 'FILL_ME',
    spawned_by: process.env.CLAUDE_SESSION_ID ?? undefined,
  }
  writeFileSync(path.join(dir, 'run.json'), JSON.stringify(run, null, 2) + '\n')
  writeFileSync(path.join(dir, 'status.json'), JSON.stringify({ state: 'created' }, null, 2) + '\n')
  console.log(`created ${path.relative(process.cwd(), dir)}`)
  if (run.scene === 'FILL_ME' || run.command === 'FILL_ME') {
    console.log('fill in scene/command in run.json before the run starts — check will fail otherwise')
  }
  if (dirty) {
    console.log('warning: working tree is dirty — this run is not reproducible from the recorded commit')
  }
}
