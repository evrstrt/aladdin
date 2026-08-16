# aladdin

Experiment tracking for agent-driven pipelines. Agents grant wishes in parallel;
the lamp remembers every one.

The problem it solves: AI-driven testing produces huge exploration volume, but the
judgment — what worked, why, under what circumstances, and which conclusions were
based on flawed scoring — dies with each session. aladdin makes runs immutable,
verdicts revisable-but-never-erased, and evidence mandatory.

## Model

- **Run** — immutable evidence. Commit, config, scene, host (rig/runpod/local),
  raw metrics, reviewable material in `evidence/`, pointers to big artifacts.
  Never edited, never deleted.
- **Verdict** — a judgment on runs. States its scoring method (versioned), the
  scenes it rests on, and links evidence a human can eyeball. Agent verdicts are
  born `unreviewed`; a human confirms or rejects. Wrong in hindsight? A new
  verdict supersedes it — history stays.
- **Experiment** — the question. Groups runs and verdicts, carries the current
  conclusion and its confidence. The thing future sessions read first.
- **Scoring method** — versioned definition of how things are judged. When v2
  reveals v1 was blind to something, every v1-based conclusion is automatically
  suspect and re-scorable from the raw runs.

Data lives as plain files in each project repo under `experiments/` — git-versioned,
greppable, agent-writable. The CLI is the guarded write path; `check` is the linter
that keeps the tree honest.

## Usage

```
npm link                              # once, to get `aladdin` on PATH

aladdin init                           # scaffold experiments/ in a project repo
aladdin new seam-blending "does poisson beat feathering on splat seams?"
aladdin propose tsdf-fusion "does tsdf beat poisson meshing?" --priority high
aladdin run exp-0001 --scene warehouse-a --host runpod --command "python train.py"
aladdin mark exp-0001 run-001 running       # later: succeeded / failed
aladdin verdict exp-0001 --method seam-quality.v1
aladdin status                        # queue, active runs, pending review
aladdin check                          # validate everything; exit 1 on errors
aladdin index                          # regenerate INDEX.md
```

The full agent contract is in `templates/EXPERIMENTS-README.md`, installed into each
repo by `init`.

## Mac app

`app/` is a Tauri app: review queue, projects sidebar, experiment pages with
evidence inline. Build with `npx tauri build` in `app/`; it reads the repo
registry (`aladdin repos`).

## MCP server

`aladdin mcp` runs a stdio MCP server exposing query_experiments, get_experiment,
create_experiment, record_run, mark_run, submit_verdict, conclude_experiment, and
check_tree — schema-validated writes for Claude sessions. Register once with
`claude mcp add -s user aladdin -- aladdin mcp`.

## Roadmap

- Launch integration: `aladdin run --exec` wrapping ssh to rig / RunPod pod spin-up,
  so recording a run and starting it are the same action.
