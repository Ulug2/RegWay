import type { Regulation } from '../lib/types'

const STYLES: Record<Regulation['category'], { label: string; bg: string; fg: string }> = {
  regulatory: { label: 'Regulatory', bg: 'rgba(2,132,199,0.10)', fg: '#0284C7' },
  enforcement: { label: 'Enforcement', bg: 'rgba(217,119,6,0.12)', fg: '#B45309' },
  geopolitical: { label: 'Geopolitical', bg: 'rgba(124,58,237,0.10)', fg: '#7C3AED' },
}

export default function CategoryBadge({ category }: { category: Regulation['category'] }) {
  const style = STYLES[category] ?? STYLES.regulatory
  return (
    <span
      className="inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5"
      style={{ borderRadius: 9999, background: style.bg, color: style.fg }}
    >
      {style.label}
    </span>
  )
}
