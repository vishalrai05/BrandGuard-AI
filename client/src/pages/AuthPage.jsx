import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'

function friendlyMessage(error) {
  const messages = {
    'Invalid email or password.': 'That email and password combination did not match.',
    'Email already exists.': 'An account with that email already exists. Try signing in instead.',
  }
  return messages[error.message] ?? error.message ?? 'We could not complete that request. Please try again.'
}

function AuthPage({ mode }) {
  const isRegister = mode === 'register'
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message] = useState(location.state?.message ?? '')

  function chooseDemoAccount(demoEmail) {
    setEmail(demoEmail)
    setPassword('')
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (isRegister && !name.trim()) return setError('Enter your name to create an account.')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.')
    if (password.length < (isRegister ? 8 : 1)) return setError(isRegister ? 'Use a password with at least 8 characters.' : 'Enter your password.')
    setLoading(true)
    try {
      if (isRegister) await register(name.trim(), email.trim(), password)
      else await login(email.trim(), password)
      const from = location.state?.from
      navigate(from?.pathname ? { pathname: from.pathname, search: from.search ?? '', hash: from.hash ?? '' } : '/', { replace: true })
    } catch (requestError) {
      setError(friendlyMessage(requestError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-screen">
      <section aria-labelledby="auth-title" className="auth-card">
        <div className="auth-brand"><span className="brand-square" /><span className="brand-wordmark">BRANDGUARD</span></div>
        <p className="eyebrow">{isRegister ? 'Create an account' : 'Welcome back'}</p>
        <h1 id="auth-title">{isRegister ? 'Start reviewing with confidence.' : 'Sign in to BrandGuard.'}</h1>
        <p className="auth-intro">{isRegister ? 'Your account will be created as a reviewer.' : 'Review copy, resolve findings, and move approvals forward.'}</p>
        {message && <p className="auth-notice" role="status">{message}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {!isRegister && (
          <div className="demo-login-actions" aria-label="Demo accounts">
            <button className="button-secondary button-small" onClick={() => chooseDemoAccount('reviewer@nimbusnotes.demo')} type="button">Use demo reviewer</button>
            <button className="button-secondary button-small" onClick={() => chooseDemoAccount('approver@nimbusnotes.demo')} type="button">Use demo approver</button>
          </div>
        )}
        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegister && <><label className="field-label" htmlFor="auth-name">Name</label><input autoComplete="name" className="text-input single-line" id="auth-name" maxLength={80} onChange={(event) => setName(event.target.value)} required value={name} /></>}
          <label className="field-label" htmlFor="auth-email">Email</label>
          <input autoComplete="email" className="text-input single-line" id="auth-email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          <label className="field-label" htmlFor="auth-password">Password</label>
          <input autoComplete={isRegister ? 'new-password' : 'current-password'} className="text-input single-line" id="auth-password" minLength={isRegister ? 8 : undefined} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          <button className="button-primary auth-submit" disabled={loading} type="submit">
            {loading ? <><LoaderCircle className="animate-spin" size={16} /> {isRegister ? 'Creating account' : 'Signing in'}</> : <>{isRegister ? 'Create reviewer account' : 'Sign in'} <ArrowRight size={15} /> </>}
          </button>
        </form>
        <p className="auth-switch">{isRegister ? 'Already have an account?' : 'New to BrandGuard?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link></p>
        <p className="auth-footnote"><ShieldCheck size={14} /> Your password is never saved by BrandGuard.</p>
      </section>
    </main>
  )
}

export default AuthPage
