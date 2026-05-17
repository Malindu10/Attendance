import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { sessionsAPI } from '../services/api'
import { useToast } from '../hooks/useToast'

export default function StatsTab({ sessionData, students, presentIds, guestCount }) {
  const navigate    = useNavigate()
  const { showToast, Toast } = useToast()
  const [closing, setClosing] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const total      = students.length
  const present    = students.filter(s => presentIds.has(s.id)).length
  const pct        = total > 0 ? Math.round((present / total) * 100) : 0
  const scansUsed  = sessionData?.scan_count ?? 0
  const scansLimit = sessionData?.scan_limit  ?? 60

  async function closeSession() {
    setClosing(true)
    try {
      await sessionsAPI.close(sessionData.session_id)
      showToast('Session closed ✓', 'success')
      setTimeout(() => navigate('/session-setup', { replace: true }), 1000)
    } catch {
      showToast('Could not close session. Try again.', 'error')
      setClosing(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toast />
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '12px 14px' }}>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div className="stat-card">
            <div className="stat-num" style={{ color: '#1D9E75' }}>{present}</div>
            <div className="stat-label">Present</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{total}</div>
            <div className="stat-label">Expected</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: pct >= 80 ? '#1D9E75' : pct >= 60 ? '#EF9F27' : '#E24B4A' }}>
              {pct}%
            </div>
            <div className="stat-label">Attendance</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{guestCount}</div>
            <div className="stat-label">Guests</div>
          </div>
        </div>

        {/* Scan usage */}
        <div className="card" style={{ padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1c1c1e' }}>Scan usage</span>
            <span style={{ fontSize: 13, color: '#8e8e93' }}>{scansUsed} / {scansLimit}</span>
          </div>
          <div className="limit-bar-track">
            <div
              className={`limit-bar-fill ${
                scansUsed/scansLimit < 0.7 ? 'ok' : scansUsed/scansLimit < 0.9 ? 'warning' : 'danger'
              }`}
              style={{ width: `${Math.min(100, Math.round(scansUsed/scansLimit*100))}%` }}
            />
          </div>
          <div style={{ fontSize: 11, color: '#8e8e93', marginTop: 5 }}>
            {scansLimit - scansUsed} scans remaining in this session
          </div>
        </div>

        {/* Register list */}
        <div style={{ fontSize: 12, fontWeight: 600, color: '#8e8e93',
                      textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Session register
        </div>
        <div className="card" style={{ marginBottom: 14 }}>
          {students.map((s, i) => {
            const isPresent = presentIds.has(s.id)
            return (
              <div key={s.id} className="list-item"
                   style={{ borderBottom: i < students.length - 1 ? '0.5px solid rgba(0,0,0,0.07)' : 'none' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                              background: isPresent ? '#1D9E75' : '#d1d1d6' }} />
                <div style={{ flex: 1, fontSize: '0.9375rem', color: '#1c1c1e' }}>{s.name}</div>
                <span className={s.is_regular ? 'tag-regular' : 'tag-occasional'} style={{ marginRight: 8 }}>
                  {s.is_regular ? 'Regular' : 'Occasional'}
                </span>
                <span className={isPresent ? 'tag-present' : 'tag-absent'}>
                  {isPresent ? 'Present' : 'Absent'}
                </span>
              </div>
            )
          })}
          {guestCount > 0 && (
            <div className="list-item">
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1D9E75' }} />
              <div style={{ flex: 1, fontSize: '0.9375rem', color: '#1c1c1e' }}>
                Guests (unnamed)
              </div>
              <span className="tag-present">{guestCount} present</span>
            </div>
          )}
        </div>

        {/* Close session */}
        {!confirm ? (
          <button className="btn-secondary" onClick={() => setConfirm(true)}>
            Close session
          </button>
        ) : (
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1c1c1e', marginBottom: 6 }}>
              Close this session?
            </div>
            <div style={{ fontSize: 13, color: '#8e8e93', marginBottom: 14 }}>
              No more scans can be made once closed. Attendance is saved.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-confirm" onClick={closeSession} disabled={closing}>
                {closing ? 'Closing…' : 'Yes, close'}
              </button>
              <button className="btn-rescan" onClick={() => setConfirm(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{ paddingBottom: 8 }} />
      </div>
    </div>
  )
}
