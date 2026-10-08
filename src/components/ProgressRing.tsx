export default function ProgressRing({ percent, size = 44, label }: { percent: number; size?: number; label?: string }) {
  const stroke = Math.max(3, Math.round(size / 11))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const id = `ring-${size}`
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--primary-light)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--line-rgb) / 0.55)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, Math.max(0, percent)) / 100)}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center font-semibold"
        style={{ fontSize: Math.round(size / 3.6), color: 'var(--primary)' }}
      >
        {label ?? `${Math.round(percent)}%`}
      </div>
    </div>
  )
}
