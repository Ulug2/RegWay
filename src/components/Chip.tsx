// Pill toggle used for multi-choice answers and filter chips.
export default function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]"
      style={{
        borderRadius: 9999,
        background: selected ? 'var(--brand)' : 'rgb(var(--surface-rgb) / 0.75)',
        color: selected ? 'white' : 'var(--text-600)',
        border: selected ? '1px solid transparent' : '1px solid rgb(var(--line-strong-rgb) / 0.55)',
        boxShadow: selected ? '0 2px 8px rgb(var(--primary-rgb) / 0.22)' : 'none',
      }}
    >
      {children}
    </button>
  )
}
