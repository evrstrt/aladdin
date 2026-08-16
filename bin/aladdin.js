#!/usr/bin/env node
import { init } from '../src/commands/init.js'
import { newExperiment, propose } from '../src/commands/new.js'
import { newRun } from '../src/commands/run.js'
import { newVerdict } from '../src/commands/verdict.js'
import { check } from '../src/commands/check.js'
import { index } from '../src/commands/index-cmd.js'
import { mark } from '../src/commands/mark.js'
import { status } from '../src/commands/status.js'
import { repos } from '../src/commands/repos.js'

const [cmd, ...args] = process.argv.slice(2)

const commands = { init, new: newExperiment, propose, run: newRun, mark, verdict: newVerdict, check, index, status, repos }

const usage = `aladdin — experiment tracking for agent-driven pipelines

usage:
  aladdin init [dir]                 scaffold experiments/ in a repo
  aladdin new <slug> <question...>   start a new experiment
  aladdin propose <slug> <question...> [--priority high|medium|low]
                                     queue a test proposal
  aladdin run <exp-id> [opts]        create an immutable run record
  aladdin mark <exp-id> <run-id> <state>
                                     update run lifecycle (queued|running|succeeded|failed|aborted)
  aladdin verdict <exp-id> [opts]    create an unreviewed verdict
  aladdin status [dir]               dashboard: queue, active runs, pending review\n  aladdin repos [add|rm] [dir]       manage the repo registry the Mac app reads
  aladdin mcp                        run the MCP server (stdio) for Claude sessions
  aladdin check [dir]                validate the whole tree
  aladdin index [dir]                regenerate INDEX.md`

if (cmd === 'mcp') {
  const { runMcp } = await import('../src/mcp.js')
  await runMcp()
} else if (!cmd || !commands[cmd]) {
  console.log(usage)
  process.exit(cmd ? 1 : 0)
} else {

  try {
    commands[cmd](args)
  } catch (e) {
    console.error(`error: ${e.message}`)
    process.exit(1)
  }
}
