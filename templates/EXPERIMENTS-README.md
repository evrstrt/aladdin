# experiments/ — aladdin experiment log

Append-only record of what was tried in this repo, what worked, what didn't, and under
what circumstances. Written by agents through the aladdin MCP tools, reviewed by a human
in the aladdin app.

## Layout

```
experiments/
  INDEX.md                    regenerated index — never edit by hand
  scoring/<method>.v<N>.md    scoring method definitions, versioned
  exp-NNNN-<slug>/
    experiment.md             the question, status, current conclusion (mutable)
    runs/run-NNN/             immutable evidence: run.json, metrics.json, evidence/, artifacts.json
                              plus status.json — the ONE mutable file, changed via mark_run
    verdicts/v-<stamp>.md     append-only judgments on runs
```

## Write path — MCP only

All records go through the aladdin MCP tools: `query_experiments`, `get_experiment`,
`create_experiment`, `record_run`, `mark_run`, `submit_verdict`, `conclude_experiment`,
`check_tree`. They validate at write time. If the aladdin MCP server is not available
in your session, SAY SO and stop recording — do not hand-write experiment files.
(Evidence files and metrics.json inside a run's directory are the exception: write
those directly, then reference them from the verdict.)

## Rules — non-negotiable

1. **Never edit or delete anything under `runs/`** — status changes only through
   `mark_run`, and keep it current so the dashboard reflects reality. A bad run stays;
   a verdict explains why it is disregarded.
2. **Never delete or rewrite a verdict.** To change a judgment, `submit_verdict` with
   `supersedes` set — the old verdict is marked superseded automatically.
3. **Every verdict must carry evidence** — at least one path pointing at material a
   human can eyeball (renders, crops, comparisons, sample output) inside the run's
   `evidence/` dir. Numbers alone are not evidence. The tool enforces this.
4. **Agent verdicts are born `unreviewed`.** Only the human confirms or rejects, in the app.
5. **State your basis.** Verdicts list the runs and scenes they rest on.
   A conclusion from one scene is n=1 and must say so.
6. **Never iterate against holdout scenes** listed in an experiment's `holdout:` field —
   final evaluation only.
7. **Big artifacts stay on the rig/pod.** Record pointers in `artifacts.json`; put only
   small reviewable material (images, short clips, text samples) in `evidence/`.
8. **Conclusions live in `experiment.md`** — update via `conclude_experiment` as
   understanding improves. This is what future sessions read first.
9. **Run `check_tree` before ending a session.** Fix errors; do not leave the tree broken.

## Proposing tests

Ideas worth testing but not started yet: `create_experiment` with status `proposed` and
a priority. When picking up work, take from the queue and set the experiment to `open`
via `conclude_experiment`. Propose freely — a written proposal that never runs beats a
lost idea.

## Before starting new work

`query_experiments` first, then `get_experiment` on anything related to your task.
Do not re-run what already has a confirmed answer — unless the scoring method it used
has since been superseded (check `scoring/`), which makes the old conclusion suspect
and worth revisiting.
