import path from 'node:path'
import { existsSync } from 'node:fs'
import { loadRepos, saveRepos, registerRepo } from '../config.js'

export function repos(args) {
  const [sub, target] = args
  if (sub === 'add') {
    const abs = path.resolve(target ?? '.')
    if (!existsSync(path.join(abs, 'experiments'))) {
      console.error(`${abs} has no experiments/ — run "aladdin init" there first`)
      process.exit(1)
    }
    console.log(registerRepo(abs) ? `added ${abs}` : `already registered: ${abs}`)
  } else if (sub === 'rm') {
    const abs = path.resolve(target ?? '.')
    saveRepos(loadRepos().filter((r) => r !== abs))
    console.log(`removed ${abs}`)
  } else {
    for (const r of loadRepos()) console.log(r)
  }
}
