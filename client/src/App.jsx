import { useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import Shell from './components/Shell.jsx'
import { ThemeProvider } from './hooks/useTheme.jsx'
import FactsPage from './pages/FactsPage.jsx'
import HistoryPage from './pages/HistoryPage.jsx'
import ReviewPage from './pages/ReviewPage.jsx'
import RulesPage from './pages/RulesPage.jsx'

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [newReviewRequest, setNewReviewRequest] = useState(0)
  const [toast, setToast] = useState('')
  const [reviewSummary, setReviewSummary] = useState(null)

  function beginNewReview() {
    setSearch('')
    setStatusFilter('all')
    if (location.pathname === '/') {
      setNewReviewRequest((current) => current + 1)
      return
    }
    navigate('/', { state: { openNewReview: true } })
  }

  return (
    <ThemeProvider>
      <Shell
        onNewReview={beginNewReview}
        onSearch={setSearch}
        onStatusFilter={setStatusFilter}
        search={search}
        setToast={setToast}
        summary={reviewSummary}
        statusFilter={statusFilter}
        toast={toast}
      >
        <Routes>
          <Route
            element={
              <ReviewPage
                newReviewRequest={newReviewRequest}
                onSummaryChange={setReviewSummary}
                search={search}
                setToast={setToast}
                statusFilter={statusFilter}
                onStatusFilter={setStatusFilter}
              />
            }
            path="/"
          />
          <Route element={<HistoryPage />} path="/history" />
          <Route element={<RulesPage />} path="/rules" />
          <Route element={<FactsPage />} path="/facts" />
          <Route
            element={
              <ReviewPage
                newReviewRequest={newReviewRequest}
                onSummaryChange={setReviewSummary}
                search={search}
                setToast={setToast}
                statusFilter={statusFilter}
                onStatusFilter={setStatusFilter}
              />
            }
            path="/reviews/:id"
          />
          <Route element={<ReviewPage setToast={setToast} />} path="*" />
        </Routes>
      </Shell>
    </ThemeProvider>
  )
}

export default App
