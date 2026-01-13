import React, { useState, useEffect } from 'react'
import { Modal, View, Text, Button, StyleSheet, Alert, FlatList } from 'react-native'
import theme from '../styles/theme'
import ArCoreBridge from '../services/arcore'
import { computeVolumeFromFloorAndHeights } from '../services/arcore/geometry'
import { buildOBJFromFloorAndHeights, saveObjToFile } from '../services/exporter'

// props: visible, floorPoints: [{x,y,z}], onCancel, onSave(payload)
export default function ARVolumeModal({ visible, floorPoints = [], onCancel, onSave, onUpdateSamples }) {
  const [samples, setSamples] = useState([]) // array per vertex: { heights: [y1,y2], avgHeight }

  useEffect(() => {
    if (visible) {
      setSamples(floorPoints.map(p => ({ floorY: p.y, heights: [], avgHeight: null })))
    }
  }, [visible, floorPoints])

  async function sampleCeilingFor(index) {
    // instruct the user to point at the ceiling above the vertex and press Sample
    try {
      // perform a hitTest at center
      const res = await ArCoreBridge.hitTest(Math.round(global.screenWidth/2 || 540), Math.round(global.screenHeight/2 || 960), global.screenWidth || 1080, global.screenHeight || 1920)
      if (!res) return Alert.alert('No ceiling point detected. Try moving the camera.')
      const y = res.y
      setSamples(prev => {
        const next = prev.slice()
        next[index].heights.push(y)
        next[index].avgHeight = next[index].heights.reduce((a,b) => a+b,0)/next[index].heights.length
        // notify host about updated per-vertex heights (relative to floor)
        try { if (onUpdateSamples) onUpdateSamples(next.map((s,i)=>({ floorY: s.floorY, avgHeight: s.avgHeight, relative: s.avgHeight ? s.avgHeight - (s.floorY || floorPoints[i].y || 0) : null }))) } catch(e){}
        return next
      })
    } catch (e) {
      Alert.alert('Sample error', String(e))
    }
  }

  function computeVolume() {
    // prepare per-vertex heights relative to floor
    const heights = samples.map((s, i) => {
      if (!s || !s.avgHeight) return null
      return Math.max(0, s.avgHeight - (s.floorY || floorPoints[i].y || 0))
    })

    return computeVolumeFromFloorAndHeights(floorPoints, heights)
  }

  const vol = computeVolume()

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.title}>Ceiling Scan & Volume</Text>
          <Text style={styles.sub}>Floor vertices: {floorPoints.length}</Text>

          <FlatList
            data={floorPoints}
            keyExtractor={(item, idx) => String(idx)}
            style={{ maxHeight: 240 }}
            renderItem={({item, index}) => (
              <View style={styles.row}>
                <Text style={{ flex: 1 }}>Pt {index+1}: h={samples[index] && samples[index].avgHeight ? (samples[index].avgHeight - (samples[index].floorY || item.y || 0)).toFixed(3) + 'm' : '—'}</Text>
                <Button title="Sample" onPress={() => sampleCeilingFor(index)} />
              </View>
            )}
          />

          <Text style={styles.area}>Floor: {vol.area_sqm} m² ({vol.area_sqft} ft²)</Text>
          <Text style={styles.area}>Volume: {vol.volume_m3} m³ ({vol.volume_ft3} ft³)</Text>

          <View style={styles.buttons}>
            <Button title="Cancel" onPress={onCancel} />
            <Button title="Done" onPress={() => {
              const payload = {
                volume_m3: vol.volume_m3,
                volume_ft3: vol.volume_ft3,
                area_sqm: vol.area_sqm,
                area_sqft: vol.area_sqft,
                vertex_heights_m: samples.map((s,i)=>{
                  if (!s || !s.avgHeight) return null
                  return Math.max(0, Number((s.avgHeight - (s.floorY || floorPoints[i].y || 0)).toFixed(4)))
                })
              }
              if (onSave) onSave(payload)
            }} />
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  card: { width: '90%', backgroundColor: '#fff', padding: 12, borderRadius: 8, ...theme.shadow },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  sub: { marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  area: { marginTop: 8 },
  buttons: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between' }
})
