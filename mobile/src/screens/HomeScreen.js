import React, { useState, useMemo, useEffect } from 'react'
import { SafeAreaView, View, Text, Button, StyleSheet, FlatList, TouchableOpacity, TextInput, Platform, StatusBar, Image } from 'react-native'
import theme from '../styles/theme'
import PropertyCard from '../components/PropertyCard'

const API_BASE = (Platform.OS === 'android' ? 'http://127.0.0.1:8000' : 'http://127.0.0.1:8000')

export default function HomeScreen({ user, onStartAR, onProfile, onPost, onSelect }) {
  const [apiProperties, setApiProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [areaMin, setAreaMin] = useState('')
  const [areaMax, setAreaMax] = useState('')

  useEffect(() => {
    async function fetchProperties() {
      try {
        const res = await fetch(`${API_BASE}/api/properties`)
        if (res.ok) {
          const data = await res.json()
          setApiProperties(data)
        }
      } catch (e) {
        console.error('Fetch error:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchProperties()
  }, [])

  const posted = (user && user.postedProperties) || []
  const bought = (user && user.boughtProperties) || []
  // Combine API properties with locally created ones to ensure immediate visibility after post
  // In a full app, we'd rely on a global state or re-fetch
  const all = useMemo(() => {
    return apiProperties
  }, [apiProperties])

  const filtered = useMemo(() => {
    const q = (query || '').trim().toLowerCase()
    const pMin = parseFloat(priceMin) || 0
    const pMax = parseFloat(priceMax) || Infinity
    const aMin = parseFloat(areaMin) || 0
    const aMax = parseFloat(areaMax) || Infinity

    return all.filter((it) => {
      // Exclude properties posted by the current user
      if (user && it.owner_id === user.id) return false;

      if (q) {
        const inTitle = (it.title || '').toLowerCase().includes(q)
        const inAddr = (it.address || it.location || '').toLowerCase().includes(q)
        if (!inTitle && !inAddr) return false
      }
      const price = Number(it.price) || 0
      if (price < pMin || price > pMax) return false
      // try several possible area fields
      const area = Number(it.total_land || (it.additional && it.additional.totalLand) || (it.area_sqm) || 0)
      if (area < aMin || area > aMax) return false
      return true
    })
  }, [all, query, priceMin, priceMax, areaMin, areaMax])

  function clearFilter(key) {
    if (key === 'query') return setQuery('')
    if (key === 'price') { setPriceMin(''); setPriceMax(''); return }
    if (key === 'area') { setAreaMin(''); setAreaMax(''); return }
  }

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.logo}>Sunrisers</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.postButton} onPress={onPost} activeOpacity={0.8}>
            <Text style={styles.postButtonText}>Post Your Property</Text>
          </TouchableOpacity>
          <View style={{ width: 8 }} />
          <TouchableOpacity onPress={onProfile} style={styles.profileIcon}><Text style={{ color: '#fff' }}>P</Text></TouchableOpacity>
        </View>
      </View>

      <View style={{ marginBottom: 12 }}>
        {/* Active filter badges */}
        {(query || priceMin || priceMax || areaMin || areaMax) && (
          <View style={styles.filterBadgesContainer}>
            {query ? (
              <TouchableOpacity onPress={() => clearFilter('query')} style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>🔎 {query}</Text>
              </TouchableOpacity>
            ) : null}
            {(priceMin || priceMax) ? (
              <TouchableOpacity onPress={() => clearFilter('price')} style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>₹ {priceMin || 'min'} - {priceMax || 'max'}</Text>
              </TouchableOpacity>
            ) : null}
            {(areaMin || areaMax) ? (
              <TouchableOpacity onPress={() => clearFilter('area')} style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>Area: {areaMin || 'min'} - {areaMax || 'max'} sqm</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
        <View style={styles.searchWrapper}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput placeholder="Search properties by title or address" value={query} onChangeText={setQuery} style={styles.searchInputInner} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
          <Button title={showFilters ? 'Hide Filters' : 'Show Filters'} onPress={() => setShowFilters((s) => !s)} />
        </View>
        {showFilters && (
          <View style={styles.filterBox}>
            <View style={styles.filterRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.filterLabel}>Min Price</Text>
                <TextInput placeholder="0" keyboardType="numeric" style={styles.inputSmall} value={priceMin} onChangeText={setPriceMin} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.filterLabel}>Max Price</Text>
                <TextInput placeholder="Any" keyboardType="numeric" style={styles.inputSmall} value={priceMax} onChangeText={setPriceMax} />
              </View>
            </View>
            <View style={{ height: 12 }} />
            <View style={styles.filterRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.filterLabel}>Min Area (sqm)</Text>
                <TextInput placeholder="0" keyboardType="numeric" style={styles.inputSmall} value={areaMin} onChangeText={setAreaMin} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.filterLabel}>Max Area (sqm)</Text>
                <TextInput placeholder="Any" keyboardType="numeric" style={styles.inputSmall} value={areaMax} onChangeText={setAreaMax} />
              </View>
            </View>
            <View style={styles.clearButtonWrapper}>
              <Button title="CLEAR" color={theme.colors.primary} onPress={() => { setPriceMin(''); setPriceMax(''); setAreaMin(''); setAreaMax(''); setQuery('') }} />
            </View>
          </View>
        )}
      </View>

      <Text style={styles.sectionTitle}>Properties</Text>
      <FlatList
        data={filtered}
        keyExtractor={(it, idx) => String(it.id || idx)}
        renderItem={({ item }) => (
          <PropertyCard
            item={item}
            onPress={() => onSelect && onSelect(item)}
          />
        )}
        ListEmptyComponent={() => (
          <View style={{ padding: 16 }}><Text style={{ color: theme.colors.muted }}>No properties to show</Text></View>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: theme.spacing.md, paddingTop: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + theme.spacing.md : theme.spacing.md), backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md },
  logo: { fontSize: 22, fontWeight: '700', color: theme.colors.primary },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  profileIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  postButton: { backgroundColor: theme.colors.accent, borderRadius: 6, paddingHorizontal: 6 },
  postButtonText: { color: '#fff', paddingVertical: 8, paddingHorizontal: 12, fontWeight: '700' },
  controlsRow: { marginBottom: theme.spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: theme.spacing.sm }
})
styles.searchInput = {
  borderWidth: 1,
  borderColor: theme.colors.border,
  padding: 8,
  borderRadius: 8,
  backgroundColor: '#fff'
}

styles.inputSmall = {
  flex: 1,
  borderWidth: 1,
  borderColor: theme.colors.border,
  padding: 8,
  borderRadius: 8,
  backgroundColor: '#fff'
}

styles.searchWrapper = {
  flexDirection: 'row',
  alignItems: 'center',
  borderWidth: 1,
  borderColor: theme.colors.border,
  borderRadius: 8,
  backgroundColor: '#fff',
  paddingHorizontal: 8
}

styles.searchIcon = {
  marginRight: 8,
  fontSize: 16,
  color: theme.colors.muted
}

styles.searchInputInner = {
  flex: 1,
  paddingVertical: 8
}

styles.filterBadgesContainer = {
  flexDirection: 'row',
  flexWrap: 'wrap',
  marginBottom: 8,
  alignItems: 'center'
}

styles.filterBadge = {
  backgroundColor: theme.colors.primary,
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 16,
  marginRight: 8,
  marginBottom: 8
}

styles.filterBadgeText = {
  color: '#fff',
  fontWeight: '600'
}

styles.filterBox = {
  marginTop: 10,
  padding: 12,
  backgroundColor: '#fff',
  borderRadius: 12,
  borderWidth: 1,
  borderColor: theme.colors.border
}

styles.filterRow = {
  flexDirection: 'row',
  gap: 8
}

styles.clearButtonWrapper = {
  marginTop: 10,
  alignItems: 'flex-end'
}

styles.filterLabel = {
  fontSize: 12,
  fontWeight: '600',
  color: theme.colors.muted,
  marginBottom: 4,
  marginLeft: 2
}
