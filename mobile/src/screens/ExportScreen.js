import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Button, Alert, Platform, StatusBar } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import PerimeterMiniMap from '../components/PerimeterMiniMap'
import { buildOBJFromFloorAndHeights, saveObjToFile } from '../services/exporter'

const STORAGE_KEY = '@saved_measurements_v1'

function buildSVGFromPerimeter(perimeter = [], width = 600, height = 400) {
  if (!perimeter || perimeter.length < 3) return ''
  const xs = perimeter.map(p => p.x || p[0])
  const zs = perimeter.map(p => p.z || p[2])
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minZ = Math.min(...zs), maxZ = Math.max(...zs)
  const pad = 12
  const scaleX = (width - pad * 2) / Math.max(0.0001, (maxX - minX))
  const scaleY = (height - pad * 2) / Math.max(0.0001, (maxZ - minZ))
  const pts = perimeter.map(p => {
    const x = (((p.x || p[0]) - minX) * scaleX) + pad
    const y = height - (((p.z || p[2]) - minZ) * scaleY) - pad
    return `${x},${y}`
  }).join(' ')
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'><rect width='100%' height='100%' fill='#ffffff'/><polyline points='${pts}' fill='none' stroke='#2b8cff' stroke-width='3' stroke-linejoin='round' stroke-linecap='round'/></svg>`
}

export default function ExportScreen() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      setItems(Array.isArray(parsed) ? parsed : [])
    } catch (e) {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function exportPDFFor(item) {
    try {
      const Print = require('expo-print')
      const Sharing = require('expo-sharing')
      const perimeter = item.perimeter || item.measurements && item.measurements.perimeter || []
      const svg = buildSVGFromPerimeter(perimeter, 600, 360)
      const html = `<html><body><h2>Room Report</h2><p>Area: ${item.area_sqm || (item.measurements && item.measurements.area_sqm) || '—'} m²</p><p>Height: ${item.avg_height_m || (item.measurements && item.measurements.avg_height_m) || '—'} m</p><p>Volume: ${item.volume_m3 || (item.measurements && item.measurements.volume_m3) || '—'} m³</p>${svg}</body></html>`
      const file = await Print.printToFileAsync({ html })
      const canShare = await Sharing.isAvailableAsync()
      if (canShare) await Sharing.shareAsync(file.uri)
      else Alert.alert('PDF saved', `File: ${file.uri}`)
    } catch (e) {
      Alert.alert('Export PDF failed', 'Install expo-print and expo-sharing: `npx expo install expo-print expo-sharing`')
    }
  }

  async function exportFloorPlanImage(item) {
    try {
      const FileSystem = require('expo-file-system')
      const Sharing = require('expo-sharing')
      const perimeter = item.perimeter || item.measurements && item.measurements.perimeter || []
      const svg = buildSVGFromPerimeter(perimeter, 1200, 800)
      const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory || ''
      const path = `${dir}floorplan_${item.id || Date.now()}.svg`
      await FileSystem.writeAsStringAsync(path, svg, { encoding: FileSystem.EncodingType.UTF8 })
      const canShare = await Sharing.isAvailableAsync()
      if (canShare) await Sharing.shareAsync(path)
      else Alert.alert('Saved', `SVG saved to ${path}`)
    } catch (e) {
      Alert.alert('Export image failed', 'Install expo-file-system and expo-sharing: `npx expo install expo-file-system expo-sharing`')
    }
  }

  async function export3D(item) {
    try {
      const floor = (item.perimeter && item.perimeter.length) ? item.perimeter.map(p => ({ x: p.x || p[0], y: p.y || p[1] || 0, z: p.z || p[2] })) : []
      const heights = item.vertex_heights_m || []
      if (!floor.length || !heights.length) return Alert.alert('Missing data', 'Perimeter or vertex heights missing for OBJ export')
      const obj = buildOBJFromFloorAndHeights(floor, heights)
      await saveObjToFile(obj, `room_${item.id || Date.now()}.obj`)
    } catch (e) {
      Alert.alert('Export 3D failed', String(e))
    }
  }

  function renderItem({ item }) {
    const area = item.area_sqm || (item.measurements && item.measurements.area_sqm) || 0
    const height = item.avg_height_m || (item.measurements && item.measurements.avg_height_m) || 0
    return (
      <TouchableOpacity style={[styles.row, selected && selected.id === item.id ? styles.rowSelected : null]} onPress={() => setSelected(item)}>
        <PerimeterMiniMap points={(item.perimeter || []).map(p => ({ x: p.x || p[0], z: p.z || p[2] }))} size={80} closed={true} />
        <View style={{ flex: 1, paddingLeft: 12 }}>
          <Text style={styles.title}>{item.title || item.id || 'Measurement'}</Text>
          <Text style={styles.meta}>{area ? `${area.toFixed(2)} m²` : '— m²'} · {height ? `${height.toFixed(2)} m` : '— m'}</Text>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}><Text style={styles.headerTitle}>Export</Text><Button title="Reload" onPress={load} /></View>
      <FlatList data={items} keyExtractor={(it, i) => String(it.id || it._id || i)} renderItem={renderItem} contentContainerStyle={{ padding: 12 }} ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 40 }}>{loading ? 'Loading...' : 'No saved measurements'}</Text>} />

      {selected && (
        <View style={styles.actions}>
          <Text style={{ fontWeight: '700', marginBottom: 8 }}>{selected.title || selected.id}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Export PDF" onPress={() => exportPDFFor(selected)} />
            <Button title="Export Image" onPress={() => exportFloorPlanImage(selected)} />
            <Button title="Export OBJ" onPress={() => export3D(selected)} />
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0),
    backgroundColor: '#fff'
  },
  header: { padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: '#f7fafc', borderRadius: 8, marginBottom: 8 },
  rowSelected: { backgroundColor: '#eef6ff' },
  title: { fontSize: 16, fontWeight: '700' },
  meta: { color: '#666', marginTop: 6 },
  actions: { padding: 12, borderTopWidth: 1, borderColor: '#eee', backgroundColor: '#fff' }
})
