import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useCamera } from '../hooks/useCamera'
import { useToast } from '../hooks/useToast'
import { attendanceAPI } from '../services/api'

export default function ScanScreen({ sessionData, onAttendanceUpdate }) {
  const { videoRef, active, cooldown, startCamera, stopCamera, captureFrame } = useCamera()
  const { showToast, Toast } = useToast()

  const [ovalState, setOvalState]   = useState('idle')      // idle|scanning|matched|unknown
  const [scanning, setScanning]     = useState(false)
  const [match, setMatch]           = useState(null)         // {student, confidence}
  const [showUnknown, setShowUnknown] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [cameraError, setCameraError] = useState('')

  const scansUsed      = sessionData?.scan_count ?? 0
  const scansLimit     = sessionData?.scan_limit  ?? 60
  const scansRemaining = Math.max(0, scansLimit - scansUsed)
  const pct            = Math.round((scansUsed / scansLimit) * 100)
  const barClass       = pct < 70 ? 'ok' : pct < 90 ? 'warning' : 'danger'

  useEffect(() => {
    let mounted = true
    startCamera().catch(e => {
      if (mounted) setCameraError(e.message)
    })
    return () => {
      mounted = false
      stopCamera()
    }
  }, [])

  const doScan = useCallback(async () => {
    if (scanning || cooldown > 0) return
    if (scansRemaining <= 0) {
      showToast('Session scan limit reached. Close and reopen if needed.', 'warning', 4000)
      return
    }

    setScanning(true)
    setOvalState('scanning')
    setMatch(null)
    setShowUnknown(false)

    try {
      const blob = await captureFrame()
      const { data } = await attendanceAPI.scan(sessionData.session_id, blob)

      if (data.matched) {
        setMatch({ student: data.student, confidence: data.confidence, alreadyMarked: data.already_marked })
        setOvalState('matched')
        if (data.already_marked) {
          showToast(`${data.student.name} already marked present`, 'warning')
        }
      } else {
        setOvalState('unknown')
        setShowUnknown(true)
      }
    } catch (err) {
      const detail = err.response?.data?.detail
      const code   = typeof detail === 'object' ? detail?.code : null
      const msg    = typeof detail === 'object' ? detail?.message : detail

      if (code === 'COOLDOWN' || code === 'RATE_LIMIT_MINUTE') {
        showToast(msg || 'Too many scans — wait a moment.', 'warning')
      } else if (code === 'SESSION_CLOSED') {
        showToast('Session is closed.', 'error')
      } else if (code === 'MONTHLY_LIMIT') {
        showToast('Monthly limit reached. Contact admin.', 'error', 5000)
      } else {
        showToast(msg || 'Scan failed. Try again.', 'error')
      }
      setOvalState('idle')
    } finally {
      setScanning(false)
    }
  }, [scanning, cooldown, scansRemaining, captureFrame, sessionData])

  async function confirmAttendance() {
    if (!match || confirming) return
    setConfirming(true)
    try {
      await attendanceAPI.confirm(sessionData.session_id, match.student.id, match.confidence)
      showToast(`${match.student.name} marked present ✓`, 'success')
      onAttendanceUpdate?.(match.student.id)
      setMatch(null)
      setOvalState('idle')
    } catch (err) {
      showToast(err.response?.data?.detail || 'Could not confirm. Try again.', 'error')
    } finally {
      setConfirming(false)
    }
  }

  async function markGuest() {
    try {
      await attendanceAPI.markGuest(sessionData.session_id)
      showToast('Guest logged ✓', 'success')
      onAttendanceUpdate?.('guest')
    } catch {}
    setShowUnknown(false)
    setOvalState('idle')
  }

  function rescan() {
    setMatch(null)
    setShowUnknown(false)
    setOvalState('idle')
  }

  const confClass = match?.confidence >= 88 ? 'high' : match?.confidence >= 75 ? 'medium' : 'low'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toast />

      {/* Scan limit bar */}
      <div style={{ padding: '8px 16px 6px', background: '#fff',
                    borderBottom: '0.5px solid rgba(0,0,0,0.07)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between',
                      fontSize: 11, color: '#8e8e93', marginBottom: 5 }}>
          <span>Scans used this session</span>
          <span style={{ color: scansRemaining < 10 ? '#E24B4A' : '#8e8e93',
                         fontWeight: scansRemaining < 10 ? 600 : 400 }}>
            {scansUsed} / {scansLimit} ({scansRemaining} left)
          </span>
        </div>
        <div className="limit-bar-track">
          <div className={`limit-bar-fill ${barClass}`} style={{ width: `${Math.min(pct,100)}%` }} />
        </div>
      </div>

      {/* Camera */}
      <div className="camera-wrap">
        {cameraError ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', height: '100%', gap: 12, padding: 24, color: '#fff' }}>
            <span style={{ fontSize: 40 }}>📷</span>
            <p style={{ textAlign: 'center', fontSize: 14 }}>{cameraError}</p>
          </div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted />
        )}

        {/* Face oval guide */}
        <div className="face-guide">
          <div className={`face-oval ${ovalState}`}>
            <div className={`scan-line ${scanning ? 'active' : ''}`} />
          </div>
        </div>

        {/* Status chip */}
        <div className="cam-status">
          {scanning
            ? 'Scanning…'
            : cooldown > 0
            ? `Wait ${cooldown}s`
            : ovalState === 'matched'
            ? 'Face matched!'
            : ovalState === 'unknown'
            ? 'No match found'
            : active
            ? 'Position face in oval'
            : 'Starting camera…'
          }
        </div>
      </div>

      {/* Scroll area */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>

        {/* Matched card */}
        {match && !match.alreadyMarked && (
          <div style={{ margin: '12px 14px 0' }} className="card">
            <div style={{ padding: '14px 14px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="avatar avatar-green"
                   style={{ width: 52, height: 52, fontSize: 17 }}>
                {match.student.initials}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '1.0625rem', fontWeight: 600, color: '#1c1c1e' }}>
                  {match.student.name}
                </div>
                <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 2 }}>
                  {match.student.position}
                  {match.student.jersey_number ? ` · #${match.student.jersey_number}` : ''}
                  {' · '}{match.student.age_group}
                </div>
              </div>
              <span className={match.student.is_regular ? 'tag-regular' : 'tag-occasional'}>
                {match.student.is_regular ? 'Regular' : 'Occasional'}
              </span>
            </div>

            {/* Confidence */}
            <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: '#8e8e93', width: 72, flexShrink: 0 }}>Confidence</span>
              <div className="conf-track">
                <div className={`conf-fill ${confClass}`}
                     style={{ width: `${match.confidence}%` }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1c1c1e',
                             width: 36, textAlign: 'right' }}>
                {match.confidence}%
              </span>
            </div>

            {!match.student.is_regular && (
              <div className="warning-banner" style={{ margin: '0 14px', borderRadius: 8 }}>
                <span>⚠️</span>
                <span>Occasional player — please verify identity carefully before confirming.</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, padding: '12px 14px 14px' }}>
              <button className="btn-confirm" onClick={confirmAttendance} disabled={confirming}>
                {confirming ? 'Saving…' : '✓ Confirm present'}
              </button>
              <button className="btn-rescan" onClick={rescan}>↺ Rescan</button>
            </div>
          </div>
        )}

        {/* Already marked */}
        {match?.alreadyMarked && (
          <div style={{ margin: '12px 14px 0' }} className="card">
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#1c1c1e', marginBottom: 4 }}>
                {match.student.name} — already marked ✓
              </div>
              <div style={{ fontSize: 13, color: '#8e8e93' }}>
                This student is already present for this session.
              </div>
              <button className="btn-secondary" onClick={rescan} style={{ marginTop: 12 }}>
                ↺ Scan next player
              </button>
            </div>
          </div>
        )}

        {/* Unknown face */}
        {showUnknown && (
          <div style={{ margin: '12px 14px 0', background: '#FCEBEB',
                        borderRadius: 16, padding: 14, border: '0.5px solid #F7C1C1' }}>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#A32D2D', marginBottom: 4 }}>
              Face not recognised
            </div>
            <div style={{ fontSize: 13, color: '#791F1F', marginBottom: 14 }}>
              This person isn't in the system. They may be a guest or a new player.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-confirm"
                      style={{ background: '#A32D2D' }}
                      onClick={markGuest}>
                + Mark as guest
              </button>
              <button className="btn-rescan" onClick={rescan}>↺ Rescan</button>
            </div>
          </div>
        )}

        {/* Scan button */}
        <div style={{ padding: '12px 14px 8px' }}>
          <button
            className="btn-primary"
            onClick={doScan}
            disabled={scanning || cooldown > 0 || scansRemaining <= 0 || !!cameraError}
          >
            {scanning
              ? 'Scanning…'
              : cooldown > 0
              ? `Wait ${cooldown}s`
              : scansRemaining <= 0
              ? 'Scan limit reached'
              : '⊙ Scan player'
            }
          </button>
        </div>

        {scansRemaining <= 10 && scansRemaining > 0 && (
          <div className="warning-banner" style={{ margin: '0 14px', borderRadius: 10 }}>
            <span>⚠️</span>
            <span>Only {scansRemaining} scan{scansRemaining !== 1 ? 's' : ''} remaining this session.</span>
          </div>
        )}
        {scansRemaining === 0 && (
          <div className="error-banner" style={{ margin: '0 14px', borderRadius: 10 }}>
            <span>🚫</span>
            <span>Session scan limit reached. Use the Register tab to mark students manually.</span>
          </div>
        )}
      </div>
    </div>
  )
}
