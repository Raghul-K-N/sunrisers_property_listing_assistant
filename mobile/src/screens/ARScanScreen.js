import React, { useEffect, useState, useRef } from 'react'
import { SafeAreaView } from 'react-native'
import { View, Text, StyleSheet, Button, Alert, Animated, Dimensions, TouchableOpacity, TouchableWithoutFeedback, Modal, TextInput, ScrollView, Platform, StatusBar } from 'react-native'
import ARCameraPreview from '../components/ARCameraPreview'
import useAR from '../hooks/useAR'
import ArCoreBridge from '../services/arcore'
import Svg, { Polyline, Text as SvgText, G } from 'react-native-svg'
import AsyncStorage from '@react-native-async-storage/async-storage'
import theme from '../styles/theme'

export default function ARScanScreen({ onDetected }) {
  const { startSession, stopSession, measurements, isSupported } = useAR()
  const [planes, setPlanes] = useState([])
  const subRef = useRef(null)
  const [scanning, setScanning] = useState(false)
  const pulse = useRef(new Animated.Value(0)).current
  const [points, setPoints] = useState([])
  const [closed, setClosed] = useState(false)
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const toolbarAnim = useRef(new Animated.Value(120)).current
  const [candidates, setCandidates] = useState([]) // auto-detected corner candidates (world x,z)
  const [preview, setPreview] = useState(null) // { world: {x,z}, screenX, screenY, snapped: {x,z}, snapLabel }
  const previewInterval = useRef(null)
  const dashAnim = useRef(new Animated.Value(0)).current
  const AnimatedPolyline = Animated.createAnimatedComponent(Polyline)
  const [areaM2, setAreaM2] = useState(0)
  const [vertexHeights, setVertexHeights] = useState([])
  const [ceilingSampleStatus, setCeilingSampleStatus] = useState('idle')
  const [avgHeightM, setAvgHeightM] = useState(0)
  const [volumeM3, setVolumeM3] = useState(0)
  const [scanProgress, setScanProgress] = useState(0)
  const [isFloorDetected, setIsFloorDetected] = useState(false)
  const [showReview, setShowReview] = useState(false)

  useEffect(() => {
    let mounted = true
    async function init() {
      // load persisted points
      try {
        const raw = await AsyncStorage.getItem('@ar_scan_points_v1')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) setPoints(parsed)
        }
      } catch (e) {
        // ignore
      }
      // Check support
      if (isSupported === false) {
        Alert.alert('AR not supported', 'Your device does not appear to support AR features.')
        return
      }
      // start AR session
      const ok = await startSession()
      if (!ok) return
      if (!mounted) return
      setScanning(false)
      // Remove automatic simulation start from here; wait for button click

      // subscribe to plane events (native or simulated)
      subRef.current = ArCoreBridge.onPlaneDetected((p) => {
        if (!mounted) return
        // append plane if new (by id) or update existing
        setPlanes(prev => {
          const idx = prev.findIndex(x => x.id === p.id)
          if (idx >= 0) {
            const next = prev.slice()
            next[idx] = p
            // recompute candidates when planes update
            setTimeout(() => computeCandidatesFromPlanes(next), 10)
            return next
          }
          const next = [...prev, p]
          setTimeout(() => computeCandidatesFromPlanes(next), 10)
          return next
        })
      })
    }
    init()

    // start preview polling when mounted
    previewInterval.current = setInterval(async () => {
      if (!mounted) return
      if (!scanning) return
      const screen = Dimensions.get('window')
      const cx = Math.round(screen.width / 2)
      const cy = Math.round(screen.height / 2)
      try {
        const hit = await ArCoreBridge.hitTest(cx, cy, screen.width, screen.height)
        if (!hit) return
        const snap = computeSnap({ x: hit.x, z: hit.z }, candidates)
        setPreview({ world: { x: hit.x, z: hit.z }, screenX: cx, screenY: cy, snapped: snap.point, snapLabel: snap.label })
      } catch (e) {
        // ignore
      }
    }, 200)

    // pulse animation for instruction dot
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true })
      ])
    ).start()

    return () => {
      mounted = false
      if (subRef.current) subRef.current()
      if (previewInterval.current) clearInterval(previewInterval.current)
      stopSession()
    }
  }, [isSupported])

  // persist points
  async function savePointsToStorage(arr) {
    try {
      await AsyncStorage.setItem('@ar_scan_points_v1', JSON.stringify(arr || []))
    } catch (e) {
      // ignore
    }
  }

  function pushUndoSnapshot() {
    try {
      undoStackRef.current.push(points.slice())
      if (undoStackRef.current.length > 60) undoStackRef.current.shift()
    } catch (e) { }
  }

  const CLOSE_RADIUS_M = 0.45

  function addPointWrapped(newPoint) {
    if (closed) return Alert.alert('Room closed', 'The room polygon is already closed.')
    pushUndoSnapshot()
    redoStackRef.current = []

    // auto-close detection: if new point is near the first point and we have >=3 points
    if (points && points.length >= 3) {
      const first = points[0]
      const d = dist2({ x: newPoint.x, z: newPoint.z }, { x: first.x, z: first.z })
      if (d <= CLOSE_RADIUS_M) {
        Alert.alert('Close shape?', 'First and last points are very close. Close polygon now?', [
          {
            text: 'Keep adding', style: 'cancel', onPress: () => {
              const next = [...points, newPoint]
              setPoints(next)
              savePointsToStorage(next)
            }
          },
          {
            text: 'Close polygon', style: 'default', onPress: () => {
              // Don't add the near-duplicate point; mark closed
              setClosed(true)
              savePointsToStorage(points)
            }
          }
        ])
        return
      }
    }

    // optimize edge geometry (snap to straight/orthogonal when appropriate)
    const optimized = optimizeEdge(newPoint)
    const next = [...points, optimized]
    setPoints(next)
    savePointsToStorage(next)
  }

  function undo() {
    if (!undoStackRef.current.length) return
    const prev = undoStackRef.current.pop()
    redoStackRef.current.push(points.slice())
    setPoints(prev)
    savePointsToStorage(prev)
  }

  function redo() {
    if (!redoStackRef.current.length) return
    const nextState = redoStackRef.current.pop()
    undoStackRef.current.push(points.slice())
    setPoints(nextState)
    savePointsToStorage(nextState)
  }

  function clearPoints() {
    pushUndoSnapshot()
    redoStackRef.current = []
    setPoints([])
    savePointsToStorage([])
  }

  async function handleScreenTap(e) {
    if (!scanning) return
    const { locationX, locationY } = e.nativeEvent
    const screen = Dimensions.get('window')

    // If scanning but floor not detected, we let them tap but maybe show a hint
    if (!isFloorDetected) {
      // simulate detection on manual tap if they are impatient
      setIsFloorDetected(true)
      setScanProgress(1)
    }

    try {
      const hit = await ArCoreBridge.hitTest(locationX, locationY, screen.width, screen.height)
      if (!hit) return
      const snap = computeSnap({ x: hit.x, z: hit.z }, candidates)
      addPointWrapped({ x: snap.point.x, y: hit.y, z: snap.point.z, screenX: locationX, screenY: locationY, snapped: snap.label })
    } catch (err) {
      console.warn('Tap hit test failed:', err)
    }
  }

  // Recompute candidates when planes change (include floor corners)
  function computeCandidatesFromPlanes(planesList) {
    try {
      const verts = []
      planesList.forEach(pl => {
        const poly = pl.polygon_m || []
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i]
          const b = poly[(i + 1) % poly.length]
          verts.push({ a: { x: a[0], z: a[2] }, b: { x: b[0], z: b[2] } })
        }
      })

      const cand = []
      for (let i = 0; i < verts.length; i++) {
        // add polygon vertices as candidates themselves
        cand.push(verts[i].a)
        for (let j = i + 1; j < verts.length; j++) {
          const p = lineIntersection(verts[i].a, verts[i].b, verts[j].a, verts[j].b)
          if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) cand.push(p)
        }
      }
      setCandidates(cand)
    } catch (e) {
      // ignore
    }
  }

  // Project world X/Z into approximate perspective screen coordinates
  function projectPointToScreen(p) {
    const screen = Dimensions.get('window')
    const cx = screen.width / 2
    const cy = screen.height / 2

    // Simple perspective projection:
    // nx maps to horizontal tilt, nz maps to z-depth with foreshortening
    const nx = p.x / 2.0
    const nz = p.z / 2.0

    // Perspective factors matching the Grid styles
    const perspective = 1000
    const zOffset = 150
    const angleRad = (75 * Math.PI) / 180

    // Approximate transform for world z -> screen y with foreshortening
    const cosA = Math.cos(angleRad)
    const sinA = Math.sin(angleRad)

    // Simple 3D -> 2D projection logic
    const worldY = 0 // ground plane
    const ty = worldY * cosA - nz * sinA
    const tz = worldY * sinA + nz * cosA + 500 // 500 is distance from cam

    const scale = perspective / (perspective + tz)
    const sx = cx + (nx * 800) * scale
    const sy = cy + (ty * 800) * scale + zOffset

    return { x: sx, y: sy }
  }

  // line intersection in 2D (x,z)
  function lineIntersection(a1, a2, b1, b2) {
    const x1 = a1.x, y1 = a1.z, x2 = a2.x, y2 = a2.z
    const x3 = b1.x, y3 = b1.z, x4 = b2.x, y4 = b2.z
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if (Math.abs(denom) < 1e-9) return null
    const xi = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom
    const yi = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom
    return { x: xi, z: yi }
  }

  // closest point on segment and distance
  function closestPointOnSegment(p, a, b) {
    const vx = b.x - a.x, vz = b.z - a.z
    const wx = p.x - a.x, wz = p.z - a.z
    const c = (wx * vx + wz * vz) / (vx * vx + vz * vz || 1e-9)
    const t = Math.max(0, Math.min(1, c))
    return { x: a.x + vx * t, z: a.z + vz * t }
  }

  function dist2(p, q) { const dx = p.x - q.x; const dz = p.z - q.z; return Math.hypot(dx, dz) }

  // compute snap: if close to candidate corner => snap, else snap to nearest wall segment; returns {point,label}
  function computeSnap(worldPoint, candidateCorners) {
    const SNAP_RADIUS_M = 0.25 // tighter snap for professional feel
    // 1. snap to candidate corners
    if (candidateCorners && candidateCorners.length) {
      let best = null, bestD = Infinity
      for (const c of candidateCorners) {
        const d = dist2(worldPoint, c)
        if (d < bestD) { bestD = d; best = c }
      }
      if (best && bestD <= SNAP_RADIUS_M) return { point: { ...best, snapped: true }, label: 'corner' }
    }
    // 2. snap to nearest wall segment from planes
    let bestSegPt = null, bestSegD = Infinity
    planes.forEach(pl => {
      const poly = pl.polygon_m || []
      for (let i = 0; i < poly.length; i++) {
        const a3 = poly[i], b3 = poly[(i + 1) % poly.length]
        const a = { x: a3[0], z: a3[2] }, b = { x: b3[0], z: b3[2] }
        const cp = closestPointOnSegment(worldPoint, a, b)
        const d = dist2(worldPoint, cp)
        if (d < bestSegD) { bestSegD = d; bestSegPt = cp }
      }
    })
    if (bestSegPt && bestSegD <= SNAP_RADIUS_M) return { point: { ...bestSegPt, snapped: true }, label: 'wall' }
    // no snap: return original
    return { point: worldPoint, label: 'free' }
  }

  // geometry helpers
  function length(v) { return Math.hypot(v.x, v.z) }
  function normalize(v) { const L = length(v) || 1; return { x: v.x / L, z: v.z / L } }
  function dot(a, b) { return a.x * b.x + a.z * b.z }
  function projectOnto(v, dir) { const t = dot(v, dir); return { x: dir.x * t, z: dir.z * t } }

  // Optimize edge by snapping new point to be colinear or orthogonal relative to previous segment
  function optimizeEdge(candidatePoint) {
    if (!points || points.length < 2) return candidatePoint
    const n = points.length
    const last = points[n - 1]
    const prev = points[n - 2]
    const lastDir = normalize({ x: last.x - prev.x, z: last.z - prev.z })
    const newVec = { x: candidatePoint.x - last.x, z: candidatePoint.z - last.z }
    const newLen = length(newVec)
    if (newLen < 1e-6) return candidatePoint
    const newDir = normalize(newVec)
    // angle via dot
    const cosAng = Math.max(-1, Math.min(1, dot(lastDir, newDir)))
    const ang = Math.acos(cosAng)
    const ANGLE_SNAP_RAD = (12 * Math.PI) / 180 // 12 degrees
    // orthogonal check
    const perp = { x: -lastDir.z, z: lastDir.x }
    const cosPerp = Math.max(-1, Math.min(1, dot(perp, newDir)))
    const angPerp = Math.acos(cosPerp)

    if (ang <= ANGLE_SNAP_RAD) {
      // snap colinear: project newVec onto lastDir
      const proj = projectOnto(newVec, lastDir)
      return { x: last.x + proj.x, y: candidatePoint.y, z: last.z + proj.z }
    }
    if (angPerp <= ANGLE_SNAP_RAD) {
      // snap orthogonal
      const proj = projectOnto(newVec, perp)
      return { x: last.x + proj.x, y: candidatePoint.y, z: last.z + proj.z }
    }
    return candidatePoint
  }

  // point-in-polygon test on XZ plane for polygon given as array of [x,y,z]
  function pointInPolygonXZ(x, z, poly) {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], zi = poly[i][2]
      const xj = poly[j][0], zj = poly[j][2]
      const intersect = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi + 1e-9) + xi)
      if (intersect) inside = !inside
    }
    return inside
  }

  // sample ceiling heights for each floor vertex
  async function sampleCeilingHeightsForPerimeter() {
    if (!points || points.length < 3) return Alert.alert('Need at least 3 points to sample ceiling')
    setCeilingSampleStatus('sampling')
    const results = []
    for (let i = 0; i < points.length; i++) {
      const v = points[i]
      const floorY = v.y || 0
      let samples = []
      // 1) search detected horizontal planes that cover this XZ
      for (const pl of planes) {
        const normal = pl.normal || { x: 0, y: 1, z: 0 }
        if (Math.abs((normal.y || 0)) < 0.7) continue
        const poly = pl.polygon_m || []
        if (poly.length && pointInPolygonXZ(v.x, v.z, poly)) {
          // take plane Y as candidate - use center_m if available
          const cy = (pl.center_m && pl.center_m[1]) || (poly[0] && poly[0][1]) || null
          if (cy && (cy - floorY) > 0.8) samples.push(cy)
        }
      }
      // 2) fallback: try hitTests at projected screen pos with offsets to aim upward
      if (samples.length === 0) {
        const screen = projectPointToScreen(v)
        const attempts = [0, -30, -60, -90, -120]
        for (const off of attempts) {
          try {
            const sx = Math.round(screen.x)
            const sy = Math.round(screen.y + off)
            const hit = await ArCoreBridge.hitTest(sx, sy, Dimensions.get('window').width, Dimensions.get('window').height)
            if (hit && typeof hit.y === 'number' && (hit.y - floorY) > 0.8) {
              samples.push(hit.y)
            }
          } catch (e) {
            // ignore
          }
        }
      }
      // compute robust average: remove outliers beyond 0.6m from median
      if (samples.length) {
        const sorted = samples.slice().sort((a, b) => a - b)
        const mid = sorted[Math.floor(sorted.length / 2)]
        const filtered = samples.filter(s => Math.abs(s - mid) <= 0.6)
        const avg = filtered.reduce((acc, vv) => acc + vv, 0) / filtered.length
        results.push(avg)
      } else {
        results.push(null)
      }
    }
    setVertexHeights(results)
    setCeilingSampleStatus('done')
    return results
  }

  useEffect(() => {
    // slide toolbar up when scanning
    Animated.timing(toolbarAnim, { toValue: scanning ? 0 : 120, duration: 320, useNativeDriver: true }).start()
  }, [scanning])

  // compute area when points change
  useEffect(() => {
    if (!points || points.length < 3) {
      setAreaM2(0)
      return
    }
    try {
      const a = shoelaceArea(points)
      setAreaM2(a)
    } catch (e) {
      setAreaM2(0)
    }
  }, [points])

  // compute average height and volume when vertex heights or area change
  useEffect(() => {
    // compute average from vertexHeights, ignore nulls
    if (!vertexHeights || !vertexHeights.length) {
      setAvgHeightM(0)
      setVolumeM3(0)
      return
    }
    const vals = vertexHeights.filter(h => typeof h === 'number' && isFinite(h) && h > 0)
    if (!vals.length) {
      setAvgHeightM(0)
      setVolumeM3(0)
      return
    }
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length
    setAvgHeightM(avg)
    const vol = areaM2 * avg
    setVolumeM3(vol)
  }, [vertexHeights, areaM2])

  function shoelaceArea(pts) {
    // pts: array of objects with x,z
    const n = pts.length
    if (n < 3) return 0
    let sum = 0
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const xi = pts[i].x
      const yi = pts[i].z
      const xj = pts[j].x
      const yj = pts[j].z
      sum += (xi * yj) - (xj * yi)
    }
    return Math.abs(sum) * 0.5
  }

  // animate dash offset for perimeter line
  useEffect(() => {
    Animated.loop(
      Animated.timing(dashAnim, { toValue: 24, duration: 1200, useNativeDriver: true })
    ).start()
  }, [])

  // derive counts
  const horiz = planes.filter(p => !p.normal || Math.abs((p.normal && p.normal.y) || 0) > 0.5).length
  const vert = planes.filter(p => p.normal && Math.abs((p.normal.y || 0)) <= 0.5).length

  return (
    <View style={styles.container}>
      <TouchableWithoutFeedback onPress={handleScreenTap}>
        <View style={StyleSheet.absoluteFill}>
          <ARCameraPreview />

          {/* Overlay grid */}
          <View pointerEvents="box-none" style={styles.overlay}>
            {isFloorDetected && <Grid />}

            {/* Reticle / Crosshair */}
            <View pointerEvents="none" style={styles.reticleContainer}>
              {/* Vertical Corner Line (ARPlan 3D style) */}
              {isFloorDetected && (
                <View style={styles.verticalCornerLine} />
              )}
              {/* Magnifier View (Simulated zoomed circle) */}
              {isFloorDetected && (
                <View style={styles.magnifier}>
                  <View style={styles.magnifierGrid}>
                    <Grid mini />
                  </View>
                  <View style={styles.magnifierCross} />
                </View>
              )}
              <View style={[styles.reticleCross, isFloorDetected && styles.reticleActive]} />
              {isFloorDetected && <Text style={styles.reticleHint}>Align corner and tap</Text>}
            </View>

            <View style={styles.instructionBox}>
              <Text style={styles.instructionTitle}>{isFloorDetected ? 'Floor Detected' : 'Scanning Space...'}</Text>
              <Text style={styles.instructionSub}>
                {isFloorDetected
                  ? 'Move around to see the grid. Tap to mark corners of the room.'
                  : 'Move your device slowly to sweep the room. Mapping environment...'}
              </Text>
              {!isFloorDetected && (
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${scanProgress * 100}%` }]} />
                </View>
              )}
              <View style={styles.statusRow}>
                <Text style={styles.statusText}>Horizontal Planes: {horiz}</Text>
              </View>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>

      <View style={styles.arOverlay} pointerEvents="box-none">
        {/* AR Ruler Labels & Segments */}
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Main Polygon Segments */}
          {points && points.length > 1 && (
            <Polyline
              points={points.map(p => {
                const sp = projectPointToScreen(p)
                return `${sp.x},${sp.y}`
              }).join(' ')}
              fill="rgba(94,231,223,0.1)"
              stroke="#5ee7df"
              strokeWidth="3"
            />
          )}

          {/* Individual Segment Labels (Ruler Style) */}
          {points && points.length > 1 && points.map((p, i) => {
            if (i === 0) return null
            const prev = points[i - 1]
            const p1 = projectPointToScreen(prev)
            const p2 = projectPointToScreen(p)
            const dist = Math.sqrt(Math.pow(p.x - prev.x, 2) + Math.pow(p.z - prev.z, 2))
            const labelX = (p1.x + p2.x) / 2
            const labelY = (p1.y + p2.y) / 2

            return (
              <G key={`label-${i}`}>
                <SvgText
                  x={labelX}
                  y={labelY - 10}
                  fill="#fff"
                  fontSize="14"
                  fontWeight="bold"
                  textAnchor="middle"
                  stroke="#000"
                  strokeWidth="0.5"
                >
                  {dist.toFixed(2)}m
                </SvgText>
              </G>
            )
          })}

          {/* Live Preview Segment & Ruler */}
          {scanning && points.length > 0 && preview && (
            <G>
              <Polyline
                points={`${projectPointToScreen(points[points.length - 1]).x},${projectPointToScreen(points[points.length - 1]).y} ${preview.screenX},${preview.screenY}`}
                stroke="#5ee7df"
                strokeWidth="2"
                strokeDasharray="5,5"
              />
              <SvgText
                x={(projectPointToScreen(points[points.length - 1]).x + preview.screenX) / 2}
                y={(projectPointToScreen(points[points.length - 1]).y + preview.screenY) / 2 - 10}
                fill="#5ee7df"
                fontSize="14"
                fontWeight="bold"
                textAnchor="middle"
                stroke="#000"
                strokeWidth="0.5"
              >
                {(Math.sqrt(Math.pow(preview.world.x - points[points.length - 1].x, 2) + Math.pow(preview.world.z - points[points.length - 1].z, 2))).toFixed(2)}m
              </SvgText>
            </G>
          )}
        </Svg>

        {/* candidate corner markers */}
        {candidates && candidates.map((c, idx) => {
          const screenPos = projectPointToScreen(c)
          return (
            <View key={`cand-${idx}`} style={[styles.candidateMarker, { left: screenPos.x - 6, top: screenPos.y - 6 }]} />
          )
        })}

        {/* live preview marker at center (snapped or free) */}
        {preview && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: preview.screenX - 16,
              top: preview.screenY - 16
            }}
          >
            <View
              style={[
                styles.previewMarker,
                preview.snapLabel === 'corner'
                  ? styles.previewCorner
                  : preview.snapLabel === 'wall'
                    ? styles.previewWall
                    : null
              ]}
            />

            <Text style={styles.previewLabel}>
              {preview.snapLabel}
            </Text>
          </View>
        )}

        {/* area readout */}
        <View style={styles.areaCard} pointerEvents="none">
          <Text style={styles.areaText}>{areaM2 > 0 ? `${areaM2.toFixed(2)} m2` : '- m2'}</Text>
          <Text style={styles.areaSub}>{areaM2 > 0 ? `${(areaM2 * 10.7639).toFixed(1)} ft2` : '- ft2'}</Text>
        </View>
        {/* ceiling status */}
        {ceilingSampleStatus !== 'idle' && (
          <View style={styles.sampleCard} pointerEvents="none">
            <Text style={{ color: '#fff', fontSize: 12 }}>Ceiling: {ceilingSampleStatus}</Text>
          </View>
        )}
        {/* volume readout */}
        <View style={styles.volumeCard} pointerEvents="none">
          <Text style={styles.volumeText}>{volumeM3 > 0 ? `${volumeM3.toFixed(2)} m3` : '- m3'}</Text>
          <Text style={styles.volumeSub}>{volumeM3 > 0 ? `${(volumeM3 * 35.3147).toFixed(1)} ft3` : '- ft3'}</Text>
          {avgHeightM > 0 && <Text style={styles.heightSub}>{`${avgHeightM.toFixed(2)} m avg`}</Text>}
        </View>
        <Animated.View style={[styles.pulse, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0.15] }) }]} />

        {/* Guidance coach overlay */}
        <GuidanceCoach />
      </View>

      <View style={styles.footer}>
        <Button title={scanning ? (points.length >= 3 ? 'Finish & Review' : 'Stop Scan') : 'Start Scan'} onPress={async () => {
          if (scanning) {
            if (points.length >= 3) {
              // Done - show review
              setShowReview(true)
              setScanning(false)
            } else {
              if (subRef.current) subRef.current()
              await stopSession()
              setScanning(false)
              setIsFloorDetected(false)
              setScanProgress(0)
            }
          } else {
            const ok = await startSession()
            if (ok) {
              setScanning(true)
              let progress = 0
              const progInt = setInterval(() => {
                progress += 0.05
                if (progress >= 1) {
                  progress = 1
                  setIsFloorDetected(true)
                  clearInterval(progInt)
                }
                setScanProgress(progress)
              }, 100)
            }
          }
        }} />
      </View>

      {/* Slide-up toolbar with floating actions */}
      <Animated.View style={[styles.toolbar, { transform: [{ translateY: toolbarAnim }] }]} pointerEvents="box-none">
        <View style={styles.leftActions} pointerEvents="box-none">
          <FloatingButton onPress={async () => {
            if (!isFloorDetected) return Alert.alert('Scanning...', 'Please wait for the floor to be detected.')
            // perform center hit test and add point locally
            const screen = Dimensions.get('window')
            const cx = Math.round(screen.width / 2)
            const cy = Math.round(screen.height / 2)
            try {
              const hit = await ArCoreBridge.hitTest(cx, cy, screen.width, screen.height)
              if (!hit) return Alert.alert('No surface detected at center')
              // compute snap from hit
              const snap = computeSnap({ x: hit.x, z: hit.z }, candidates)
              addPointWrapped({ x: snap.point.x, y: hit.y, z: snap.point.z, screenX: cx, screenY: cy, snapped: snap.label })
            } catch (e) {
              Alert.alert('Hit test failed', String(e))
            }
          }} label="Add point" icon={'➕'} />
          <FloatingButton onPress={() => undo()} label="Undo" icon={'↶'} />
          <FloatingButton onPress={() => redo()} label="Redo" icon={'↷'} />
        </View>

        <View style={styles.rightActions} pointerEvents="box-none">
          <FloatingButton onPress={() => clearPoints()} label="Clear" icon={'🗑️'} color="#ff6666" />
          <FloatingButton onPress={async () => {
            setCeilingSampleStatus('starting')
            const heights = await sampleCeilingHeightsForPerimeter()
            // show quick feedback
            if (heights && heights.length) Alert.alert('Ceiling sampled', `Got ${heights.filter(h => h).length} heights`)
          }} label="Sample H" icon={'📶'} color="#6a9cff" />
        </View>
      </Animated.View>

      {/* render simple placed point markers */}
      {/* perimeter lines (projected) */}
      {points && points.length >= 2 && (
        (() => {
          const proj = points.map(p => projectPointToScreen(p))
          const ptsStr = proj.map(r => `${r.x},${r.y}`).join(' ')
          return (
            <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} pointerEvents="none">
              <Svg width="100%" height="100%">
                <AnimatedPolyline
                  points={ptsStr}
                  fill="none"
                  stroke="rgba(46,204,113,0.9)"
                  strokeWidth={3}
                  strokeDasharray={[12, 8]}
                  strokeDashoffset={dashAnim}
                  strokeLinecap="round"
                />
              </Svg>
            </View>
          )
        })()
      )}

      {/* Review & Edit Modal */}
      <Modal visible={showReview} animationType="slide" transparent={false}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
          <ScrollView style={{ padding: 20 }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: '#1a1a1b', marginBottom: 20 }}>Review Measurements</Text>

            <View style={reviewStyles.card}>
              <Text style={reviewStyles.label}>Area (sqm)</Text>
              <TextInput
                style={reviewStyles.input}
                keyboardType="numeric"
                value={String(areaM2.toFixed(2))}
                onChangeText={(v) => setAreaM2(Number(v) || 0)}
              />

              <Text style={reviewStyles.label}>Estimated Volume (m3)</Text>
              <TextInput
                style={reviewStyles.input}
                keyboardType="numeric"
                value={String(volumeM3.toFixed(2))}
                onChangeText={(v) => setVolumeM3(Number(v) || 0)}
              />

              <Text style={reviewStyles.label}>Number of Corners</Text>
              <Text style={{ fontSize: 18, color: '#333' }}>{points.length}</Text>
            </View>

            <Text style={{ color: '#666', marginTop: 10, fontSize: 13 }}>
              You can manually adjust the area and volume if the AR scan requires fine-tuning.
            </Text>
          </ScrollView>

          <View style={{ padding: 20, borderTopWidth: 1, borderColor: '#eee', backgroundColor: '#fff' }}>
            <TouchableOpacity
              style={reviewStyles.submitBtn}
              onPress={() => {
                setShowReview(false)
                if (onDetected) onDetected({ area_sqm: areaM2, volume_m3: volumeM3, points })
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Confirm & Submit Listing</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ marginTop: 12, alignItems: 'center' }}
              onPress={() => setShowReview(false)}
            >
              <Text style={{ color: '#666' }}>Go back to Scan</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  )
}

const reviewStyles = StyleSheet.create({
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 12, ...theme.shadow },
  label: { fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 4, marginTop: 16 },
  input: { borderBottomWidth: 1, borderColor: '#5ee7df', fontSize: 18, color: '#333', paddingVertical: 8 },
  submitBtn: { backgroundColor: '#2ecc71', padding: 16, borderRadius: 12, alignItems: 'center' }
})

const Grid = ({ mini }) => (
  <View style={[styles.gridContainer, mini && styles.gridContainerMini]}>
    <View style={[styles.gridPerspective, mini && styles.gridPerspectiveMini]}>
      <View style={[styles.grid, mini && styles.gridMini]}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
          <View key={`h-${i}`} style={[styles.gridLine, { top: `${i * 10}%`, left: 0, right: 0, height: 1 }]} />
        ))}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
          <View key={`v-${i}`} style={[styles.gridLine, { left: `${i * 10}%`, top: 0, bottom: 0, width: 1 }]} />
        ))}
      </View>
    </View>
  </View>
)

const GuidanceCoach = () => {
  const [step, setStep] = useState(1)
  const arrow = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(arrow, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(arrow, { toValue: 0, duration: 700, useNativeDriver: true })
      ])
    ).start()
  }, [])

  const arrowTranslate = arrow.interpolate({ inputRange: [0, 1], outputRange: [0, -14] })

  function next() { setStep(s => Math.min(3, s + 1)) }
  function prev() { setStep(s => Math.max(1, s - 1)) }

  return (
    <View style={coachStyles.container} pointerEvents="box-none">
      <View style={coachStyles.card}>
        <Text style={coachStyles.title}>Guide</Text>
        <View style={{ marginTop: 8 }}>
          {step === 1 && (
            <View style={coachStyles.stepRow}>
              <Animated.Text style={[coachStyles.arrow, { transform: [{ translateY: arrowTranslate }] }]}>⬆️</Animated.Text>
              <Text style={coachStyles.hintTitle}>Step 1 — Scan floor</Text>
              <Text style={coachStyles.hintText}>Move your phone slowly in a sweeping motion until the floor is detected.</Text>
            </View>
          )}
          {step === 2 && (
            <View style={coachStyles.stepRow}>
              <Animated.Text style={[coachStyles.arrow, { transform: [{ translateY: arrowTranslate }] }]}>👆</Animated.Text>
              <Text style={coachStyles.hintTitle}>Step 2 — Tap to place points</Text>
              <Text style={coachStyles.hintText}>Tap on screen to add corner points around the room perimeter.</Text>
            </View>
          )}
          {step === 3 && (
            <View style={coachStyles.stepRow}>
              <Animated.Text style={[coachStyles.arrow, { transform: [{ translateY: arrowTranslate }] }]}>✅</Animated.Text>
              <Text style={coachStyles.hintTitle}>Step 3 — Confirm area</Text>
              <Text style={coachStyles.hintText}>Review the polygon, edit if needed, then save to compute area and volume.</Text>
            </View>
          )}
        </View>

        <View style={coachStyles.controls}>
          <TouchableOpacity onPress={prev}><Text style={coachStyles.ctrl}>Prev</Text></TouchableOpacity>
          <TouchableOpacity onPress={next}><Text style={coachStyles.ctrl}>Next</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setStep(1)}><Text style={coachStyles.ctrl}>Reset</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const coachStyles = StyleSheet.create({
  container: { position: 'absolute', left: 16, right: 16, bottom: 100, alignItems: 'center' },
  card: { width: '100%', backgroundColor: 'rgba(0,0,0,0.6)', padding: 12, borderRadius: 12 },
  title: { color: '#fff', fontWeight: '700' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  arrow: { fontSize: 28, marginRight: 8 },
  hintTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  hintText: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 4 },
  controls: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between' },
  ctrl: { color: '#5ee7df', paddingHorizontal: 10 }
})

// Floating action button used in toolbar
function FloatingButton({ onPress, label, icon, color = '#2b8cff' }) {
  return (
    <TouchableOpacity onPress={onPress} style={[fabStyles.wrap, { backgroundColor: color }]} activeOpacity={0.85}>
      <Text style={fabStyles.icon}>{icon}</Text>
      {label ? <Text style={fabStyles.label}>{label}</Text> : null}
    </TouchableOpacity>
  )
}

const fabStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, alignItems: 'center', marginVertical: 6, minWidth: 64 },
  icon: { fontSize: 18, color: '#fff', marginBottom: 4 },
  label: { color: '#fff', fontSize: 12 }
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-start', alignItems: 'center', zIndex: 50 },
  grid: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  gridLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.06)' },
  gridContainer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  gridPerspective: {
    width: 600,
    height: 600,
    transform: [
      { perspective: 1000 },
      { rotateX: '75deg' },
      { translateY: 150 }
    ]
  },
  grid: { width: '100%', height: '100%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  gridMini: { borderColor: 'rgba(94,231,223,0.4)', borderWidth: 2 },
  gridLine: { position: 'absolute', backgroundColor: 'rgba(94,231,223,0.3)' },
  gridContainerMini: { backgroundColor: 'transparent' },
  gridPerspectiveMini: { width: 400, height: 400, transform: [{ perspective: 1000 }, { rotateX: '75deg' }, { translateY: 100 }, { scale: 1.5 }] },
  magnifier: { position: 'absolute', top: -110, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(0,0,0,0.5)', overflow: 'hidden', borderWidth: 2, borderColor: '#5ee7df', alignItems: 'center', justifyContent: 'center' },
  magnifierGrid: { width: 100, height: 100, position: 'absolute' },
  magnifierCross: { width: 10, height: 10, borderWidth: 1, borderColor: '#fff' },
  verticalCornerLine: {
    position: 'absolute',
    top: -500,
    bottom: -500,
    width: 2,
    backgroundColor: 'rgba(94,231,223,0.8)',
    shadowColor: '#5ee7df',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  reticleContainer: { position: 'absolute', top: '50%', left: '50%', marginLeft: -20, marginTop: -20, alignItems: 'center', justifyContent: 'center' },
  reticleCross: { width: 40, height: 40, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 20 },
  reticleActive: { borderColor: '#5ee7df', borderWidth: 3, transform: [{ scale: 1.1 }] },
  reticleHint: { color: '#5ee7df', fontSize: 10, marginTop: 4, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  progressBarBg: { height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginTop: 12, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#5ee7df' },
  instructionBox: { position: 'absolute', top: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 48), left: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.85)', padding: 16, borderRadius: 12, zIndex: 100 },
  instructionTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  instructionSub: { color: 'rgba(255,255,255,0.95)', marginTop: 8, fontSize: 14 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  statusText: { color: '#5ee7df', marginRight: 12, fontWeight: '600' },
  footer: { position: 'absolute', bottom: 40, left: 20, right: 20, zIndex: 100 },
  pulse: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: '#5ee7df', top: 120, opacity: 0.5 },
  toolbar: { position: 'absolute', left: 18, right: 18, bottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  leftActions: { flexDirection: 'column', alignItems: 'flex-start' },
  rightActions: { flexDirection: 'column', alignItems: 'flex-end' },
  marker: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(94,231,223,0.95)', borderWidth: 2, borderColor: '#fff' },
  arOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 25, pointerEvents: 'none' },
  candidateMarker: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,200,0,0.9)', borderWidth: 1, borderColor: '#fff' },
  previewMarker: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,150,255,0.9)', borderWidth: 2, borderColor: '#fff' },
  previewCorner: { backgroundColor: 'rgba(0,200,100,0.95)' },
  previewWall: { backgroundColor: 'rgba(255,140,0,0.95)' },
  previewLabel: { color: '#fff', fontSize: 12, textAlign: 'center', marginTop: 4 },
  areaCard: { position: 'absolute', top: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 10 : 24), right: 18, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 8, alignItems: 'center' },
  areaText: { color: '#b7f2e6', fontWeight: '700', fontSize: 16 },
  areaSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  sampleCard: { position: 'absolute', top: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 50 : 74), right: 18, backgroundColor: 'rgba(0,0,0,0.55)', padding: 6, borderRadius: 8 },
  volumeCard: { position: 'absolute', top: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 85 : 120), right: 18, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 8, alignItems: 'center' },
  volumeText: { color: '#ffd7a6', fontWeight: '700', fontSize: 14 },
  volumeSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11 },
  heightSub: { color: 'rgba(180,255,220,0.9)', fontSize: 11, marginTop: 4 }
})
