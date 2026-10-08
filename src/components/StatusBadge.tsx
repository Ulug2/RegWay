// The AI-written impact status is a free-text sentence (e.g. "Proposed
// rule; comment period closes November 2026."), too long for a list-item
// badge. This pulls out just the lead word when it's one of the small set
// the regulation-impact prompt is instructed to lead with, and renders
// nothing otherwise rather than show a truncated or misleading fragment.
const KNOWN_LABELS: Record<string, string> = {
  final: 'Final',
  proposed: 'Proposed',
  interim: 'Interim',
  notice: 'Notice',
}

export function proposedFinalLabel(status: string | undefined): string | null {
  if (!status) return null
  const leadWord = status.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '')
  return leadWord ? (KNOWN_LABELS[leadWord] ?? null) : null
}

export default function StatusBadge({ status }: { status: string | undefined }) {
  const label = proposedFinalLabel(status)
  if (!label) return null

  return (
    <span className="badge" style={{ background: 'rgb(var(--neutral-rgb) / 0.12)', color: 'var(--text-500)' }}>
      {label}
    </span>
  )
}
