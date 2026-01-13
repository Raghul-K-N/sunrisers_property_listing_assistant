import earcut from 'earcut'
import { vec3 } from 'gl-matrix'

function buildPlaneBasis(points3D) {
  const centroid = vec3.fromValues(0, 0, 0)
  points3D.forEach((p) => vec3.add(centroid, centroid, vec3.fromValues(p.x, p.y, p.z)))
  vec3.scale(centroid, centroid, 1 / points3D.length)

  if (points3D.length < 3) throw new Error('Need at least 3 points')

  const a = vec3.fromValues(points3D[0].x, points3D[0].y, points3D[0].z)
  let b = null
  let c = null
  for (let i = 1; i < points3D.length && !b; i++) b = vec3.fromValues(points3D[i].x, points3D[i].y, points3D[i].z)
  for (let i = 2; i < points3D.length && !c; i++) {
    const tmp = vec3.fromValues(points3D[i].x, points3D[i].y, points3D[i].z)
    const ab = vec3.create(); vec3.subtract(ab, b, a)
    const ac = vec3.create(); vec3.subtract(ac, tmp, a)
    const cross = vec3.create(); vec3.cross(cross, ab, ac)
    if (vec3.length(cross) > 1e-6) c = tmp
  }
  if (!b || !c) throw new Error('Not enough non-collinear points')

  const v1 = vec3.create(); vec3.subtract(v1, b, a)
  const v2 = vec3.create(); vec3.subtract(v2, c, a)
  const normal = vec3.create(); vec3.cross(normal, v1, v2); vec3.normalize(normal, normal)

  const u = vec3.create(); vec3.normalize(u, v1)
  const v = vec3.create(); vec3.cross(v, normal, u); vec3.normalize(v, v)

  return { centroid, u, v, normal }
}

function projectTo2D(points3D) {
  const { centroid, u, v } = buildPlaneBasis(points3D)
  const pts2 = []
  const flat = []
  points3D.forEach((p) => {
    const rel = vec3.create(); vec3.subtract(rel, vec3.fromValues(p.x, p.y, p.z), centroid)
    const x = vec3.dot(rel, u)
    const y = vec3.dot(rel, v)
    pts2.push({ x, y, z: p.z })
    flat.push(x, y)
  })
  return { pts2, flat }
}

function shoelaceArea2D(pts2) {
  let sum = 0
  for (let i = 0; i < pts2.length; i++) {
    const a = pts2[i]
    const b = pts2[(i + 1) % pts2.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

export function computeAreaAndVolume(vertices3D, vertexHeights = null) {
  if (!vertices3D || vertices3D.length < 3) return { area_sqm: 0, volume_m3: 0 }
  const { pts2, flat } = projectTo2D(vertices3D)
  const area = shoelaceArea2D(pts2)

  const triangles = earcut(flat)
  let volume = 0
  if (vertexHeights && vertexHeights.length === vertices3D.length) {
    for (let i = 0; i < triangles.length; i += 3) {
      const ia = triangles[i], ib = triangles[i+1], ic = triangles[i+2]
      const ax = flat[2*ia], ay = flat[2*ia+1]
      const bx = flat[2*ib], by = flat[2*ib+1]
      const cx = flat[2*ic], cy = flat[2*ic+1]
      const triArea = Math.abs((ax*(by-cy) + bx*(cy-ay) + cx*(ay-by)) / 2)
      const avgH = (vertexHeights[ia] + vertexHeights[ib] + vertexHeights[ic]) / 3
      volume += triArea * avgH
    }
  } else {
    const zs = vertices3D.map(p => p.z)
    const avgH = Math.max(...zs) - Math.min(...zs)
    volume = area * Math.max(avgH, 0)
  }

  return { area_sqm: area, volume_m3: volume }
}

export default { computeAreaAndVolume }
