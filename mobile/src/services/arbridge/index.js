import { NativeModules, NativeEventEmitter, Platform } from 'react-native'
import * as geom from '../arcore/geometry'

const { ARBridge } = NativeModules || {}
const emitter = ARBridge ? new NativeEventEmitter(ARBridge) : null

function _notSupportedFallback(name) {
  return Promise.reject(new Error(`${name} not available: native ARBridge not installed`))
}

export async function startSession(options = {}) {
  if (ARBridge && ARBridge.startSession) return ARBridge.startSession(options)
  // JS fallback: nothing to start, resolve immediately
  return Promise.resolve({ ok: true, fallback: true })
}

export async function pauseSession() {
  if (ARBridge && ARBridge.pauseSession) return ARBridge.pauseSession()
  return Promise.resolve({ ok: true, fallback: true })
}

export async function stopSession() {
  if (ARBridge && ARBridge.stopSession) return ARBridge.stopSession()
  return Promise.resolve({ ok: true, fallback: true })
}

// getPlanes: returns array of detected plane objects {id, center:{x,y,z}, polygon:[{x,y,z}], alignment: 'horizontal'|'vertical'}
export async function getPlanes() {
  if (ARBridge && ARBridge.getPlanes) return ARBridge.getPlanes()
  // fallback: return empty array (or any cached plane data if available elsewhere)
  return []
}

// hitTest: take screen coordinates and return world intersection points [{x,y,z, distance}]
export async function hitTest(screenX, screenY) {
  if (ARBridge && ARBridge.hitTest) return ARBridge.hitTest(screenX, screenY)
  // JS fallback: not available without native hit-testing
  return _notSupportedFallback('hitTest')
}

// getFeaturePoints: returns array of points {x,y,z,confidence}
export async function getFeaturePoints() {
  if (ARBridge && ARBridge.getFeaturePoints) return ARBridge.getFeaturePoints()
  // Fallback: try to synthesize from detected planes' polygons (low-quality)
  try {
    const planes = await getPlanes()
    const pts = []
    for (const p of planes) {
      if (p && p.polygon && p.polygon.length) {
        for (const v of p.polygon) pts.push({ x: v.x, y: v.y, z: v.z, confidence: 0.2 })
      }
    }
    return pts
  } catch (e) {
    return []
  }
}

// Subscribe to native AR events (planeAdded, planeUpdated, planeRemoved, anchorAdded, featurePointFound)
export function addListener(eventName, cb) {
  if (!emitter) return () => {}
  const sub = emitter.addListener(eventName, cb)
  return () => sub.remove()
}

export default {
  startSession,
  pauseSession,
  stopSession,
  getPlanes,
  hitTest,
  getFeaturePoints,
  addListener
}
