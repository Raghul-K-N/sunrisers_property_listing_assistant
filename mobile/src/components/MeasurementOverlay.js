import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

// Helper to render a line between two screen points using a rotated View
function Line({ x1, y1, x2, y2, color = 'rgba(0,200,80,0.9)', thickness = 3 }) {
  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.sqrt(dx * dx + dy * dy)
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI
  return (
    <View
      pointerEvents="none"
      style={[
        styles.line,
        {
          left: x1,
          top: y1 - thickness / 2,
          width: Math.max(0, length),
          height: thickness,
          backgroundColor: color,
          transform: [{ rotateZ: `${angle}deg` }]
        }
      ]}
    />
  )
}

function DistanceLabel({ x1, y1, x2, y2, distText }) {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  return (
    <View pointerEvents="none" style={[styles.labelWrap, { left: mx - 40, top: my - 12 }]}> 
      <Text style={styles.labelText}>{distText}</Text>
    </View>
  )
}

export default function MeasurementOverlay({ points = [], closed = false, pending = null }) {
  // helper to compute real-world distance in cm when 3D points available
  function edgeDistanceCm(a, b) {
    if (!a || !b) return 0
    if (typeof a.x === 'number' && typeof b.x === 'number') {
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dz = a.z - b.z
      const m = Math.sqrt(dx * dx + dy * dy + dz * dz)
      return Math.round(m * 100)
    }
    // fallback to screen pixel distance (not meaningful in cm) -> return pixel value
    const px = Math.hypot((a.screenX || 0) - (b.screenX || 0), (a.screenY || 0) - (b.screenY || 0))
    return Math.round(px)
  }

  return (
    <View pointerEvents="none" style={styles.container}>
      {/* Top-left summary box */}
      <View style={styles.box}>
        <Text style={styles.h1}>Measurement Points</Text>
        <Text style={styles.item}>{points.length} points{closed ? ' (closed)' : ''}</Text>
      </View>

      {/* Draw lines and points on-screen */}
      {points.map((p, i) => {
        // draw a small circle for each point
        return (
          <View
            key={`pt-${i}`}
            style={[styles.point, { left: p.screenX - 6, top: p.screenY - 6 }]}
          />
        )
      })}

      {/* pending point preview */}
      {pending && (
        <>
          <View style={[styles.pendingPoint, { left: pending.screenX - 6, top: pending.screenY - 6 }]} />
          {points.length > 0 && (
            <Line x1={points[points.length - 1].screenX} y1={points[points.length - 1].screenY} x2={pending.screenX} y2={pending.screenY} color={'rgba(255,165,0,0.95)'} />
          )}
        </>
      )}

      {/* Lines between consecutive points and distance labels */}
      {points.map((p, i) => {
        const next = points[i + 1]
        if (!next) return null
        const dist = edgeDistanceCm(p, next)
        const distText = typeof p.x === 'number' && typeof next.x === 'number' ? `${dist} cm` : `${dist} px`
        return (
          <React.Fragment key={`ln-${i}`}>
            <Line x1={p.screenX} y1={p.screenY} x2={next.screenX} y2={next.screenY} />
            <DistanceLabel x1={p.screenX} y1={p.screenY} x2={next.screenX} y2={next.screenY} distText={distText} />
          </React.Fragment>
        )
      })}

      {/* Closing line */}
      {closed && points.length >= 3 && (
        <>
          <Line x1={points[points.length - 1].screenX} y1={points[points.length - 1].screenY} x2={points[0].screenX} y2={points[0].screenY} />
          <DistanceLabel
            x1={points[points.length - 1].screenX}
            y1={points[points.length - 1].screenY}
            x2={points[0].screenX}
            y2={points[0].screenY}
            distText={`${edgeDistanceCm(points[points.length - 1], points[0])} cm`}
          />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  box: { position: 'absolute', top: 20, left: 20, backgroundColor: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 8 },
  h1: { color: '#fff', fontWeight: '600' },
  item: { color: '#fff', fontSize: 12 },
  point: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: 'rgba(0,200,80,0.95)', borderWidth: 1, borderColor: '#fff' },
  line: { position: 'absolute', borderRadius: 2 }
  ,
  labelWrap: { position: 'absolute', width: 80, height: 24, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  labelText: { color: '#fff', fontSize: 12 }
  ,
  pendingPoint: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,165,0,0.95)', borderWidth: 1, borderColor: '#fff' }
})
