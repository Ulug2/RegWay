import { useState } from 'react'

const SEARCH_THRESHOLD = 12

export default function TagInput({ tags, onAdd, onRemove, placeholder, options }: {
  tags: string[]
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  placeholder: string
  options: string[]
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const remaining = options.filter(o => !tags.includes(o))
  // Long lists (every country, every U.S. state) are unusable as a bare
  // dropdown, so they get a type-to-filter box; short ones stay a plain list.
  const searchable = options.length > SEARCH_THRESHOLD
  const needle = query.trim().toLowerCase()
  const available = needle ? remaining.filter(o => o.toLowerCase().includes(needle)) : remaining

  const close = () => {
    setOpen(false)
    setQuery('')
  }
  const pick = (opt: string) => {
    onAdd(opt)
    close()
  }

  return (
    <div className="relative">
      <div
        className="min-h-[44px] flex flex-wrap gap-2 p-2 cursor-text"
        style={{
          background: 'rgb(var(--surface-rgb) / 0.70)',
          border: '1px solid rgb(var(--line-rgb) / 0.50)',
          borderRadius: 10,
        }}
        onClick={() => setOpen(true)}
      >
        {tags.map(tag => (
          <span
            key={tag}
            className="flex items-center gap-1 px-3 py-1 text-xs font-medium"
            style={{
              background: 'rgb(var(--primary-rgb) / 0.10)',
              color: 'var(--primary)',
              borderRadius: 9999,
              border: '1px solid rgb(var(--primary-rgb) / 0.20)',
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
          <span className="text-sm" style={{ color: 'var(--text-300)', padding: '4px 6px' }}>{placeholder}</span>
        )}
      </div>
      {open && remaining.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 mt-1 z-50 py-2"
          style={{
            background: 'rgb(var(--surface-rgb) / 0.95)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgb(var(--line-rgb) / 0.50)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
          }}
        >
          {searchable && (
            <div className="px-3 pb-2">
              <input
                autoFocus
                className="glass-input-rect w-full text-sm"
                placeholder="Type to search…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && available[0]) {
                    e.preventDefault()
                    pick(available[0])
                  } else if (e.key === 'Escape') {
                    close()
                  }
                }}
              />
            </div>
          )}
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {available.map(opt => (
              <button
                key={opt}
                className="w-full text-left px-4 py-2 text-sm hover:bg-sky-50 transition-colors"
                style={{ color: 'var(--text-600)' }}
                onClick={() => pick(opt)}
              >
                {opt}
              </button>
            ))}
            {available.length === 0 && (
              <div className="px-4 py-2 text-sm" style={{ color: 'var(--text-300)' }}>No matches</div>
            )}
          </div>
          <button
            className="w-full text-left px-4 py-2 text-xs border-t"
            style={{ color: 'var(--text-300)', borderColor: 'rgb(var(--line-rgb) / 0.30)' }}
            onClick={close}
          >
            Close
          </button>
        </div>
      )}
    </div>
  )
}
