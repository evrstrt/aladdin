import { parse as parseYaml } from 'yaml'

export function parseFrontmatter(text, file) {
  if (!text.startsWith('---\n')) {
    throw new Error(`${file}: missing frontmatter block`)
  }
  const end = text.indexOf('\n---', 4)
  if (end === -1) {
    throw new Error(`${file}: unterminated frontmatter block`)
  }
  const raw = text.slice(4, end)
  let data
  try {
    data = parseYaml(raw)
  } catch (e) {
    throw new Error(`${file}: invalid YAML frontmatter: ${e.message}`)
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${file}: frontmatter must be a YAML mapping`)
  }
  const body = text.slice(end + 4).replace(/^\n/, '')
  return { data, body }
}

export function serializeFrontmatter(data, body) {
  const yaml = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        return v.length === 0 ? `${k}: []` : `${k}:\n${v.map((x) => `  - ${x}`).join('\n')}`
      }
      if (typeof v === 'string' && /[:#]/.test(v)) return `${k}: ${JSON.stringify(v)}`
      return `${k}: ${v}`
    })
    .join('\n')
  return `---\n${yaml}\n---\n\n${body}`
}
