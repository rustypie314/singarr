import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useEffect, useState } from 'react'
import axios from 'axios'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import Login from './pages/Login.jsx'
import Home from './pages/Home.jsx'
import Requests from './pages/Requests.jsx'
import Issues from './pages/Issues.jsx'
import Admin from './pages/Admin.jsx'
import SetupWizard from './pages/SetupWizard.jsx'
import Layout from './components/Layout.jsx'

function ProtectedRoute({ children, adminOnly }) {
  const { user, loading } = useAuth()
  if (loading) return <AppLoader />
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && !user.isAdmin) return <Navigate to="/" replace />
  return children
}

function AppLoader() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg-base)', color:'var(--text-muted)', fontFamily:'var(--font-sans)', gap:12 }}>
      <div style={{ width:20, height:20, border:'2px solid var(--border-strong)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
      Loading…
    </div>
  )
}

function AppRoutes({ setupComplete, onSetupComplete }) {
  const { user } = useAuth()
  if (!setupComplete) return <SetupWizard onComplete={onSetupComplete} />
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Home />} />
        <Route path="requests" element={<Requests />} />
        <Route path="issues"   element={<Issues />} />
        <Route path="admin"    element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function AppWithSetup() {
  const [setupComplete, setSetupComplete] = useState(null)
  useEffect(() => {
    axios.get('/api/setup/status')
      .then(r => setSetupComplete(r.data.setupComplete))
      .catch(() => setSetupComplete(false))
  }, [])
  if (setupComplete === null) return <AppLoader />
  return (
    <BrowserRouter>
      <AppRoutes setupComplete={setupComplete} onSetupComplete={() => setSetupComplete(true)} />
      <Toaster position="bottom-right" toastOptions={{
        style: { background:'var(--bg-elevated)', color:'var(--text-primary)', border:'1px solid var(--border)', fontFamily:'var(--font-sans)', fontSize:'14px' },
        success: { iconTheme: { primary:'var(--accent)', secondary:'var(--bg-elevated)' } },
        error:   { iconTheme: { primary:'#ef4444', secondary:'var(--bg-elevated)' } },
      }} />
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppWithSetup />
      </AuthProvider>
    </ThemeProvider>
  )
}
