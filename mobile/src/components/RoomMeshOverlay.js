import React from 'react'
import { View, Dimensions } from 'react-native'
import Svg, { Polygon, Polyline } from 'react-native-svg'

// Props:
// - floorPoints: [{x,y,z}, ...]
// - vertexHeights: [h1, h2, ...] heights in meters relative to floor
// This component provides a simple projected 2.5D visualization of the room:
// it projects X/Z into screen space using a bounding-box mapping and
// offsets ceiling points upward to simulate depth.
export default function RoomMeshOverlay({ floorPoints = [], vertexHeights = [] }) {
  if (!floorPoints || floorPoints.length < 3) return null

  const screen = Dimensions.get('window')
  // compute bbox in X/Z
  const xs = floorPoints.map(p => p.x)
  const zs = floorPoints.map(p => p.z)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minZ = Math.min(...zs), maxZ = Math.max(...zs)
  const centerX = (minX + maxX) / 2
  const centerZ = (minZ + maxZ) / 2
  const halfW = Math.max((maxX - minX) / 2, 0.001)
  const halfD = Math.max((maxZ - minZ) / 2, 0.001)

  // Determine max sampled height for scaling
  const maxH = Math.max(...vertexHeights.filter(h => typeof h === 'number'), 2)

  // Projection mapping: map world X/Z to a centered region on screen
  const mapPoint = (p, heightOffset = 0) => {
    const nx = (p.x - centerX) / halfW // approx -1..1
    const nz = (p.z - centerZ) / halfD // approx -1..1
    const cx = screen.width / 2
    const cy = screen.height * 0.58
    const sx = cx + nx * (screen.width * 0.28)
    const syFloor = cy + nz * (screen.height * 0.14)
    const sy = syFloor - (heightOffset / Math.max(maxH, 0.0001)) * (screen.height * 0.28)
    return { x: sx, y: sy }
  }

  // Build arrays of projected floor and ceiling points
  const floorPts = floorPoints.map(p => mapPoint(p, 0))
  const ceilingPts = floorPoints.map((p, i) => mapPoint(p, vertexHeights && vertexHeights[i] ? vertexHeights[i] : 0))

  const floorCoords = floorPts.map(pt => `${pt.x},${pt.y}`).join(' ')
  const ceilCoords = ceilingPts.map(pt => `${pt.x},${pt.y}`).join(' ')

  // Walls: for each edge, build polygon floor[i], floor[i+1], ceil[i+1], ceil[i]
  const wallPolys = []
  for (let i = 0; i < floorPts.length; i++) {
    const j = (i + 1) % floorPts.length
    const a = floorPts[i]
    const b = floorPts[j]
    const c = ceilingPts[j]
    const d = ceilingPts[i]
    wallPolys.push(`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`)
  }

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
      <Svg width="100%" height="100%">
        {/* ceiling face */}
        <Polygon points={ceilCoords} fill="rgba(200,230,255,0.85)" stroke="rgba(80,120,160,0.9)" strokeWidth={1} />
        {/* floor outline */}
        <Polyline points={floorCoords} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={1.5} />
        {/* walls */}
        {wallPolys.map((pts, idx) => (
          <Polygon key={idx} points={pts} fill="rgba(180,200,220,0.35)" stroke="rgba(120,140,160,0.6)" strokeWidth={0.8} />
        ))}
      </Svg>
    </View>
  )
}
