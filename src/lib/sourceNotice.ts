const REGULATOR_FEEDS_FALLBACK = 'Regulator feeds (U.S., UK and EU)'

export function sourceNotice(names: string[]): string {
  if (names.length === 0) return ''
  const list = names.length === 1 ? names[0] : names.length === 2
    ? names.join(' and ')
    : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
  const plural = names.length > 1 || names[0] === REGULATOR_FEEDS_FALLBACK
  return `${list} ${plural ? "haven't" : "hasn't"} updated successfully recently. Recent items from ${plural ? 'these sources' : 'this source'} may be missing.`
}