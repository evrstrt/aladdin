import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { findExperimentsDir, listExperimentDirs } from '../tree.js'
import { serializeFrontmatter } from '../frontmatter.js'

function create(args, extra, usage) {
  const slug = args[0]
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    console.error(usage)
    process.exit(1)
  }
  const question = args.slice(1).join(' ')
  if (!question) {
    console.error('a question is required — what is this experiment trying to answer?')
    process.exit(1)
  }
  const experimentsDir = findExperimentsDir('.')
  const existing = listExperimentDirs(experimentsDir)
  const next = existing.reduce((max, d) => {
    const n = parseInt(path.basename(d).slice(4, 8), 10)
    return n > max ? n : max
  }, 0) + 1
  const id = `exp-${String(next).padStart(4, '0')}`
  const dir = path.join(experimentsDir, `${id}-${slug}`)
  mkdirSync(path.join(dir, 'runs'), { recursive: true })
  mkdirSync(path.join(dir, 'verdicts'), { recursive: true })
  const md = serializeFrontmatter(
    { id, question, ...extra, scenes: [], holdout: [] },
    '## Context\n\nWhy this question, what prompted it.\n\n## Conclusion\n\n(none yet)\n'
  )
  writeFileSync(path.join(dir, 'experiment.md'), md)
  console.log(`created ${path.relative(process.cwd(), dir)}`)
}

export function newExperiment(args) {
  create(args, { status: 'open' }, 'usage: aladdin new <slug> <question...>   (slug: lowercase, dashes)')
}

export function propose(args) {
  let priority
  const rest = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--priority') priority = args[++i]
    else rest.push(args[i])
  }
  if (priority && !['high', 'medium', 'low'].includes(priority)) {
    console.error('priority must be high, medium, or low')
    process.exit(1)
  }
  create(
    rest,
    { status: 'proposed', priority },
    'usage: aladdin propose <slug> <question...> [--priority high|medium|low]'
  )
  console.log('promote when work starts: set status to "open" in experiment.md')
}
