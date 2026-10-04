// Pill toggle used for multi-choice answers and filter chips.
export default function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3.5 py-1.5 text-xs font-medium transition-all"
      style={{
        borderRadius: 9999,
        background: selected ? 'linear-gradient(135deg,#0284C7,#38BDF8)' : 'rgba(255,255,255,0.75)',
        color: selected ? 'white' : '#334155',
        border: selected ? '1px solid transparent' : '1px solid rgba(148,197,224,0.55)',
        boxShadow: selected ? '0 2px 8px rgba(2,132,199,0.22)' : 'none',
      }}
    >
      {children}
    </button>
  )
}
