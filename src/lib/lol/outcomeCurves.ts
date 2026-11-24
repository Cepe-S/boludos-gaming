import type {
  LolMacroDurationRangeKey,
  LolMacroDurationRangeStats,
  LolOutcomeCurveModel,
  LolOutcomeCurveSample,
  LolOutcomeMinuteCurve,
  LolOutcomeMinuteEstimate,
  LolValidOutcome,
} from '../../types/lol';
import {
  CURVE_DOMAIN_MIN_SPAN_MIN,
  CURVE_DOMAIN_PAD_MIN,
  CURVE_FALLBACK_SPREAD_MIN,
  CURVE_MAX_BANDWIDTH_MIN,
  CURVE_MAX_LOCAL_BANDWIDTH_MIN,
  CURVE_MIN_BANDWIDTH_MIN,
  CURVE_PRIOR_STRENGTH,
  INV_SQRT_2PI,
  LOL_MACRO_DURATION_RANGES,
} from './constants';
import { clamp } from './helpers';

// ==============================================================================
// OUTCOME × DURATION CURVE — minute-by-minute V/D/FF rates for small samples
// ==============================================================================
// Estimator (per minute m, classes k ∈ {win, loss, ff}):
//
//   p_k(m) = ( Σ_i K((m − d_i) / h(m)) · 1[c_i = k]  +  α · π_k )
//            ---------------------------------------------------------
//                    ( Σ_i K((m − d_i) / h(m))  +  α )
//
// - K(u) = exp(−u²/2): unnormalized Gaussian, so each nearby game weighs ≈ 1 and
//   W(m) = Σ_i K(·) reads as "effective games supporting minute m".
// - Nadaraya–Watson ratio ⇒ no boundary bias from density normalization and the
//   three class shares always sum to 1 (they share the same denominator).
// - h(m) = clamp(max(h0, d_(k)(m)), h0, 9m): balloon bandwidth. h0 is Silverman's
//   rule 0.9·min(σ, IQR/1.34)·N^(−1/5) clamped to [2.5m, 6m]; d_(k)(m) is the
//   distance to the k-th nearest game (k = clamp(⌈√N⌉, 2, 5) ≤ N). In sparse tails
//   the kernel widens until ≥ k games support the estimate, so one isolated game
//   can never drive a 0% ↔ 100% jump. h(m) is continuous in m ⇒ smooth curves.
// - α = 2 pseudo-games of Dirichlet prior centred on the global composition π
//   (empirical Bayes). Where W(m) is low the estimate shrinks toward the global
//   rate; where games are dense (W ≫ α) the local trend dominates (FF peak at
//   15–20m, late-game winrate at 30m+). Classes never observed stay exactly 0%.
// - Output is allocated in integer basis points (largest remainder) so
//   winRate + lossRate + ffRate = 100.00 exactly at every minute.
// ==============================================================================


/** 0–10: [0, 600] · 10–20: (600, 1200] · 20–30: (1200, 1800] · 30–40: (1800, 2400] · 40+: (2400, ∞). */
export function resolveMacroDurationRange(durationSeconds: number): LolMacroDurationRangeKey {
  if (durationSeconds <= 600) return '0-10';
  if (durationSeconds <= 1200) return '10-20';
  if (durationSeconds <= 1800) return '20-30';
  if (durationSeconds <= 2400) return '30-40';
  return '40+';
}

/**
 * Largest-remainder allocation of non-negative weights into integers summing exactly to `scale`.
 * Zero weights always stay at 0.
 */
export function allocateLargestRemainder(weights: number[], scale: number): number[] {
  const safe = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const total = safe.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return safe.map(() => 0);
  const raw = safe.map((w) => (w / total) * scale);
  const out = raw.map((r) => Math.floor(r));
  let remaining = scale - out.reduce((sum, v) => sum + v, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - out[i] }))
    .filter((entry) => safe[entry.i] > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  let cursor = 0;
  while (remaining > 0 && order.length > 0) {
    out[order[cursor % order.length].i] += 1;
    remaining -= 1;
    cursor += 1;
  }
  return out;
}

export function computeMacroDurationRangeStats(
  samples: LolOutcomeCurveSample[]
): LolMacroDurationRangeStats[] {
  return LOL_MACRO_DURATION_RANGES.map((def) => {
    let wins = 0;
    let losses = 0;
    let ffs = 0;
    for (const s of samples) {
      if (s.outcome === 'remake' || !Number.isFinite(s.durationSeconds)) continue;
      if (resolveMacroDurationRange(s.durationSeconds) !== def.key) continue;
      if (s.outcome === 'win') wins += 1;
      else if (s.outcome === 'ff') ffs += 1;
      else losses += 1;
    }
    const total = wins + losses + ffs;
    const [winPct, lossPct, ffPct] = allocateLargestRemainder([wins, losses, ffs], 100);
    return { ...def, total, wins, losses, ffs, winPct, lossPct, ffPct };
  });
}


export function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function buildOutcomeCurveModel(
  samples: LolOutcomeCurveSample[]
): LolOutcomeCurveModel | null {
  const points: Array<{ minute: number; outcome: LolValidOutcome }> = [];
  for (const s of samples) {
    if (s.outcome === 'remake') continue;
    if (!Number.isFinite(s.durationSeconds) || s.durationSeconds < 0) continue;
    points.push({ minute: s.durationSeconds / 60, outcome: s.outcome });
  }
  const n = points.length;
  if (n === 0) return null;
  points.sort((a, b) => a.minute - b.minute);

  let wins = 0;
  let losses = 0;
  let ffs = 0;
  for (const p of points) {
    if (p.outcome === 'win') wins += 1;
    else if (p.outcome === 'ff') ffs += 1;
    else losses += 1;
  }

  const minutes = points.map((p) => p.minute);
  const mean = minutes.reduce((sum, m) => sum + m, 0) / n;
  const sd =
    n > 1
      ? Math.sqrt(minutes.reduce((sum, m) => sum + (m - mean) ** 2, 0) / (n - 1))
      : 0;
  const iqrScaled = (quantileSorted(minutes, 0.75) - quantileSorted(minutes, 0.25)) / 1.34;
  const spreadCandidates = [sd, iqrScaled].filter((v) => v > 1e-9);
  const spread =
    spreadCandidates.length > 0 ? Math.min(...spreadCandidates) : CURVE_FALLBACK_SPREAD_MIN;
  const bandwidthMin = clamp(
    0.9 * spread * Math.pow(n, -0.2),
    CURVE_MIN_BANDWIDTH_MIN,
    CURVE_MAX_BANDWIDTH_MIN
  );
  const kNeighbors = Math.min(n, clamp(Math.ceil(Math.sqrt(n)), 2, 5));

  return {
    sampleSize: n,
    points,
    bandwidthMin,
    kNeighbors,
    priorStrength: CURVE_PRIOR_STRENGTH,
    prior: { win: wins / n, loss: losses / n, ff: ffs / n },
    minDurationMin: minutes[0],
    maxDurationMin: minutes[n - 1],
  };
}

export function estimateOutcomeAtMinute(
  model: LolOutcomeCurveModel,
  minute: number
): LolOutcomeMinuteEstimate {
  const h0 = model.bandwidthMin;
  const dists = model.points.map((p) => Math.abs(p.minute - minute)).sort((a, b) => a - b);
  const dk = dists[Math.max(0, model.kNeighbors - 1)] ?? 0;
  const h = clamp(Math.max(h0, dk), h0, Math.max(h0, CURVE_MAX_LOCAL_BANDWIDTH_MIN));

  let wWin = 0;
  let wLoss = 0;
  let wFf = 0;
  let density = 0;
  for (const p of model.points) {
    const delta = p.minute - minute;
    const u = delta / h;
    const k = Math.exp(-0.5 * u * u);
    if (p.outcome === 'win') wWin += k;
    else if (p.outcome === 'ff') wFf += k;
    else wLoss += k;
    const u0 = delta / h0;
    density += (Math.exp(-0.5 * u0 * u0) * INV_SQRT_2PI) / h0;
  }

  const effectiveGames = wWin + wLoss + wFf;
  const alpha = model.priorStrength;
  const denom = effectiveGames + alpha;
  const pWin = (wWin + alpha * model.prior.win) / denom;
  const pLoss = (wLoss + alpha * model.prior.loss) / denom;
  const pFf = (wFf + alpha * model.prior.ff) / denom;
  const [bpWin, bpLoss, bpFf] = allocateLargestRemainder([pWin, pLoss, pFf], 10000);

  return {
    minute,
    winRate: bpWin / 100,
    lossRate: bpLoss / 100,
    ffRate: bpFf / 100,
    effectiveGames,
    density,
    localBandwidthMin: h,
  };
}

/**
 * Minute-by-minute V/D/FF curve. Defaults to every integer minute between the shortest and the
 * longest valid game; pass `startMin`/`endMin`/`stepMin` to evaluate a custom grid.
 */
export function computeOutcomeMinuteCurve(
  samples: LolOutcomeCurveSample[],
  options: { startMin?: number; endMin?: number; stepMin?: number } = {}
): LolOutcomeMinuteCurve {
  const model = buildOutcomeCurveModel(samples);
  if (!model) return { model: null, points: [] };
  const step = options.stepMin && options.stepMin > 0 ? options.stepMin : 1;
  const start = options.startMin ?? Math.floor(model.minDurationMin);
  const end = Math.max(start, options.endMin ?? Math.ceil(model.maxDurationMin));
  const count = Math.floor((end - start) / step + 1e-9) + 1;
  const points: LolOutcomeMinuteEstimate[] = [];
  for (let i = 0; i < count; i++) {
    points.push(estimateOutcomeAtMinute(model, start + i * step));
  }
  return { model, points };
}

/**
 * X domain (integer minutes) for the outcome chart:
 * - Any game in 0–10 ⇒ start at 0 (full 0–10 range); otherwise start 2m before the shortest game,
 *   never below the lower bound of its macro range (no dead 0–10 / 10–20 segment).
 * - End 2m after the longest game, never beyond the upper bound of its macro range
 *   (a 28m max ends at 30, not 31); 0–10 only ⇒ end at 10.
 * - Minimum span 8m (N = 1 or identical durations).
 */
export function computeOutcomeChartDomain(durationsSeconds: number[]): {
  startMin: number;
  endMin: number;
} {
  const valid = durationsSeconds.filter((d) => Number.isFinite(d) && d >= 0);
  if (valid.length === 0) return { startMin: 0, endMin: 30 };
  const minSec = Math.min(...valid);
  const maxSec = Math.max(...valid);
  const lowerOf: Record<LolMacroDurationRangeKey, number> = {
    '0-10': 0,
    '10-20': 10,
    '20-30': 20,
    '30-40': 30,
    '40+': 40,
  };
  const upperOf: Record<LolMacroDurationRangeKey, number> = {
    '0-10': 10,
    '10-20': 20,
    '20-30': 30,
    '30-40': 40,
    '40+': Number.POSITIVE_INFINITY,
  };
  const minRange = resolveMacroDurationRange(minSec);
  const maxRange = resolveMacroDurationRange(maxSec);
  let start =
    minRange === '0-10'
      ? 0
      : Math.max(lowerOf[minRange], Math.floor(minSec / 60) - CURVE_DOMAIN_PAD_MIN);
  let end =
    maxRange === '0-10'
      ? 10
      : Math.min(upperOf[maxRange], Math.ceil(maxSec / 60) + CURVE_DOMAIN_PAD_MIN);
  if (end - start < CURVE_DOMAIN_MIN_SPAN_MIN) {
    const center = (start + end) / 2;
    start = Math.max(0, Math.floor(center - CURVE_DOMAIN_MIN_SPAN_MIN / 2));
    end = start + CURVE_DOMAIN_MIN_SPAN_MIN;
  }
  return { startMin: start, endMin: end };
}
