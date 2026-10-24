import { useEffect, useRef } from 'react'
import { Bell, Menu, Search } from 'lucide-react'
import IconButton from './IconButton.jsx'

function TopBar({ search, onSearch, onNewReview, onOpenMobile }) {
  const searchRef = useRef(null)

  useEffect(() => {
    function focusSearch(event) {
      if (event.key !== '/' || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      const inField = target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')
      if (inField) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  return (
    <header className="topbar">
      <IconButton className="mobile-menu" label="Open navigation" onClick={onOpenMobile}><Menu size={20} /></IconButton>
      <div className="topbar-brand">
        <p className="eyebrow">Copy review</p>
        <h1>BrandGuard</h1>
      </div>
      <label className="search-box">
        <Search size={17} />
        <input
          aria-label="Search current findings"
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search findings..."
          ref={searchRef}
          value={search}
        />
        <kbd>/</kbd>
      </label>
      <div className="topbar-actions">
        <span className="topbar-date">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        <IconButton label="Notifications"><Bell size={18} /><i className="notification-dot" /></IconButton>
        <span aria-label="User V" className="avatar">V</span>
        <button className="button-primary top-new-review" onClick={onNewReview} type="button"><span>+</span> New review</button>
      </div>
    </header>
  )
}

export default TopBar
