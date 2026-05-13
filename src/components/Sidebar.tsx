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
  AlertTriangle,
  Activity,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getInitials } from '@/lib/utils'

const REP_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/log',       label: 'Log Activity', icon: Mic },
  { to: '/ledger',    label: 'Master Ledger', icon: BookOpen },
  { to: '/weekly',    label: 'Weekly Summary', icon: CalendarDays },
  { to: '/guide',     label: 'Quick Guide', icon: BookOpenCheck },
]

const ROUTE_NAV = [
  { to: '/route',    label: 'My Route', icon: MapPin },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/sales',    label: 'Sales Pipeline', icon: TrendingUp },
]

const ADMIN_NAV = [
  { to: '/markets',       label: 'Markets',       icon: BarChart2 },
  { to: '/flagged',       label: 'Flagged Queue', icon: ShieldAlert },
  { to: '/team',          label: 'Team',          icon: UserCog },
  { to: '/rep-activity',  label: 'Rep Activity',  icon: Activity },
  { to: '/alerts',        label: 'Alerts',        icon: AlertTriangle },
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
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
      isActive
        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
        : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60'
    }`

  const locationLabel = isOwner ? 'All markets' : (profile?.location?.name ?? 'Unassigned')

  return (
    <nav className="h-full bg-sidebar flex flex-col border-r border-sidebar-border">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-sidebar-border">
        <div className="text-base font-semibold text-sidebar-foreground leading-tight">Sales OS</div>
        <div className="text-[10px] text-sidebar-foreground/35 uppercase tracking-widest mt-0.5">SERVPRO · TEXAS</div>
      </div>

      {/* Nav */}
      <div className="flex-1 px-3 py-3 overflow-y-auto space-y-0.5">
        {/* Primary nav */}
        {REP_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={onClose} className={navLinkClass}>
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}

        {/* CRM Tools divider */}
        <div className="pt-4 pb-1 px-3">
          <span className="text-[9px] text-sidebar-foreground/30 uppercase tracking-widest">CRM Tools</span>
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
            <div className="pt-4 pb-1 px-3">
              <span className="text-[9px] text-sidebar-foreground/30 uppercase tracking-widest">Admin</span>
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
      <div className="px-4 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-medium text-sidebar-foreground">
              {getInitials(profile?.full_name)}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-sidebar-foreground truncate">{profile?.full_name ?? 'User'}</div>
            <div className="text-[10px] text-sidebar-foreground/40 capitalize">
              {profile?.role} · {locationLabel}
            </div>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs text-sidebar-foreground/40 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </nav>
  )
}
