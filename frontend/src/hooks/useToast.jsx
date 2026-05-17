import { useState, useCallback, useRef } from 'react'

export function useToast() {
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' })
  const timer = useRef(null)

  const showToast = useCallback((message, type = 'success', duration = 2500) => {
    clearTimeout(timer.current)
    setToast({ show: true, message, type })
    timer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), duration)
  }, [])

  const Toast = () => (
    <div className={`toast ${toast.type} ${toast.show ? 'show' : ''}`}>
      {toast.message}
    </div>
  )

  return { showToast, Toast }
}
