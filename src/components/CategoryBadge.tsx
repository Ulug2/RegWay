import type { Regulation } from '../lib/types'

const STYLES: Record<Regulation['category'], { label: string; bg: string; fg: string }> = {
  regulatory: { label: 'Regulatory', bg: 'rgb(var(--primary-rgb) / 0.10)', fg: 'var(--primary)' },
  enforcement: { label: 'Enforcement', bg: 'rgb(var(--neutral-rgb) / 0.14)', fg: 'var(--text-600)' },
  geopolitical: { label: 'Geopolitical', bg: 'rgb(var(--neutral-rgb) / 0.14)', fg: 'var(--text-600)' },
}

export default function CategoryBadge({ category }: { category: Regulation['category'] }) {
  const style = STYLES[category] ?? STYLES.regulatory
  return (
    <span className="badge" style={{ background: style.bg, color: style.fg }}>
      {style.label}
    </span>
  )
}
