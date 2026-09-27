// Flat hologram silhouettes (SVG) for tiers and enemy kinds.
import type { Tier, EnemyKind, Quadrant } from "../../shared/types";
import { TIER_COLOR, QUAD_COLOR, GOLD } from "./util";

/** ONE blocker visual language: shape + color = type (Eisenhower quadrant) only. Gold ring = needs a person.
 *  Matches the map: Do now = solid hexagon, Schedule = diamond, Delegate = triangle, Drop = small open circle. */
const QUAD_SHAPE: Record<Quadrant, string> = {
  do_now: `<path d="M32 11 L50 21.5 L50 42.5 L32 53 L14 42.5 L14 21.5 Z"/>`,
  schedule: `<path d="M32 11 L53 32 L32 53 L11 32 Z"/>`,
  delegate: `<path d="M32 13 L52 49 L12 49 Z"/>`,
  drop: `<circle cx="32" cy="32" r="10" fill="none" stroke="currentColor" stroke-width="4"/>`,
};
export function blockerGlyph(q: Quadrant, humanOnly: boolean, size = 22) {
  const c = QUAD_COLOR[q] ?? QUAD_COLOR.drop;
  return `<svg class="glyph bk-glyph" width="${size}" height="${size}" viewBox="0 0 64 64" style="color:${c};fill:${c}" aria-hidden="true">${QUAD_SHAPE[q] ?? QUAD_SHAPE.drop}${humanOnly ? `<circle cx="32" cy="32" r="27" fill="none" stroke="${GOLD}" stroke-width="3.5"/>` : ""}</svg>`;
}

export const QUAD_WHY: Record<Quadrant, string> = {
  do_now: "Urgent and important. Handle first.",
  schedule: "Important, not urgent. Plan it.",
  delegate: "Urgent, but an agent can take it.",
  drop: "Neither. Safe to ignore.",
};

const TIER_PATH: Record<Tier, string> = {
  // haiku: a small dart
  haiku: `<path d="M32 10 L42 46 L32 40 L22 46 Z"/>`,
  // sonnet: a swept-wing fighter
  sonnet: `<path d="M32 8 L37 26 L54 40 L54 45 L37 40 L35 52 L32 50 L29 52 L27 40 L10 45 L10 40 L27 26 Z"/>`,
  // opus: a cruiser with side pods
  opus: `<path d="M32 6 L38 18 L38 30 L48 30 L48 22 L52 22 L52 48 L48 48 L48 40 L38 40 L36 56 L28 56 L26 40 L16 40 L16 48 L12 48 L12 22 L16 22 L16 30 L26 30 L26 18 Z"/>`,
  // fable: a capital ship (diamond hull with fins)
  fable: `<path d="M32 4 L44 22 L58 30 L44 36 L40 58 L32 50 L24 58 L20 36 L6 30 L20 22 Z"/><path d="M32 18 L36 30 L32 38 L28 30 Z" fill="rgba(4,6,12,.55)"/>`,
  // river: the sentinel eye
  river: `<circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" stroke-width="3"/><path d="M12 32 Q32 14 52 32 Q32 50 12 32 Z"/><circle cx="32" cy="32" r="6" fill="rgba(4,6,12,.7)"/>`,
  unknown: `<circle cx="32" cy="32" r="14"/>`,
};

export function tierGlyph(tier: Tier, size = 20, color?: string) {
  const c = color ?? TIER_COLOR[tier] ?? TIER_COLOR.unknown;
  return `<svg class="glyph" width="${size}" height="${size}" viewBox="0 0 64 64" style="color:${c};fill:${c}" aria-hidden="true">${TIER_PATH[tier] ?? TIER_PATH.unknown}</svg>`;
}

const KIND_PATH: Record<EnemyKind, string> = {
  credential: `<path d="M8 32 L22 18 L50 22 L58 32 L50 42 L22 46 Z"/><rect x="26" y="28" width="16" height="8" fill="rgba(4,6,12,.6)"/>`,
  account: `<rect x="18" y="18" width="28" height="28" rx="3"/><circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="4 4"/>`,
  approval: `<path d="M32 6 L52 18 L52 38 L32 58 L12 38 L12 18 Z"/><circle cx="32" cy="28" r="6" fill="rgba(4,6,12,.6)"/>`,
  rate_limit: `<path d="M16 14 L24 20 L16 26 Z"/><path d="M40 12 L48 18 L40 24 Z"/><path d="M28 28 L36 34 L28 40 Z"/><path d="M14 42 L22 48 L14 54 Z"/><path d="M44 40 L52 46 L44 52 Z"/>`,
  billing: `<path d="M16 14 L24 20 L16 26 Z"/><path d="M40 12 L48 18 L40 24 Z"/><path d="M28 28 L36 34 L28 40 Z"/><path d="M14 42 L22 48 L14 54 Z"/><path d="M44 40 L52 46 L44 52 Z"/>`,
  missing_info: `<path d="M14 20 L30 12 L50 18 L54 36 L40 52 L20 50 L10 36 Z" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="10 5"/><text x="32" y="40" text-anchor="middle" font-size="22" font-weight="700" fill="currentColor">?</text>`,
  dependency: `<rect x="10" y="22" width="22" height="20" rx="2"/><rect x="36" y="22" width="18" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="3"/><path d="M30 32 H38" stroke="currentColor" stroke-width="3"/>`,
  failure: `<path d="M32 8 L58 54 L6 54 Z"/><rect x="30" y="24" width="4" height="16" fill="rgba(4,6,12,.7)"/><rect x="30" y="44" width="4" height="4" fill="rgba(4,6,12,.7)"/>`,
  todo: "M4 6h16M4 12h16M4 18h10",
};

export function kindGlyph(kind: EnemyKind, color: string, size = 22) {
  return `<svg class="glyph" width="${size}" height="${size}" viewBox="0 0 64 64" style="color:${color};fill:${color}" aria-hidden="true">${KIND_PATH[kind] ?? KIND_PATH.failure}</svg>`;
}

export const CC_EMBLEM = `<svg class="glyph" width="44" height="44" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".5"/><path d="M32 8 L36 28 L56 32 L36 36 L32 56 L28 36 L8 32 L28 28 Z" fill="currentColor"/><circle cx="32" cy="32" r="4" fill="rgba(4,6,12,.8)"/></svg>`;
