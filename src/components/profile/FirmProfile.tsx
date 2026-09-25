import { useEffect, useState } from 'react'
import { fetchFirm, getCachedFirm, saveFirmAnswers } from '../../lib/data'
import EntityCard from './EntityCard'

export default function FirmProfile({ firmId }: { firmId: string }) {
  const [firm, setFirm] = useState(getCachedFirm)
  useEffect(() => { fetchFirm(firmId).then(setFirm).catch(() => {}) }, [firmId])
  if (!firm) return null
  return (
    <EntityCard
      scope="firm"
      title={firm.name}
      subtitle="Firm profile"
      row={firm as unknown as Record<string, unknown>}
      defaultOpen
      onSave={a => saveFirmAnswers(firmId, a)}
    />
  )
}
