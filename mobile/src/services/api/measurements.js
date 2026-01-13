/**
 * measurements API service
 */

import { Platform } from 'react-native'

const DEFAULT_BASE = process.env.MEASUREMENTS_API_BASE || (Platform.OS === 'android' ? 'http://127.0.0.1:8000' : 'http://127.0.0.1:8000')

export async function postMeasurement(payload, opts = {}) {
  const base = DEFAULT_BASE
  const url = `${base.replace(/\/$/, '')}/api/measurements`

  try {
    const headers = { 'Content-Type': 'application/json' }
    if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    const text = await res.text()
    try {
      const data = JSON.parse(text)
      return { ok: res.ok, data }
    } catch (e) {
      console.error('Measurement post parse error:', e, 'Raw response:', text)
      return { ok: false, error: 'Server returned invalid response' }
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export async function exportMeasurement(measurementId, formats = ['obj', 'svg', 'pdf'], opts = {}) {
  const base = DEFAULT_BASE
  const url = `${base.replace(/\/$/, '')}/api/measurements/${measurementId}/export`

  try {
    const headers = { 'Content-Type': 'application/json' }
    if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ formats })
    })
    const text = await res.text()
    try {
      const data = JSON.parse(text)
      return { ok: res.ok, data }
    } catch (e) {
      console.error('Measurement export parse error:', e, 'Raw response:', text)
      return { ok: false, error: 'Server returned invalid response' }
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export default { postMeasurement, exportMeasurement }
