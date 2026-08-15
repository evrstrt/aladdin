import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { findExperimentsDir, resolveExperiment, utcStamp } from '../tree.js'

const STATES = ['queued', 'running', 'succeeded', 'failed', 'aborted']
const TERMINAL = ['succeeded', 'failed', 'aborted']

export function mark(args) {
  const [ref, runId, state] = args
  if (!ref || !runId || !STATES.includes(state)) {
    console.error(`usage: aladdin mark <exp-id> <run-id> <${STATES.join('|')}> [--exit <code>]`)
    process.exit(1)
  }
  const exitIdx = args.indexOf('--exit')
  const experimentsDir = findExperimentsDir('.')
  const expDir = resolveExperiment(experimentsDir, ref)
  const runDir = path.join(expDir, 'runs', runId)
  if (!existsSync(path.join(runDir, 'run.json'))) {
    console.error(`no such run: ${runId} in ${path.basename(expDir)}`)
    process.exit(1)
  }
  const statusFile = path.join(runDir, 'status.json')
  const status = existsSync(statusFile) ? JSON.parse(readFileSync(statusFile, 'utf8')) : { state: 'created' }
  status.state = state
  if (state === 'running' && !status.started) status.started = utcStamp()
  if (TERMINAL.includes(state)) {
    status.finished = utcStamp()
    if (exitIdx !== -1) status.exit_code = parseInt(args[exitIdx + 1], 10)
  }
  writeFileSync(statusFile, JSON.stringify(status, null, 2) + '\n')
  console.log(`${path.basename(expDir)}/${runId} → ${state}`)
}
