import React, { useState } from 'react'
import { View, Text, TextInput, Button, StyleSheet, Alert, Platform, StatusBar } from 'react-native'
import { forgotPassword } from '../services/auth'

export default function ForgotPasswordScreen({ onDone, onCancel }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSend() {
    if (!email) return Alert.alert('Please enter your email')
    try {
      setBusy(true)
      await forgotPassword(email)
      Alert.alert('Password Reset', 'If this email exists, a reset link was sent.')
      if (onDone) onDone()
    } catch (e) {
      Alert.alert('Error', String(e.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.page}>
      <Text style={styles.title}>Forgot Password</Text>
      <Text style={styles.label}>Email</Text>
      <TextInput style={styles.input} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <View style={styles.buttonsRow}>
        <Button title="Cancel" onPress={onCancel} />
        <Button title={busy ? 'Sending...' : 'Send Reset'} onPress={handleSend} disabled={busy} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    padding: 16,
    paddingTop: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 16 : 16),
    justifyContent: 'center'
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  label: { marginTop: 8, color: '#666' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 },
  buttonsRow: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between' }
})
