/*
  Geometry helpers for AR measurements

  Exports:
    - computeMeasurement(points3D)

  Input: points3D: array of points. Each point can be {x,y,z} or [x,y,z].
  Output: { area_sqm, left_cm, right_cm, front_cm, back_cm }

  Approach:
  1. Compute plane normal from first non-collinear triple of points.
  2. Build a local 2D basis (u, v) on the plane.
  3. Project 3D points onto (u,v) coordinates (meters).
  4. Compute 2D convex hull of projected points.
  5. Compute polygon area (m^2) via shoelace formula.
  6. Compute axis-aligned bounding box in (u,v) coordinates -> width and depth in meters.

  This accounts for real-world scale because input points are expected in meters
  (as provided by ARCore hit tests). The method assumes points lie on (or near)
  a common plane (ARCore horizontal plane). For non-planar inputs results may be
  approximate.
*/

function toVec(p) {
  if (Array.isArray(p)) return { x: p[0], y: p[1], z: p[2] }
  return { x: p.x, y: p.y, z: p.z }
}

function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z } }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z } }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z }
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  }
}
function norm(v) { return Math.sqrt(dot(v, v)) }
function normalize(v) {
  const n = norm(v) || 1e-9
  return { x: v.x / n, y: v.y / n, z: v.z / n }
}

// 2D helpers (points are {x,y})
function cross2(a, b, c) {
  // cross product z-component of (b-a) x (c-a)
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function convexHull(points) {
  // Monotonic chain algorithm. Input: array of {x,y}. Returns hull in CCW order.
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
  if (pts.length <= 1) return pts
  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross2(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross2(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  upper.pop()
  lower.pop()
  return lower.concat(upper)
}

function polygonArea2D(poly) {
  // poly: array of {x,y} in order (either CW or CCW). Returns signed area.
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y
  }
  return Math.abs(a) / 2
}

/**
 * computeMeasurement
 * @param {Array} points3D - array of points in meters, each {x,y,z} or [x,y,z]
 * @returns {{area_sqm: number, left_cm: number, right_cm: number, front_cm: number, back_cm: number}}
 */
export function computeMeasurement(points3D) {
  if (!points3D || points3D.length < 3) {
    return { area_sqm: 0, left_cm: 0, right_cm: 0, front_cm: 0, back_cm: 0 }
  }

  const pts = points3D.map(toVec)

  // Centroid
  const centroid = pts.reduce((acc, p) => add(acc, p), { x: 0, y: 0, z: 0 })
  centroid.x /= pts.length
  centroid.y /= pts.length
  centroid.z /= pts.length

  // Find a non-collinear triple to compute plane normal
  let normal = null
  for (let i = 0; i < pts.length - 2 && !normal; i++) {
    const a = sub(pts[i + 1], pts[i])
    const b = sub(pts[i + 2], pts[i])
    const cr = cross(a, b)
    const nrm = norm(cr)
    if (nrm > 1e-6) normal = normalize(cr)
  }
  if (!normal) {
    // Degenerate: fallback to up vector
    normal = { x: 0, y: 1, z: 0 }
  }

  // Choose local axes u (along first edge projected to plane) and v = normal x u
  // Use vector from first to second point as initial direction
  let init = sub(pts[1], pts[0])
  // Project init onto plane: init - (init·normal) * normal
  const dotInit = dot(init, normal)
  let u = sub(init, { x: normal.x * dotInit, y: normal.y * dotInit, z: normal.z * dotInit })
  if (norm(u) < 1e-6) {
    // pick arbitrary vector
    u = { x: 1, y: 0, z: 0 }
    const d = dot(u, normal)
    u = sub(u, { x: normal.x * d, y: normal.y * d, z: normal.z * d })
  }
  u = normalize(u)
  const v = normalize(cross(normal, u))

  // Project points into 2D plane coords (meters) using centroid as origin
  const projected = pts.map((p) => {
    const r = sub(p, centroid)
    return { x: dot(r, u), y: dot(r, v) }
  })

  // Compute convex hull of projected points to handle unordered input
  const hull = convexHull(projected)

  // Area in square meters
  const area_sqm = polygonArea2D(hull)

  // Axis-aligned bounding box in (u,v) coords -> width and depth in meters
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of hull) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const width_m = Math.max(0, maxX - minX)
  const depth_m = Math.max(0, maxY - minY)

  // Compute per-side lengths (left/right/front/back) by classifying hull edges
  // Projected 2D centroid
  const centroid2D = hull.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
  centroid2D.x /= hull.length
  centroid2D.y /= hull.length

  let left_m = 0, right_m = 0, front_m = 0, back_m = 0
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]
    const b = hull[(i + 1) % hull.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }

    // Determine whether edge is more aligned with X (dx) or Y (dy)
    if (Math.abs(dx) > Math.abs(dy)) {
      // Edge runs roughly along X -> classify as front/back (varies in X)
      if (mid.y < centroid2D.y) front_m += len
      else back_m += len
    } else {
      // Edge runs roughly along Y -> classify as left/right
      if (mid.x < centroid2D.x) left_m += len
      else right_m += len
    }
  }

  return {
    area_sqm: Math.max(0, Number(area_sqm.toFixed(4))),
    // side-specific lengths in cm
    left_cm: Math.round(left_m * 100),
    right_cm: Math.round(right_m * 100),
    front_cm: Math.round(front_m * 100),
    back_cm: Math.round(back_m * 100)
  }
}

export default { computeMeasurement }

// Simple shoelace polygon area using X/Z components (expects meters)
export function shoelaceAreaFromXZ(points3D) {
  if (!points3D || points3D.length < 3) return 0
  let a = 0
  for (let i = 0; i < points3D.length; i++) {
    const j = (i + 1) % points3D.length
    const xi = points3D[i].x
    const yi = points3D[i].z
    const xj = points3D[j].x
    const yj = points3D[j].z
    a += xi * yj - xj * yi
  }
  return Math.abs(a) / 2
}

/**
 * computeVolumeFromFloorAndHeights
 * - floorPoints: array of {x,y,z} in meters (ordered polygon)
 * - heights: array of per-vertex heights in meters above corresponding floor vertex (can contain nulls)
 * Returns: { volume_m3, volume_ft3, area_sqm, area_sqft, triangle_breakdown: [{ area_m2, avg_height_m, volume_m3 }] }
 */
export function computeVolumeFromFloorAndHeights(floorPoints, heights) {
  if (!floorPoints || floorPoints.length < 3) return { volume_m3: 0, volume_ft3: 0, area_sqm: 0, area_sqft: 0, triangle_breakdown: [] }

  // area in X/Z
  const ptsXZ = floorPoints.map(p => ({ x: p.x, z: p.z }))
  const area = shoelaceAreaFromXZ(ptsXZ)

  // prepare heights array: if some null, fill with average of provided
  const valid = heights && heights.filter(h => typeof h === 'number')
  const avgH = valid && valid.length ? valid.reduce((s,v)=>s+v,0)/valid.length : 0
  const fillHeights = (heights || []).map(h => (typeof h === 'number' ? h : avgH))

  // triangulate by fan from centroid (in XZ)
  const cx = ptsXZ.reduce((s,p)=>s+p.x,0)/ptsXZ.length
  const cz = ptsXZ.reduce((s,p)=>s+p.z,0)/ptsXZ.length
  let volume = 0
  const breakdown = []
  for (let i = 0; i < ptsXZ.length; i++) {
    const j = (i+1) % ptsXZ.length
    const a1 = ptsXZ[i]
    const a2 = ptsXZ[j]
    // triangle area (centroid, a1, a2)
    const triA = Math.abs((a1.x - cx)*(a2.z - cz) - (a2.x - cx)*(a1.z - cz))/2
    const h1 = fillHeights[i]
    const h2 = fillHeights[j]
    const hCent = fillHeights.reduce((s,v)=>s+v,0)/fillHeights.length
    const avgH = (h1 + h2 + hCent)/3
    const triVol = triA * avgH
    breakdown.push({ area_m2: Number(triA.toFixed(6)), avg_height_m: Number(avgH.toFixed(6)), volume_m3: Number(triVol.toFixed(6)) })
    volume += triVol
  }

  const volume_m3 = Number(volume.toFixed(6))
  const volume_ft3 = Number((volume * 35.3147).toFixed(6))
  return { volume_m3, volume_ft3, area_sqm: Number(area.toFixed(6)), area_sqft: Number((area*10.7639).toFixed(6)), triangle_breakdown: breakdown }
}
