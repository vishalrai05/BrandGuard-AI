import { useState } from 'react'
import { Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import Shell from './components/Shell.jsx'
import { GuestRoute, ProtectedRoute } from './components/AuthRoutes.jsx'
import { ThemeProvider } from './hooks/useTheme.jsx'
import AuthPage from './pages/AuthPage.jsx'
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
      <Routes>
        <Route element={<GuestRoute><AuthPage mode="login" /></GuestRoute>} path="/login" />
        <Route element={<GuestRoute><AuthPage mode="register" /></GuestRoute>} path="/register" />
        <Route element={
          <ProtectedRoute>
            <Shell
              onNewReview={beginNewReview}
              onSearch={setSearch}
              onStatusFilter={setStatusFilter}
              search={search}
              setToast={setToast}
              summary={reviewSummary}
              statusFilter={statusFilter}
              toast={toast}
            ><Outlet /></Shell>
          </ProtectedRoute>
        }>
          <Route
            element={<ReviewPage newReviewRequest={newReviewRequest} onSummaryChange={setReviewSummary} search={search} setToast={setToast} statusFilter={statusFilter} onStatusFilter={setStatusFilter} />}
            path="/"
          />
          <Route element={<HistoryPage />} path="/history" />
          <Route element={<RulesPage />} path="/rules" />
          <Route element={<FactsPage />} path="/facts" />
          <Route
            element={<ReviewPage newReviewRequest={newReviewRequest} onSummaryChange={setReviewSummary} search={search} setToast={setToast} statusFilter={statusFilter} onStatusFilter={setStatusFilter} />}
            path="/reviews/:id"
          />
          <Route element={<ReviewPage setToast={setToast} />} path="*" />
        </Route>
      </Routes>
    </ThemeProvider>
  )
}

export default App
