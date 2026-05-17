import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Login         from './pages/Login'
import SessionSetup  from './pages/SessionSetup'
import SessionScreen from './pages/SessionScreen'
import './index.css'

function Protected({ children }) {
  const { coach } = useAuth()
  return coach ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/session-setup" element={
            <Protected><SessionSetup /></Protected>
          }/>
          <Route path="/session" element={
            <Protected><SessionScreen /></Protected>
          }/>
          <Route path="*" element={<Navigate to="/session-setup" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
