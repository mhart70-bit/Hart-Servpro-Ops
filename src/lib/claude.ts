import type { ParsedNote } from '@/types'

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string

const SYSTEM_PROMPT = `You are an AI assistant for Hart SERVPRO, a restoration company operating across 5 Texas markets (Amarillo, Abilene, San Angelo, Victoria, Sugar Land).

Your job is to parse sales rep field notes — spoken or typed — and extract structured CRM data.

Centers of Influence (COIs) are contacts who refer business to SERVPRO: insurance agents, property managers, real estate agents, facility managers, contractors, HOA managers, hotel managers, etc.

Extract the following fields from the note. If a field is not mentioned, return null for it.
Return ONLY valid JSON with no markdown or explanation.`

const USER_PROMPT = (transcript: string) => `Parse this sales rep note and return JSON:

Note: "${transcript}"

Return this exact JSON structure:
{
  "contact_name": "full name of person visited/called or null",
  "company": "company or organization name or null",
  "activity_type": "visit|call|email|note",
  "outcome": "brief outcome like 'Interested', 'Left message', 'Not available', 'Gave referral', etc. or null",
  "notes": "clean summary of what happened (required, at least a sentence)",
  "follow_up_date": "ISO date string YYYY-MM-DD or null",
  "follow_up_action": "what to do on follow-up or null",
  "deal_value": numeric dollar amount if mentioned or null,
  "damage_type": "water|fire|mold|storm|biohazard|other or null",
  "urgency": "high|normal or null",
  "confidence_score": 0.0-1.0 how confident you are in the extraction
}`

export async function parseNote(transcript: string): Promise<ParsedNote> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured. Add VITE_ANTHROPIC_API_KEY to your .env file.')
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: USER_PROMPT(transcript),
        },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Claude API error: ${error}`)
  }

  const data = await response.json()
  const text = data.content[0]?.text ?? '{}'

  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(cleaned) as ParsedNote

  return parsed
}
