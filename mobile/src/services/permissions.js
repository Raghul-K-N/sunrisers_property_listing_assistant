import { Platform, Alert, Linking } from 'react-native'
import { Camera } from 'expo-camera'
import * as DeviceMotion from 'expo-sensors'

async function requestCameraPermission() {
  try {
    const { status, granted } = await Camera.requestCameraPermissionsAsync()
    const ok = (status === 'granted' || granted === true)
    return { granted: ok, status }
  } catch (e) {
    return { granted: false, status: 'error' }
  }
}

async function requestMotionPermission() {
  // On iOS, device motion requires explicit permission; expo-sensors exposes requestPermissionsAsync for DeviceMotion
  if (Platform.OS === 'ios') {
    try {
      if (DeviceMotion.requestPermissionsAsync) {
        const res = await DeviceMotion.requestPermissionsAsync()
        // some SDK versions return { granted } others return { status }
        const granted = res && (res.granted === true || res.status === 'granted')
        return { granted, status: res.status || (granted ? 'granted' : 'denied') }
      }
      // fallback: assume allowed
      return { granted: true, status: 'granted' }
    } catch (e) {
      return { granted: false, status: 'error' }
    }
  }
  // Android does not require runtime motion permission for sensors in most cases
  return { granted: true, status: 'granted' }
}

export async function requestARPermissions({ showRationale = true } = {}) {
  const cam = await requestCameraPermission()
  const motion = await requestMotionPermission()

  if (!cam.granted && showRationale) {
    Alert.alert(
      'Camera Permission Required',
      'Camera access is required for AR scanning. Please allow camera permission in Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() }
      ]
    )
  }

  if (!motion.granted && showRationale && Platform.OS === 'ios') {
    Alert.alert(
      'Motion Permission Required',
      'Motion access improves AR tracking. Please allow Motion & Fitness permission in Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() }
      ]
    )
  }

  return { camera: cam, motion }
}

export default { requestARPermissions }
