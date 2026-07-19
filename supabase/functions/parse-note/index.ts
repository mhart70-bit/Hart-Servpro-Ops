// Parse-note edge function.
// Holds the Anthropic API key server-side (set via `supabase secrets set ANTHROPIC_API_KEY=...`)
// so it never ships in the browser bundle. Supabase verifies the caller's JWT
// before this function runs (verify_jwt defaults to true), so only signed-in
// users of the app can invoke it.

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `You are an AI assistant for Hart SERVPRO, a restoration company operating across 5 Texas markets (Amarillo, Abilene, San Angelo, Victoria, Sugar Land).

Your job is to parse sales rep field notes — spoken or typed — and extract structured CRM data.

Centers of Influence (COIs) are contacts who refer business to SERVPRO: insurance agents, property managers, real estate agents, facility managers, contractors, HOA managers, hotel managers, etc.

Extract the following fields from the note. If a field is not mentioned, return null for it.
Return ONLY valid JSON with no markdown or explanation.`

const USER_PROMPT = (transcript: string) => `Today's date is ${new Date().toISOString().slice(0, 10)} — resolve relative dates ("Thursday", "next week", "tomorrow") against it.

Parse this sales rep note and return JSON:

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })

  if (!ANTHROPIC_API_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' }, 500)
  }

  let transcript: unknown
  try {
    ;({ transcript } = await req.json())
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400)
  }
  if (typeof transcript !== 'string' || !transcript.trim()) {
    return json({ error: 'Missing transcript.' }, 400)
  }
  if (transcript.length > 10_000) {
    return json({ error: 'Note is too long.' }, 400)
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: USER_PROMPT(transcript) }],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    let message = `Claude API error ${response.status}`
    try {
      message = JSON.parse(body)?.error?.message ?? message
    } catch { /* use fallback message */ }
    // 502 so the client can distinguish upstream failure from its own bad request
    return json({ error: message }, 502)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text ?? '{}'
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    return json(JSON.parse(cleaned))
  } catch {
    return json({ error: 'Claude returned malformed JSON. Please try again.' }, 502)
  }
})
