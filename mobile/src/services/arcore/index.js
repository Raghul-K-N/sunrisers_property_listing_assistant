import { NativeModules, NativeEventEmitter, Platform } from 'react-native'
import ARBridge from '../arbridge'

const NativeBridge = NativeModules.ARCoreBridge || NativeModules.ARBridge || null

// Avoid spamming the console if native bridge is missing; only warn once in dev.
let _arcoreBridgeWarned = false

// Event emitter for native plane detection events
let emitter = null
if (NativeBridge && NativeBridge.addListener) {
  emitter = new NativeEventEmitter(NativeBridge)
}

// JS-side fallback: simulate plane detection when native bridge isn't installed.
function simulatePlaneDetection(cb) {
  const t = setTimeout(() => {
    // Example plane in meters (real-world scale)
    const plane = {
      id: 'sim-plane-1',
      label: 'Simulated Floor',
      // polygon as array of [x, y, z] in meters (counter-clockwise)
      polygon_m: [
        [-1.05, 0, -0.45],
        [1.05, 0, -0.45],
        [1.05, 0, 0.45],
        [-1.05, 0, 0.45]
      ],
      center_m: { x: 0, y: 0, z: 0 },
      width_m: 2.1,
      depth_m: 0.9
    }
    cb(plane)
  }, 1500)
  return () => clearTimeout(t)
}

const ArCoreBridge = {
  async startSession() {
    if (NativeBridge && NativeBridge.startSession) {
      return await NativeBridge.startSession()
    }
    if (ARBridge && ARBridge.startSession) {
      return ARBridge.startSession()
    }
    if (__DEV__ && !_arcoreBridgeWarned) {
      console.warn('ARCoreBridge.startSession(): native bridge not found, running simulation')
      _arcoreBridgeWarned = true
    }
    return true
  },

  async stopSession() {
    if (NativeBridge && NativeBridge.stopSession) {
      return await NativeBridge.stopSession()
    }
    if (ARBridge && ARBridge.stopSession) {
      return ARBridge.stopSession()
    }
    return true
  },

  async getPlanes() {
    if (NativeBridge && NativeBridge.getPlanes) {
      // expect native to return polygon coords in meters
      return await NativeBridge.getPlanes()
    }
    if (ARBridge && ARBridge.getPlanes) {
      return ARBridge.getPlanes()
    }
    // fallback: return simulated plane(s)
    return [
      {
        id: 'sim-plane-1',
        label: 'Simulated Floor',
        polygon_m: [
          [-1.05, 0, -0.45],
          [1.05, 0, -0.45],
          [1.05, 0, 0.45],
          [-1.05, 0, 0.45]
        ],
        center_m: { x: 0, y: 0, z: 0 },
        width_m: 2.1,
        depth_m: 0.9
      }
    ]
  },

  async requestSnapshot() {
    if (NativeBridge && NativeBridge.requestSnapshot) {
      return await NativeBridge.requestSnapshot()
    }
    return { ok: true }
  },

  /**
   * Subscribe to plane-detected events.
   * The native bridge should emit an event named 'onPlaneDetected' with a plane payload:
   * { id, label, polygon_m: [[x,y,z], ...], center_m: {x,y,z}, width_m, depth_m }
   * Returns an unsubscribe function.
   */
  onPlaneDetected(cb) {
    if (emitter) {
      const sub = emitter.addListener('onPlaneDetected', cb)
      return () => sub.remove()
    }
    // fallback: simulate a single plane detection
    return simulatePlaneDetection(cb)
  }
}

export default ArCoreBridge

// Hit test: convert a screen touch into a real-world 3D point (meters) on a detected plane.
// Native implementation should accept screenX, screenY, screenWidth, screenHeight and return
// a point { x, y, z } in meters. We provide a JS fallback that maps screen coords to the
// first detected plane's bounding box (for simulation/testing).
ArCoreBridge.hitTest = async function (screenX, screenY, screenWidth, screenHeight) {
  // 1. Try Native ARCoreBridge directly
  if (NativeBridge && NativeBridge.hitTest) {
    try {
      return await NativeBridge.hitTest(screenX, screenY, screenWidth, screenHeight)
    } catch (e) {
      console.warn('Native hitTest failed, falling back to JS', e)
    }
  }

  // 2. JS fallback: use simulation logic
  const planes = await ArCoreBridge.getPlanes()
  const plane = planes && planes[0]

  // If no planes yet, we can't do a real hit test, but for the simulator, 
  // we can return a point on the ground plane (y=0)
  if (!plane) {
    const nx = (screenX / screenWidth - 0.5) * 2
    const ny = (screenY / screenHeight - 0.5) * 2
    return { x: nx * 2, y: 0, z: ny * 2 }
  }

  // Map normalized coords to plane bounding box (simple orthographic mapping)
  const nx = (screenX / screenWidth - 0.5) * 2
  const ny = (screenY / screenHeight - 0.5) * 2

  const halfW = (plane.width_m || 1.0) / 2
  const halfD = (plane.depth_m || 1.0) / 2

  const worldX = (plane.center_m && plane.center_m.x ? plane.center_m.x : 0) + nx * halfW
  const worldZ = (plane.center_m && plane.center_m.z ? plane.center_m.z : 0) + ny * halfD * -1
  const worldY = (plane.center_m && plane.center_m.y ? plane.center_m.y : 0)

  return { x: worldX, y: worldY, z: worldZ }
}

// Measurement helpers (JS fallback state when native module doesn't implement measurement API)
let _measurementActive = false
let _measurementPoints = [] // array of { x,y,z }

function _shoelaceAreaMeters(points) {
  // points: array of {x, z} or [x,z]
  if (!points || points.length < 3) return 0
  let a = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    const xi = points[i].x !== undefined ? points[i].x : points[i][0]
    const yi = points[i].z !== undefined ? points[i].z : points[i][1]
    const xj = points[j].x !== undefined ? points[j].x : points[j][0]
    const yj = points[j].z !== undefined ? points[j].z : points[j][1]
    a += xi * yj - xj * yi
  }
  return Math.abs(a) / 2
}

/**
 * Start a measurement session. Clears previous points.
 * Native implementations should reset their internal measurement state.
 */
ArCoreBridge.startMeasurement = async function () {
  if (NativeBridge && NativeBridge.startMeasurement) {
    return await NativeBridge.startMeasurement()
  }
  _measurementActive = true
  _measurementPoints = []
  return true
}

/**
 * addPointOnTap(screenX, screenY, screenWidth, screenHeight, commit=false)
 * - performs a hitTest at the screen coords and returns a world point {x,y,z}
 * - if commit===true, the found point is appended to the measurement polygon
 */
ArCoreBridge.addPointOnTap = async function (screenX, screenY, screenWidth, screenHeight, commit = false) {
  // Prefer native if available
  if (NativeBridge && NativeBridge.addPointOnTap) {
    return await NativeBridge.addPointOnTap(screenX, screenY, screenWidth, screenHeight, commit)
  }
  const hit = await ArCoreBridge.hitTest(screenX, screenY, screenWidth, screenHeight)
  if (!hit) return null
  if (commit) _measurementPoints.push({ x: hit.x, y: hit.y, z: hit.z })
  return hit
}

/**
 * resetMeasurement(): clear measurement points (native or JS fallback)
 */
ArCoreBridge.resetMeasurement = async function () {
  if (NativeBridge && NativeBridge.resetMeasurement) {
    return await NativeBridge.resetMeasurement()
  }
  _measurementPoints = []
  _measurementActive = false
  return true
}

/**
 * getArea(): returns { area_sqm, area_sqft, pointsCount }
 */
ArCoreBridge.getArea = async function () {
  if (NativeBridge && NativeBridge.getArea) {
    return await NativeBridge.getArea()
  }
  // compute area from _measurementPoints using x,z coordinates
  const pts = _measurementPoints.map(p => ({ x: p.x, z: p.z }))
  const area_sqm = _shoelaceAreaMeters(pts)
  const area_sqft = Number((area_sqm * 10.7639).toFixed(4))
  return { area_sqm: Number(area_sqm.toFixed(4)), area_sqft, pointsCount: _measurementPoints.length }
}

// Check whether the current device supports ARCore.
// Native implementations should expose `isSupported()` returning a boolean or Promise<boolean>.
ArCoreBridge.isSupported = async function () {
  if (NativeModules && NativeModules.ARCoreBridge && NativeModules.ARCoreBridge.isSupported) {
    try {
      const res = await NativeModules.ARCoreBridge.isSupported()
      return Boolean(res)
    } catch (e) {
      return false
    }
  }

  // Fallback heuristic: only Android devices can support ARCore.
  // This fallback is conservative: return true on Android, false otherwise.
  return Platform.OS === 'android'
}
