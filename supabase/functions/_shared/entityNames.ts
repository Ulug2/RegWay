// The fund or company an AI answer names, found even when the model
// shortens the name ("Brightwell Wealth" for "Brightwell Wealth (test)",
// "A.L.A. S.p.A." for "A.L.A. S.p.A. (Advanced Logistics for Aerospace)").
// An exact name could not be found that way, and the match was saved for
// the firm or dropped (first scored test set, 2026-11-25).
//
// In order: the exact name (any case); the name without anything in
// brackets or punctuation; one name that starts with the other, word for
// word. Two candidates means it is not known which: null.

const key = (name: string) =>
  name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

export function resolveEntity<T extends { name: string }>(rows: T[], name: string | null | undefined): T | null {
  const wanted = (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!wanted) return null
  const exact = rows.filter(r => r.name.trim().toLowerCase().replace(/\s+/g, ' ') === wanted)
  if (exact.length === 1) return exact[0]
  const k = key(wanted)
  if (!k) return null
  const same = rows.filter(r => key(r.name) === k)
  if (same.length === 1) return same[0]
  if (same.length > 1) return null
  const startsWith = rows.filter(r => {
    const rk = key(r.name)
    return rk.startsWith(`${k} `) || k.startsWith(`${rk} `)
  })
  return startsWith.length === 1 ? startsWith[0] : null
}
