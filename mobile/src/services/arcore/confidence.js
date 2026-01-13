/**
 * Confidence scorer for AR measurements
 *
 * Exports:
 *  - computeConfidence(metrics)
 *
 * Input `metrics` is an object that can include any of:
 *  - numPoints: integer (number of plane polygon points detected/placed)
 *  - deviceMotionStability: number in [0,1] where 1 = very stable, 0 = very unstable
 *    OR deviceMotionStd: standard deviation (m/s or rad/s) where lower is better
 *  - lightingLux: number (lux) measured by camera / environment sensor
 *    OR lightingScore: number in [0,1] where 1 = very bright, 0 = very dark
 *  - trackingState: string 'NOT_TRACKING'|'LIMITED'|'NORMAL' OR numeric code (0..2)
 *
 * Returns a float in [0,1].
 *
 * Strategy (explanation):
 *  - Compute sub-scores for each signal (points, motion, lighting, tracking).
 *  - Normalize each sub-score to [0,1].
 *  - Combine with tuned weights emphasizing tracking and motion stability.
 *  - This heuristic balances geometric confidence (more points -> better) with
 *    runtime sensors (stable device, good lighting) and AR system tracking quality.
 *
 * The function is defensive: missing metrics are given reasonable defaults so
 * it can be used in early prototypes where not every signal is available.
 */

function clamp(v, a = 0, b = 1) { return Math.max(a, Math.min(b, v)) }

// Map numPoints -> score in [0,1].
// Minimum useful polygon points = 3. More points up to a cap improve confidence.
function scorePoints(numPoints) {
  if (!numPoints || numPoints < 3) return 0
  const min = 3
  const cap = 12 // after this additional points give diminishing returns
  const v = (numPoints - min) / (cap - min)
  return clamp(v)
}

// Device motion stability: prefer a stability metric in [0,1]. If standard deviation
// is supplied instead, convert to a stability score (smaller std -> higher stability).
function scoreMotion({ deviceMotionStability, deviceMotionStd }) {
  if (typeof deviceMotionStability === 'number') return clamp(deviceMotionStability)
  if (typeof deviceMotionStd === 'number') {
    // Convert std -> stability in (0,1]. Tune scale: std around 0.1 -> good.
    const scale = 0.5
    const s = 1 / (1 + deviceMotionStd / scale)
    return clamp(s)
  }
  // Default conservative value when unknown
  return 0.6
}

// Lighting: accept direct score or lux value. Map lux thresholds to 0..1.
function scoreLighting({ lightingScore, lightingLux }) {
  if (typeof lightingScore === 'number') return clamp(lightingScore)
  if (typeof lightingLux === 'number') {
    // Heuristic mapping (lux):
    // 0 - 10 : very dark -> 0.0..0.1
    // 10 - 100 : dim -> 0.1..0.4
    // 100 - 300 : indoor good -> 0.4..0.8
    // 300+ : bright -> 0.8..1.0
    if (lightingLux <= 10) return clamp((lightingLux / 10) * 0.1)
    if (lightingLux <= 100) return clamp(0.1 + ((lightingLux - 10) / 90) * 0.3)
    if (lightingLux <= 300) return clamp(0.4 + ((lightingLux - 100) / 200) * 0.4)
    return 0.8 + clamp((lightingLux - 300) / 2000) * 0.2
  }
  // Unknown -> neutral
  return 0.6
}

// Tracking state: map ARCore tracking states to confidence.
function scoreTracking(trackingState) {
  if (typeof trackingState === 'number') {
    // assume 0..2 where 2 = best
    return clamp(trackingState / 2)
  }
  if (typeof trackingState === 'string') {
    const s = trackingState.toUpperCase()
    if (s === 'NORMAL' || s === 'TRACKING') return 1.0
    if (s === 'LIMITED') return 0.5
    return 0.0
  }
  return 0.6
}

/**
 * computeConfidence(metrics)
 * @param {Object} metrics
 * @returns {number} confidence in [0,1]
 */
export function computeConfidence(metrics = {}) {
  const pts = scorePoints(metrics.numPoints)
  const motion = scoreMotion({ deviceMotionStability: metrics.deviceMotionStability, deviceMotionStd: metrics.deviceMotionStd })
  const light = scoreLighting({ lightingScore: metrics.lightingScore, lightingLux: metrics.lightingLux })
  const track = scoreTracking(metrics.trackingState)

  // Weights chosen to prioritize tracking and motion stability, then geometry and lighting.
  const weights = { tracking: 0.35, motion: 0.30, points: 0.2, lighting: 0.15 }

  const raw = (track * weights.tracking) + (motion * weights.motion) + (pts * weights.points) + (light * weights.lighting)

  return clamp(Number(raw.toFixed(3)))
}

export default { computeConfidence }
