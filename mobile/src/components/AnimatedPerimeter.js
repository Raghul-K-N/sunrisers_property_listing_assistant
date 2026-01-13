import React, { useEffect, useState } from 'react'
import { View } from 'react-native'
import Svg, { Polyline } from 'react-native-svg'
import Animated, { useSharedValue, useAnimatedReaction, runOnJS } from 'react-native-reanimated'

// AnimatedPerimeter: progressively reveals perimeter points as `progress` goes 0..1
export default function AnimatedPerimeter({ points = [], progress = 1.0, width = 200, height = 200 }) {
  const [visibleCount, setVisibleCount] = useState(points.length)
  const prog = useSharedValue(progress)

  useEffect(() => { prog.value = progress }, [progress])

  useAnimatedReaction(
    () => prog.value,
    (p, prev) => {
      const count = Math.max(0, Math.min(points.length, Math.floor((p || 0) * points.length)))
      if (count !== visibleCount) runOnJS(setVisibleCount)(count)
    },
    [points.length]
  )

  if (!points || points.length < 2) return null

  // normalize X/Z to SVG coords
  const xs = points.map(p => (Array.isArray(p) ? p[0] : p.x))
  const zs = points.map(p => (Array.isArray(p) ? p[2] : p.z))
  const minx = Math.min(...xs)
  const maxx = Math.max(...xs)
  const minz = Math.min(...zs)
  const maxz = Math.max(...zs)
  const w = maxx - minx || 1
  const h = maxz - minz || 1

  const proj = (p) => {
    const x = ( (Array.isArray(p) ? p[0] : p.x) - minx)/w * (width - 8) + 4
    const y = (1 - ((Array.isArray(p) ? p[2] : p.z) - minz)/h) * (height - 8) + 4
    return `${x},${y}`
  }

  const visiblePts = points.slice(0, Math.max(2, visibleCount))
  const ptsStr = visiblePts.map(p => proj(p)).join(' ')

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Polyline points={ptsStr} fill="none" stroke="#00aaff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  )
}
