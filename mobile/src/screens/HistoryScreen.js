import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Button, Platform, StatusBar } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Swipeable from 'react-native-gesture-handler/Swipeable'
import PerimeterMiniMap from '../components/PerimeterMiniMap'

const STORAGE_KEY = '@saved_measurements_v1'

export default function HistoryScreen({ navigation }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
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
  }, [])

  useEffect(() => { load() }, [load])

  async function removeItem(id) {
    Alert.alert('Delete', 'Delete this measurement?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            const next = items.filter(it => it.id !== id)
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
            setItems(next)
          } catch (e) { Alert.alert('Delete failed') }
        }
      }
    ])
  }

  function renderRightActions(item) {
    return (
      <View style={styles.rightActions}>
        <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.deleteBtn}>
          <Text style={{ color: '#fff' }}>Delete</Text>
        </TouchableOpacity>
      </View>
    )
  }

  function renderItem({ item }) {
    const area = item.area_sqm || (item.measurements && item.measurements.area_sqm) || 0
    const height = item.avg_height_m || (item.measurements && item.measurements.avg_height_m) || 0
    const volume = item.volume_m3 || (item.measurements && item.measurements.volume_m3) || 0
    const perimeter = item.perimeter || item.measurements && item.measurements.perimeter || []

    return (
      <Swipeable renderRightActions={() => renderRightActions(item)}>
        <TouchableOpacity style={styles.row} onPress={() => navigation && navigation.navigate && navigation.navigate('MeasurementDetail', { item })}>
          <View style={styles.miniWrap}>
            <PerimeterMiniMap points={(perimeter || []).map(p => ({ x: p.x || p[0], z: p.z || p[2] }))} size={90} closed={true} />
          </View>
          <View style={styles.info}>
            <Text style={styles.title}>{item.title || item.id || 'Measurement'}</Text>
            <Text style={styles.meta}>{area ? `${area.toFixed(2)} m²` : '— m²'} · {height ? `${height.toFixed(2)} m` : '— m'}</Text>
            <Text style={styles.meta}>{volume ? `${volume.toFixed(2)} m³` : '— m³'}</Text>
          </View>
        </TouchableOpacity>
      </Swipeable>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Measurements</Text>
        <Button title="Refresh" onPress={load} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(it, idx) => String(it.id || it._id || idx)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>{loading ? 'Loading...' : 'No saved measurements'}</Text></View>}
      />
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
  row: { flexDirection: 'row', backgroundColor: '#f9fafb', padding: 8, borderRadius: 8, marginBottom: 10, alignItems: 'center' },
  miniWrap: { width: 100, height: 90, justifyContent: 'center', alignItems: 'center' },
  info: { flex: 1, paddingLeft: 12 },
  title: { fontSize: 16, fontWeight: '700' },
  meta: { color: '#555', marginTop: 4 },
  rightActions: { justifyContent: 'center', alignItems: 'center', width: 80 },
  deleteBtn: { backgroundColor: '#ff4d4f', padding: 12, borderRadius: 6 },
  empty: { padding: 24, alignItems: 'center' },
  emptyText: { color: '#666' }
})
