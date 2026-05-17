import { useState, useEffect } from 'react'
import { sessionsAPI, attendanceAPI } from '../services/api'
import { useToast } from '../hooks/useToast'

export default function RegisterTab({ sessionId, presentIds, onToggle }) {
  const { showToast, Toast } = useToast()
  const [students, setStudents] = useState([])
  const [filter, setFilter]     = useState('all')   // all | regular | occasional
  const [loading, setLoading]   = useState(true)
  const [toggling, setToggling] = useState(null)     // student id being toggled

  useEffect(() => {
    sessionsAPI.register(sessionId)
      .then(r => setStudents(r.data.students))
      .catch(() => showToast('Failed to load register', 'error'))
      .finally(() => setLoading(false))
  }, [sessionId])

  async function toggle(student) {
    if (toggling) return
    setToggling(student.id)
    try {
      const { data } = await attendanceAPI.manual(sessionId, student.id)
      onToggle?.(student.id, data.present)
      setStudents(prev =>
        prev.map(s => s.id === student.id ? { ...s, present: data.present } : s)
      )
      showToast(
        data.present ? `${student.name} marked present` : `${student.name} removed`,
        data.present ? 'success' : 'warning'
      )
    } catch {
      showToast('Could not update. Try again.', 'error')
    } finally {
      setToggling(null)
    }
  }

  const visible = students.filter(s => {
    if (filter === 'regular')    return s.is_regular
    if (filter === 'occasional') return !s.is_regular
    return true
  })

  const presentCount    = students.filter(s => s.present).length
  const totalCount      = students.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toast />

      {/* Summary bar */}
      <div style={{ padding: '10px 16px', background: '#fff',
                    borderBottom: '0.5px solid rgba(0,0,0,0.07)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, color: '#8e8e93' }}>
          <span style={{ color: '#1D9E75', fontWeight: 600 }}>{presentCount}</span>
          /{totalCount} present
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all','regular','occasional'].map(f => (
            <button
              key={f}
              className={`pill ${filter === f ? 'selected' : ''}`}
              style={{ padding: '5px 12px', fontSize: 12, minHeight: 32 }}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#8e8e93', fontSize: 14 }}>
            Loading register…
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#8e8e93', fontSize: 14 }}>
            No students in this group.
          </div>
        ) : (
          <div className="card" style={{ margin: 12, borderRadius: 16 }}>
            {visible.map((s, i) => (
              <button
                key={s.id}
                onClick={() => toggle(s)}
                disabled={toggling === s.id}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', background: 'transparent', textAlign: 'left',
                  borderBottom: i < visible.length - 1 ? '0.5px solid rgba(0,0,0,0.07)' : 'none',
                  opacity: toggling === s.id ? 0.5 : 1,
                  minHeight: 60,
                }}
              >
                <div
                  className={`avatar ${s.present ? 'avatar-green' : 'avatar-gray'}`}
                  style={{ width: 38, height: 38, fontSize: 13, fontWeight: 600,
                           transition: 'background 0.2s' }}
                >
                  {s.name.split(' ').map(p => p[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 500,
                                color: '#1c1c1e', whiteSpace: 'nowrap',
                                overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.name}
                  </div>
                  <div style={{ fontSize: 12, color: '#8e8e93', marginTop: 1 }}>
                    {s.position}
                    {s.jersey_number ? ` · #${s.jersey_number}` : ''}
                  </div>
                </div>
                <span className={s.is_regular ? 'tag-regular' : 'tag-occasional'}
                      style={{ flexShrink: 0, marginRight: 8 }}>
                  {s.is_regular ? 'Regular' : 'Occasional'}
                </span>
                <span className={s.present ? 'tag-present' : 'tag-absent'} style={{ flexShrink: 0 }}>
                  {s.present ? 'Present' : 'Absent'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
