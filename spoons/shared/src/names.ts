import { NAME_MAX } from './constants.js';

export function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  return s.replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}
