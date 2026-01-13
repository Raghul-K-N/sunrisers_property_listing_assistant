// Auth service with backend integration
import { Platform } from 'react-native'

const API_BASE = process.env.API_BASE || (Platform.OS === 'android' ? 'http://127.0.0.1:8000' : 'http://127.0.0.1:8000')

export async function login(email, password) {
  if (!email || !password) throw new Error('Email and password are required')

  const formData = new FormData()
  formData.append('username', email)
  formData.append('password', password)

  console.log('[AUTH] Attempting login to:', `${API_BASE}/api/auth/token`)
  let res
  try {
    res = await fetch(`${API_BASE}/api/auth/token`, {
      method: 'POST',
      body: formData
    })
  } catch (e) {
    console.error('[AUTH] Fetch Error:', e)
    throw new Error('Network request failed. Ensure backend is running and ADB reverse is active.')
  }

  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch (e) {
    console.error('Login parse error:', e, 'Raw response:', text)
    throw new Error('Server returned invalid response')
  }

  if (!res.ok) throw new Error(data.detail || 'Login failed')

  // Get user details
  const meRes = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${data.access_token}` }
  })
  const userData = await meRes.json()

  return {
    token: data.access_token,
    user: {
      ...userData,
      name: `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || userData.username,
      postedProperties: [], // Placeholder for now
      boughtProperties: []
    }
  }
}

export async function logout() {
  // placeholder for cleanup
  return true
}

export async function register(name, email, password, mobile = '') {
  if (!name || !email || !password) throw new Error('Name, email and password are required')

  const nameParts = name.trim().split(' ')
  const firstName = nameParts[0]
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''
  const username = email.split('@')[0] + Math.floor(Math.random() * 1000)

  const payload = {
    email,
    username,
    password,
    first_name: firstName,
    last_name: lastName,
    phone_number: mobile,
    role: 'client'
  }

  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch (e) {
    console.error('Register parse error:', e, 'Raw response:', text)
    throw new Error('Server returned invalid response')
  }

  if (!res.ok) throw new Error(data.detail || 'Registration failed')

  // Auto-login after registration or just return user
  // For simplicity, let's login or just return a mock token for now since the backend register doesn't return a token
  const loginData = await login(email, password)
  return loginData
}

export async function forgotPassword(email) {
  if (!email) throw new Error('Email is required')
  const emailTrim = String(email).trim()
  if (!/^\S+@\S+\.\S+$/.test(emailTrim)) throw new Error('Invalid email')

  const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailTrim })
  })

  // We don't really care about the response body for security/UX reasons (always success message)
  if (!res.ok) {
    const text = await res.text()
    console.warn('Forgot password error:', text)
    // Fallback to "success" from UI perspective or throw if 500
    if (res.status >= 500) throw new Error('Server error')
  }

  return true
}
