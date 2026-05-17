import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { setupAPI, sessionsAPI } from '../services/api'
import { useAuth } from '../hooks/useAuth'

export default function SessionSetup() {
  const { coach, logout } = useAuth()
  const navigate = useNavigate()

  const [setup, setSetup]       = useState({ age_groups: [], locations: [] })
  const [ageGroup, setAgeGroup] = useState(null)
  const [location, setLocation] = useState(null)
  const [sessType, setSessType] = useState('Training')
  const [loading, setLoading]   = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError]       = useState('')

  const SESSION_TYPES = ['Training', 'Match', 'Fitness']

  useEffect(() => {
    setupAPI.getSetup()
      .then(r => setSetup(r.data))
      .catch(() => setError('Failed to load setup data. Check your connection.'))
      .finally(() => setLoading(false))
  }, [])

  // Auto-select suggested location when age group changes
  useEffect(() => {
    if (!ageGroup) return
    const grp = setup.age_groups.find(g => g.id === ageGroup)
    if (!grp) return
    const loc = setup.locations.find(l => l.default_group === grp.id)
    if (loc) setLocation(loc.id)
  }, [ageGroup, setup])

  async function startSession() {
    if (!ageGroup || !location || !sessType) return
    setStarting(true)
    setError('')
    try {
      const { data } = await sessionsAPI.start({
        age_group_id: ageGroup,
        location_id:  location,
        session_type: sessType,
      })
      navigate('/session', { state: { session: data }, replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not start session. Try again.')
      setStarting(false)
    }
  }

  const canStart = ageGroup && location && sessType

  if (loading) return <div style={centreStyle}>Loading…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#f2f2f7' }}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: '#1c1c1e' }}>⚽ Academy Attendance</div>
          <div style={{ fontSize: 12, color: '#8e8e93', marginTop: 2 }}>
            {coach?.name} · {new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'short' })}
          </div>
        </div>
        <button onClick={logout} style={{ fontSize: 13, color: '#8e8e93', padding: '8px 0' }}>
          Sign out
        </button>
      </div>

      <div className="scroll-content" style={{ paddingBottom: 32 }}>
        <div style={{ padding: '16px 16px 0' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1c1c1e', marginBottom: 4 }}>
            Start a session
          </h2>
          <p style={{ fontSize: 13, color: '#8e8e93' }}>Select the group, location and session type.</p>
        </div>

        {/* Age group */}
        <div style={{ padding: '16px 16px 0' }}>
          <div className="section-label" style={{ padding: 0, marginBottom: 10 }}>Age group</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {setup.age_groups.map(g => (
              <button
                key={g.id}
                className={`pill ${ageGroup === g.id ? 'selected' : ''}`}
                onClick={() => setAgeGroup(g.id)}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div style={{ padding: '16px 16px 0' }}>
          <div className="section-label" style={{ padding: 0, marginBottom: 10 }}>Location</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {setup.locations.map(l => (
              <button
                key={l.id}
                className={`pill ${location === l.id ? 'selected' : ''}`}
                onClick={() => setLocation(l.id)}
              >
                {l.name}
              </button>
            ))}
          </div>
        </div>

        {/* Session type */}
        <div style={{ padding: '16px 16px 0' }}>
          <div className="section-label" style={{ padding: 0, marginBottom: 10 }}>Session type</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {SESSION_TYPES.map(t => (
              <button
                key={t}
                className={`pill ${sessType === t ? 'selected' : ''}`}
                onClick={() => setSessType(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="error-banner" style={{ margin: '16px 16px 0', borderRadius: 10 }}>
            <span>⚠️</span> {error}
          </div>
        )}

        <div style={{ padding: '20px 16px 0' }}>
          <button
            className="btn-primary"
            disabled={!canStart || starting}
            onClick={startSession}
          >
            {starting ? 'Starting…' : '▶ Start session'}
          </button>
        </div>
      </div>
    </div>
  )
}

const headerStyle = {
  padding: '14px 16px',
  background: '#fff',
  borderBottom: '0.5px solid rgba(0,0,0,0.1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingTop: `calc(14px + env(safe-area-inset-top))`,
}

const centreStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  minHeight: '100dvh', color: '#8e8e93', fontSize: '0.9375rem',
}
