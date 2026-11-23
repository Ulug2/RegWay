import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// The server functions import supabase-js from npm by a pinned version, which
// `pnpm audit` cannot see. Keeping it equal to the version the app installs
// (pnpm-lock.yaml) means the audit of the app covers the functions too.
// Changing it needs a deploy of every function.
const ROOT = path.resolve(__dirname, '../..')
const FUNCTIONS = path.join(ROOT, 'supabase/functions')

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? files(full) : full.endsWith('.ts') ? [full] : []
  })

const lockedVersion = readFileSync(path.join(ROOT, 'pnpm-lock.yaml'), 'utf8').match(/^ {2}'?@supabase\/supabase-js@([\d.]+)'?:/m)?.[1]
const vitestAlias = readFileSync(path.join(ROOT, 'vitest.config.ts'), 'utf8').match(/'(npm:@supabase\/supabase-js@[\d.]+)'/)?.[1]

describe('supabase-js in the server functions', () => {
  const imports = files(FUNCTIONS).flatMap(file =>
    [...readFileSync(file, 'utf8').matchAll(/from '([^']*supabase-js[^']*)'/g)].map(m => ({ file: path.relative(FUNCTIONS, file), spec: m[1] })),
  )

  it('finds the app version and the imports', () => {
    expect(lockedVersion).toMatch(/^2\.\d+\.\d+$/)
    expect(imports.length).toBeGreaterThan(20)
  })

  it('every function imports the version the app installs', () => {
    const wrong = imports.filter(i => i.spec !== `npm:@supabase/supabase-js@${lockedVersion}`)
    expect(wrong).toEqual([])
  })

  it('the unit tests replace exactly that import with the fake client', () => {
    expect(vitestAlias).toBe(`npm:@supabase/supabase-js@${lockedVersion}`)
  })
})

// The PDF reader (Sidekick §17.8): the same rule, against package.json,
// which pins it for the unit tests and `pnpm audit`.
describe('unpdf in the server functions', () => {
  const pinned = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).devDependencies?.unpdf as string | undefined
  const imports = files(FUNCTIONS).flatMap(file => [...readFileSync(file, 'utf8').matchAll(/from '(npm:unpdf[^']*)'/g)].map(m => m[1]))

  it('is pinned to one exact version', () => {
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/)
    expect(imports.length).toBeGreaterThan(0)
  })

  it('every import and the test alias use that version', () => {
    expect([...new Set(imports)]).toEqual([`npm:unpdf@${pinned}`])
    expect(readFileSync(path.join(ROOT, 'vitest.config.ts'), 'utf8')).toContain(`'npm:unpdf@${pinned}': 'unpdf'`)
  })
})
