import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

export default function ARDebugOverlay({ trackingState, planeDetected, numPoints, area_sqm, left_cm, right_cm, front_cm, back_cm, confidence }) {
  return (
    <View style={styles.container} pointerEvents="none">
      <Text style={styles.row}><Text style={styles.key}>Tracking:</Text> {trackingState}</Text>
      <Text style={styles.row}><Text style={styles.key}>Plane:</Text> {planeDetected ? 'Yes' : 'No'}</Text>
      <Text style={styles.row}><Text style={styles.key}>Points:</Text> {numPoints}</Text>
      <Text style={styles.row}><Text style={styles.key}>Area:</Text> {area_sqm} m²</Text>
      <Text style={styles.row}><Text style={styles.key}>L/R:</Text> {left_cm}/{right_cm} cm</Text>
      <Text style={styles.row}><Text style={styles.key}>F/B:</Text> {front_cm}/{back_cm} cm</Text>
      <Text style={styles.row}><Text style={styles.key}>Confidence:</Text> {confidence}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 6 },
  row: { color: '#fff', fontSize: 12, color: '#fff', marginBottom: 4 },
  key: { fontWeight: '700', color: '#d1fae5' }
})
