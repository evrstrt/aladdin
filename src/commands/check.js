import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { findExperimentsDir, listExperimentDirs, listRunDirs, listVerdictFiles } from '../tree.js'
import { parseFrontmatter } from '../frontmatter.js'
import { validate } from '../validate.js'

export function check(args) {
  const experimentsDir = findExperimentsDir(args[0])
  const errors = []
  const warnings = []
  const rel = (p) => path.relative(experimentsDir, p)

  const methods = new Set()
  const scoringDir = path.join(experimentsDir, 'scoring')
  if (existsSync(scoringDir)) {
    for (const f of readdirSync(scoringDir).filter((f) => f.endsWith('.md'))) {
      const file = path.join(scoringDir, f)
      try {
        const { data } = parseFrontmatter(readFileSync(file, 'utf8'), rel(file))
        for (const e of validate('scoring', data)) errors.push(`${rel(file)}: ${e}`)
        methods.add(`${data.method}.v${data.version}`)
        if (f !== `${data.method}.v${data.version}.md`) {
          errors.push(`${rel(file)}: filename does not match method/version (expected ${data.method}.v${data.version}.md)`)
        }
      } catch (e) {
        errors.push(e.message)
      }
    }
  }

  let expCount = 0
  let runCount = 0
  let verdictCount = 0

  for (const expDir of listExperimentDirs(experimentsDir)) {
    expCount++
    const expName = path.basename(expDir)
    const expId = expName.slice(0, 8)
    const expFile = path.join(expDir, 'experiment.md')
    let exp = null
    if (!existsSync(expFile)) {
      errors.push(`${expName}: missing experiment.md`)
    } else {
      try {
        const { data } = parseFrontmatter(readFileSync(expFile, 'utf8'), rel(expFile))
        exp = data
        for (const e of validate('experiment', data)) errors.push(`${rel(expFile)}: ${e}`)
        if (data.id && data.id !== expId) {
          errors.push(`${rel(expFile)}: id ${data.id} does not match directory ${expName}`)
        }
      } catch (e) {
        errors.push(e.message)
      }
    }

    const runIds = new Set()
    for (const runDir of listRunDirs(expDir)) {
      runCount++
      const runId = path.basename(runDir)
      runIds.add(runId)
      const runFile = path.join(runDir, 'run.json')
      if (!existsSync(runFile)) {
        errors.push(`${rel(runDir)}: missing run.json`)
        continue
      }
      try {
        const run = JSON.parse(readFileSync(runFile, 'utf8'))
        for (const e of validate('run', run)) errors.push(`${rel(runFile)}: ${e}`)
        if (run.id && run.id !== runId) {
          errors.push(`${rel(runFile)}: id ${run.id} does not match directory ${runId}`)
        }
        if (run.experiment && run.experiment !== expId) {
          errors.push(`${rel(runFile)}: experiment ${run.experiment} does not match ${expId}`)
        }
        if (run.scene === 'FILL_ME' || run.command === 'FILL_ME') {
          errors.push(`${rel(runFile)}: template placeholders not filled in`)
        }
        if (run.dirty) {
          warnings.push(`${rel(runFile)}: recorded from a dirty working tree — not reproducible from commit`)
        }
      } catch (e) {
        errors.push(`${rel(runFile)}: ${e.message}`)
      }
      const metricsFile = path.join(runDir, 'metrics.json')
      if (existsSync(metricsFile)) {
        try {
          JSON.parse(readFileSync(metricsFile, 'utf8'))
        } catch (e) {
          errors.push(`${rel(metricsFile)}: invalid JSON: ${e.message}`)
        }
      }
    }

    const verdictIds = new Set()
    const verdicts = []
    for (const file of listVerdictFiles(expDir)) {
      verdictCount++
      try {
        const { data } = parseFrontmatter(readFileSync(file, 'utf8'), rel(file))
        verdicts.push({ file, data })
        verdictIds.add(data.id)
        for (const e of validate('verdict', data)) errors.push(`${rel(file)}: ${e}`)
        if (data.id && `${data.id}.md` !== path.basename(file)) {
          errors.push(`${rel(file)}: id ${data.id} does not match filename`)
        }
        for (const runId of data.runs ?? []) {
          if (!runIds.has(runId)) errors.push(`${rel(file)}: references ${runId} which does not exist`)
        }
        for (const ev of data.evidence ?? []) {
          if (!existsSync(path.join(expDir, ev))) {
            errors.push(`${rel(file)}: evidence path "${ev}" does not exist (relative to ${expName}/)`)
          }
        }
        if (data.method && data.method !== 'manual' && !methods.has(data.method)) {
          warnings.push(`${rel(file)}: method "${data.method}" has no definition in scoring/`)
        }
        if (data.method === 'FILL_ME') {
          errors.push(`${rel(file)}: template placeholders not filled in`)
        }
        if (['confirmed', 'rejected'].includes(data.status) && !data.reviewed_by) {
          errors.push(`${rel(file)}: status ${data.status} requires reviewed_by`)
        }
      } catch (e) {
        errors.push(e.message)
      }
    }
    for (const { file, data } of verdicts) {
      if (data.supersedes && !verdictIds.has(data.supersedes)) {
        errors.push(`${rel(file)}: supersedes ${data.supersedes} which does not exist`)
      }
    }
    const superseded = new Set(verdicts.map((v) => v.data.supersedes).filter(Boolean))
    for (const { file, data } of verdicts) {
      if (superseded.has(data.id) && data.status !== 'superseded') {
        errors.push(`${rel(file)}: superseded by a newer verdict but status is "${data.status}"`)
      }
    }

    if (exp?.status === 'concluded') {
      if ((exp.scenes ?? []).length <= 1) {
        warnings.push(`${expName}: concluded on ${exp.scenes?.length ?? 0} scene(s) — n=1, low confidence`)
      }
      if (!verdicts.some((v) => v.data.status === 'confirmed')) {
        warnings.push(`${expName}: concluded without any human-confirmed verdict`)
      }
    }
  }

  for (const w of warnings) console.log(`⚠ ${w}`)
  for (const e of errors) console.log(`✗ ${e}`)
  console.log(
    `${errors.length} error(s), ${warnings.length} warning(s) across ${expCount} experiment(s), ${runCount} run(s), ${verdictCount} verdict(s)`
  )
  if (errors.length > 0) process.exit(1)
}
