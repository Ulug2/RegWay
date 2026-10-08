// Marks a Federal Register document that's on public inspection: filed and
// scheduled, but not yet published (so its date is when it will publish).
export default function PrePublicationBadge() {
  return (
    <span
      className="inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5"
      style={{ borderRadius: 9999, background: 'rgb(var(--neutral-rgb) / 0.12)', color: 'var(--text-500)' }}
      title="Filed with the Federal Register and scheduled for publication; not yet published"
    >
      Pre-publication
    </span>
  )
}
