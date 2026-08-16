import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const configDir = path.join(os.homedir(), '.aladdin')
const configFile = path.join(configDir, 'repos.json')

export function loadRepos() {
  try {
    return JSON.parse(readFileSync(configFile, 'utf8')).repos ?? []
  } catch {
    return []
  }
}

export function saveRepos(repos) {
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })
  writeFileSync(configFile, JSON.stringify({ repos: [...new Set(repos)] }, null, 2) + '\n')
}

export function registerRepo(repo) {
  const repos = loadRepos()
  const abs = path.resolve(repo)
  if (!repos.includes(abs)) {
    repos.push(abs)
    saveRepos(repos)
    return true
  }
  return false
}
