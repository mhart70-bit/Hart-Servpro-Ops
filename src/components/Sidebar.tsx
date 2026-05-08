import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  MapPin,
  Users,
  Mic,
  TrendingUp,
  BarChart2,
  LogOut,
  BookOpen,
  CalendarDays,
  BookOpenCheck,
  ShieldAlert,
  UserCog,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getInitials } from '@/lib/utils'

const REP_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/log', label: 'Submit a Note', icon: Mic },
  { to: '/ledger', label: 'Master Ledger', icon: BookOpen },
  { to: '/weekly', label: 'Weekly Summary', icon: CalendarDays },
  { to: '/guide', label: 'Quick Guide', icon: BookOpenCheck },
]

const ROUTE_NAV = [
  { to: '/route', label: 'My Route', icon: MapPin },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/sales', label: 'Sales Pipeline', icon: TrendingUp },
]

const ADMIN_NAV = [
  { to: '/markets', label: 'Markets', icon: BarChart2 },
  { to: '/flagged', label: 'Flagged Queue', icon: ShieldAlert },
  { to: '/team', label: 'Team', icon: UserCog },
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

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
      isActive
        ? 'bg-primary/15 text-primary font-medium'
        : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-white/5'
    }`

  return (
    <nav className="h-full bg-sidebar flex flex-col border-r border-white/[0.07]">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-white/[0.07]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-primary flex items-center justify-center flex-shrink-0">
            <span className="text-primary-foreground text-xs font-bold">H</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground leading-tight">Hart SERVPRO</div>
            <div className="text-[10px] text-white/40 uppercase tracking-widest">Sales OS</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
        {/* Primary nav */}
        {REP_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={onClose} className={navLinkClass}>
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}

        {/* CRM tools divider */}
        <div className="pt-3 pb-1 px-3">
          <span className="text-[9px] text-white/25 uppercase tracking-widest">CRM tools</span>
        </div>
        {ROUTE_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={onClose} className={navLinkClass}>
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}

        {/* Admin divider */}
        {(isOwner || isGM) && (
          <>
            <div className="pt-3 pb-1 px-3">
              <span className="text-[9px] text-white/25 uppercase tracking-widest">Admin</span>
            </div>
            {ADMIN_NAV.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} onClick={onClose} className={navLinkClass}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </NavLink>
            ))}
          </>
        )}
      </div>

      {/* User footer */}
      <div className="px-4 py-3 border-t border-white/[0.07]">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-medium text-primary">
              {getInitials(profile?.full_name)}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-foreground truncate">{profile?.full_name ?? 'User'}</div>
            <div className="text-[10px] text-white/40 capitalize">{profile?.role}</div>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </nav>
  )
}
