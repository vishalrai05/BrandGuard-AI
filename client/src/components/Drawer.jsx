import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import IconButton from './IconButton.jsx'

function Drawer({ open, onClose, title, children }) {
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return undefined
    const previousFocus = document.activeElement
    const drawer = document.querySelector('.drawer')
    const focusable = drawer?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')
    focusable?.[0]?.focus()
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        closeRef.current()
        return
      }
      if (event.key === 'Tab' && focusable?.length) {
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [open])

  if (!open) return null
  return (
    <div className="drawer-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <aside aria-label={title} aria-modal="true" className="drawer" role="dialog">
        <div className="drawer-header">
          <h2>{title}</h2>
          <IconButton label="Close details" onClick={onClose}><X size={18} /></IconButton>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  )
}

export default Drawer
