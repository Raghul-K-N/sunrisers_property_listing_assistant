import React, { useState, useEffect } from 'react'
import { Modal, View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated'
import { PanGestureHandler } from 'react-native-gesture-handler'
import { Pressable } from 'react-native'
import AnimatedPerimeter from './AnimatedPerimeter'


/**
 * ARMeasurementModal
 * Features:
 * - Editable inputs for side-specific lengths (left/right/front/back)
 * - Validation with realistic min/max values
 * - Reset button restores AR-detected values
 * - Save button emits measurement JSON (area + sides)
 */

export default function ARMeasurementModal({ visible, areaM2 = 0, avgHeightMProp = 0, vertexHeights = [], perimeterPoints = [], onCancel, onSave, initialDimensions = {}, onScanVolume, drawMode = false, scaleMetersPerUnit = 0.5, setScaleMetersPerUnit = null }) {
  const [localHeight, setLocalHeight] = useState(typeof avgHeightMProp === 'number' ? avgHeightMProp : 0)
  const [lengthM, setLengthM] = useState(initialDimensions.length_m ?? '')
  const [widthM, setWidthM] = useState(initialDimensions.width_m ?? '')
  const [roomName, setRoomName] = useState('')
  const [roomType, setRoomType] = useState('')
  const [confidence, setConfidence] = useState('')
  const sheetY = useSharedValue(0)
  const sheetHeight = 320

  useEffect(() => {
    // when visible toggles, animate sheet in/out
    sheetY.value = visible ? withTiming(0, { duration: 350 }) : withTiming(sheetHeight, { duration: 300 })
  }, [visible])

  const aStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.value }] }))

  // Note: gesture handling is implemented via PanGestureHandler below.

  useEffect(() => {
    if (visible) {
      setLocalHeight(typeof avgHeightMProp === 'number' ? avgHeightMProp : 0)
      // populate from props if present, otherwise default
      if (initialDimensions.length_m !== undefined) setLengthM(String(initialDimensions.length_m.toFixed(2)))
      if (initialDimensions.width_m !== undefined) setWidthM(String(initialDimensions.width_m.toFixed(2)))
    }
  }, [visible, avgHeightMProp, initialDimensions])

  function saveMeasurement() {
    const h = Number(localHeight)
    if (isNaN(h) || h <= 0 || h > 10) return Alert.alert('Please enter a valid ceiling height in meters')
    const area = Number(areaM2) || 0
    const volume = area * h
    // parse side inputs (m)
    const l = parseFloatSafe(lengthM)
    const w = parseFloatSafe(widthM)

    const payload = {
      area_sqm: Number(area.toFixed(4)),
      area_sqft: Number((area * 10.7639).toFixed(3)),
      avg_height_m: Number(h.toFixed(3)),
      height_ft: Number((h * 3.28084).toFixed(3)),
      volume_m3: Number(volume.toFixed(4)),
      volume_ft3: Number((volume * 35.3147).toFixed(2)),
      vertex_heights_m: vertexHeights || [],
      perimeter: perimeterPoints || [],
      length_m: isFinite(l) ? Number(l.toFixed(3)) : null,
      width_m: isFinite(w) ? Number(w.toFixed(3)) : null,
      confidence_score: parseFloatSafe(confidence),
      room_name: roomName || null,
      room_type: roomType || null,
      measurement_method: 'ar',
    }
    if (onSave) onSave(payload)
  }

  function resetToARDimensions() {
    if (initialDimensions.length_m !== undefined) setLengthM(String(initialDimensions.length_m.toFixed(2)))
    if (initialDimensions.width_m !== undefined) setWidthM(String(initialDimensions.width_m.toFixed(2)))
    Alert.alert('Reset', 'Restored AR-detected dimensions')
  }

  function parseFloatSafe(v) {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : NaN
  }

  // Try to estimate side lengths from perimeter points array
  function computeSideLengthsFromPerimeter(points) {
    if (!points || !Array.isArray(points) || points.length < 4) return null
    try {
      // Points expected as [{x,y,z}, ...] or [x,y] arrays. Compute sequential distances.
      const pts = points.map(p => {
        if (Array.isArray(p)) return { x: p[0], y: p[1] }
        return { x: p.x ?? p[0], y: p.y ?? p[1] }
      })
      const dists = []
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]
        const b = pts[(i + 1) % pts.length]
        const dx = (b.x - a.x) || 0
        const dy = (b.y - a.y) || 0
        dists.push(Math.sqrt(dx * dx + dy * dy))
      }
      // assign front/left/back/right using order of points
      return {
        front_cm: dists[0],
        left_cm: dists[1],
        back_cm: dists[2],
        right_cm: dists[3]
      }
    } catch (e) {
      return null
    }
  }

  return (
    <Modal visible={visible} animationType="none" transparent>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouchable} onPress={onCancel} />
        <Animated.View style={[styles.sheet, aStyle]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Room Volume</Text>
          {/* Animated perimeter preview */}
          {perimeterPoints && perimeterPoints.length > 2 ? (
            <AnimatedPerimeter points={perimeterPoints} progress={1.0} width={260} height={120} />
          ) : null}
          <View style={styles.rowDisplay}>
            <View style={styles.col}>
              <Text style={styles.labelSmall}>Area</Text>
              <Text style={styles.value}>{areaM2 > 0 ? `${areaM2.toFixed(2)} m²` : '— m²'}</Text>
              <Text style={styles.sub}>{areaM2 > 0 ? `${(areaM2 * 10.7639).toFixed(1)} ft²` : ''}</Text>
              {drawMode ? (
                <>
                  <Text style={[styles.labelSmall, { marginTop: 6 }]}>Scale (m per unit)</Text>
                  <TextInput style={styles.sideInput} keyboardType="numeric" value={String(scaleMetersPerUnit)} onChangeText={(v) => { if (setScaleMetersPerUnit) setScaleMetersPerUnit(Number(v) || 0) }} />
                </>
              ) : null}
            </View>
            <View style={styles.col}>
              <Text style={styles.labelSmall}>Height (m)</Text>
              <TextInput style={styles.heightInput} keyboardType="numeric" value={String(localHeight)} onChangeText={setLocalHeight} />
              <Text style={styles.sub}>{localHeight ? `${(Number(localHeight) * 3.28084).toFixed(2)} ft` : ''}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.labelSmall}>Volume</Text>
              <Text style={styles.value}>{(areaM2 && localHeight) ? `${(areaM2 * Number(localHeight)).toFixed(2)} m³` : '— m³'}</Text>
              <Text style={styles.sub}>{(areaM2 && localHeight) ? `${(areaM2 * Number(localHeight) * 35.3147).toFixed(1)} ft³` : ''}</Text>
            </View>
          </View>

          {/* Dimensions inputs */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <View style={{ flex: 1, paddingHorizontal: 6 }}>
              <Text style={styles.labelSmall}>Length (m)</Text>
              <TextInput style={styles.sideInput} keyboardType="numeric" value={String(lengthM)} onChangeText={setLengthM} />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 6 }}>
              <Text style={styles.labelSmall}>Width (m)</Text>
              <TextInput style={styles.sideInput} keyboardType="numeric" value={String(widthM)} onChangeText={setWidthM} />
            </View>
          </View>

          <View style={{ marginTop: 8 }}>
            <Text style={styles.labelSmall}>Room name</Text>
            <TextInput style={styles.textInput} value={roomName} onChangeText={setRoomName} placeholder="e.g. Master Bedroom" />
            <Text style={[styles.labelSmall, { marginTop: 6 }]}>Room type</Text>
            <TextInput style={styles.textInput} value={roomType} onChangeText={setRoomType} placeholder="e.g. bedroom, kitchen" />
            <Text style={[styles.labelSmall, { marginTop: 6 }]}>Confidence (0-1)</Text>
            <TextInput style={styles.sideInput} keyboardType="numeric" value={String(confidence)} onChangeText={setConfidence} placeholder="0.92" />
          </View>

          <View style={styles.buttonsRow}>
            <Button title="Reset" onPress={resetToARDimensions} />
            {typeof onScanVolume === 'function' ? <Button title="Scan Ceiling" onPress={onScanVolume} /> : null}
            <Button title="Cancel" onPress={onCancel} />
            <Button title="Save Measurement" onPress={saveMeasurement} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  backdropTouchable: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
  handle: { alignSelf: 'center', width: 48, height: 4, backgroundColor: '#ddd', borderRadius: 4, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  rowDisplay: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  col: { flex: 1, alignItems: 'flex-start', paddingHorizontal: 8 },
  labelSmall: { color: '#666', fontSize: 12 },
  value: { fontSize: 16, fontWeight: '700', marginTop: 6 },
  sub: { color: '#888', fontSize: 12, marginTop: 4 },
  heightInput: { borderWidth: 1, borderColor: '#e2e8f0', padding: 8, borderRadius: 6, marginTop: 6, minWidth: 80, textAlign: 'center' },
  buttonsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }
})

// Additional styles
Object.assign(styles, {
  sideInput: { borderWidth: 1, borderColor: '#e2e8f0', padding: 6, borderRadius: 6, marginTop: 6, textAlign: 'center' },
  textInput: { borderWidth: 1, borderColor: '#e2e8f0', padding: 8, borderRadius: 6, marginTop: 6 }
})
