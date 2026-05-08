import { BookOpenCheck } from 'lucide-react'

const FRAMEWORK = [
  {
    who: true,
    title: 'Who',
    body: 'Name the contact and the company. Phone or email if you have them.',
    tips: ['Sarah Chen, ops director', 'Westside Property Management'],
  },
  {
    title: 'What',
    body: 'Damage type, urgency, and dollar amount. Describe the job on the ground.',
    tips: ['Water · Fire · Mold · Storm', 'Category 3 · Large Loss · Emergency', '$12,400 mitigation estimate'],
  },
  {
    title: 'When',
    body: 'The next follow-up date and action. Real dates, not "soon."',
    tips: ['Follow up Thursday 9am', 'Proposal goes out tomorrow'],
  },
]

const EXAMPLES = [
  {
    title: 'Residential water loss',
    note: 'Just left the Smith residence on Oak Lane. Category 3 water damage in the basement, sump pump failed. Owner is Jennifer Smith, 713-555-0144. Sending a $4,500 mitigation estimate tonight. Follow up Thursday morning.',
    tags: ['Who: Jennifer Smith', 'What: Cat 3 water · $4,500', 'When: Thursday AM'],
  },
  {
    title: 'Commercial property manager',
    note: 'Met with Sarah Chen, ops director at Westside Property Management in Houston. They want a standing commercial water and fire contract across their 12 properties. Ballpark $85k annual. Proposal due next Wednesday.',
    tags: ['Who: Sarah Chen · Westside PM', 'What: Contract · ~$85k', 'When: Proposal Wed'],
  },
  {
    title: 'Emergency callout',
    note: 'Emergency fire job, duplex in Austin near downtown. Contact is Mike Rivera, 512-555-0199. Large loss — insurance adjuster coming tomorrow. Estimate in the $45k range.',
    tags: ['Who: Mike Rivera', 'What: Fire · Emergency · ~$45k', 'When: Adjuster tomorrow'],
  },
]

const REMINDERS = [
  'Speak naturally — the system handles filler words and stumbles.',
  'Use exact urgency labels for owner alerts: Category 3, Large Loss, Emergency.',
  'Damage types are limited to Water · Fire · Mold · Storm.',
  'Your notes never get deleted. Every one lives in the Master Ledger forever.',
  "If the AI isn't sure, it flags the entry so Mark can take a quick look. No record is ever lost.",
]

export default function QuickGuide() {
  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <BookOpenCheck className="w-4 h-4 text-primary" />
          <span className="text-[10px] text-primary uppercase tracking-widest font-medium">Sales Rep Quick Guide</span>
        </div>
        <h1 className="text-3xl font-serif font-semibold text-foreground">Who. What. When.</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl">
          Three questions, one field note. Use the "Who, What, When" framework every time you submit — the AI handles the rest.
          If it hears all three, your confidence score will sit at ninety-plus and the record enters the permanent ledger without a flag.
        </p>
      </div>

      {/* Framework cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-10">
        {FRAMEWORK.map(card => (
          <div key={card.title} className="bg-card border border-border rounded-xl p-5">
            <div className="text-xs font-medium text-primary uppercase tracking-widest mb-2">{card.title}</div>
            <p className="text-sm text-foreground mb-4">{card.body}</p>
            <div className="space-y-1">
              {card.tips.map(tip => (
                <div key={tip} className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                  {tip}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Example notes */}
      <h2 className="text-xl font-serif font-semibold text-foreground mb-4">Example notes</h2>
      <div className="space-y-4 mb-10">
        {EXAMPLES.map(ex => (
          <div key={ex.title} className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-2">{ex.title}</h3>
            <p className="text-sm text-muted-foreground italic mb-3">"{ex.note}"</p>
            <div className="flex flex-wrap gap-1.5">
              {ex.tags.map(tag => (
                <span key={tag} className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Field reminders */}
      <div className="bg-muted/50 border border-border rounded-xl p-5">
        <h3 className="text-base font-serif font-semibold text-foreground mb-3">A few field reminders</h3>
        <ul className="space-y-2">
          {REMINDERS.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="text-primary mt-0.5">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
