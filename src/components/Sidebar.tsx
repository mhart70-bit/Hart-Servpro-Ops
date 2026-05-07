import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  MapPin,
  Users,
  Mic,
  TrendingUp,
  BarChart2,
  LogOut,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getInitials } from '@/lib/utils'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/route', label: 'My Route', icon: MapPin },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/log', label: 'Log Activity', icon: Mic },
  { to: '/sales', label: 'Sales', icon: TrendingUp },
]

const OWNER_NAV = [
  { to: '/markets', label: 'Markets', icon: BarChart2 },
]

interface SidebarProps {
  onClose?: () => void
}

export default function Sidebar({ onClose }: SidebarProps) {
  const { profile, signOut, isOwner, isGM } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const allNav = [...NAV, ...((isOwner || isGM) ? OWNER_NAV : [])]

  return (
    <nav className="h-full bg-sidebar flex flex-col border-r border-border">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-primary flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">H</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground leading-tight">Hart SERVPRO</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Sales CRM</div>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <div className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {allNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </div>

      {/* User footer */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-medium text-muted-foreground">
              {getInitials(profile?.full_name)}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-foreground truncate">{profile?.full_name ?? 'User'}</div>
            <div className="text-[10px] text-muted-foreground capitalize">{profile?.role}</div>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </nav>
  )
}
