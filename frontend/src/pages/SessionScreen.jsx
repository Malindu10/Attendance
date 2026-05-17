import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { sessionsAPI } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import ScanScreen   from './ScanScreen'
import RegisterTab  from './RegisterTab'
import StatsTab     from './StatsTab'

// Tab bar icons (inline SVG — no external deps needed)
const icons = {
  scan: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
      <circle cx={12} cy={12} r={3}/>
    </svg>
  ),
  register: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  ),
  stats: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <rect x={18} y={3} width={4} height={18} rx={1}/><rect x={10} y={8} width={4} height={13} rx={1}/>
      <rect x={2} y={13} width={4} height={8} rx={1}/>
    </svg>
  ),
}

const TABS = [
  { id: 'scan',     label: 'Scan',     icon: icons.scan },
  { id: 'register', label: 'Register', icon: icons.register },
  { id: 'stats',    label: 'Stats',    icon: icons.stats },
]

export default function SessionScreen() {
  const { state } = useLocation()
  const { coach } = useAuth()
  const navigate  = useNavigate()

  const [activeTab, setActiveTab]   = useState('scan')
  const [sessionData, setSessionData] = useState(state?.session)
  const [students, setStudents]     = useState(state?.session?.expected_squad ?? [])
  const [presentIds, setPresentIds] = useState(new Set())
  const [guestCount, setGuestCount] = useState(0)

  useEffect(() => {
    if (!state?.session) navigate('/session-setup', { replace: true })
  }, [])

  // Load register on first visit to that tab
  const refreshRegister = useCallback(async () => {
    if (!sessionData?.session_id) return
    try {
      const { data } = await sessionsAPI.register(sessionData.session_id)
      setStudents(data.students)
      setPresentIds(new Set(
        data.students.filter(s => s.present).map(s => s.id)
      ))
      setGuestCount(data.guest_count)
      setSessionData(prev => ({ ...prev, scan_count: data.scan_count }))
    } catch {}
  }, [sessionData?.session_id])

  // Called by ScanScreen when a student is confirmed
  const handleAttendanceUpdate = useCallback((studentId) => {
    if (studentId === 'guest') {
      setGuestCount(n => n + 1)
      return
    }
    setPresentIds(prev => new Set([...prev, studentId]))
    setStudents(prev => prev.map(s =>
      s.id === studentId ? { ...s, present: true } : s
    ))
    setSessionData(prev => ({ ...prev, scan_count: (prev?.scan_count ?? 0) + 1 }))
  }, [])

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab)
    if (tab === 'register' || tab === 'stats') refreshRegister()
  }, [refreshRegister])

  // Session info bar
  const group    = students[0]?.age_group ?? '—'
  const sessType = sessionData?.session_type ?? '—'
  const time     = sessionData?.started_at
    ? new Date(sessionData.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        padding: '12px 16px',
        paddingTop: `calc(12px + env(safe-area-inset-top))`,
        background: '#fff',
        borderBottom: '0.5px solid rgba(0,0,0,0.1)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1c1c1e' }}>
              ⚽ {sessType} · {group}
            </div>
            <div style={{ fontSize: 12, color: '#8e8e93', marginTop: 2 }}>
              {coach?.name} · Started {time}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: '#1D9E75', fontWeight: 600 }}>
              {presentIds.size}/{students.length}
            </span>
            <span style={{ fontSize: 11, color: '#8e8e93' }}>present</span>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'scan' && (
          <ScanScreen
            sessionData={sessionData}
            onAttendanceUpdate={handleAttendanceUpdate}
          />
        )}
        {activeTab === 'register' && (
          <RegisterTab
            sessionId={sessionData?.session_id}
            presentIds={presentIds}
            onToggle={(id, isPresent) => {
              setPresentIds(prev => {
                const next = new Set(prev)
                isPresent ? next.add(id) : next.delete(id)
                return next
              })
            }}
          />
        )}
        {activeTab === 'stats' && (
          <StatsTab
            sessionData={sessionData}
            students={students}
            presentIds={presentIds}
            guestCount={guestCount}
          />
        )}
      </div>

      {/* Bottom tab bar */}
      <nav className="tab-bar" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
