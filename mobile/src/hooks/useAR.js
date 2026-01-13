import { useEffect, useState, useRef } from 'react'
import { AppState } from 'react-native'
import ArCoreBridge from '../services/arcore'
import Permissions from '../services/permissions'
import { Alert } from 'react-native'

// Hook that manages AR session lifecycle and exposes basic data to screens
export default function useAR() {
  const [measurements, setMeasurements] = useState([])
  const [isSupported, setIsSupported] = useState(null)
  const appState = useRef(AppState.currentState)
  const runningRef = useRef(false)

  async function checkSupport() {
    try {
      const s = await ArCoreBridge.isSupported()
      setIsSupported(Boolean(s))
      return Boolean(s)
    } catch (e) {
      setIsSupported(false)
      return false
    }
  }

  async function startSession() {
    if (isSupported === false) return false
    try {
      // Request camera and motion permissions before starting AR session
      try {
        const perms = await Permissions.requestARPermissions()
        if (!perms.camera || !perms.camera.granted) {
          // If camera not granted, abort starting session
          Alert.alert('Camera permission denied', 'Cannot start AR session without camera permission.')
          return false
        }
      } catch (e) {
        // ignore and proceed to attempt starting session; native layer may handle permissions
      }

      await ArCoreBridge.startSession()
      runningRef.current = true
      // update planes
      const planes = await ArCoreBridge.getPlanes()
      setMeasurements(planes)
      return true
    } catch (e) {
      runningRef.current = false
      return false
    }
  }

  async function stopSession() {
    try {
      await ArCoreBridge.stopSession()
    } finally {
      runningRef.current = false
    }
  }

  async function requestSnapshot() {
    return ArCoreBridge.requestSnapshot()
  }

  useEffect(() => {
    let mounted = true
    // Check support on mount
    checkSupport()

    const handleAppState = (nextAppState) => {
      if (!mounted) return
      // if app goes to background, pause AR session
      if (appState.current.match(/active/) && nextAppState.match(/inactive|background/)) {
        if (runningRef.current) stopSession()
      }
      // if app comes to foreground, restart session if previously running
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // don't auto-start here; callers should start when focused.
      }
      appState.current = nextAppState
    }

    const sub = AppState.addEventListener ? AppState.addEventListener('change', handleAppState) : AppState.addEventListener('change', handleAppState)

    return () => {
      mounted = false
      // clean up
      if (sub && sub.remove) sub.remove()
      stopSession()
    }
  }, [])

  return { startSession, stopSession, measurements, requestSnapshot, isSupported }
}
