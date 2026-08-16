import React, { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { marked } from 'marked'

const STATUS_LABEL = {
  proposed: 'proposed',
  open: 'open',
  concluded: 'concluded',
  abandoned: 'abandoned',
}

function md(text) {
  return { __html: marked.parse(text ?? '') }
}

function slugTitle(name) {
  return name.replace(/^exp-\d{4}-/, '').replace(/-/g, ' ')
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Dot({ status }) {
  return <span className={`dot dot-${status ?? 'unknown'}`} />
}

function Chip({ kind, children }) {
  return <span className={`chip chip-${kind}`}>{children}</span>
}

function Evidence({ path }) {
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(false)
  const name = path.split('/').pop()
  const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(name)

  useEffect(() => {
    if (isImage || open) invoke('read_evidence', { path }).then(setData).catch(() => setData({ kind: 'error' }))
  }, [path, open])

  if (isImage) {
    if (!data) return <div className="evidence-loading">{name}</div>
    if (data.kind === 'error') return <div className="evidence-loading">could not read {name}</div>
    return (
      <figure className="evidence-image">
        <img src={`data:${data.mime};base64,${data.base64}`} alt={name} />
        <figcaption>{name}</figcaption>
      </figure>
    )
  }
  return (
    <details className="evidence-text" open={open} onToggle={(e) => setOpen(e.target.open)}>
      <summary>{name}</summary>
      {data?.kind === 'text' &&
        (data.ext === 'md' ? (
          <div className="prose" dangerouslySetInnerHTML={md(data.text)} />
        ) : (
          <pre>{data.text}</pre>
        ))}
    </details>
  )
}

function Metrics({ metrics }) {
  if (!metrics || metrics._error) return null
  return (
    <div className="metrics">
      {Object.entries(metrics).map(([k, v]) => (
        <div key={k} className="metric">
          <span className="metric-key">{k}</span>
          <span className="metric-val">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
        </div>
      ))}
    </div>
  )
}

function RunCard({ run }) {
  const r = run.run ?? {}
  const host = r.host?.type ?? 'local'
  const state = run.status?.state
  return (
    <div className="card run-card">
      <div className="card-head">
        <span className="mono strong">{run.id}</span>
        <Chip kind={`host-${host}`}>{host}{r.host?.id ? ` · ${String(r.host.id).split(' ')[0]}` : ''}</Chip>
        {state && <Chip kind={`state-${state}`}>{state}</Chip>}
        {r.scene && <span className="muted mono">{r.scene}</span>}
        <span className="muted push">{fmtDate(r.created)}</span>
      </div>
      {r.command && <div className="command mono">{r.command}</div>}
      <Metrics metrics={run.metrics} />
      {run.evidence.length > 0 && (
        <div className="evidence-row">
          {run.evidence.map((p) => (
            <Evidence key={p} path={p} />
          ))}
        </div>
      )}
      {r.notes && <div className="muted small">{r.notes}</div>}
    </div>
  )
}

function VerdictCard({ verdict, supersededBy, onReview, reviewer }) {
  const d = verdict.data ?? {}
  const ghost = d.status === 'superseded' || d.status === 'rejected'
  return (
    <div className={`card verdict-card ${ghost ? 'ghost' : ''}`}>
      <div className="card-head">
        <Chip kind={`v-${d.status}`}>{d.status}</Chip>
        <span className="mono muted">{d.method}</span>
        <span className="muted">{d.scorer === 'human' ? 'scored by you' : 'agent'}</span>
        <span className="muted push">{fmtDate(d.date)}</span>
      </div>
      <div className="prose" dangerouslySetInnerHTML={md(verdict.body)} />
      <div className="verdict-meta muted small">
        on {(d.runs ?? []).join(', ')}
        {d.supersedes && <> · supersedes {d.supersedes}</>}
        {supersededBy && <> · superseded by {supersededBy}</>}
        {d.reviewed_by && <> · reviewed by {d.reviewed_by}</>}
      </div>
      {d.status === 'unreviewed' && (
        <div className="review-actions">
          <button className="btn confirm" onClick={() => onReview(verdict.file, 'confirm')}>
            Confirm
          </button>
          <button className="btn reject" onClick={() => onReview(verdict.file, 'reject')}>
            Reject
          </button>
          <span className="muted small">writes reviewed_by: {reviewer}</span>
        </div>
      )}
    </div>
  )
}

function ExperimentPage({ project, experiment, onReview, reviewer }) {
  const d = experiment.exp?.data ?? {}
  const supersededBy = useMemo(() => {
    const map = {}
    for (const v of experiment.verdicts) {
      if (v.data?.supersedes) map[v.data.supersedes] = v.data.id
    }
    return map
  }, [experiment])
  const verdicts = [...experiment.verdicts].reverse()

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow mono">
          {project.name} / {experiment.name}
        </div>
        <h1>{d.question}</h1>
        <div className="chips">
          <Chip kind={`s-${d.status}`}>{STATUS_LABEL[d.status] ?? d.status}</Chip>
          {d.priority && <Chip kind="plain">priority {d.priority}</Chip>}
          {d.confidence && <Chip kind="plain">confidence {d.confidence}</Chip>}
          {(d.scenes ?? []).length > 0 && (
            <Chip kind="plain">
              {d.scenes.length} scene{d.scenes.length > 1 ? 's' : ''}: {d.scenes.join(', ')}
            </Chip>
          )}
        </div>
      </div>

      {d.conclusion && (
        <section>
          <h2>Conclusion</h2>
          <div className="conclusion prose" dangerouslySetInnerHTML={md(d.conclusion)} />
        </section>
      )}

      <section>
        <h2>
          Verdicts <span className="count">{verdicts.length}</span>
        </h2>
        {verdicts.length === 0 && <div className="empty">No verdicts yet.</div>}
        {verdicts.map((v) => (
          <VerdictCard
            key={v.file}
            verdict={v}
            supersededBy={supersededBy[v.data?.id]}
            onReview={onReview}
            reviewer={reviewer}
          />
        ))}
      </section>

      <section>
        <h2>
          Runs <span className="count">{experiment.runs.length}</span>
        </h2>
        {experiment.runs.length === 0 && <div className="empty">No runs yet.</div>}
        {experiment.runs.map((r) => (
          <RunCard key={r.id} run={r} />
        ))}
      </section>
    </div>
  )
}

function InboxPage({ items, onOpen }) {
  return (
    <div className="page">
      <div className="page-header">
        <h1>Review queue</h1>
        <div className="muted">{items.length === 0 ? 'Nothing waiting on you.' : `${items.length} verdict${items.length > 1 ? 's' : ''} waiting for your judgment.`}</div>
      </div>
      {items.map(({ project, experiment, verdict }) => (
        <button key={verdict.file} className="inbox-row" onClick={() => onOpen(experiment.dir)}>
          <Dot status={experiment.exp?.data?.status} />
          <div className="inbox-main">
            <div className="inbox-title">{slugTitle(experiment.name)}</div>
            <div className="muted small">
              {project.name} · {verdict.data?.method} · on {(verdict.data?.runs ?? []).join(', ')}
            </div>
          </div>
          <span className="muted small">{fmtDate(verdict.data?.date)}</span>
        </button>
      ))}
    </div>
  )
}

export default function App() {
  const [state, setState] = useState(null)
  const [sel, setSel] = useState({ type: 'inbox' })
  const [error, setError] = useState(null)

  const refresh = () =>
    invoke('get_state')
      .then((s) => {
        setState(s)
        setError(null)
      })
      .catch((e) => setError(String(e)))

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 4000)
    return () => clearInterval(t)
  }, [])

  const inbox = useMemo(() => {
    if (!state) return []
    const items = []
    for (const project of state.projects)
      for (const experiment of project.experiments)
        for (const verdict of experiment.verdicts)
          if (verdict.data?.status === 'unreviewed') items.push({ project, experiment, verdict })
    items.sort((a, b) => (a.verdict.data?.date < b.verdict.data?.date ? 1 : -1))
    return items
  }, [state])

  const onReview = (file, action) =>
    invoke('review_verdict', { file, action }).then(refresh).catch((e) => setError(String(e)))

  const current = useMemo(() => {
    if (!state || sel.type !== 'exp') return null
    for (const project of state.projects)
      for (const experiment of project.experiments)
        if (experiment.dir === sel.dir) return { project, experiment }
    return null
  }, [state, sel])

  if (!state)
    return (
      <div className="app">
        <div className="boot" data-tauri-drag-region>
          aladdin
        </div>
      </div>
    )

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-top" data-tauri-drag-region>
          <span className="brand">aladdin</span>
        </div>
        <button className={`nav-row inbox ${sel.type === 'inbox' ? 'active' : ''}`} onClick={() => setSel({ type: 'inbox' })}>
          <span className="lamp">◍</span>
          <span>Review queue</span>
          {inbox.length > 0 && <span className="badge push">{inbox.length}</span>}
        </button>
        <div className="sidebar-scroll">
          {state.projects.map((project) => (
            <div key={project.path} className="project">
              <div className="project-name">{project.name}</div>
              {project.missing && <div className="muted small pad">no experiments/ found</div>}
              {project.experiments.map((experiment) => (
                <button
                  key={experiment.dir}
                  className={`nav-row ${sel.type === 'exp' && sel.dir === experiment.dir ? 'active' : ''}`}
                  onClick={() => setSel({ type: 'exp', dir: experiment.dir })}
                >
                  <Dot status={experiment.exp?.data?.status} />
                  <span className="nav-label">{slugTitle(experiment.name)}</span>
                  {experiment.unreviewed > 0 && <span className="badge push">{experiment.unreviewed}</span>}
                </button>
              ))}
            </div>
          ))}
          {state.projects.length === 0 && (
            <div className="pad muted small">
              No projects yet. Register one:
              <pre>aladdin repos add ~/path/to/repo</pre>
            </div>
          )}
        </div>
      </aside>
      <main className="main">
        {error && <div className="error-bar">{error}</div>}
        {sel.type === 'inbox' && <InboxPage items={inbox} onOpen={(dir) => setSel({ type: 'exp', dir })} />}
        {sel.type === 'exp' && current && (
          <ExperimentPage
            project={current.project}
            experiment={current.experiment}
            onReview={onReview}
            reviewer={state.reviewer}
          />
        )}
        {sel.type === 'exp' && !current && <div className="page empty">This experiment is gone from disk.</div>}
      </main>
    </div>
  )
}
