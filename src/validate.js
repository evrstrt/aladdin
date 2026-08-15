import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const schemaDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'schemas')

const ajv = new Ajv2020.default({ allErrors: true, strictRequired: false })
addFormats.default(ajv)

const validators = {}
for (const name of ['experiment', 'run', 'verdict', 'scoring', 'runstatus']) {
  const schema = JSON.parse(readFileSync(path.join(schemaDir, `${name}.schema.json`), 'utf8'))
  validators[name] = ajv.compile(schema)
}

export function validate(kind, data) {
  const validator = validators[kind]
  if (!validator) throw new Error(`unknown schema kind: ${kind}`)
  if (validator(data)) return []
  return validator.errors.map((e) => `${e.instancePath || '/'} ${e.message}`)
}
