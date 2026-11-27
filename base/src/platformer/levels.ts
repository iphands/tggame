/** Platform shapes and motion shared by the platformers (server sim and client views). */

export type PlatformKind = 'normal' | 'ice' | 'crumble' | 'bounce';

export type PlatformMove = {
  /** Horizontal amplitude (px). */
  ax?: number;
  /** Vertical amplitude (px). */
  ay?: number;
  periodMs: number;
  /** 0..1 phase offset. */
  phase?: number;
  /** Move along an ellipse (x = sin, y = cos) instead of a line. */
  circle?: boolean;
};

export type PlatformDef = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind?: PlatformKind;
  move?: PlatformMove;
};

export type ThemeId = 'sky' | 'frost' | 'temple' | 'forge' | 'neon';

/** Position of a platform at sim time `t` (ms). */
export function platformPos(def: PlatformDef, t: number): { x: number; y: number } {
  const m = def.move;
  if (!m) return { x: def.x, y: def.y };
  const a = 2 * Math.PI * (t / m.periodMs + (m.phase ?? 0));
  const dx = m.ax ? Math.sin(a) * m.ax : 0;
  const dy = m.ay ? (m.circle ? Math.cos(a) : Math.sin(a)) * m.ay : 0;
  return { x: def.x + dx, y: def.y + dy };
}
