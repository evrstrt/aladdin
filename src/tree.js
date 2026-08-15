import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

export function findExperimentsDir(target) {
  const dir = path.resolve(target ?? '.')
  if (path.basename(dir) === 'experiments' && existsSync(dir)) return dir
  const nested = path.join(dir, 'experiments')
  if (existsSync(nested)) return nested
  throw new Error(`no experiments/ directory found at ${dir} — run "aladdin init" first`)
}

export function listExperimentDirs(experimentsDir) {
  return readdirSync(experimentsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^exp-\d{4}-/.test(e.name))
    .map((e) => path.join(experimentsDir, e.name))
    .sort()
}

export function listRunDirs(expDir) {
  const runsDir = path.join(expDir, 'runs')
  if (!existsSync(runsDir)) return []
  return readdirSync(runsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^run-\d{3,}$/.test(e.name))
    .map((e) => path.join(runsDir, e.name))
    .sort()
}

export function listVerdictFiles(expDir) {
  const verdictsDir = path.join(expDir, 'verdicts')
  if (!existsSync(verdictsDir)) return []
  return readdirSync(verdictsDir)
    .filter((f) => /^v-\d{8}T\d{6}Z\.md$/.test(f))
    .map((f) => path.join(verdictsDir, f))
    .sort()
}

export function resolveExperiment(experimentsDir, ref) {
  const dirs = listExperimentDirs(experimentsDir)
  const matches = dirs.filter((d) => path.basename(d).startsWith(ref))
  if (matches.length === 1) return matches[0]
  if (matches.length === 0) throw new Error(`no experiment matching "${ref}"`)
  throw new Error(`ambiguous experiment ref "${ref}": ${matches.map((d) => path.basename(d)).join(', ')}`)
}

export function utcStamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function compactStamp(date = new Date()) {
  return utcStamp(date).replace(/[-:]/g, '')
}
