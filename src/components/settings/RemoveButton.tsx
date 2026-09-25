import { useState } from 'react'

interface RemoveButtonProps {
  onConfirm: () => void
  disabled?: boolean
}

// Two-step inline remove — avoids a blocking browser confirm() dialog.
export default function RemoveButton({ onConfirm, disabled }: RemoveButtonProps) {
  const [armed, setArmed] = useState(false)

  if (!armed) {
    return (
      <button className="btn-ghost" onClick={() => setArmed(true)} disabled={disabled}>
        Remove
      </button>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <button className="btn-primary" onClick={onConfirm} disabled={disabled}>Confirm remove</button>
      <button className="btn-ghost" onClick={() => setArmed(false)}>Cancel</button>
    </div>
  )
}
