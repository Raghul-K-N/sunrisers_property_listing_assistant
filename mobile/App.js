import React, { useState, useRef, useEffect } from 'react'
import { SafeAreaView, StyleSheet } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'

import HomeScreen from './src/screens/HomeScreen'
import ARMeasureScreen from './src/screens/ARMeasureScreen'
import ARScanScreen from './src/screens/ARScanScreen'
import LoginScreen from './src/screens/LoginScreen'
import ProfileScreen from './src/screens/ProfileScreen'
import PostPropertyScreen from './src/screens/PostPropertyScreen'
import RegisterScreen from './src/screens/RegisterScreen'
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen'
import PropertyDetailScreen from './src/screens/PropertyDetailScreen'

export default function App() {
  const [route, setRoute] = useState('login')
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [returnTo, setReturnTo] = useState('home')
  const pendingARCallback = useRef(null)
  const pendingARReturn = useRef(null)

  // Hide splash screen on mount
  useEffect(() => {
    async function hideSplash() {
      try {
        await SplashScreen.hideAsync()
        console.log('Splash screen hidden successfully')
      } catch (e) {
        console.warn('Error hiding splash screen:', e)
      }
    }
    hideSplash()
  }, [])

  function handleLogin(u, t) {
    setUser(u)
    setToken(t)
    setRoute('home')
  }

  function handleLogout() {
    setUser(null)
    setToken(null)
    setRoute('login')
  }

  function handleAddProperty(prop) {
    setUser((prev) => {
      if (!prev) return prev
      const next = { ...prev, postedProperties: [...(prev.postedProperties || []), prop] }
      return next
    })
    setRoute('home')
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Auth Flow */}
      {!user && route === 'login' && <LoginScreen onLogin={handleLogin} onNavigate={(r) => setRoute(r)} />}
      {!user && route === 'register' && <RegisterScreen onRegister={(u, t) => { handleLogin(u, t) }} onCancel={() => setRoute('login')} />}
      {!user && route === 'forgot' && <ForgotPasswordScreen onDone={() => setRoute('login')} onCancel={() => setRoute('login')} />}

      {/* Main Flow */}
      {user && route === 'home' && (
        <HomeScreen
          user={user}
          onStartAR={() => setRoute('scan')}
          onProfile={() => setRoute('profile')}
          onPost={() => setRoute('post')}
          onSelect={(prop) => {
            setSelectedProperty(prop)
            setReturnTo('home')
            setRoute('detail')
          }}
        />
      )}
      {user && route === 'detail' && (
        <PropertyDetailScreen
          property={selectedProperty}
          onBack={() => setRoute(returnTo)}
        />
      )}
      {user && route === 'profile' && (
        <ProfileScreen
          user={user}
          token={token}
          onLogout={handleLogout}
          onBack={() => setRoute('home')}
          onSelect={(prop) => {
            setSelectedProperty(prop)
            setReturnTo('profile')
            setRoute('detail')
          }}
        />
      )}
      {user && route === 'post' && (
        <PostPropertyScreen
          token={token}
          onCancel={() => setRoute('home')}
          onSuccess={(prop) => handleAddProperty(prop)}
          onStartAR={(cb) => {
            pendingARCallback.current = cb
            setRoute('scan')
          }}
        />
      )}
      {user && route === 'scan' && (
        <ARMeasureScreen
          onExit={() => {
            if (pendingARCallback.current) {
              try { pendingARCallback.current(null) } finally { pendingARCallback.current = null }
              setRoute('post')
            } else {
              setRoute('home')
            }
          }}
          onComplete={(payload) => {
            if (pendingARCallback.current) {
              try { pendingARCallback.current(payload) } finally { pendingARCallback.current = null }
              setRoute('post')
            } else {
              setRoute('home')
            }
          }}
          guidedFlow={Boolean(pendingARCallback.current)}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' }
})
