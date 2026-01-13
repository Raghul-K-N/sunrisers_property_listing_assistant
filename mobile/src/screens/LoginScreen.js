import React, { useState } from 'react'
import { View, Text, TextInput, Button, StyleSheet, Alert, Platform, StatusBar } from 'react-native'
import theme from '../styles/theme'
import { login } from '../services/auth'

export default function LoginScreen({ onLogin, onNavigate }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleLogin() {
    try {
      setBusy(true)
      const res = await login(email, password)
      if (onLogin) onLogin(res.user, res.token)
    } catch (e) {
      Alert.alert('Login failed', String(e.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <Text style={styles.label}>Password</Text>
        <TextInput style={styles.input} secureTextEntry value={password} onChangeText={setPassword} />
        <View style={styles.buttonRow}>
          <Button title={busy ? 'Signing in...' : 'Sign in'} onPress={handleLogin} disabled={busy} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
          <Button title="Register" onPress={() => onNavigate && onNavigate('register')} />
          <Button title="Forgot" onPress={() => onNavigate && onNavigate('forgot')} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    padding: theme.spacing.md,
    paddingTop: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + theme.spacing.md : theme.spacing.md),
    justifyContent: 'center',
    backgroundColor: theme.colors.background
  },
  card: { backgroundColor: theme.colors.card, padding: theme.spacing.md, borderRadius: 12, marginHorizontal: theme.spacing.md, ...theme.shadow },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12, color: theme.colors.primary },
  label: { marginTop: 8, marginBottom: 4, color: theme.colors.muted },
  input: { borderWidth: 1, borderColor: theme.colors.border, padding: 8, borderRadius: 8, backgroundColor: '#fff' },
  buttonRow: { marginTop: 16 }
})
