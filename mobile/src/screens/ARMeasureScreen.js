import React, { useEffect, useState, useRef } from 'react'
import { View, Text, Button, StyleSheet, Alert, Dimensions, Pressable, Platform, StatusBar } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import ARCameraPreview from '../components/ARCameraPreview'
import MeasurementOverlay from '../components/MeasurementOverlay'
import useAR from '../hooks/useAR'
import ArCoreBridge from '../services/arcore'
import { computeMeasurement, shoelaceAreaFromXZ, convexHull, computeVolumeFromFloorAndHeights } from '../services/arcore/geometry'
import { computeAreaAndVolume } from '../utils/arMath'
import PerimeterMiniMap from '../components/PerimeterMiniMap'
import ARMeasurementModal from '../components/ARMeasurementModal'
import ARVolumeModal from '../components/ARVolumeModal'
import RoomMeshOverlay from '../components/RoomMeshOverlay'
import ARDebugOverlay from '../components/ARDebugOverlay'
import { computeConfidence } from '../services/arcore/confidence'
import { postMeasurement } from '../services/api/measurements'

/**
 * ARMeasureScreen
 * - starts ARCore session
 * - listens for horizontal plane (floor) detections
 * - overlays a simple outline of the detected plane
 * - returns plane coordinates (meters) via `onPlaneDetected`
 *
 * Notes:
 * - The real projection from 3D plane polygon to 2D screen coordinates must be
 *   performed by the native AR view (it provides camera intrinsics and pose).
 *   Here we render a simple representative overlay and include comments
 *   indicating where native-provided projection should be used.
 */

export default function ARMeasureScreen({ onExit, onPlaneDetected, onComplete, listingId, guidedFlow = false }) {
  const ar = useAR()
  const { startSession, stopSession, requestSnapshot, isSupported } = ar
  const [plane, setPlane] = useState(null)
  const [planes, setPlanes] = useState([])
  const unsubscribeRef = useRef(null)
  const [mergedFloorPoints, setMergedFloorPoints] = useState([])
  const [points, setPoints] = useState([]) // placed points: { x,y,z, screenX, screenY }
  const [pendingPoint, setPendingPoint] = useState(null)
  const [livePreview, setLivePreview] = useState(false)
  const [perimeterMode, setPerimeterMode] = useState(false)
  const [closed, setClosed] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [volumeModalVisible, setVolumeModalVisible] = useState(false)
  const [vertexHeights, setVertexHeights] = useState([])
  const [guidedMode, setGuidedMode] = useState(false)
  const [guidedIndex, setGuidedIndex] = useState(null)
  const [measurementDetected, setMeasurementDetected] = useState({ area_sqm: 0, length_m: 0, width_m: 0 })
  const [drawMode, setDrawMode] = useState(false)
  const [scaleMetersPerUnit, setScaleMetersPerUnit] = useState(0.5) // default approx 0.5m per screen-unit
  const [simulationMode, setSimulationMode] = useState(false)
  const [debugVisible, setDebugVisible] = useState(false)

  // This screen is used standalone in the prototype — assume focused.
  const isFocused = true

  const screen = Dimensions.get('window')

  // Fallback UI when device doesn't support ARCore
  if (isSupported === false && !simulationMode) {
    return (
      <View style={styles.unsupportedContainer}>
        <Text style={styles.unsupportedTitle}>ARCore Not Supported</Text>
        <Text style={styles.unsupportedText}>Your device does not appear to support ARCore. You can try simulated AR or exit.</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Use Simulated AR" onPress={() => setSimulationMode(true)} />
          <Button title="Exit" onPress={onExit} />
        </View>
      </View>
    )
  }

  useEffect(() => {
    // Start the session when screen is focused and AR is supported (or simulationMode)
    let mounted = true
    const tryStart = async () => {
      if (!isFocused) return
      if (isSupported === false && !simulationMode) return
      await startSession()
      // start measurement session (native or JS fallback)
      try { await ArCoreBridge.startMeasurement() } catch (e) { /* ignore */ }
    }
    tryStart()

    // Subscribe to plane events from ArCoreBridge (native or simulated)
    unsubscribeRef.current = ArCoreBridge.onPlaneDetected((p) => {
      // `p` is expected to contain polygon_m: [[x,y,z], ...] in meters
      if (!mounted) return
      // maintain planes list (by id)
      setPlanes(prev => {
        const idx = prev.findIndex(x => x.id === p.id)
        if (idx >= 0) {
          const next = prev.slice()
          next[idx] = p
          return next
        }
        return [...prev, p]
      })
      setPlane(p)
      if (onPlaneDetected) onPlaneDetected(p)
    })

    return () => {
      // Clean up
      mounted = false
      if (unsubscribeRef.current) unsubscribeRef.current()
      stopSession()
    }
  }, [isFocused, isSupported, simulationMode])

  // When planes change, merge horizontal plane polygons into a single floor polygon via convex hull
  useEffect(() => {
    try {
      const horizPolys = []
      const floorYs = []
      for (const pl of planes) {
        const normal = pl.normal || { x: 0, y: 1, z: 0 }
        if (Math.abs((normal.y || 0)) < 0.6) continue
        const poly = pl.polygon_m || []
        if (poly.length) {
          poly.forEach(pt => horizPolys.push({ x: pt[0], y: pt[1], z: pt[2] }))
          if (pl.center_m && typeof pl.center_m[1] === 'number') floorYs.push(pl.center_m[1])
        }
      }
      if (!horizPolys.length) {
        setMergedFloorPoints([])
        return
      }
      const floorY = floorYs.length ? (floorYs.reduce((s, v) => s + v, 0) / floorYs.length) : horizPolys[0].y || 0
      const pts2d = horizPolys.map(p => ({ x: p.x, y: p.z }))
      const hull2d = convexHull(pts2d)
      const merged = hull2d.map(p => ({ x: p.x, y: floorY, z: p.y }))
      setMergedFloorPoints(merged)
    } catch (e) {
      // ignore
    }
  }, [planes])

  // Pause session when screen loses focus
  useEffect(() => {
    if (!isFocused) stopSession()
  }, [isFocused])

  // Derived debug values
  const numPoints = points.length
  // compute area for draw mode (screen units) if drawMode
  function computeScreenAreaUnits(pts) {
    if (!pts || pts.length < 3) return 0
    // use shoelace on screenX/screenY normalized
    let a = 0
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length
      const xi = pts[i].screenX / screen.width
      const yi = pts[i].screenY / screen.height
      const xj = pts[j].screenX / screen.width
      const yj = pts[j].screenY / screen.height
      a += xi * yj - xj * yi
    }
    return Math.abs(a) / 2
  }
  // compute live area using shoelace on X/Z coordinates
  const measurementCurrent = (() => {
    if (numPoints < 2) return { area_sqm: 0, area_sqft: 0, length_m: 0, width_m: 0 }
    if (drawMode) {
      const units = computeScreenAreaUnits(points)
      const area_sqm = Number((units * (scaleMetersPerUnit * scaleMetersPerUnit)).toFixed(4))
      const area_sqft = Number((area_sqm * 10.7639).toFixed(4))
      return { area_sqm, area_sqft, length_m: 0, width_m: 0 }
    }
    const ptsXZ = points.map(p => ({ x: p.x, z: p.z }))

    // Bounding box logic
    const xs = ptsXZ.map(p => p.x)
    const zs = ptsXZ.map(p => p.z)
    const minX = Math.min(...xs); const maxX = Math.max(...xs)
    const minZ = Math.min(...zs); const maxZ = Math.max(...zs)
    const l = maxX - minX
    const w = maxZ - minZ

    const area_sqm = numPoints >= 3 ? shoelaceAreaFromXZ(ptsXZ) : 0
    const area_sqft = Number((area_sqm * 10.7639).toFixed(4))

    // Assign larger dimension to length
    const length_m = Math.max(l, w)
    const width_m = Math.min(l, w)

    return { area_sqm, area_sqft, length_m, width_m }
  })()
  const trackingState = plane ? (plane.trackingState || 'NORMAL') : 'LIMITED'
  const confidence = computeConfidence({ numPoints, trackingState, deviceMotionStability: 0.6, lightingScore: 0.6 })

  async function handleSnapshot() {
    const res = await requestSnapshot()
    if (res && res.ok) Alert.alert('Snapshot saved')
  }

  // Handle a tap on the overlay: perform a hit test to get a real-world point
  async function handleTap(evt) {
    if (closed) return
    const { locationX, locationY } = evt.nativeEvent
    if (drawMode) {
      // create a screen-space point (no AR hit) for manual drawing
      const newPoint = { x: null, y: null, z: null, screenX: locationX, screenY: locationY }
      setPendingPoint(newPoint)
      return
    }
    // Use bridge helper to get a hit point (don't commit yet)
    const hit = await ArCoreBridge.addPointOnTap(locationX, locationY, screen.width, screen.height, false)
    if (!hit) {
      Alert.alert('No plane detected at that point')
      return
    }

    // Set a pending point — user must confirm to add it
    const newPoint = { x: hit.x, y: hit.y, z: hit.z, screenX: locationX, screenY: locationY }
    setPendingPoint(newPoint)
  }

  function handleUndo() {
    if (closed) return
    // discard pending point if present, otherwise remove last confirmed
    if (pendingPoint) {
      setPendingPoint(null)
      return
    }
    setPoints((p) => p.slice(0, -1))
  }

  function handleFinish() {
    if (points.length < 3) {
      Alert.alert('Need at least 3 points to form a polygon')
      return
    }
    setClosed(true)

    // Compute AR-derived measurements from the placed 3D points
    const pts3 = points.map(p => ({ x: p.x, y: p.y, z: p.z }))
    // Bounding box approximation for detected measurements
    const xs = pts3.map(p => p.x)
    const zs = pts3.map(p => p.z)
    const l = Math.max(...xs) - Math.min(...xs)
    const w = Math.max(...zs) - Math.min(...zs)
    // Store detected dimensions
    setMeasurementDetected({ area_sqm: arResult.area_sqm, volume_m3: arResult.volume_m3, length_m: Math.max(l, w), width_m: Math.min(l, w) })
    // If caller requested guided corner-by-corner ceiling scan, start guided flow
    if (guidedFlow) {
      setVertexHeights(Array(points.length).fill(null))
      setGuidedMode(true)
      setGuidedIndex(0)
      return
    }

    // After perimeter capture, open the measurement review modal
    setModalVisible(true)
  }

  async function sampleCeilingAtIndex(idx) {
    try {
      const cx = Math.round(screen.width / 2)
      const cy = Math.round(screen.height / 2)
      const hit = await ArCoreBridge.hitTest(cx, cy, screen.width, screen.height)
      if (!hit) {
        Alert.alert('No ceiling point detected. Move the camera and try again.')
        return false
      }
      const floorY = (points[idx] && typeof points[idx].y === 'number') ? points[idx].y : 0
      const rel = Math.max(0, Number((hit.y - floorY).toFixed(4)))
      setVertexHeights(prev => {
        const next = prev.slice()
        next[idx] = rel
        return next
      })
      return rel
    } catch (e) {
      Alert.alert('Sample error', String(e))
      return false
    }
  }

  async function advanceGuided() {
    if (guidedIndex === null) return
    // try sample automatically once
    const relOrFalse = await sampleCeilingAtIndex(guidedIndex)
    if (!relOrFalse && relOrFalse !== 0) return
    const rel = relOrFalse
    const nextHeights = (vertexHeights || []).slice()
    nextHeights[guidedIndex] = rel
    const next = guidedIndex + 1
    if (next >= points.length) {
      // finish guided flow
      setGuidedIndex(null)
      setGuidedMode(false)
      // compute volume and emit payload
      const pts3 = points.map(p => ({ x: p.x, y: p.y, z: p.z }))
      const arRes = computeAreaAndVolume(pts3, nextHeights.map(h => typeof h === 'number' ? h : 0))
      const payload = {
        points: pts3,
        area_sqm: arRes.area_sqm,
        area_sqft: Number((arRes.area_sqm * 10.7639).toFixed(4)),
        volume_m3: arRes.volume_m3,
        vertex_heights_m: nextHeights.map(h => (typeof h === 'number' ? Number(h.toFixed(4)) : null)),
        avg_height_m: (nextHeights.filter(h => typeof h === 'number').reduce((s, v) => s + v, 0) / (nextHeights.filter(h => typeof h === 'number').length || 1))
      }
      // return payload to parent/caller
      try { if (onComplete) onComplete(payload) } catch (e) { }
      // also persist locally (offline-first)
      try { await saveMeasurementLocally({ ...payload, saved_at: Date.now() }) } catch (e) { }
      // done; route back to caller who set pending callback will handle navigation
      return
    }
    setVertexHeights(nextHeights)
    setGuidedIndex(next)
  }

  function confirmPendingPoint() {
    if (!pendingPoint) return
    // commit the point to native/bridge storage and also to local points
    (async function () {
      try {
        if (!drawMode) await ArCoreBridge.addPointOnTap(pendingPoint.screenX, pendingPoint.screenY, screen.width, screen.height, true)
      } catch (e) { /* ignore */ }
    })()
    setPoints((prev) => [...prev, pendingPoint])
    setPendingPoint(null)
    // enable live center preview so user can move to next corner
    setLivePreview(true)
  }

  function cancelPendingPoint() {
    setPendingPoint(null)
  }

  // Live center hit-test preview: when enabled, periodically perform a hitTest
  // at the screen center and set `pendingPoint` so user can confirm the next corner
  useEffect(() => {
    let interval = null
    let mounted = true
    async function runHit() {
      try {
        const cx = Math.round(screen.width / 2)
        const cy = Math.round(screen.height / 2)
        const hit = await ArCoreBridge.hitTest(cx, cy, screen.width, screen.height)
        if (!mounted) return
        if (hit) {
          setPendingPoint({ x: hit.x, y: hit.y, z: hit.z, screenX: cx, screenY: cy })
        }
      } catch (e) {
        // ignore
      }
    }
    if (livePreview && !pendingPoint) {
      // poll at ~5Hz
      runHit()
      interval = setInterval(runHit, 200)
    }
    return () => {
      mounted = false
      if (interval) clearInterval(interval)
    }
  }, [livePreview, pendingPoint])

  // Local persistence helper (offline-first)
  async function saveMeasurementLocally(item) {
    const STORAGE_KEY = '@saved_measurements_v1'
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      const arr = raw ? JSON.parse(raw) : []
      arr.push(item)
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
    } catch (e) {
      // ignore storage errors
    }
  }

  return (
    <View style={styles.container}>
      <ARCameraPreview />

      {/* Pressable overlay to capture taps for placing points. Reserve bottom area for controls. */}
      <Pressable style={styles.touchArea} onPressIn={handleTap} />

      <View style={styles.instructionBox} pointerEvents="none">
        <Text style={styles.instructionText}>Tap to place corner points (min 3). Move phone slowly to scan the floor.</Text>
      </View>

      <MeasurementOverlay points={points} closed={closed} pending={pendingPoint} />

      {/* Live measurement summary (updates as points are added) */}
      {numPoints >= 1 && (
        <View style={styles.liveBox} pointerEvents="none">
          <Text style={{ color: '#fff', fontWeight: '600' }}>{`Points: ${numPoints}`}</Text>
          <Text style={{ color: '#fff' }}>{`Area: ${measurementCurrent.area_sqm || 0} m²`}</Text>
          <Text style={{ color: '#fff' }}>{`${measurementCurrent.area_sqft ? measurementCurrent.area_sqft + ' ft²' : ''}`}</Text>
          <Text style={{ color: '#fff' }}>{`L: ${(measurementCurrent.length_m || 0).toFixed(2)}m  W: ${(measurementCurrent.width_m || 0).toFixed(2)}m`}</Text>
        </View>
      )}

      {/* Perimeter-walk controls */}
      <View style={styles.perimeterControls} pointerEvents="box-none">
        {!perimeterMode ? (
          <Button title="Start Perimeter Walk" onPress={async () => {
            setPerimeterMode(true)
            setPoints([])
            setPendingPoint(null)
            setClosed(false)
            setLivePreview(true)
            try { await ArCoreBridge.startMeasurement() } catch (e) { }
          }} />
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Finish Walk" onPress={() => {
              setPerimeterMode(false)
              setLivePreview(false)
              handleFinish()
            }} />
            <Button title="Cancel Walk" color="#cc3300" onPress={async () => {
              await ArCoreBridge.resetMeasurement()
              setPerimeterMode(false)
              setPoints([])
              setPendingPoint(null)
              setLivePreview(false)
              setClosed(false)
            }} />
          </View>
        )}
      </View>

      {/* Confirm / Cancel controls shown when there is a pending point */}
      {pendingPoint && (
        <View style={styles.pendingControls} pointerEvents="box-none">
          <View style={styles.pendingButton}><Button title="Confirm" onPress={confirmPendingPoint} /></View>
          <View style={styles.pendingButton}><Button title="Cancel" onPress={cancelPendingPoint} color="#cc3300" /></View>
        </View>
      )}

      {/* Guided corner-by-corner ceiling scan overlay */}
      {guidedMode && guidedIndex !== null && (
        <View style={styles.guidedOverlay} pointerEvents="box-none">
          <Text style={{ color: '#fff', fontWeight: '700' }}>{`Corner ${guidedIndex + 1} of ${points.length}`}</Text>
          <Text style={{ color: '#fff', marginTop: 6 }}>Point the camera at the ceiling above this corner, then press Sample.</Text>
          <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
            <Button title="Sample" onPress={async () => {
              const rel = await sampleCeilingAtIndex(guidedIndex)
              if (rel === false) return
              // advance to next automatically
              await advanceGuided()
            }} />
            <Button title="Skip" color="#cc3300" onPress={() => {
              const next = guidedIndex + 1
              if (next >= points.length) {
                setGuidedIndex(null)
                setGuidedMode(false)
                setModalVisible(true)
              } else {
                setGuidedIndex(next)
              }
            }} />
            <Button title="Done" onPress={() => { setGuidedIndex(null); setGuidedMode(false); setModalVisible(true) }} />
          </View>
          <Text style={{ color: '#fff', marginTop: 8 }}>{`Current height: ${typeof vertexHeights[guidedIndex] === 'number' ? vertexHeights[guidedIndex].toFixed(3) + ' m' : '—'}`}</Text>
        </View>
      )}

      {/* Mini-map for perimeter walk */}
      {perimeterMode && (
        <View style={styles.miniMapWrap} pointerEvents="none">
          <PerimeterMiniMap points={points.map(p => ({ x: p.x, z: p.z }))} size={140} closed={closed} />
        </View>
      )}

      <ARMeasurementModal
        visible={modalVisible}
        areaM2={measurementCurrent.area_sqm}
        avgHeightMProp={vertexHeights && vertexHeights.length ? (vertexHeights.filter(h => typeof h === 'number' && h > 0).reduce((s, v) => s + v, 0) / vertexHeights.filter(h => typeof h === 'number' && h > 0).length) : 0}
        vertexHeights={vertexHeights}
        perimeterPoints={points}
        onCancel={() => setModalVisible(false)}
        onScanVolume={() => setVolumeModalVisible(true)}
        initialDimensions={{ length_m: measurementDetected.length_m || 0, width_m: measurementDetected.width_m || 0 }}
        drawMode={drawMode}
        scaleMetersPerUnit={scaleMetersPerUnit}
        setScaleMetersPerUnit={setScaleMetersPerUnit}
        onSave={async (payload) => {
          // Emit updated measurement JSON to parent via onComplete
          if (onComplete) onComplete(payload)

          // Persist locally (offline-first)
          try {
            await saveMeasurementLocally({ ...payload, saved_at: Date.now() })
          } catch (e) {
            // ignore local save failures
          }

          // Determine listing id: prefer explicit prop `listingId`, then payload.
          const listing_id_num = (typeof payload.listing_id === 'number') ? payload.listing_id : (typeof listingId === 'number' ? listingId : null)

          // Attempt backend POST if we have a listing id
          if (listing_id_num !== null) {
            try {
              const apiPayload = {
                listing_id: listing_id_num,
                room_type: payload.room_type || 'room',
                measurements: {
                  area_sqm: payload.area_sqm,
                  length_m: payload.length_m || 0,
                  width_m: payload.width_m || 0,
                  avg_height_m: payload.avg_height_m || 0,
                  volume_m3: payload.volume_m3 || 0,
                  vertex_heights_m: payload.vertex_heights_m || []
                },
                confidence_score: typeof confidence === 'number' ? confidence : (payload.confidence_score || 0)
              }
              const res = await postMeasurement(apiPayload)
              if (res && res.ok) {
                Alert.alert('Saved', 'Measurement saved and uploaded')
              } else {
                Alert.alert('Saved locally', 'Measurement saved locally; upload failed')
              }
            } catch (e) {
              Alert.alert('Saved locally', 'Measurement saved locally; upload error')
            }
          } else {
            Alert.alert('Saved locally', 'Measurement saved locally')
          }

          setModalVisible(false)
        }}
      />

      <ARVolumeModal
        visible={volumeModalVisible}
        floorPoints={points}
        onUpdateSamples={(arr) => {
          // arr: [{ floorY, avgHeight, relative }, ...]
          const rel = arr.map(a => (a && typeof a.relative === 'number') ? Number(a.relative) : null)
          setVertexHeights(rel)
        }}
        onCancel={() => setVolumeModalVisible(false)}
        onSave={async (payload) => {
          // payload contains: volume_m3, volume_ft3, area_sqm, area_sqft, vertex_heights_m
          // Persist locally first (offline-first)
          try {
            await saveMeasurementLocally({ type: 'volume', payload: payload, saved_at: Date.now() })
          } catch (e) { }

          // send best-effort to backend
          const listing_id_num = (typeof listingId === 'number') ? listingId : null
          if (listing_id_num === null) {
            Alert.alert('Saved locally', 'Volume saved locally; no listing id available for upload.')
            setVolumeModalVisible(false)
            return
          }

          try {
            const apiPayload = {
              listing_id: listing_id_num,
              room_type: 'room',
              measurements: {
                area_sqm: payload.area_sqm,
                length_m: measurementDetected.length_m || 0,
                width_m: measurementDetected.width_m || 0,
                volume_m3: payload.volume_m3,
                volume_ft3: payload.volume_ft3,
                vertex_heights_m: payload.vertex_heights_m
              },
              confidence_score: typeof confidence === 'number' ? confidence : 0
            }
            const res = await postMeasurement(apiPayload)
            if (res && res.ok) {
              Alert.alert('Saved', 'Volume saved and uploaded')
            } else {
              Alert.alert('Saved locally', 'Volume saved locally; upload failed')
            }
          } catch (e) {
            Alert.alert('Saved locally', 'Volume saved locally; upload error')
          } finally {
            setVolumeModalVisible(false)
          }
        }}
      />

      {/* 3D mesh overlay preview (simple projected view) */}
      {points && points.length >= 3 && (
        <RoomMeshOverlay floorPoints={(points && points.length >= 3) ? points : mergedFloorPoints} vertexHeights={vertexHeights} />
      )}

      {debugVisible && (
        <ARDebugOverlay
          trackingState={trackingState}
          planeDetected={!!plane}
          numPoints={numPoints}
          area_sqm={measurementCurrent.area_sqm}
          left_cm={measurementCurrent.left_cm}
          right_cm={measurementCurrent.right_cm}
          front_cm={measurementCurrent.front_cm}
          back_cm={measurementCurrent.back_cm}
          confidence={confidence}
        />
      )}

      {plane && (
        <View style={styles.planeOverlayContainer} pointerEvents="none">
          <View style={[styles.planeRect, {
            transform: [{ scaleX: Math.min(2 + (plane.width_m || 0) / 1.0, 4) }]
          }]} />
        </View>
      )}

      <View style={styles.controls}>
        {!perimeterMode ? (
          <Button title={drawMode ? 'Start Drawing' : 'Take Measurement'} onPress={async () => {
            // start measurement flow
            setPerimeterMode(true)
            setPoints([])
            setPendingPoint(null)
            setClosed(false)
            setLivePreview(true)
            try { if (!drawMode) await ArCoreBridge.startMeasurement() } catch (e) { }
          }} />
        ) : (
          <Button title="Finish" onPress={() => {
            setPerimeterMode(false)
            setLivePreview(false)
            handleFinish()
          }} />
        )}
        {/* <Button title={drawMode ? 'Disable Draw' : 'Enable Draw'} onPress={() => setDrawMode(d => !d)} /> */}
        <Button title="Exit" onPress={onExit} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  unsupportedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  unsupportedTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  unsupportedText: { textAlign: 'center', marginBottom: 12, color: '#444' },
  instructionBox: { position: 'absolute', top: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 40), left: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.45)', padding: 8, borderRadius: 8 },
  instructionText: { color: '#fff', fontSize: 14 },
  controls: { position: 'absolute', bottom: 20, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' },
  // leave 120px at bottom so controls are tappable
  touchArea: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 120 },
  planeOverlayContainer: { position: 'absolute', bottom: 140, left: 0, right: 0, alignItems: 'center' },
  planeRect: { width: 160, height: 90, borderWidth: 2, borderColor: 'rgba(0,200,80,0.9)', borderRadius: 6, backgroundColor: 'rgba(0,200,80,0.12)' }
  ,
  pendingControls: { position: 'absolute', bottom: 120, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  pendingButton: { flex: 1, marginHorizontal: 8 }
  ,
  liveBox: { position: 'absolute', top: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 10 : 20), right: 20, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 8 }
  ,
  perimeterControls: { position: 'absolute', bottom: 160, left: 20, right: 20, alignItems: 'center' },
  miniMapWrap: { position: 'absolute', top: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 70 : 100), left: 20 }
  ,
  guidedOverlay: { position: 'absolute', top: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 110 : 140), left: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', padding: 12, borderRadius: 8 }
})
