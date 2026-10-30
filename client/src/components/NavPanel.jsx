import { Link } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, Moon, Sun, X } from 'lucide-react'
import { useTheme } from '../hooks/useTheme.jsx'
import IconButton from './IconButton.jsx'

function NavGroup({ label, group, expanded, onToggle }) {
  return (
    <button
      aria-expanded={expanded}
      className={`nav-group-toggle ${group !== 'reviews' ? 'nav-group-spaced' : ''}`}
      onClick={() => onToggle(group)}
      type="button"
    >
      {label}<ChevronDown className={expanded ? 'group-chevron expanded' : 'group-chevron'} size={12} />
    </button>
  )
}

function NavPanel({
  collapsed,
  mobileOpen,
  onCloseMobile,
  onToggleCollapsed,
  expandedGroups,
  onToggleGroup,
  libraryCounts,
  isReview,
  locationPathname,
  statusFilter,
  onStatusFilter,
  summary,
}) {
  const { theme, setTheme } = useTheme()

  return (
    <aside className={`nav-panel ${collapsed ? 'nav-collapsed' : ''} ${mobileOpen ? 'nav-mobile-open' : ''}`}>
      <div className="nav-panel-head">
        <div>
          <p className="eyebrow">Navigation</p>
          <h2>Pages</h2>
        </div>
        <IconButton className="collapse-button" label={collapsed ? 'Expand navigation' : 'Collapse navigation'} onClick={onToggleCollapsed}>
          {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
        </IconButton>
        <IconButton className="mobile-close" label="Close navigation" onClick={onCloseMobile}><X size={18} /></IconButton>
      </div>

      <div className="nav-scroll">
        <NavGroup expanded={expandedGroups.reviews} group="reviews" label="REVIEWS" onToggle={onToggleGroup} />
        {expandedGroups.reviews && (
          <>
            <Link className={`nav-row ${isReview ? 'nav-row-active' : ''}`} to="/">
              <span>Current review</span><span className="nav-dot" />
            </Link>
            <Link className={`nav-row ${locationPathname === '/history' ? 'nav-row-active' : ''}`} to="/history">
              <span>All reviews</span><span className="count-badge">{libraryCounts.reviews}</span>
            </Link>
            <Link className={`nav-row ${locationPathname === '/insights' ? 'nav-row-active' : ''}`} to="/insights">
              <span>Insights</span><span className="nav-dot" />
            </Link>
          </>
        )}

        <NavGroup expanded={expandedGroups.libraries} group="libraries" label="LIBRARIES" onToggle={onToggleGroup} />
        {expandedGroups.libraries && (
          <>
            <Link className={`nav-row ${locationPathname === '/rules' ? 'nav-row-active' : ''}`} to="/rules">
              <span>Rules</span><span className="count-badge">{libraryCounts.rules}</span>
            </Link>
            <Link className={`nav-row ${locationPathname === '/facts' ? 'nav-row-active' : ''}`} to="/facts">
              <span>Facts</span><span className="count-badge">{libraryCounts.facts}</span>
            </Link>
          </>
        )}

        {isReview && (
          <>
            <NavGroup expanded={expandedGroups.findings} group="findings" label="FINDINGS" onToggle={onToggleGroup} />
            {expandedGroups.findings && [
              ['all', 'All', summary?.total ?? 0],
              ['open', 'Open', summary?.open ?? 0],
              ['accepted', 'Accepted', summary?.accepted ?? 0],
              ['dismissed', 'Dismissed', summary?.dismissed ?? 0],
            ].map(([value, label, count]) => (
              <button
                aria-pressed={statusFilter === value}
                className={`nav-row nav-filter ${statusFilter === value ? 'nav-row-active' : ''}`}
                key={value}
                onClick={() => onStatusFilter(value)}
                type="button"
              >
                <span>{label}</span><span className="count-badge">{count}</span>
              </button>
            ))}
          </>
        )}
      </div>

      <div className="theme-control">
        <span className="nav-group-label">APPEARANCE</span>
        <div className="theme-switch" role="group" aria-label="Color theme">
          <button aria-pressed={theme === 'light'} onClick={() => setTheme('light')} type="button"><Sun size={15} /> Light</button>
          <button aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')} type="button"><Moon size={15} /> Dark</button>
        </div>
      </div>
    </aside>
  )
}

export default NavPanel
