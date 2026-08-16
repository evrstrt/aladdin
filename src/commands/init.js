import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { registerRepo } from '../config.js'

const templateDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates')

const claudeMdSection = `
## experiments — aladdin

This repo tracks experiments under \`experiments/\`. Before any experiment, test run,
or pipeline-evaluation work, read \`experiments/README.md\` and follow its rules.
Use the aladdin MCP tools: query_experiments before starting; record_run, mark_run,
submit_verdict, conclude_experiment while working; check_tree before ending the
session. If the aladdin MCP server is not available, say so and stop recording —
do not hand-write experiment files. Never edit anything under runs/ except via
mark_run; never delete or rewrite a verdict — supersede it.
`

export function init(args) {
  const target = path.resolve(args[0] ?? '.')
  const dir = path.join(target, 'experiments')
  if (existsSync(dir)) {
    console.error(`${dir} already exists`)
    process.exit(1)
  }
  mkdirSync(path.join(dir, 'scoring'), { recursive: true })
  copyFileSync(path.join(templateDir, 'EXPERIMENTS-README.md'), path.join(dir, 'README.md'))
  writeFileSync(path.join(dir, 'INDEX.md'), '# experiments\n\n(no experiments yet — run `aladdin new <slug> <question>`)\n')
  console.log(`initialized ${dir}`)

  if (registerRepo(target)) console.log('registered in ~/.aladdin/repos.json (used by the app and `aladdin repos`)')

  const claudeMd = path.join(target, 'CLAUDE.md')
  if (!existsSync(claudeMd)) {
    writeFileSync(claudeMd, `# CLAUDE.md\n${claudeMdSection}`)
    console.log(`created ${claudeMd} with the aladdin contract`)
  } else if (readFileSync(claudeMd, 'utf8').includes('aladdin')) {
    console.log(`${claudeMd} already references aladdin — left untouched`)
  } else {
    appendFileSync(claudeMd, claudeMdSection)
    console.log(`appended aladdin contract to ${claudeMd}`)
  }
}
