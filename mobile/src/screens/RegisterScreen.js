import React, { useState } from 'react'
import { View, Text, TextInput, Button, StyleSheet, Alert, Platform, StatusBar } from 'react-native'
import { register } from '../services/auth'
import theme from '../styles/theme'

export default function RegisterScreen({ onRegister, onCancel }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleRegister() {
    if (!name || !email || !password) return Alert.alert('Please fill required fields')
    if (password !== confirm) return Alert.alert('Passwords do not match')
    try {
      setBusy(true)
      const res = await register(name, email, password, mobile)
      Alert.alert('Success', 'Account created successfully. Please login.', [
        { text: 'OK', onPress: () => { if (onCancel) onCancel() } }
      ])
    } catch (e) {
      Alert.alert('Register failed', String(e.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} />
        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <Text style={styles.label}>Mobile</Text>
        <TextInput style={styles.input} keyboardType="phone-pad" value={mobile} onChangeText={setMobile} />
        <Text style={styles.label}>Password</Text>
        <TextInput style={styles.input} secureTextEntry value={password} onChangeText={setPassword} />
        <Text style={styles.label}>Confirm Password</Text>
        <TextInput style={styles.input} secureTextEntry value={confirm} onChangeText={setConfirm} />

        <View style={styles.buttonsRow}>
          <Button title="Cancel" onPress={onCancel} />
          <Button title={busy ? 'Creating...' : 'Create Account'} onPress={handleRegister} disabled={busy} />
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
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12, color: theme.colors.primary },
  label: { marginTop: 8, color: theme.colors.muted },
  input: { borderWidth: 1, borderColor: theme.colors.border, padding: 8, borderRadius: 8, backgroundColor: '#fff' },
  buttonsRow: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between' }
})
