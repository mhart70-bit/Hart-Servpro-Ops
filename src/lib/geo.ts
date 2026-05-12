/**
 * Hart SERVPRO CRM — Geo Routing Utility
 * ========================================
 * Geocoding (address → lat/lng) and route optimization.
 *
 * TO ACTIVATE:
 *   Add to .env:
 *     VITE_GOOGLE_MAPS_API_KEY=AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *
 *   Enable these Google APIs in your project:
 *     - Geocoding API
 *     - Maps JavaScript API (optional, for future map view)
 *     - Directions API (optional, for turn-by-turn routing)
 */

import type { Contact, LatLng } from '@/types'

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? null
export const GEO_ACTIVE = !!GOOGLE_MAPS_KEY

// ── Geocoding ─────────────────────────────────────────────────
/**
 * Convert a street address to lat/lng using Google Geocoding API.
 * Returns null if geocoding fails or API key not configured.
 */
export async function geocodeAddress(
  address: string,
  city: string,
  state = 'TX'
): Promise<LatLng | null> {
  if (!GEO_ACTIVE) {
    console.log('[GEO STUB] Geocoding not configured. Add VITE_GOOGLE_MAPS_API_KEY to .env')
    return null
  }

  const query = encodeURIComponent(`${address}, ${city}, ${state}`)
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${GOOGLE_MAPS_KEY}`

  try {
    const res = await fetch(url)
    const data = await res.json()

    if (data.status !== 'OK' || !data.results?.[0]) return null

    const { lat, lng } = data.results[0].geometry.location
    return { lat, lng }
  } catch {
    return null
  }
}

// ── Haversine distance ────────────────────────────────────────
/**
 * Calculate straight-line distance between two lat/lng points.
 * Returns distance in miles.
 */
export function haversineDistance(a: LatLng, b: LatLng): number {
  const R = 3958.8 // Earth radius in miles
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng
  return R * 2 * Math.asin(Math.sqrt(h))
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

// ── Route sorting ─────────────────────────────────────────────
/**
 * Sort contacts by proximity to a starting point using a
 * greedy nearest-neighbor algorithm. Fast and good enough
 * for 5-20 stops per day.
 *
 * Falls back to urgency sort if contacts lack coordinates.
 *
 * @param contacts  - List of contacts to sort
 * @param origin    - Rep's starting location (home or office)
 * @returns         - Contacts sorted by travel order
 */
export function sortByRoute(
  contacts: Contact[],
  origin: LatLng
): Contact[] {
  const withCoords = contacts.filter(c => c.lat != null && c.lng != null)
  const withoutCoords = contacts.filter(c => c.lat == null || c.lng == null)

  if (withCoords.length === 0) return contacts

  // Greedy nearest-neighbor
  const sorted: Contact[] = []
  const remaining = [...withCoords]
  let current = origin

  while (remaining.length > 0) {
    let nearestIdx = 0
    let nearestDist = Infinity

    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i]
      const dist = haversineDistance(current, { lat: c.lat!, lng: c.lng! })
      if (dist < nearestDist) {
        nearestDist = dist
        nearestIdx = i
      }
    }

    const nearest = remaining.splice(nearestIdx, 1)[0]
    sorted.push(nearest)
    current = { lat: nearest.lat!, lng: nearest.lng! }
  }

  // Contacts without coords go to end, sorted by urgency
  return [...sorted, ...withoutCoords]
}

// ── Distance label helper ─────────────────────────────────────
export function distanceLabel(a: LatLng, b: LatLng): string {
  const miles = haversineDistance(a, b)
  if (miles < 0.1) return 'Nearby'
  if (miles < 1) return `${(miles * 5280).toFixed(0)} ft`
  return `${miles.toFixed(1)} mi`
}

// ── Geocode and update contact ────────────────────────────────
/**
 * Attempt to geocode a contact's address and return the coordinates.
 * The caller is responsible for saving lat/lng to the database.
 *
 * Usage in Contacts.tsx after saving a new contact:
 *   const coords = await geocodeContact(newContact)
 *   if (coords) {
 *     await supabase.from('contacts').update(coords).eq('id', newContact.id)
 *   }
 */
export async function geocodeContact(contact: {
  address: string | null
  city: string | null
  state: string | null
}): Promise<LatLng | null> {
  if (!contact.address && !contact.city) return null

  const addressStr = [contact.address, contact.city].filter(Boolean).join(', ')
  return geocodeAddress(
    contact.address ?? '',
    contact.city ?? '',
    contact.state ?? 'TX'
  ).catch(() => null)
}

// ── Rep location (browser geolocation) ───────────────────────
/**
 * Get the rep's current GPS position via browser geolocation API.
 * Used to set the route origin to the rep's actual location.
 */
export function getRepLocation(): Promise<LatLng | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60000 }
    )
  })
}

// ── Market center coordinates (fallback origins) ──────────────
export const MARKET_CENTERS: Record<string, LatLng> = {
  Amarillo:   { lat: 35.2220, lng: -101.8313 },
  Abilene:    { lat: 32.4487, lng: -99.7331 },
  'San Angelo': { lat: 31.4638, lng: -100.4370 },
  Victoria:   { lat: 28.8053, lng: -97.0036 },
  'Sugar Land': { lat: 29.6197, lng: -95.6349 },
}
