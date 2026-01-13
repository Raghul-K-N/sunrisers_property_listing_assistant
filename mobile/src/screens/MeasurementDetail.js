import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, TextInput, Button, Alert, TouchableOpacity, Platform, StatusBar } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import PerimeterMiniMap from '../components/PerimeterMiniMap'
import { buildOBJFromFloorAndHeights, saveObjToFile } from '../services/exporter'

const STORAGE_KEY = '@saved_measurements_v1'

export default function MeasurementDetail({ route, navigation }) {
  const item = route && route.params && route.params.item ? route.params.item : null
  const [data, setData] = useState(item || {})
  const [title, setTitle] = useState(item ? (item.title || '') : '')

  useEffect(() => {
    if (item) setData(item)
  }, [item])

  async function persistEdits(newData) {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      const arr = raw ? JSON.parse(raw) : []
      const next = arr.map(it => (it.id === newData.id ? newData : it))
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setData(newData)
      Alert.alert('Saved')
    } catch (e) {
      Alert.alert('Save failed', String(e))
    }
  }

  function saveTitle() {
    const next = { ...data, title: title }
    persistEdits(next)
  }

  function exportJson() {
    const payload = data
    // use simple share via navigator (or console fallback)
    try {
      const txt = JSON.stringify(payload, null, 2)
      // use clipboard or share; for now show prompt with JSON length
      Alert.alert('Export JSON', `Prepared JSON with ${txt.length} chars. Use share integration on device.`)
    } catch (e) {
      Alert.alert('Export failed', String(e))
    }
  }

  async function exportObj() {
    try {
      const floor = (data.perimeter && data.perimeter.length) ? data.perimeter.map(p => ({ x: p.x || p[0], y: p.y || p[1] || 0, z: p.z || p[2] })) : []
      const heights = data.vertex_heights_m || []
      if (!floor.length || !heights.length) return Alert.alert('No floor or heights to export')
      const obj = buildOBJFromFloorAndHeights(floor, heights)
      await saveObjToFile(obj, `room_${data.id || Date.now()}.obj`)
    } catch (e) {
      Alert.alert('OBJ export failed', String(e))
    }
  }

  if (!data) return (
    <View style={styles.container}><Text style={{ padding: 20 }}>No measurement selected</Text></View>
  )

  const area = data.area_sqm || (data.measurements && data.measurements.area_sqm) || 0
  const height = data.avg_height_m || data.height_cm / 100 || (data.measurements && data.measurements.avg_height_m) || 0
  const volume = data.volume_m3 || (data.measurements && data.measurements.volume_m3) || 0
  const perimeter = data.perimeter || (data.measurements && data.measurements.perimeter) || []
  const vertexHeights = data.vertex_heights || data.vertex_heights_m || []

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.heading}>Room Report</Text>
      <PerimeterMiniMap points={(perimeter || []).map(p => ({ x: p.x || p[0], z: p.z || p[2] }))} size={220} closed={true} />

      <View style={styles.infoRow}>
        <View style={styles.infoCol}><Text style={styles.label}>Area</Text><Text style={styles.value}>{area ? `${area.toFixed(2)} m²` : '—'}</Text></View>
        <View style={styles.infoCol}><Text style={styles.label}>Height</Text><Text style={styles.value}>{height ? `${height.toFixed(2)} m` : '—'}</Text></View>
        <View style={styles.infoCol}><Text style={styles.label}>Volume</Text><Text style={styles.value}>{volume ? `${volume.toFixed(2)} m³` : '—'}</Text></View>
      </View>

      <View style={{ marginTop: 12 }}>
        <Text style={styles.section}>Vertex Heights (m)</Text>
        {(vertexHeights).map((h, idx) => (
          <Text key={idx} style={styles.mono}>{`${idx + 1}: ${h ? h.toFixed(3) : '—'}`}</Text>
        ))}
      </View>

      <View style={{ marginTop: 12 }}>
        <Text style={styles.section}>Label</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Room label or name" />
        <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Button title="Save" onPress={saveTitle} />
          <Button title="Export JSON" onPress={exportJson} />
          <Button title="Export OBJ" onPress={exportObj} />
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0),
    backgroundColor: '#fff'
  },
  heading: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  infoCol: { flex: 1, alignItems: 'center' },
  label: { color: '#666' },
  value: { fontSize: 16, fontWeight: '700', marginTop: 6 },
  section: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  mono: { fontFamily: 'monospace', color: '#333' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }
})
