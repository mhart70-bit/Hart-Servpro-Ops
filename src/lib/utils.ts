import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isToday, isTomorrow, isPast, parseISO } from 'date-fns'
import type { DealStage, Priority } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = parseISO(dateStr)
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  return format(d, 'MMM d')
}

export function formatRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return formatDistanceToNow(parseISO(dateStr), { addSuffix: true })
}

export function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  return isPast(parseISO(dateStr))
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function fullName(contact: { first_name?: string | null; last_name?: string | null }): string {
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unnamed Contact'
}

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  emergency_call: 'Emergency Call',
  assessment: 'Assessment',
  estimate: 'Estimate',
  approved: 'Approved',
  job_start: 'Job Start',
  completion: 'Completion',
  invoiced: 'Invoiced',
  paid: 'Paid',
  lost: 'Lost',
}

export const DEAL_STAGE_ORDER: DealStage[] = [
  'emergency_call',
  'assessment',
  'estimate',
  'approved',
  'job_start',
  'completion',
  'invoiced',
  'paid',
]

export const PRIORITY_COLORS: Record<Priority, string> = {
  high: 'text-red-400 bg-red-400/10 border-red-400/20',
  medium: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  low: 'text-slate-400 bg-slate-400/10 border-slate-400/20',
}

export const DAMAGE_TYPE_LABELS: Record<string, string> = {
  water: 'Water',
  fire: 'Fire',
  mold: 'Mold',
  storm: 'Storm',
  biohazard: 'Biohazard',
  other: 'Other',
}

export const LOCATIONS = [
  { id: 'amarillo', name: 'Amarillo' },
  { id: 'abilene', name: 'Abilene' },
  { id: 'san_angelo', name: 'San Angelo' },
  { id: 'victoria', name: 'Victoria' },
  { id: 'sugar_land', name: 'Sugar Land' },
] as const
