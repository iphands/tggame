/** Lays a table: how much of what, and where. Deterministic for a given RNG. */
import {
  BASE_COUNTS,
  TEAM_SHARE,
  TIERS,
  areaFactor,
  countFactor,
  edgeShare,
  tableSize,
  tiersInCourse,
} from '../../shared/src/constants.js';
import { massForTier, startRing } from '../../shared/src/sim.js';

export type Rng = () => number;
export type Placed = { tier: number; x: number; y: number };
export type Course = { no: number; w: number; h: number; tiers: number; foods: Placed[] };

/** A hole must be able to reach each tier with this much growth to spare. */
const MARGIN = 1.15;

/**
 * The least any team's biggest hole is guaranteed to weigh after `total` has been eaten: the
 * worst case is an even split, where each hole has its own share plus the team share of the rest.
 */
export function guaranteedMass(total: number, players: number): number {
  return (total * (1 + TEAM_SHARE * (players - 1))) / players;
}

/** How many of each tier, topped up with the smallest food until every tier can be reached. */
export function foodCounts(no: number, players: number): number[] {
  const tiers = tiersInCourse(no);
  const k = areaFactor(players, no) * countFactor(no);
  const counts = BASE_COUNTS.slice(0, tiers).map((c) => Math.max(1, Math.round(c * k)));
  for (let tier = 1; tier < tiers; tier++) {
    const below = (): number => counts.slice(0, tier).reduce((sum, c, t) => sum + c * TIERS[t].value, 0);
    while (guaranteedMass(below(), players) < massForTier(tier) * MARGIN) counts[0]++;
  }
  return counts;
}

export function makeCourse(no: number, players: number, rng: Rng): Course {
  const { w, h } = tableSize(players, no);
  const counts = foodCounts(no, players);
  const tiers = counts.length;
  const edge = edgeShare(no);
  /** Nothing is laid on top of the holes. */
  const clear = startRing(players) + 60;

  const clusters = Array.from({ length: Math.max(3, Math.round(4 * areaFactor(players, no))) }, () => ({
    x: 120 + rng() * (w - 240),
    y: 120 + rng() * (h - 240),
    r: 80 + rng() * 110,
  }));

  const foods: Placed[] = [];
  const fits = (tier: number, x: number, y: number): boolean => {
    const r = TIERS[tier].r;
    if (x < r + 10 || y < r + 10 || x > w - r - 10 || y > h - r - 10) return false;
    if (Math.hypot(x - w / 2, y - h / 2) < clear + r) return false;
    for (const f of foods) {
      const gap = r + TIERS[f.tier].r + 3;
      const dx = f.x - x;
      const dy = f.y - y;
      if (dx * dx + dy * dy < gap * gap) return false;
    }
    return true;
  };

  const nearEdge = (r: number): { x: number; y: number } => {
    const inset = r + 12 + rng() * 60;
    const along = rng();
    switch (Math.floor(rng() * 4)) {
      case 0:
        return { x: along * w, y: inset };
      case 1:
        return { x: along * w, y: h - inset };
      case 2:
        return { x: inset, y: along * h };
      default:
        return { x: w - inset, y: along * h };
    }
  };

  // big food first: it is the hardest to find room for, and the small food then crowds round it
  for (let tier = tiers - 1; tier >= 0; tier--) {
    const r = TIERS[tier].r;
    for (let i = 0; i < counts[tier]; i++) {
      let spot: { x: number; y: number } | null = null;
      for (let attempt = 0; attempt < 240 && !spot; attempt++) {
        let p: { x: number; y: number };
        if (attempt >= 60) p = { x: rng() * w, y: rng() * h };
        else if (rng() < edge) p = nearEdge(r);
        else {
          const c = clusters[Math.floor(rng() * clusters.length)];
          const a = rng() * Math.PI * 2;
          const d = Math.sqrt(rng()) * (c.r + r);
          p = { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d };
        }
        if (fits(tier, p.x, p.y)) spot = p;
      }
      // a table too crowded for a free spot: lay it anyway, clear of the edge
      spot ??= { x: r + 20 + rng() * (w - 2 * r - 40), y: r + 20 + rng() * (h - 2 * r - 40) };
      foods.push({ tier, x: Math.round(spot.x * 10) / 10, y: Math.round(spot.y * 10) / 10 });
    }
  }
  return { no, w, h, tiers, foods };
}
