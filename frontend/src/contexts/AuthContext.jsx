import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext()

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use(config => {
  const token = localStorage.getItem('singarr-token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('singarr-token')
    if (!token) { setLoading(false); return }
    api.get('/auth/me')
      .then(r => setUser(r.data))
      .catch(() => localStorage.removeItem('singarr-token'))
      .finally(() => setLoading(false))
  }, [])

  const login = (token, userData) => {
    localStorage.setItem('singarr-token', token)
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('singarr-token')
    setUser(null)
  }

  const refreshUser = () =>
    api.get('/auth/me').then(r => setUser(r.data)).catch(() => {})

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, api }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
