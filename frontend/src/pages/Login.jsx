import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { login } = useAuth()
  const navigate  = useNavigate()
  const [email, setEmail]   = useState('')
  const [pin, setPin]       = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    if (!email || pin.length < 4) {
      setError('Enter your email and PIN.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await login(email, pin)
      navigate('/session-setup', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Check your email and PIN.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh',
                  padding: '0 24px', justifyContent: 'center', background: '#fff' }}>
      {/* Logo area */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ width: 72, height: 72, background: '#185FA5', borderRadius: 20,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 16px', fontSize: 36 }}>
          ⚽
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1c1c1e' }}>Academy Attendance</h1>
        <p style={{ color: '#8e8e93', marginTop: 6, fontSize: '0.9375rem' }}>
          Sign in to start taking attendance
        </p>
      </div>

      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#3a3a3c', display: 'block', marginBottom: 6 }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="coach@academy.com"
            autoComplete="email"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#3a3a3c', display: 'block', marginBottom: 6 }}>
            PIN
          </label>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g,''))}
            placeholder="4–6 digit PIN"
            autoComplete="current-password"
            style={inputStyle}
          />
        </div>

        {error && (
          <div className="error-banner" style={{ borderRadius: 10, marginTop: 2 }}>
            <span>⚠️</span> {error}
          </div>
        )}

        <button
          type="submit"
          className="btn-primary"
          disabled={loading}
          style={{ marginTop: 8 }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p style={{ textAlign: 'center', fontSize: 12, color: '#aeaeb2', marginTop: 32 }}>
        Contact your administrator if you need access.
      </p>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '13px 14px',
  fontSize: '1rem',
  borderRadius: 12,
  border: '1px solid #d1d1d6',
  outline: 'none',
  background: '#f9f9f9',
  color: '#1c1c1e',
  WebkitAppearance: 'none',
}
