import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  BookOpenCheck, ClipboardCheck, FileText, LayoutDashboard, Settings2, Sparkles,
} from 'lucide-react'
import { api } from '../api/client.js'
import { useTheme } from '../hooks/useTheme.jsx'
import IconButton from './IconButton.jsx'
import NavPanel from './NavPanel.jsx'
import Toast from './Toast.jsx'
import TopBar from './TopBar.jsx'

const navItems = [
  { label: 'Review', to: '/', icon: ClipboardCheck, end: true },
  { label: 'History', to: '/history', icon: LayoutDashboard },
  { label: 'Rules', to: '/rules', icon: BookOpenCheck },
  { label: 'Facts', to: '/facts', icon: FileText },
]

function Shell({
  children, onNewReview, onSearch, search, statusFilter, onStatusFilter,
  toast, setToast, summary,
}) {
  const location = useLocation()
  const { theme, setTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState({ reviews: true, libraries: true, findings: true })
  const [libraryCounts, setLibraryCounts] = useState({ rules: 0, facts: 0, reviews: 0 })
  const isReview = location.pathname === '/' || location.pathname.startsWith('/reviews/')

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    let active = true
    Promise.all([api.getRules(), api.getFacts(), api.getReviews()])
      .then(([rules, facts, reviews]) => {
        if (active) setLibraryCounts({ rules: rules.length, facts: facts.length, reviews: reviews.length })
      })
      .catch((error) => {
        if (active) setToast(`Navigation counts unavailable: ${error.message}`)
      })
    return () => {
      active = false
    }
  }, [location.pathname, setToast])

  const closeToast = useCallback(() => setToast(''), [setToast])
  const toggleGroup = (group) => setExpandedGroups((current) => ({ ...current, [group]: !current[group] }))

  return (
    <div className="app-frame">
      <nav aria-label="Primary navigation" className="icon-rail">
        <Link aria-label="BrandGuard home" className="brand-mark" to="/">
          <Sparkles size={21} strokeWidth={2.3} />
        </Link>
        <div className="rail-items">
          {navItems.map(({ label, to, icon: Icon, end }) => (
            <Link
              aria-label={label}
              className={`rail-link ${end ? (location.pathname === '/' || location.pathname.startsWith('/reviews/') ? 'rail-active' : '') : location.pathname.startsWith(to) ? 'rail-active' : ''}`}
              to={to}
              key={to}
              title={label}
            >
              <Icon size={19} />
              <span className="rail-mobile-label">{label}</span>
            </Link>
          ))}
          <button className="rail-link rail-theme-button" aria-label="Toggle light and dark theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Settings" type="button">
            <Settings2 size={19} /><span className="rail-mobile-label">Settings</span>
          </button>
        </div>
        <IconButton className="rail-settings" label="Settings and appearance" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          <Settings2 size={19} />
        </IconButton>
      </nav>

      <NavPanel
        collapsed={collapsed}
        expandedGroups={expandedGroups}
        isReview={isReview}
        libraryCounts={libraryCounts}
        locationPathname={location.pathname}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onStatusFilter={onStatusFilter}
        onToggleCollapsed={() => setCollapsed(!collapsed)}
        onToggleGroup={toggleGroup}
        statusFilter={statusFilter}
        summary={summary}
      />
      {mobileOpen && <button aria-label="Close navigation" className="mobile-scrim" onClick={() => setMobileOpen(false)} type="button" />}

      <div className="main-shell">
        <TopBar
          onNewReview={onNewReview}
          onOpenMobile={() => setMobileOpen(true)}
          onSearch={onSearch}
          search={search}
        />
        <main className="page-content">{children}</main>
      </div>
      <Toast message={toast} onClose={closeToast} />
    </div>
  )
}

export default Shell
