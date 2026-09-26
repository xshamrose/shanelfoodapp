/**
 * Turning what a customer sends you into something a rider can navigate to.
 *
 * In practice customers share a Google Maps pin over WhatsApp rather than typing
 * an address, and those links come in several shapes:
 *
 *   https://maps.app.goo.gl/5Z5FxAXWq3ExuNNa6      (short — no coordinates in it)
 *   https://www.google.com/maps/place/.../@12.97,77.59,17z/...
 *   https://www.google.com/maps?q=12.97,77.59
 *   https://maps.google.com/?ll=12.97,77.59
 *
 * A short link cannot be decoded without asking Google, so we simply open it and
 * let Maps resolve it. When the link does carry coordinates we pull them out,
 * because coordinates let us open turn-by-turn directions straight away.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export function looksLikeUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

/** A Google Maps link of any shape, or a bare "lat, lng" pair. */
export function looksLikeLocation(text: string): boolean {
  const t = text.trim();
  return looksLikeUrl(t) || extractLatLng(t) !== null;
}

function validLatLng(lat: number, lng: number): LatLng | null {
  if (!isFinite(lat) || !isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // 0,0 is in the Atlantic — almost certainly a parse artefact, not a delivery.
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/** Pull coordinates out of a maps link, or a plain "12.97, 77.59" string. */
export function extractLatLng(text: string): LatLng | null {
  const t = text.trim();
  if (!t) return null;

  const patterns = [
    // Place URLs: .../@12.9716,77.5946,17z
    /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
    // The precise pin Google embeds in longer place URLs: !3d<lat>!4d<lng>
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    // ?q= / &query= / ?ll= / &destination= / &center=
    /[?&](?:q|query|ll|destination|center|daddr)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
    // geo: URIs, which some Android share sheets produce
    /^geo:(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
    // A bare coordinate pair pasted on its own
    /^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/,
  ];

  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match) {
      const found = validLatLng(Number(match[1]), Number(match[2]));
      if (found) return found;
    }
  }
  return null;
}

export interface Navigable {
  address?: string;
  mapLink?: string;
  lat?: number;
  lng?: number;
}

/**
 * The best URL to hand to Google Maps for this customer.
 *
 * Coordinates win because they open directions immediately and cannot be
 * misread. A saved link comes next. A typed address is the last resort, since
 * Maps has to guess at it.
 */
export function mapsUrlFor(target: Navigable): string | null {
  if (target.lat !== undefined && target.lng !== undefined) {
    return `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`;
  }
  if (target.mapLink && looksLikeUrl(target.mapLink)) {
    return target.mapLink.trim();
  }
  // Someone may have pasted the link into the address box instead — still work.
  if (target.address && looksLikeUrl(target.address)) {
    return target.address.trim();
  }
  if (target.address && target.address.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      target.address.trim()
    )}`;
  }
  return null;
}

/** True when this customer has an exact pin rather than only a typed address. */
export function hasPreciseLocation(target: Navigable): boolean {
  if (target.lat !== undefined && target.lng !== undefined) return true;
  if (target.mapLink && looksLikeUrl(target.mapLink)) return true;
  return !!(target.address && looksLikeUrl(target.address));
}
