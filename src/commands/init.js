import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const templateDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates')

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
  console.log('add a line to this repo\'s CLAUDE.md pointing agents at experiments/README.md')
}
