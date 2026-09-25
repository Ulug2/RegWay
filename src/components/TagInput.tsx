import { useState } from 'react'

export default function TagInput({ tags, onAdd, onRemove, placeholder, options }: {
  tags: string[]
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  placeholder: string
  options: string[]
}) {
  const [open, setOpen] = useState(false)
  const available = options.filter(o => !tags.includes(o))

  return (
    <div className="relative">
      <div
        className="min-h-[44px] flex flex-wrap gap-2 p-2 cursor-text"
        style={{
          background: 'rgba(255,255,255,0.70)',
          border: '1px solid rgba(186,230,253,0.50)',
          borderRadius: 10,
        }}
        onClick={() => setOpen(true)}
      >
        {tags.map(tag => (
          <span
            key={tag}
            className="flex items-center gap-1 px-3 py-1 text-xs font-medium"
            style={{
              background: 'rgba(2,132,199,0.10)',
              color: '#0284C7',
              borderRadius: 9999,
              border: '1px solid rgba(2,132,199,0.20)',
            }}
          >
            {tag}
            <button
              onClick={e => { e.stopPropagation(); onRemove(tag) }}
              className="ml-1 hover:opacity-60 transition-opacity"
              style={{ lineHeight: 1 }}
            >
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && (
          <span className="text-sm" style={{ color: '#94a3b8', padding: '4px 6px' }}>{placeholder}</span>
        )}
      </div>
      {open && available.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 mt-1 z-50 py-2"
          style={{
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(186,230,253,0.50)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
          }}
        >
          {available.map(opt => (
            <button
              key={opt}
              className="w-full text-left px-4 py-2 text-sm hover:bg-sky-50 transition-colors"
              style={{ color: '#334155' }}
              onClick={() => { onAdd(opt); setOpen(false) }}
            >
              {opt}
            </button>
          ))}
          <button
            className="w-full text-left px-4 py-2 text-xs border-t"
            style={{ color: '#94a3b8', borderColor: 'rgba(186,230,253,0.30)' }}
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  )
}
