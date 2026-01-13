import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

// Simple top-down miniature map for perimeter points.
// points: array of { x, z } (world meters)
export default function PerimeterMiniMap({ points = [], size = 120, padding = 8, closed = false }) {
  if (!points || points.length === 0) {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <Text style={styles.hint}>No points</Text>
      </View>
    )
  }

  // compute bounding box in X/Z
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }
  // avoid zero-size box
  if (minX === maxX) { minX -= 0.5; maxX += 0.5 }
  if (minZ === maxZ) { minZ -= 0.5; maxZ += 0.5 }

  const w = maxX - minX
  const h = maxZ - minZ
  const scale = (size - padding * 2) / Math.max(w, h)

  // map world coord to local px
  const mapPoint = (p) => {
    const px = (p.x - minX) * scale + padding
    // invert Z so larger Z is up on the mini-map
    const py = (maxZ - p.z) * scale + padding
    return { px, py }
  }

  const mapped = points.map(mapPoint)

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View style={styles.bg} />
      {/* lines */}
      {mapped.map((m, i) => {
        const next = mapped[(i + 1) % mapped.length]
        if (!next) return null
        // only draw line to next for non-closed if last point
        if (!closed && i === mapped.length - 1) return null
        const dx = next.px - m.px
        const dy = next.py - m.py
        const len = Math.sqrt(dx * dx + dy * dy)
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI
        return (
          <View key={`ln-${i}`} pointerEvents="none" style={[styles.line, {
            left: m.px,
            top: m.py - 1,
            width: Math.max(0.5, len),
            transform: [{ rotateZ: `${angle}deg` }]
          }]} />
        )
      })}

      {/* points */}
      {mapped.map((m, i) => (
        <View key={`pt-${i}`} pointerEvents="none" style={[styles.point, { left: m.px - 4, top: m.py - 4 }]}>
          <Text style={styles.ptLabel}>{i + 1}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { position: 'relative', borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.6)' },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.03)' },
  hint: { color: '#fff', padding: 8, textAlign: 'center' },
  line: { position: 'absolute', height: 2, backgroundColor: 'rgba(0,200,80,0.9)', borderRadius: 1 },
  point: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,165,0,0.95)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#fff' },
  ptLabel: { color: '#000', fontWeight: '700', fontSize: 11 }
})
