import { createContext, useContext, useState, useCallback } from 'react'
import { authAPI } from '../services/api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [coach, setCoach] = useState(() => {
    try { return JSON.parse(localStorage.getItem('coach')) } catch { return null }
  })

  const login = useCallback(async (email, pin) => {
    const { data } = await authAPI.login(email, pin)
    localStorage.setItem('token', data.token)
    localStorage.setItem('coach', JSON.stringify(data.coach))
    setCoach(data.coach)
    return data.coach
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('coach')
    setCoach(null)
  }, [])

  return (
    <AuthCtx.Provider value={{ coach, login, logout, isAdmin: coach?.role === 'admin' }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
