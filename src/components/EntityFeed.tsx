import Chip from './Chip'
import CategoryBadge from './CategoryBadge'
import StatusBadge from './StatusBadge'
import PrePublicationBadge from './PrePublicationBadge'
import type { MatchedRegulation } from '../lib/types'
import { publisherName } from '../lib/duplicates'
import { CaretLeft, CaretRight, X } from './icons'
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
    <article className="relative group">
      <button onClick={onOpen} className="glass-card-light glass-lift w-full text-left p-5 sm:p-6 block">
        <div className="flex items-center flex-wrap gap-1.5 mb-3 pr-9">
          <CategoryBadge category={item.category} />
          <StatusBadge status={status} />
          {item.on_public_inspection && <PrePublicationBadge />}
          {isNew && (
            <span className="badge" style={{ background: 'var(--brand)', color: 'white' }} title="Matched since your last visit">
              New
            </span>
          )}
        </div>
        <div className="text-base font-semibold mb-2 pr-9 break-words" style={{ color: 'var(--text-900)', lineHeight: 1.4, letterSpacing: '-0.012em' }}>
          {item.title}
        </div>
        <div className="flex items-center flex-wrap gap-x-2 text-[13px]" style={{ color: 'var(--text-400)' }}>
          <span>{item.agency || item.jurisdiction || 'Unknown source'}</span>
          {item.published_date && (
            <>
              <span aria-hidden="true">·</span>
              <span className="num">{item.on_public_inspection ? 'Publishes' : 'Published'} {formatDate(item.published_date)}</span>
            </>
          )}
        </div>
        {item.summary && (
          <p className="text-sm mt-3 line-clamp-2" style={{ color: 'var(--text-500)', lineHeight: 1.6 }}>
            {item.summary}
          </p>
        )}
        {item.match_reason && (
          // The reason is the product: set apart from the official summary above it.
          <p className="text-sm mt-4 pl-3.5 line-clamp-3" style={{ color: 'var(--text-600)', lineHeight: 1.6, borderLeft: '2px solid rgb(var(--primary-rgb) / 0.45)' }}>
            <span className="font-semibold" style={{ color: 'var(--primary)' }}>Why it's here: </span>
            {item.match_reason}
          </p>
        )}
      </button>
      {!!item.also_published_as?.length && (
        // Outside the card's button: these are links of their own.
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 sm:px-6 pt-2.5 text-[13px]" style={{ color: 'var(--text-400)' }}>
          <span>Also published as:</span>
          {item.also_published_as.map(v => (
            <a key={v.id} href={v.source_url} target="_blank" rel="noreferrer" title={v.title} className="link num">
              {publisherName(v)}
              {v.published_date ? ` · ${formatDate(v.published_date)}` : ''}
            </a>
          ))}
        </div>
      )}
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        title="Not relevant: dismiss (restore in Profile → Dismissed)"
        className="btn-icon absolute top-3.5 right-3.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        style={{ width: 30, height: 30, zIndex: 2 }}
      >
        <X size={14} weight="bold" aria-hidden="true" />
      </button>
    </article>
  )
}

function Message({ children }: { children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>
}

// The list's shape while it loads, so the page doesn't jump when it arrives.
function Loading({ message }: { message: string }) {
  return (
    <div className="max-w-2xl mx-auto" role="status" aria-live="polite">
      <p className="text-sm mb-4" style={{ color: 'var(--text-400)' }}>{message}</p>
      <div className="space-y-4" aria-hidden="true">
        {[0, 1, 2].map(i => (
          <div key={i} className="glass-card-light p-6">
            <div className="skeleton h-4 w-24 mb-4" />
            <div className="skeleton h-5 mb-3" style={{ width: `${82 - i * 14}%` }} />
            <div className="skeleton h-3.5 w-48 mb-5" />
            <div className="skeleton h-3.5 w-full mb-2" />
            <div className="skeleton h-3.5 w-3/4" />
          </div>
        ))}
      </div>
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
            {c.label} <span className="num" style={{ opacity: 0.7 }}>{counts[c.key]}</span>
          </Chip>
        ))}
        {isFiltered(filter) && (
          <button className="link ml-auto text-[13px]" onClick={() => onChange(DEFAULT_FILTER)}>
            Clear filters
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
        <input
          className="glass-input-rect"
          type="search"
          name="search"
          autoComplete="off"
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


// "‹ Today · October 5, 2026 ›": what RegWay found on one day.
function DayStepper({ day, today, first, count, onChange }: { day: string | null; today: string; first: string; count: number; onChange: (d: DaySelection) => void }) {
  if (day === null) {
    return (
      <div className="flex items-center justify-between mb-5 text-sm" style={{ color: 'var(--text-900)' }}>
        <span className="font-semibold">All days</span>
        <button className="link text-[13px]" onClick={() => onChange(null)}>
          Back to today
        </button>
      </div>
    )
  }
  const go = (d: string) => onChange(d === today ? null : d)
  return (
    <div className="flex items-center gap-1 mb-5">
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold" style={{ color: 'var(--text-900)', letterSpacing: '-0.012em' }} aria-live="polite">
          {dayLabel(day, today)}
          <span className="font-normal num" style={{ color: 'var(--text-400)' }}> · {fullDate(day)}</span>
        </div>
        <div className="text-[13px] num" style={{ color: 'var(--text-400)' }}>
          {count === 0 ? 'Nothing new found' : `${count} found by RegWay`}
        </div>
      </div>
      <button className="btn-icon" aria-label="Previous day" disabled={day <= first} onClick={() => go(shiftDay(day, -1))}>
        <CaretLeft size={16} weight="bold" aria-hidden="true" />
      </button>
      <button className="btn-icon" aria-label="Next day" disabled={day >= today} onClick={() => go(shiftDay(day, 1))}>
        <CaretRight size={16} weight="bold" aria-hidden="true" />
      </button>
      <button className="link text-[13px] ml-2" onClick={() => onChange('all')}>
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
  if (items === undefined) return <Loading message={loadingMessage} />
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
            <button className="link" onClick={() => onDayChange(earlier)}>
              See {dayLabel(earlier, today) === 'Yesterday' ? 'yesterday' : fullDate(earlier)} ({itemsOnDay(items, earlier).length})
            </button>
          )}
          {earlier && ' · '}
          <button className="link" onClick={() => onDayChange('all')}>
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
                <button className="link" onClick={() => onFilterChange(DEFAULT_FILTER)}>
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
