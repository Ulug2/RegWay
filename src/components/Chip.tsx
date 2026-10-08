// Pill toggle used for multi-choice answers and filter chips.
export default function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3.5 py-1.5 text-xs font-medium transition-all"
      style={{
        borderRadius: 9999,
        background: selected ? 'linear-gradient(135deg,var(--brand),var(--brand-light))' : 'rgb(var(--surface-rgb) / 0.75)',
        color: selected ? 'white' : 'var(--text-600)',
        border: selected ? '1px solid transparent' : '1px solid rgb(var(--line-strong-rgb) / 0.55)',
        boxShadow: selected ? '0 2px 8px rgb(var(--primary-rgb) / 0.22)' : 'none',
      }}
    >
      {children}
    </button>
  )
}
