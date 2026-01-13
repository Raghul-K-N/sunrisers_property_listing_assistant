import React, { useEffect, useRef, useState } from 'react'
import { View, StyleSheet, Platform, Text } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'

// NOTE: This component renders the device camera using `expo-camera`.
// The AR/plane detection and depth information must come from a native ARCore bridge.
// See `services/arcore` for the native bridge stubs and integration notes.

// If you install a native ARCore module (for example `react-native-arcore`),
// you would typically import the native view here and overlay it on top of the camera
// or replace the Camera preview with the native AR view entirely.

export default function ARCameraPreview() {
  const [permission, requestPermission] = useCameraPermissions()

  useEffect(() => {
    if (!permission || !permission.granted) {
      requestPermission()
    }
  }, [permission])

  if (!permission) return <View style={styles.center}><Text>Requesting permission...</Text></View>
  if (!permission.granted) return <View style={styles.center}><Text>No camera permission</Text></View>

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back" />

      {/*
        PLACEHOLDER: Native AR View
        If you add a native ARCore bridge, import the native AR view here and render it.
        Example (pseudocode):

        import { NativeArView } from 'react-native-arcore'
        <NativeArView style={styles.arView} onPlaneDetected={...} />

        The native module should provide plane detection, anchors, depth, and transform data.
      */}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' }
})
