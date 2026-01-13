import { Alert } from 'react-native'

// Build a simple Wavefront OBJ string from floor polygon and per-vertex heights
// floorPoints: [{x,y,z}, ...]
// heights: [h0,h1,...] heights in meters above corresponding floor vertex
export function buildOBJFromFloorAndHeights(floorPoints, heights) {
  if (!floorPoints || floorPoints.length < 3) return ''
  const n = floorPoints.length
  const verts = []
  for (let i = 0; i < n; i++) {
    const p = floorPoints[i]
    const fx = Number(p.x || 0)
    const fy = Number(p.y || 0)
    const fz = Number(p.z || 0)
    verts.push([fx, fy, fz]) // floor vertex
  }
  // ceiling vertices
  for (let i = 0; i < n; i++) {
    const p = floorPoints[i]
    const fx = Number(p.x || 0)
    const fy = Number(p.y || 0)
    const fz = Number(p.z || 0)
    const h = (heights && typeof heights[i] === 'number') ? Number(heights[i]) : 0
    verts.push([fx, fy + h, fz])
  }

  // OBJ header
  let out = '# Exported OBJ - simple room mesh\n'
  out += '# vertices\n'
  for (const v of verts) {
    out += `v ${v[0]} ${v[1]} ${v[2]}\n`
  }

  // faces
  out += '# faces\n'
  // floor (fan triangulation)
  for (let i = 1; i < n - 1; i++) {
    // indices are 1-based
    const a = 1
    const b = i + 1
    const c = i + 2
    out += `f ${a} ${c} ${b}\n`
  }

  // ceiling (fan, indices offset by n) - reverse order so normal points outward
  for (let i = 1; i < n - 1; i++) {
    const a = n + 1
    const b = n + i + 2
    const c = n + i + 1
    out += `f ${a} ${b} ${c}\n`
  }

  // walls: for each edge, make two triangles (floor_i, floor_j, ceil_j) and (floor_i, ceil_j, ceil_i)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const fi = i + 1
    const fj = j + 1
    const ci = n + i + 1
    const cj = n + j + 1
    out += `f ${fi} ${fj} ${cj}\n`
    out += `f ${fi} ${cj} ${ci}\n`
  }

  return out
}

// Save OBJ string to a file and present share sheet when possible.
export async function saveObjToFile(objStr, filename = 'room.obj') {
  if (!objStr) return null
  try {
    // Try using Expo FileSystem + Sharing if available
    const FileSystem = require('expo-file-system')
    const Sharing = require('expo-sharing')
    const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory || ''
    const path = `${dir}${filename}`
    await FileSystem.writeAsStringAsync(path, objStr, { encoding: FileSystem.EncodingType.UTF8 })
    const canShare = await Sharing.isAvailableAsync()
    if (canShare) {
      await Sharing.shareAsync(path)
    } else {
      Alert.alert('Saved', `OBJ written to ${path}`)
    }
    return path
  } catch (e) {
    Alert.alert('Export failed', 'Install expo-file-system and expo-sharing: run `npx expo install expo-file-system expo-sharing` then rebuild.')
    return null
  }
}

export default { buildOBJFromFloorAndHeights, saveObjToFile }

// Build a simple SVG string from a perimeter for embedding in HTML/PDF
export function buildSVGFromPerimeter(perimeter = [], width = 600, height = 360) {
  if (!perimeter || perimeter.length < 3) return ''
  const xs = perimeter.map(p => (typeof p.x === 'number' ? p.x : (Array.isArray(p) ? p[0] : 0)))
  const zs = perimeter.map(p => (typeof p.z === 'number' ? p.z : (Array.isArray(p) ? p[2] : 0)))
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minZ = Math.min(...zs), maxZ = Math.max(...zs)
  const pad = 12
  const dx = Math.max(1e-6, maxX - minX)
  const dz = Math.max(1e-6, maxZ - minZ)
  const scaleX = (width - pad*2) / dx
  const scaleY = (height - pad*2) / dz
  const pts = perimeter.map(p => {
    const px = (typeof p.x === 'number' ? p.x : (Array.isArray(p) ? p[0] : 0))
    const pz = (typeof p.z === 'number' ? p.z : (Array.isArray(p) ? p[2] : 0))
    const x = ((px - minX) * scaleX) + pad
    const y = height - (((pz - minZ) * scaleY) + pad)
    return `${x},${y}`
  }).join(' ')
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'><rect width='100%' height='100%' fill='#ffffff'/><polyline points='${pts}' fill='none' stroke='#2b8cff' stroke-width='3' stroke-linejoin='round' stroke-linecap='round'/></svg>`
}

// Export a PDF summary for a measurement item. Uses expo-print and expo-sharing when available.
export async function exportPDFSummary(item, filename = null) {
  try {
    const Print = require('expo-print')
    const Sharing = require('expo-sharing')
    const perimeter = item.perimeter || item.measurements && item.measurements.perimeter || []
    const svg = buildSVGFromPerimeter(perimeter, 700, 420)
    const area = item.area_sqm || (item.measurements && item.measurements.area_sqm) || ''
    const height = item.avg_height_m || (item.measurements && item.measurements.avg_height_m) || ''
    const volume = item.volume_m3 || (item.measurements && item.measurements.volume_m3) || ''
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Room Report</title></head><body style="font-family: -apple-system, Roboto, 'Helvetica Neue', Arial; padding:20px"><h2>Room Report</h2><p><strong>Area:</strong> ${area} m²</p><p><strong>Average height:</strong> ${height} m</p><p><strong>Volume:</strong> ${volume} m³</p><div style="margin-top:16px">${svg}</div></body></html>`
    const file = await Print.printToFileAsync({ html })
    const uri = file.uri || file
    const canShare = await Sharing.isAvailableAsync()
    if (canShare) {
      await Sharing.shareAsync(uri)
      return uri
    } else {
      Alert && Alert.alert && Alert.alert('PDF saved', `Saved to ${uri}`)
      return uri
    }
  } catch (e) {
    // If expo-print or expo-sharing missing, provide guidance
    try {
      Alert && Alert.alert && Alert.alert('Export failed', 'Install expo-print and expo-sharing: run `npx expo install expo-print expo-sharing` then rebuild the app.')
    } catch (ee) {}
    return null
  }
}
