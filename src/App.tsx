import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import MyRoute from '@/pages/MyRoute'
import Contacts from '@/pages/Contacts'
import LogActivity from '@/pages/LogActivity'
import Sales from '@/pages/Sales'
import Markets from '@/pages/Markets'
import Ledger from '@/pages/Ledger'
import WeeklySummary from '@/pages/WeeklySummary'
import QuickGuide from '@/pages/QuickGuide'
import FlaggedQueue from '@/pages/FlaggedQueue'
import Team from '@/pages/Team'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="log" element={<LogActivity />} />
          <Route path="ledger" element={<Ledger />} />
          <Route path="weekly" element={<WeeklySummary />} />
          <Route path="guide" element={<QuickGuide />} />
          <Route path="route" element={<MyRoute />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="sales" element={<Sales />} />
          <Route path="markets" element={<Markets />} />
          <Route path="flagged" element={<FlaggedQueue />} />
          <Route path="team" element={<Team />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
