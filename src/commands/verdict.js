import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { findExperimentsDir, resolveExperiment, listRunDirs, utcStamp, compactStamp } from '../tree.js'
import { serializeFrontmatter } from '../frontmatter.js'

export function newVerdict(args) {
  const ref = args[0]
  if (!ref) {
    console.error('usage: aladdin verdict <exp-id> [--runs run-001,run-002] [--method <method.vN>] [--supersedes <verdict-id>]')
    process.exit(1)
  }
  const opts = {}
  for (let i = 1; i < args.length; i += 2) {
    if (args[i].startsWith('--')) opts[args[i].slice(2)] = args[i + 1]
  }
  const experimentsDir = findExperimentsDir('.')
  const expDir = resolveExperiment(experimentsDir, ref)
  const runDirs = listRunDirs(expDir)
  if (runDirs.length === 0) {
    console.error('no runs to judge — create one with "aladdin run" first')
    process.exit(1)
  }
  const runs = opts.runs ? opts.runs.split(',') : [path.basename(runDirs[runDirs.length - 1])]
  const now = new Date()
  const id = `v-${compactStamp(now)}`
  const data = {
    id,
    date: utcStamp(now),
    scorer: 'agent',
    scored_by: process.env.CLAUDE_SESSION_ID ?? 'FILL_ME',
    method: opts.method ?? 'FILL_ME',
    runs,
    scenes: [],
    evidence: [],
    status: 'unreviewed',
    supersedes: opts.supersedes,
  }
  const body =
    '## Judgment\n\nWhat these runs show, and why. Reference the evidence explicitly.\n\n' +
    '## Caveats\n\nWhat this verdict does NOT establish (scenes not covered, metric blind spots).\n'
  const verdictsDir = path.join(expDir, 'verdicts')
  if (!existsSync(verdictsDir)) mkdirSync(verdictsDir)
  const file = path.join(verdictsDir, `${id}.md`)
  writeFileSync(file, serializeFrontmatter(data, body))
  console.log(`created ${path.relative(process.cwd(), file)}`)
  console.log('fill in method, scenes, evidence paths, and the judgment — check enforces all of them')
}
