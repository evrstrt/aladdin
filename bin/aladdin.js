#!/usr/bin/env node
import { init } from '../src/commands/init.js'
import { newExperiment } from '../src/commands/new.js'
import { newRun } from '../src/commands/run.js'
import { newVerdict } from '../src/commands/verdict.js'
import { check } from '../src/commands/check.js'
import { index } from '../src/commands/index-cmd.js'

const [cmd, ...args] = process.argv.slice(2)

const commands = { init, new: newExperiment, run: newRun, verdict: newVerdict, check, index }

const usage = `aladdin — experiment tracking for agent-driven pipelines

usage:
  aladdin init [dir]                 scaffold experiments/ in a repo
  aladdin new <slug> <question...>   start a new experiment
  aladdin run <exp-id> [opts]        create an immutable run record
  aladdin verdict <exp-id> [opts]    create an unreviewed verdict
  aladdin check [dir]                validate the whole tree
  aladdin index [dir]                regenerate INDEX.md`

if (!cmd || !commands[cmd]) {
  console.log(usage)
  process.exit(cmd ? 1 : 0)
}

try {
  commands[cmd](args)
} catch (e) {
  console.error(`error: ${e.message}`)
  process.exit(1)
}
