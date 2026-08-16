import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { loadRepos } from './config.js'
import { parseFrontmatter, serializeFrontmatter } from './frontmatter.js'
import { validate } from './validate.js'
import {
  listExperimentDirs, listRunDirs, listVerdictFiles,
  resolveExperiment, utcStamp, compactStamp,
} from './tree.js'

const binPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'aladdin.js')

const sessionId = () => process.env.CLAUDE_SESSION_ID ?? 'unknown-session'

function projects() {
  return loadRepos().map((repo) => ({
    name: path.basename(repo),
    repo,
    experimentsDir: path.join(repo, 'experiments'),
  }))
}

function resolveProject(ref) {
  const all = projects().filter((p) => existsSync(p.experimentsDir))
  if (!ref) {
    if (all.length === 1) return all[0]
    throw new Error(`project is required; registered: ${all.map((p) => p.name).join(', ')}`)
  }
  const match = all.filter((p) => p.name === ref || p.repo === path.resolve(ref))
  if (match.length !== 1) throw new Error(`unknown project "${ref}"; registered: ${all.map((p) => p.name).join(', ')}`)
  return match[0]
}

function readMd(file) {
  return parseFrontmatter(readFileSync(file, 'utf8'), file)
}

function experimentSummary(dir) {
  const { data } = readMd(path.join(dir, 'experiment.md'))
  const verdicts = listVerdictFiles(dir).map((f) => readMd(f).data)
  return {
    id: data.id,
    name: path.basename(dir),
    question: data.question,
    status: data.status,
    priority: data.priority,
    conclusion: data.conclusion,
    confidence: data.confidence,
    scenes: data.scenes ?? [],
    runs: listRunDirs(dir).length,
    verdicts: verdicts.length,
    unreviewed: verdicts.filter((v) => v.status === 'unreviewed').length,
  }
}

function ok(result) {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}

function assertValid(kind, data, label) {
  const errors = validate(kind, data)
  if (errors.length) throw new Error(`${label} failed validation: ${errors.join('; ')}`)
}

export async function runMcp() {
  const server = new McpServer({ name: 'aladdin', version: '0.1.0' })

  server.registerTool('query_experiments', {
    description:
      'Search the experiment log across all registered projects. Use this BEFORE starting experimental work to learn what has already been tried, what worked, what was refuted, and which conclusions were superseded. Matches against questions, conclusions, experiment context, and verdict text.',
    inputSchema: {
      query: z.string().optional().describe('free-text search; omit to list everything'),
      project: z.string().optional().describe('limit to one project (name from the registry)'),
      status: z.enum(['proposed', 'open', 'concluded', 'abandoned']).optional(),
    },
  }, async ({ query, project, status }) => {
    const q = query?.toLowerCase()
    const results = []
    for (const p of projects()) {
      if (project && p.name !== project) continue
      if (!existsSync(p.experimentsDir)) continue
      for (const dir of listExperimentDirs(p.experimentsDir)) {
        const summary = experimentSummary(dir)
        if (status && summary.status !== status) continue
        if (q) {
          const { body } = readMd(path.join(dir, 'experiment.md'))
          const verdictText = listVerdictFiles(dir).map((f) => readMd(f).body).join(' ')
          const haystack = [summary.name, summary.question, summary.conclusion, body, verdictText]
            .join(' ').toLowerCase()
          if (!haystack.includes(q)) continue
        }
        results.push({ project: p.name, ...summary })
      }
    }
    return ok({ count: results.length, results })
  })

  server.registerTool('get_experiment', {
    description:
      'Full detail of one experiment: the question and conclusion, every run (config, host, metrics, evidence paths), and every verdict including superseded ones — the complete evidence trail.',
    inputSchema: {
      project: z.string().optional(),
      experiment: z.string().describe('experiment id or name prefix, e.g. exp-0007'),
    },
  }, async ({ project, experiment }) => {
    const p = resolveProject(project)
    const dir = resolveExperiment(p.experimentsDir, experiment)
    const exp = readMd(path.join(dir, 'experiment.md'))
    const runs = listRunDirs(dir).map((rd) => ({
      id: path.basename(rd),
      run: JSON.parse(readFileSync(path.join(rd, 'run.json'), 'utf8')),
      status: existsSync(path.join(rd, 'status.json'))
        ? JSON.parse(readFileSync(path.join(rd, 'status.json'), 'utf8')) : null,
      metrics: existsSync(path.join(rd, 'metrics.json'))
        ? JSON.parse(readFileSync(path.join(rd, 'metrics.json'), 'utf8')) : null,
    }))
    const verdicts = listVerdictFiles(dir).map((f) => {
      const { data, body } = readMd(f)
      return { ...data, body }
    })
    return ok({ project: p.name, dir, experiment: { ...exp.data, context: exp.body }, runs, verdicts })
  })

  server.registerTool('create_experiment', {
    description:
      'Create a new experiment. status "proposed" queues a test idea for later; status "open" starts work now. Always check query_experiments first so you do not duplicate an answered question.',
    inputSchema: {
      project: z.string().optional(),
      slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).describe('short kebab-case name'),
      question: z.string().min(1).describe('the question this experiment answers'),
      status: z.enum(['proposed', 'open']).default('open'),
      priority: z.enum(['high', 'medium', 'low']).optional().describe('for proposed experiments'),
      context: z.string().optional().describe('why this question, what prompted it'),
    },
  }, async ({ project, slug, question, status, priority, context }) => {
    const p = resolveProject(project)
    const next = listExperimentDirs(p.experimentsDir).reduce((max, d) => {
      const n = parseInt(path.basename(d).slice(4, 8), 10)
      return n > max ? n : max
    }, 0) + 1
    const id = `exp-${String(next).padStart(4, '0')}`
    const data = { id, question, status, priority, scenes: [], holdout: [], spawned_by: sessionId() }
    assertValid('experiment', data, 'experiment')
    const dir = path.join(p.experimentsDir, `${id}-${slug}`)
    mkdirSync(path.join(dir, 'runs'), { recursive: true })
    mkdirSync(path.join(dir, 'verdicts'), { recursive: true })
    writeFileSync(path.join(dir, 'experiment.md'),
      serializeFrontmatter(data, `## Context\n\n${context ?? '(none)'}\n\n## Conclusion\n\n(none yet)\n`))
    return ok({ id, dir })
  })

  server.registerTool('record_run', {
    description:
      'Record a run BEFORE launching it: what will execute, on which host, on which scene. Returns the run directory — put reviewable material (renders, crops, comparisons) into its evidence/ subdirectory, metrics into metrics.json. Run records are immutable once written; only status changes afterwards, via mark_run.',
    inputSchema: {
      project: z.string().optional(),
      experiment: z.string(),
      scene: z.string().min(1).describe('the scene/dataset this run trains or evaluates on'),
      host: z.enum(['rig', 'runpod', 'local']),
      host_id: z.string().optional().describe('pod id, rig address, etc.'),
      command: z.string().min(1).describe('the exact command being run'),
      config: z.record(z.any()).optional().describe('key parameters as an object'),
      commit: z.string().optional().describe('code commit; auto-detected from git if omitted'),
      notes: z.string().optional(),
    },
  }, async ({ project, experiment, scene, host, host_id, command, config, commit, notes }) => {
    const p = resolveProject(project)
    const dir = resolveExperiment(p.experimentsDir, experiment)
    const expId = path.basename(dir).slice(0, 8)
    let dirty
    if (!commit) {
      try {
        commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: p.repo, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim()
        dirty = execFileSync('git', ['status', '--porcelain'], { cwd: p.repo, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim() !== ''
      } catch {
        commit = 'UNKNOWN'
      }
    }
    const next = listRunDirs(dir).reduce((max, d) => {
      const n = parseInt(path.basename(d).slice(4), 10)
      return n > max ? n : max
    }, 0) + 1
    const id = `run-${String(next).padStart(3, '0')}`
    const run = {
      id, experiment: expId, created: utcStamp(), commit,
      ...(dirty !== undefined && { dirty }),
      config: config ?? null, scene,
      host: { type: host, ...(host_id && { id: host_id }) },
      command, spawned_by: sessionId(), ...(notes && { notes }),
    }
    assertValid('run', run, 'run')
    const rd = path.join(dir, 'runs', id)
    mkdirSync(path.join(rd, 'evidence'), { recursive: true })
    writeFileSync(path.join(rd, 'run.json'), JSON.stringify(run, null, 2) + '\n')
    writeFileSync(path.join(rd, 'status.json'), JSON.stringify({ state: 'created' }, null, 2) + '\n')
    return ok({ id, dir: rd, evidence_dir: path.join(rd, 'evidence'), dirty: dirty ?? 'unknown' })
  })

  server.registerTool('mark_run', {
    description: 'Update a run\'s lifecycle state as it progresses. Keep this current — stale "running" states break the dashboard.',
    inputSchema: {
      project: z.string().optional(),
      experiment: z.string(),
      run: z.string().describe('run id, e.g. run-003'),
      state: z.enum(['queued', 'running', 'succeeded', 'failed', 'aborted']),
      exit_code: z.number().int().optional(),
    },
  }, async ({ project, experiment, run, state, exit_code }) => {
    const p = resolveProject(project)
    const dir = resolveExperiment(p.experimentsDir, experiment)
    const statusFile = path.join(dir, 'runs', run, 'status.json')
    if (!existsSync(path.join(dir, 'runs', run, 'run.json'))) throw new Error(`no such run: ${run}`)
    const status = existsSync(statusFile) ? JSON.parse(readFileSync(statusFile, 'utf8')) : { state: 'created' }
    status.state = state
    if (state === 'running' && !status.started) status.started = utcStamp()
    if (['succeeded', 'failed', 'aborted'].includes(state)) {
      status.finished = utcStamp()
      if (exit_code !== undefined) status.exit_code = exit_code
    }
    assertValid('runstatus', status, 'status')
    writeFileSync(statusFile, JSON.stringify(status, null, 2) + '\n')
    return ok(status)
  })

  server.registerTool('submit_verdict', {
    description:
      'Record a judgment on one or more runs. Evidence is MANDATORY: the listed paths (relative to the experiment directory, e.g. runs/run-003/evidence/comparison.png) must already exist — write renders/crops/tables there first. Verdicts are born unreviewed; a human confirms or rejects them. Never rewrite a verdict: to change a judgment, submit a new one with supersedes set.',
    inputSchema: {
      project: z.string().optional(),
      experiment: z.string(),
      method: z.string().min(1).describe('scoring method, e.g. psnr-masked.v2, or "manual"'),
      runs: z.array(z.string().regex(/^run-\d{3,}$/)).min(1),
      scenes: z.array(z.string()).describe('scenes this judgment rests on — be honest about n'),
      evidence: z.array(z.string()).min(1).describe('paths relative to the experiment dir; must exist'),
      judgment: z.string().min(1).describe('what these runs show and why'),
      caveats: z.string().optional().describe('what this verdict does NOT establish'),
      supersedes: z.string().optional().describe('id of the verdict this replaces'),
    },
  }, async ({ project, experiment, method, runs, scenes, evidence, judgment, caveats, supersedes }) => {
    const p = resolveProject(project)
    const dir = resolveExperiment(p.experimentsDir, experiment)
    const runIds = new Set(listRunDirs(dir).map((d) => path.basename(d)))
    for (const r of runs) if (!runIds.has(r)) throw new Error(`run ${r} does not exist in ${path.basename(dir)}`)
    for (const e of evidence) {
      if (!existsSync(path.join(dir, e))) {
        throw new Error(`evidence "${e}" does not exist — write reviewable material into the run's evidence/ dir first`)
      }
    }
    const now = new Date()
    const id = `v-${compactStamp(now)}`
    const data = {
      id, date: utcStamp(now), scorer: 'agent', scored_by: sessionId(),
      method, runs, scenes, evidence, status: 'unreviewed',
      ...(supersedes && { supersedes }),
    }
    assertValid('verdict', data, 'verdict')
    if (supersedes) {
      const old = listVerdictFiles(dir).find((f) => path.basename(f) === `${supersedes}.md`)
      if (!old) throw new Error(`supersedes target ${supersedes} not found`)
      const { data: od, body: ob } = readMd(old)
      if (od.status !== 'superseded') {
        od.status = 'superseded'
        writeFileSync(old, serializeFrontmatter(od, ob))
      }
    }
    const body = `## Judgment\n\n${judgment}\n\n## Caveats\n\n${caveats ?? '(none stated)'}\n`
    const file = path.join(dir, 'verdicts', `${id}.md`)
    writeFileSync(file, serializeFrontmatter(data, body))
    return ok({ id, file })
  })

  server.registerTool('conclude_experiment', {
    description:
      'Update an experiment\'s status and current conclusion (the summary future sessions read first). Use after verdicts justify it. Requires conclusion and scenes when status is concluded.',
    inputSchema: {
      project: z.string().optional(),
      experiment: z.string(),
      status: z.enum(['proposed', 'open', 'concluded', 'abandoned']),
      conclusion: z.string().optional(),
      confidence: z.enum(['low', 'medium', 'high']).optional(),
      scenes: z.array(z.string()).optional().describe('scenes the conclusion rests on'),
    },
  }, async ({ project, experiment, status, conclusion, confidence, scenes }) => {
    const p = resolveProject(project)
    const dir = resolveExperiment(p.experimentsDir, experiment)
    const file = path.join(dir, 'experiment.md')
    const { data, body } = readMd(file)
    data.status = status
    if (conclusion !== undefined) data.conclusion = conclusion
    if (confidence !== undefined) data.confidence = confidence
    if (scenes !== undefined) data.scenes = scenes
    assertValid('experiment', data, 'experiment')
    writeFileSync(file, serializeFrontmatter(data, body))
    return ok({ id: data.id, status: data.status })
  })

  server.registerTool('check_tree', {
    description: 'Validate a project\'s whole experiment tree (schemas, evidence links, supersede chains). Run before ending a session; fix any errors it reports.',
    inputSchema: { project: z.string().optional() },
  }, async ({ project }) => {
    const p = resolveProject(project)
    try {
      const out = execFileSync(process.execPath, [binPath, 'check', p.repo], { encoding: 'utf8' })
      return ok({ ok: true, report: out.trim() })
    } catch (e) {
      return ok({ ok: false, report: (e.stdout ?? '') + (e.stderr ?? '') })
    }
  })

  await server.connect(new StdioServerTransport())
}
