/** Asking a player for a new name, the same way in every game. */
import { sanitizeName } from '../shared/text.js';

/** The cleaned name the player typed, or null when they cancelled, cleared it or kept `current`. */
export function askName(current: string): string | null {
  const typed = prompt('Your new name:', current);
  if (typed === null) return null;
  const name = sanitizeName(typed);
  return name && name !== current ? name : null;
}
