import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const templateDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates')

const claudeMdSection = `
## experiments — aladdin

This repo tracks experiments under \`experiments/\`. Before any experiment, test run,
or pipeline-evaluation work, read \`experiments/README.md\` and follow its rules.
Record every run with \`aladdin run\`, every judgment with \`aladdin verdict\`; keep run
state current with \`aladdin mark\`; queue test ideas with \`aladdin propose\`; run
\`aladdin check\` before ending a session. Never edit anything under \`runs/\` except
via \`aladdin mark\`; never delete or rewrite a verdict — supersede it.
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
