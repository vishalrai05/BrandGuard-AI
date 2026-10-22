import { useEffect } from 'react'
import { X } from 'lucide-react'

function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined
    const timeout = window.setTimeout(onClose, 3600)
    return () => window.clearTimeout(timeout)
  }, [message, onClose])

  if (!message) return null
  return (
    <div className="toast" role="status">
      <span>{message}</span>
      <button aria-label="Dismiss notification" className="icon-button" onClick={onClose} type="button">
        <X size={16} />
      </button>
    </div>
  )
}

export default Toast
