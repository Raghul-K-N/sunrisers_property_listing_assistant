import React, { useState, useEffect } from 'react'
import { View, Text, Button, FlatList, StyleSheet, TouchableOpacity } from 'react-native'
import ARBridge from '../services/arbridge'
import theme from '../styles/theme'

export default function ARNativeExample() {
  const [running, setRunning] = useState(false)
  const [planes, setPlanes] = useState([])
  const [features, setFeatures] = useState([])

  async function onStart() {
    try {
      await ARBridge.startSession()
      setRunning(true)
    } catch (e) {
      console.warn('startSession failed', e.message)
    }
  }

  async function onPause() {
    await ARBridge.pauseSession()
    setRunning(false)
  }

  async function onStop() {
    await ARBridge.stopSession()
    setRunning(false)
  }

  async function fetchPlanes() {
    const p = await ARBridge.getPlanes()
    setPlanes(p || [])
  }

  async function fetchFeatures() {
    const f = await ARBridge.getFeaturePoints()
    setFeatures(f || [])
  }

  async function centerHitTest() {
    // approximate center of screen; native hitTest may accept only x,y
    const res = await ARBridge.hitTest(Math.round(540), Math.round(960))
    alert(res ? JSON.stringify(res) : 'no hit')
  }

  useEffect(() => {
    // optional: subscribe to native plane events
    const unsub = ARBridge.addListener ? ARBridge.addListener('onPlaneDetected', (p) => {
      setPlanes((prev) => [p, ...prev])
    }) : null
    return () => unsub && unsub()
  }, [])

  return (
    <View style={styles.container}>
      <Text style={styles.header}>AR Native Example</Text>
      <View style={styles.row}>
        <Button title={running ? 'Running' : 'Start Session'} onPress={onStart} />
        <Button title="Pause" onPress={onPause} />
        <Button title="Stop" onPress={onStop} />
      </View>

      <View style={styles.row}>
        <Button title="Get Planes" onPress={fetchPlanes} />
        <Button title="Get Features" onPress={fetchFeatures} />
        <Button title="Hit Test (center)" onPress={centerHitTest} />
      </View>

      <Text style={styles.sub}>Detected Planes ({planes.length})</Text>
      <FlatList data={planes} keyExtractor={(i, idx) => (i.id || idx).toString()} renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={{ fontWeight: '600' }}>{item.label || item.id}</Text>
          <Text>Center: {item.center_m ? `${item.center_m.x.toFixed(2)}, ${item.center_m.y.toFixed(2)}, ${item.center_m.z.toFixed(2)}` : 'n/a'}</Text>
          <Text>Polygon points: {item.polygon_m ? item.polygon_m.length : (item.polygon ? item.polygon.length : 0)}</Text>
        </View>
      )} />

      <Text style={styles.sub}>Feature Points ({features.length})</Text>
      <FlatList data={features} keyExtractor={(i, idx) => idx.toString()} renderItem={({ item }) => (
        <View style={styles.card}><Text>{(item.x || item[0]).toFixed ? `${item.x.toFixed(2)}, ${item.y.toFixed(2)}, ${item.z.toFixed(2)}` : JSON.stringify(item)}</Text></View>
      )} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  header: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sub: { marginTop: 12, marginBottom: 6, fontWeight: '600' },
  card: { padding: 8, borderRadius: 6, backgroundColor: '#f6f6f6', marginBottom: 6, ...theme.shadow }
})
