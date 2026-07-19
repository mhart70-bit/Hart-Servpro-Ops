import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { X, ArrowRight, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

// ── Step definitions ──────────────────────────────────────────
// target = a [data-tour="…"] attribute on the real UI. If the element isn't
// on screen (mobile, empty state), the tooltip falls back to centered.

interface TourStep {
  route?: string
  target?: string
  title: string
  body: string
}

const REP_STEPS: TourStep[] = [
  {
    route: '/dashboard',
    title: 'Welcome to Hart Sales OS',
    body: 'This tool answers four questions every day: Who do I need to see? Who am I meeting? What happened? What’s next? This 2-minute tour walks you through all four.',
  },
  {
    route: '/dashboard',
    target: 'hitlist',
    title: '1 · Who do I need to see?',
    body: 'Your day starts here. Overdue contacts are at the top, then everyone due today. Tap a name to open their profile — or hover and hit Log the moment you’ve seen them.',
  },
  {
    route: '/dashboard',
    target: 'nav-route',
    title: 'Plan the drive',
    body: 'My Route sorts today’s visits by urgency so you can work them as a loop. Phone numbers are tap-to-call from the field.',
  },
  {
    route: '/dashboard',
    target: 'fab',
    title: '2 · What happened? Log it fast',
    body: 'The orange button opens Quick Log: pick the contact, tap the type, optionally add a note, done. Under 30 seconds — log it in the parking lot before you drive off.',
  },
  {
    route: '/log',
    target: 'log-input',
    title: 'Or just talk',
    body: 'On this page you can dictate a field note. Say Who, What, and When — "Met Sarah Chen at Westside, water loss, sending a $12k estimate, follow up Thursday" — and the AI fills in the CRM for you. You confirm before anything saves.',
  },
  {
    route: '/contacts',
    target: 'add-contact',
    title: '3 · Your book of contacts',
    body: 'Every referral partner lives here. Add a new COI with this button — name, company, type, done. The chips filter to Overdue or Due This Week when you’re planning.',
  },
  {
    route: '/contacts',
    title: '4 · What’s next? Always captured',
    body: 'When you log a visit, the follow-up date you set becomes the contact’s next due date — it will resurface on your dashboard automatically. Each contact’s profile also has a Next Step box: keep it filled and you’ll never wonder what to do next.',
  },
  {
    route: '/contacts',
    target: 'nav-sales',
    title: 'Track the jobs',
    body: 'When a visit turns into real work, My Pipeline tracks the job from emergency call to paid. Mention a dollar amount in a voice note and the deal is created for you.',
  },
  {
    title: 'That’s the whole system',
    body: 'See your people. Log it in seconds. Set the follow-up. Everything else takes care of itself. Relaunch this tour anytime from Quick Guide in the menu.',
  },
]

const ADMIN_STEPS: TourStep[] = [
  {
    route: '/dashboard',
    title: 'Welcome to Hart Sales OS',
    body: 'This is your command center. In 60 seconds you can read the state of all five markets — this short tour shows you where to look.',
  },
  {
    route: '/dashboard',
    target: 'markets',
    title: 'All five markets at a glance',
    body: 'Pipeline value and note volume per franchise, updated live. A quiet card is a market that needs a phone call.',
  },
  {
    route: '/dashboard',
    target: 'nav-alerts',
    title: 'Who’s slipping?',
    body: 'Alerts is your triage page: reps with no activity in 3+ days, overdue contacts grouped by rep, and deals stuck in a stage. If it’s on this page, it needs attention.',
  },
  {
    route: '/dashboard',
    target: 'nav-rep-activity',
    title: 'Accountability, sorted',
    body: 'Rep Activity ranks the team least-active-first, so problems surface at the top. Expand any rep for their recent notes and overdue list.',
  },
  {
    route: '/dashboard',
    target: 'nav-weekly',
    title: 'The weekly read',
    body: 'Weekly Summary rolls up notes, flagged entries, and reps at zero — your Monday-morning page. That’s the loop: markets, alerts, activity, weekly.',
  },
]

// ── Context ───────────────────────────────────────────────────

interface TourContextValue {
  startTour: () => void
  tourActive: boolean
}

const TourContext = createContext<TourContextValue>({ startTour: () => {}, tourActive: false })
export const useTour = () => useContext(TourContext)

export const TOUR_DONE_KEY = 'hart-tour-done'

// ── Provider + overlay ────────────────────────────────────────

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { profile, isOwner, isGM } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [stepIndex, setStepIndex] = useState<number | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const steps = isOwner || isGM ? ADMIN_STEPS : REP_STEPS
  const active = stepIndex !== null
  const step = active ? steps[stepIndex] : null

  const startTour = useCallback(() => setStepIndex(0), [])

  const endTour = useCallback(() => {
    setStepIndex(null)
    setRect(null)
    try { localStorage.setItem(TOUR_DONE_KEY, '1') } catch { /* private browsing */ }
  }, [])

  // Navigate to the step's route, then locate its target element
  useEffect(() => {
    if (!step) return
    if (step.route && location.pathname !== step.route) {
      navigate(step.route)
    }
    setRect(null)
    if (!step.target) return

    let tries = 0
    pollRef.current = setInterval(() => {
      tries++
      const el = document.querySelector(`[data-tour="${step.target}"]`)
      if (el) {
        const r = el.getBoundingClientRect()
        // Element must be actually on screen (sidebar links are off-canvas on mobile)
        if (r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth) {
          el.scrollIntoView({ block: 'nearest' })
          setRect(el.getBoundingClientRect())
          clearInterval(pollRef.current!)
          return
        }
      }
      if (tries > 20) clearInterval(pollRef.current!) // fall back to centered
    }, 150)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [step, location.pathname, navigate])

  // Escape closes
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') endTour() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, endTour])

  const isLast = active && stepIndex === steps.length - 1

  // Tooltip placement: under the target if room, else above, else centered
  const tooltipStyle: React.CSSProperties = rect
    ? {
        position: 'fixed',
        left: Math.min(Math.max(rect.left, 12), window.innerWidth - 332),
        top: rect.bottom + 340 < window.innerHeight ? rect.bottom + 12 : Math.max(rect.top - 250, 12),
      }
    : {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      }

  return (
    <TourContext.Provider value={{ startTour, tourActive: active }}>
      {children}
      {active && step && profile && (
        <div className="fixed inset-0 z-[60]" data-tour-overlay>
          {/* Dimmer with spotlight cutout around the target */}
          {rect ? (
            <div
              className="absolute rounded-xl transition-all duration-200 pointer-events-none"
              style={{
                left: rect.left - 6,
                top: rect.top - 6,
                width: rect.width + 12,
                height: rect.height + 12,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
                border: '2px solid var(--color-primary, #f97316)',
              }}
            />
          ) : (
            <div className="absolute inset-0 bg-black/65" />
          )}

          {/* Tooltip card */}
          <div
            style={tooltipStyle}
            className="w-80 max-w-[calc(100vw-24px)] bg-card border border-border rounded-2xl shadow-2xl p-5"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-[10px] uppercase tracking-widest text-primary font-semibold pt-1">
                Learn Hart Sales OS · {stepIndex! + 1}/{steps.length}
              </p>
              <button
                onClick={endTour}
                aria-label="Skip tour"
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <h3 className="text-lg font-serif font-semibold text-foreground mb-1.5">{step.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.body}</p>
            <div className="flex items-center justify-between">
              <button
                onClick={endTour}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip tour
              </button>
              <div className="flex items-center gap-2">
                {stepIndex! > 0 && (
                  <button
                    onClick={() => setStepIndex(i => (i ?? 1) - 1)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground border border-border rounded-full hover:text-foreground hover:border-foreground/30 transition-colors"
                  >
                    <ArrowLeft className="w-3 h-3" /> Back
                  </button>
                )}
                <button
                  onClick={() => (isLast ? endTour() : setStepIndex(i => (i ?? 0) + 1))}
                  className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors"
                >
                  {isLast ? 'Done' : 'Next'} {!isLast && <ArrowRight className="w-3 h-3" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </TourContext.Provider>
  )
}
