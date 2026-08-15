import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { findExperimentsDir, listExperimentDirs, listRunDirs, listVerdictFiles } from '../tree.js'
import { parseFrontmatter } from '../frontmatter.js'

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2, undefined: 3 }

function elapsed(from, to = new Date()) {
  const mins = Math.max(0, Math.round((to - new Date(from)) / 60000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  return h < 48 ? `${h}h${String(mins % 60).padStart(2, '0')}m` : `${Math.floor(h / 24)}d`
}

export function status(args) {
  const experimentsDir = findExperimentsDir(args[0])
  const proposed = []
  const open = []
  const concluded = []
  const active = []
  const finished = []
  const unreviewed = []

  for (const expDir of listExperimentDirs(experimentsDir)) {
    const name = path.basename(expDir)
    const expFile = path.join(expDir, 'experiment.md')
    if (!existsSync(expFile)) continue
    let exp
    try {
      ;({ data: exp } = parseFrontmatter(readFileSync(expFile, 'utf8'), expFile))
    } catch {
      continue
    }
    if (exp.status === 'proposed') proposed.push({ name, exp })
    if (exp.status === 'open') open.push({ name, exp })
    if (exp.status === 'concluded') concluded.push({ name, exp })

    for (const runDir of listRunDirs(expDir)) {
      const statusFile = path.join(runDir, 'status.json')
      if (!existsSync(statusFile)) continue
      let s, run
      try {
        s = JSON.parse(readFileSync(statusFile, 'utf8'))
        run = JSON.parse(readFileSync(path.join(runDir, 'run.json'), 'utf8'))
      } catch {
        continue
      }
      const row = { name, run, s }
      if (['queued', 'running'].includes(s.state)) active.push(row)
      else if (s.finished) finished.push(row)
    }

    for (const file of listVerdictFiles(expDir)) {
      try {
        const { data } = parseFrontmatter(readFileSync(file, 'utf8'), file)
        if (data.status === 'unreviewed') unreviewed.push({ name, data })
      } catch {
        continue
      }
    }
  }

  proposed.sort((a, b) => PRIORITY_ORDER[a.exp.priority] - PRIORITY_ORDER[b.exp.priority])
  finished.sort((a, b) => (a.s.finished < b.s.finished ? 1 : -1))

  const out = []
  out.push(`PROPOSED (${proposed.length})`)
  for (const { name, exp } of proposed) {
    out.push(`  ${name}  [${exp.priority ?? '-'}]  ${exp.question}`)
  }
  out.push('', `ACTIVE RUNS (${active.length})`)
  for (const { name, run, s } of active) {
    const dur = s.started ? elapsed(s.started) : s.state
    out.push(`  ${name}/${run.id}  ${run.scene}  ${run.host.type}  ${s.state}  ${dur}`)
  }
  out.push('', `RECENTLY FINISHED (${Math.min(finished.length, 5)} of ${finished.length})`)
  for (const { name, run, s } of finished.slice(0, 5)) {
    const code = s.exit_code !== undefined ? ` exit=${s.exit_code}` : ''
    out.push(`  ${name}/${run.id}  ${run.scene}  ${s.state}${code}  ${elapsed(s.finished)} ago`)
  }
  out.push('', `AWAITING YOUR REVIEW (${unreviewed.length})`)
  for (const { name, data } of unreviewed) {
    out.push(`  ${name}/verdicts/${data.id}.md  ${data.method}  on ${data.runs.join(', ')}`)
  }
  out.push('', `open: ${open.length}  concluded: ${concluded.length}`)
  console.log(out.join('\n'))
}
