import { supabase } from '@/lib/supabase'
import type { ParsedNote } from '@/types'

// Note parsing runs in the `parse-note` Supabase Edge Function so the
// Anthropic API key stays server-side. The user's session token is sent
// automatically; only signed-in users can invoke it.
export async function parseNote(transcript: string): Promise<ParsedNote> {
  const { data, error } = await supabase.functions.invoke('parse-note', {
    body: { transcript },
  })

  if (error) {
    // FunctionsHttpError carries the function's JSON body with the real message
    if ('context' in error && error.context instanceof Response) {
      try {
        const body = await error.context.json()
        if (body?.error) throw new Error(body.error)
      } catch (e) {
        if (e instanceof Error && e.message) throw e
      }
    }
    throw new Error('Could not reach the note parser. Check your connection and try again.')
  }

  if (data?.error) throw new Error(data.error)
  return data as ParsedNote
}
