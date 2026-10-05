import Chip from './Chip'
import CategoryBadge from './CategoryBadge'
import StatusBadge from './StatusBadge'
import PrePublicationBadge from './PrePublicationBadge'
import type { MatchedRegulation } from '../lib/types'
import { isNewSince } from '../lib/lastVisit'
import {
  CATEGORIES,
  DATE_WINDOWS,
  DEFAULT_FILTER,
  applyFeedFilter,
  categoryCounts,
  isFiltered,
  locationOptions,
  type DateWindow,
  type FeedFilter,
} from '../lib/feedFilter'
import { dayLabel, firstDay, fullDate, itemsOnDay, localDay, previousDayWithFindings, resolveDay, shiftDay, type DaySelection } from '../lib/feedDays'

// One entity's page of matched developments (firm, fund, or portfolio
// company — spec §5 asks for the same layout on all three): the day being
// viewed (today by default, back to the firm's first day), category chips,
// topic/date/location filters, and the list.

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function FeedItem({ item, status, isNew, onOpen, onDismiss }: { item: MatchedRegulation; status?: string; isNew: boolean; onOpen: () => void; onDismiss: () => void }) {
  return (
    <div className="relative group">
      <button onClick={onOpen} className="glass-card-light glass-lift w-full text-left p-6 block">
        <div className="flex items-center gap-2 mb-3 pr-8">
          <CategoryBadge category={item.category} />
          <StatusBadge status={status} />
          {item.on_public_inspection && <PrePublicationBadge />}
          {isNew && (
            <span
              className="inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5"
              style={{ borderRadius: 9999, background: 'linear-gradient(135deg,#0284C7,#38BDF8)', color: 'white' }}
              title="Matched since your last visit"
            >
              New
            </span>
          )}
        </div>
        <div className="text-sm font-semibold mb-2 pr-8" style={{ color: '#0F172A', lineHeight: 1.5 }}>
          {item.title}
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: '#64748B' }}>
          <span>{item.agency || item.jurisdiction || 'Unknown source'}</span>
          {item.published_date && (
            <>
              <span style={{ color: '#BAE6FD' }}>●</span>
              <span>{item.on_public_inspection ? 'Publishes' : 'Published'} {formatDate(item.published_date)}</span>
            </>
          )}
        </div>
        {item.summary && (
          <p className="text-xs mt-3 line-clamp-2" style={{ color: '#475569', lineHeight: 1.6 }}>
            {item.summary}
          </p>
        )}
        {item.match_reason && (
          <p className="text-xs mt-3 line-clamp-2" style={{ color: '#334155', lineHeight: 1.6 }}>
            <span className="font-semibold" style={{ color: '#0284C7' }}>Why it's here: </span>
            {item.match_reason}
          </p>
        )}
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        title="Not relevant — dismiss (restore in Profile → Dismissed)"
        className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-sky-50"
        style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.85)' }}
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto text-center text-sm" style={{ color: '#94a3b8', padding: '24px 0' }}>
      {children}
    </div>
  )
}

function FilterBar({ items, filter, onChange }: { items: MatchedRegulation[]; filter: FeedFilter; onChange: (f: FeedFilter) => void }) {
  const counts = categoryCounts(items, filter)
  const locations = locationOptions(items)
  const set = (patch: Partial<FeedFilter>) => onChange({ ...filter, ...patch })

  return (
    <div className="space-y-3 mb-5">
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map(c => (
          <Chip key={c.key} selected={filter.category === c.key} onClick={() => set({ category: c.key })}>
            {c.label} <span style={{ opacity: 0.7 }}>{counts[c.key]}</span>
          </Chip>
        ))}
        {isFiltered(filter) && (
          <button className="ml-auto text-xs underline" style={{ color: '#0284C7' }} onClick={() => onChange(DEFAULT_FILTER)}>
            Clear filters
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
        <input
          className="glass-input-rect"
          type="search"
          placeholder="Search by topic, issuer, or reason…"
          value={filter.query}
          onChange={e => set({ query: e.target.value })}
          aria-label="Search developments"
        />
        <select className="glass-input-rect" value={filter.date} onChange={e => set({ date: e.target.value as DateWindow })} aria-label="Published">
          {DATE_WINDOWS.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
        </select>
        <select
          className="glass-input-rect"
          value={filter.location ?? ''}
          onChange={e => set({ location: e.target.value || null })}
          aria-label="Location"
        >
          <option value="">Any location</option>
          {/* Keep a chosen location selectable even if it's not in this list. */}
          {filter.location && !locations.includes(filter.location) && <option value={filter.location}>{filter.location}</option>}
          {locations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
    </div>
  )
}

const stepButton = 'w-9 h-9 flex items-center justify-center rounded-full transition-colors hover:bg-sky-50 disabled:opacity-30 disabled:cursor-not-allowed'

// "‹ Today · October 5, 2026 ›": what RegWay found on one day.
function DayStepper({ day, today, first, count, onChange }: { day: string | null; today: string; first: string; count: number; onChange: (d: DaySelection) => void }) {
  if (day === null) {
    return (
      <div className="flex items-center justify-between mb-4 text-sm" style={{ color: '#334155' }}>
        <span className="font-semibold">All days</span>
        <button className="text-xs underline" style={{ color: '#0284C7' }} onClick={() => onChange(null)}>
          Back to today
        </button>
      </div>
    )
  }
  const go = (d: string) => onChange(d === today ? null : d)
  return (
    <div className="flex items-center gap-2 mb-4">
      <button className={stepButton} style={{ color: '#334155' }} aria-label="Previous day" disabled={day <= first} onClick={() => go(shiftDay(day, -1))}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="flex-1 text-center">
        <div className="text-sm font-semibold" style={{ color: '#0F172A' }} aria-live="polite">
          {dayLabel(day, today)}
          <span className="font-normal" style={{ color: '#64748B' }}> · {fullDate(day)}</span>
        </div>
        <div className="text-xs" style={{ color: '#64748B' }}>
          {count === 0 ? 'Nothing new found' : `${count} found by RegWay`}
        </div>
      </div>
      <button className={stepButton} style={{ color: '#334155' }} aria-label="Next day" disabled={day >= today} onClick={() => go(shiftDay(day, 1))}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <button className="text-xs underline ml-1" style={{ color: '#0284C7' }} onClick={() => onChange('all')}>
        All days
      </button>
    </div>
  )
}

interface EntityFeedProps {
  // undefined while loading.
  items: MatchedRegulation[] | undefined
  loadingMessage: string
  emptyMessage: string
  statuses: Record<string, string>
  // Matches after this are badged "New"; null = no badges (first visit).
  newSince: string | null
  filter: FeedFilter
  onFilterChange: (f: FeedFilter) => void
  // Which day is shown (null = today) and when the firm started, the
  // furthest back the stepper goes.
  day: DaySelection
  onDayChange: (day: DaySelection) => void
  firmCreatedAt: string | null | undefined
  onOpen: (item: MatchedRegulation) => void
  onDismiss: (id: string) => void
}

export default function EntityFeed({ items, loadingMessage, emptyMessage, statuses, newSince, filter, onFilterChange, day: selection, onDayChange, firmCreatedAt, onOpen, onDismiss }: EntityFeedProps) {
  if (items === undefined) return <Message>{loadingMessage}</Message>
  if (items.length === 0) return <Message>{emptyMessage}</Message>

  const today = localDay(new Date())
  const day = resolveDay(selection, today)
  const first = firstDay(items, firmCreatedAt, today)
  const dayItems = day ? itemsOnDay(items, day) : items
  const shown = applyFeedFilter(dayItems, filter)
  const earlier = day ? previousDayWithFindings(items, day) : null

  return (
    <div className="max-w-2xl mx-auto">
      <DayStepper day={day} today={today} first={first} count={dayItems.length} onChange={onDayChange} />
      {dayItems.length === 0 && day ? (
        <Message>
          Nothing new was found for {dayLabel(day, today) === 'Today' ? 'today' : fullDate(day)}.{' '}
          {earlier && (
            <button className="underline" style={{ color: '#0284C7' }} onClick={() => onDayChange(earlier)}>
              See {dayLabel(earlier, today) === 'Yesterday' ? 'yesterday' : fullDate(earlier)} ({itemsOnDay(items, earlier).length})
            </button>
          )}
          {earlier && ' · '}
          <button className="underline" style={{ color: '#0284C7' }} onClick={() => onDayChange('all')}>
            Show all days
          </button>
        </Message>
      ) : (
        <>
          <FilterBar items={dayItems} filter={filter} onChange={onFilterChange} />
          {shown.length === 0 ? (
            <Message>
              Nothing here matches these filters.{' '}
              {isFiltered(filter) && (
                <button className="underline" style={{ color: '#0284C7' }} onClick={() => onFilterChange(DEFAULT_FILTER)}>
                  Clear filters
                </button>
              )}
            </Message>
          ) : (
            <div className="space-y-4">
              {shown.map(item => (
                <FeedItem
                  key={item.id}
                  item={item}
                  status={statuses[item.id]}
                  isNew={isNewSince(item.matched_at, newSince)}
                  onOpen={() => onOpen(item)}
                  onDismiss={() => onDismiss(item.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
