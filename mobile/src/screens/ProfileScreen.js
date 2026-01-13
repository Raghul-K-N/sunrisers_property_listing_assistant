import React, { useState, useEffect } from 'react'
import { View, Text, Button, StyleSheet, FlatList, TouchableOpacity, ScrollView, Platform, StatusBar } from 'react-native'
import theme from '../styles/theme'
import PropertyCard from '../components/PropertyCard'

export default function ProfileScreen({ user, token, onLogout, onBack, onSelect }) {
  const [postedProperties, setPostedProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const API_BASE = 'http://127.0.0.1:8000'

  useEffect(() => {
    async function fetchMyProperties() {
      try {
        const res = await fetch(`${API_BASE}/api/properties/user/my-properties`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        if (res.ok) {
          const data = await res.json()
          setPostedProperties(data)
        }
      } catch (e) {
        console.error('Error fetching my properties:', e)
      } finally {
        setLoading(false)
      }
    }
    if (token) {
      fetchMyProperties()
    }
  }, [token])

  if (!user) return null

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Profile</Text>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.userInfoCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user.username || 'U')[0].toUpperCase()}</Text>
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.userName}>{user.username || 'User'}</Text>
            <Text style={styles.userEmail}>{user.email || '-'}</Text>
            <Text style={styles.userPhone}>{user.phone_number || '-'}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Your Posted Properties</Text>
        {loading ? (
          <Text style={styles.empty}>Loading your properties...</Text>
        ) : (
          <FlatList
            data={postedProperties}
            scrollEnabled={false}
            keyExtractor={(i, idx) => String(i.id || idx)}
            renderItem={({ item }) => (
              <PropertyCard
                item={item}
                onPress={() => onSelect && onSelect(item)}
              />
            )}
            ListEmptyComponent={() => <Text style={styles.empty}>You haven't posted any properties yet.</Text>}
          />
        )}

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={onLogout}
          >
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    padding: theme.spacing.md,
    paddingTop: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 16 : 16),
    backgroundColor: theme.colors.background
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.primary
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  backButtonText: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '600'
  },
  userInfoCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 25,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 20
  },
  avatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700'
  },
  infoContent: {
    flex: 1
  },
  userName: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.text
  },
  userEmail: {
    color: theme.colors.muted,
    marginTop: 2
  },
  userPhone: {
    color: theme.colors.muted,
    marginTop: 2
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 10,
    marginLeft: 5
  },
  empty: {
    color: theme.colors.muted,
    paddingVertical: 20,
    textAlign: 'center'
  },
  footer: {
    marginTop: 30,
    alignItems: 'center'
  },
  logoutButton: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.danger
  },
  logoutButtonText: {
    color: theme.colors.danger,
    fontWeight: '700',
    fontSize: 16
  }
})
