import React, { useState, useRef } from 'react'
import { View, Text, TextInput, Button, Alert, TouchableOpacity, Animated, Easing, StyleSheet, ActivityIndicator, Platform, StatusBar } from 'react-native'
import measurementApi from '../services/api/measurements'
import * as ImagePicker from 'expo-image-picker'
import styled from 'styled-components/native'
import { LinearGradient } from 'expo-linear-gradient'
import theme from '../styles/theme'

const PHOTO_CATEGORIES = ['amenities', 'bedroom', 'washroom', 'playing_area']

export default function PostPropertyScreen({ token, onSuccess, onCancel, onStartAR }) {
  const [step, setStep] = useState(0) // 0: basic, 1: photos, 2: AR measure
  const [loading, setLoading] = useState(false)
  const [exportedPlans, setExportedPlans] = useState(null)

  // Basic
  const [title, setTitle] = useState('')
  const [address, setAddress] = useState('')
  const [price, setPrice] = useState('')

  // Additional details
  const [waterSupply, setWaterSupply] = useState('')
  const [totalLand, setTotalLand] = useState('')

  // Photos (simple placeholders)
  const [photos, setPhotos] = useState({
    amenities: [],
    bedroom: [],
    washroom: [],
    playing_area: []
  })

  // AR measurement result
  const [measurement, setMeasurement] = useState(null)
  // Per-room measurements (manual or AR)
  const [measurementsByRoom, setMeasurementsByRoom] = useState({})
  const [manualOpen, setManualOpen] = useState({})
  const [manualDrafts, setManualDrafts] = useState({})
  const [arLoadingRoom, setArLoadingRoom] = useState(null)

  function addDummyPhoto(category) {
    (async () => {
      try {
        const permission = await ImagePicker.requestCameraPermissionsAsync()
        if (!permission.granted) return Alert.alert('Camera permission required')
        const res = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: false })

        const isCancelled = res.canceled !== undefined ? res.canceled : res.cancelled;
        if (res && !isCancelled) {
          const uri = res.assets ? res.assets[0].uri : res.uri;
          if (uri) {
            setPhotos((p) => ({ ...p, [category]: [...(p[category] || []), { uri }] }))
            Alert.alert('Photo Added', `URI: ${uri.substring(0, 30)}...`);
          } else {
            Alert.alert('Error', 'No URI found in camera result');
          }
        }
      } catch (e) {
        Alert.alert('Camera error', String(e))
      }
    })()
  }

  function handleTakeAR() {
    if (!onStartAR) return Alert.alert('AR not available')
    // pass a callback to receive measurement
    onStartAR((payload) => {
      // payload expected to include measurements
      setMeasurement(payload)
      setStep(2)
    })
  }

  function startArForCategory(category) {
    if (!onStartAR) return Alert.alert('AR not available')
    setArLoadingRoom(category)
    onStartAR((payload) => {
      setMeasurementsByRoom((m) => ({ ...m, [category]: payload }))
      setArLoadingRoom(null)
      setStep(2)
    })
  }

  function toggleManual(category) {
    setManualOpen((m) => ({ ...m, [category]: !m[category] }))
    if (!manualDrafts[category]) {
      setManualDrafts((d) => ({ ...d, [category]: { length_m: '', width_m: '', height_m: '', area_sqm: '', volume_m3: '', corner_heights: ['', '', '', ''] } }))
    }
  }

  function updateManualDraft(category, field, value, idx) {
    setManualDrafts((d) => {
      const cur = d[category] || { length_m: '', width_m: '', height_m: '', area_sqm: '', volume_m3: '', corner_heights: [] }
      if (field === 'corner') {
        const ch = [...(cur.corner_heights || [])]
        ch[idx] = value
        return { ...d, [category]: { ...cur, corner_heights: ch } }
      }

      const updated = { ...cur, [field]: value }
      // live compute area and volume when length/width/height change
      const length = parseFloat(updated.length_m) || 0
      const width = parseFloat(updated.width_m) || 0
      const height = parseFloat(updated.height_m) || 0
      if ((field === 'length_m' || field === 'width_m') && length && width) {
        updated.area_sqm = (length * width).toFixed ? (length * width).toString() : String(length * width)
      }
      if ((field === 'height_m' || field === 'length_m' || field === 'width_m') && updated.area_sqm && height) {
        const a = parseFloat(updated.area_sqm) || 0
        updated.volume_m3 = (a * height).toFixed ? (a * height).toString() : String(a * height)
      }
      return { ...d, [category]: updated }
    })
  }

  function saveManual(category) {
    const draft = manualDrafts[category]
    if (!draft) return Alert.alert('No manual data')
    const length_m = parseFloat(draft.length_m) || 0
    const width_m = parseFloat(draft.width_m) || 0
    const height_m = parseFloat(draft.height_m) || 0
    const area_sqm = parseFloat(draft.area_sqm) || (length_m && width_m ? length_m * width_m : 0)
    const volume_m3 = parseFloat(draft.volume_m3) || (area_sqm && height_m ? area_sqm * height_m : 0)
    const points = (draft.corner_heights || []).map((h, i) => ({ x: 0, y: 0, z: parseFloat(h) || 0 }))
    const payload = { length_m, width_m, height_m, area_sqm, volume_m3, points }
    setMeasurementsByRoom((m) => ({ ...m, [category]: payload }))
    setManualOpen((m) => ({ ...m, [category]: false }))
    Alert.alert('Saved', `Manual measurements saved for ${category}`)
  }

  async function handleSave() {
    const photoCount = Object.values(photos).flat().length;
    Alert.alert('Debug Trace', `handleSave triggered. Total photos in state: ${photoCount}`);

    if (!title) return Alert.alert('Title required')
    setLoading(true)
    const p = parseFloat(price) || null
    const land = parseFloat(totalLand) || null

    const payload = {
      title,
      address,
      price: p,
      water_supply: waterSupply,
      total_land: land,
      photos,
      measurement
    }

    try {
      // 1. Create property record in backend
      const base = (Platform.OS === 'android' ? 'http://127.0.0.1:8000' : 'http://127.0.0.1:8000')
      const propRes = await fetch(`${base.replace(/\/$/, '')}/api/properties`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title,
          address,
          price: p,
          water_supply: waterSupply,
          total_land: land,
          bedrooms: photos.bedroom ? photos.bedroom.length : 0,
          images: []
        })
      })
      const propJson = await propRes.json()
      if (!propRes.ok) {
        Alert.alert('Error', 'Failed to create property: ' + (propJson.detail || propJson.error || 'unknown'))
        return
      }
      const propertyId = propJson.id
      Alert.alert('Debug Trace', `Property Created ID: ${propertyId}`);

      // 2. Upload photos to backend and collect returned paths
      const uploadedPaths = []
      const categories = Object.keys(photos)
      Alert.alert('Debug Trace', `Step 2: Starting upload loop. Categories found: ${categories.length}`);

      for (const cat of categories) {
        const arr = photos[cat] || []
        if (arr.length > 0) {
          Alert.alert('Debug Trace', `Found ${arr.length} photos in category: ${cat}`);
        }
        for (let i = 0; i < arr.length; i++) {
          const photo = arr[i]
          try {
            const form = new FormData()
            form.append('property_id', String(propertyId))
            form.append('category', cat)
            if (!photo || !photo.uri) continue;
            const photoUri = Platform.OS === 'android' && !photo.uri.startsWith('file://') ? `file://${photo.uri}` : photo.uri
            console.log(`[DEBUG] Uploading photo for ${cat}:`, { uri: photoUri, propertyId });
            form.append('file', { uri: photoUri, name: `photo_${Date.now()}.jpg`, type: 'image/jpeg' })

            // Log FormData parts for debugging (RN specific)
            if (form._parts) {
              console.log(`[DEBUG] FormData parts:`, JSON.stringify(form._parts));
            }

            Alert.alert('Debug Payload', `Uploading ${cat} photo\nURI: ${photoUri.substring(0, 50)}...`);

            const up = await fetch(`${base.replace(/\/$/, '')}/api/uploads/property-photo`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`
              },
              body: form
            })
            const upj = await up.json()
            if (up.ok && upj.path) {
              uploadedPaths.push(upj.path)
            } else {
              Alert.alert('Upload Error', `Failed to upload ${cat}: ${JSON.stringify(upj)}`)
            }
          } catch (e) {
            console.error('Photo upload error:', e)
            Alert.alert('Network Error', `Could not reach server for ${cat} photo: ${e.message}`)
          }
        }
      }

      // 3. Save measurements for each room (manual or AR)
      const roomEntries = Object.entries(measurementsByRoom)
      if (roomEntries.length) {
        for (const [cat, meas] of roomEntries) {
          try {
            const res = await measurementApi.postMeasurement({
              property_id: propertyId,
              room_type: cat,
              area_sqm: meas.area_sqm || 0,
              volume_m3: meas.volume_m3 || 0,
              perimeter: (meas.points || []).map(pt => [pt.x, pt.y, pt.z])
            }, { token })
            if (res.ok && res.data) {
              const exp = await measurementApi.exportMeasurement(res.data.id, ['obj', 'svg', 'pdf'], { token })
              if (exp.ok) setExportedPlans((prev) => ({ ...(prev || {}), [cat]: exp.data.paths }))
            }
          } catch (e) {
            // continue with next room
          }
        }
        Alert.alert('Saved', 'Property saved with room measurements.')
      } else if (measurement) {
        // fallback single generic measurement
        try {
          const res = await measurementApi.postMeasurement({
            property_id: propertyId,
            room_type: 'room',
            area_sqm: measurement.area_sqm,
            volume_m3: measurement.volume_m3,
            perimeter: measurement.points.map(pt => [pt.x, pt.y, pt.z])
          }, { token })
          if (res.ok && res.data) {
            const exp = await measurementApi.exportMeasurement(res.data.id, ['obj', 'svg', 'pdf'], { token })
            if (exp.ok) setExportedPlans(exp.data.paths)
            Alert.alert('Success', 'Property saved with 3D plans generated!')
          }
        } catch (e) {
          Alert.alert('Warning', 'Property saved but measurement upload failed.')
        }
      } else {
        Alert.alert('Saved', 'Property saved without measurements.')
      }

      // 4. Update property images list if uploads succeeded
      if (uploadedPaths.length) {
        Alert.alert('Debug', `Total uploaded paths: ${uploadedPaths.length}`)
        try {
          await fetch(`${base.replace(/\/$/, '')}/api/properties/${propertyId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ images: uploadedPaths })
          })
        } catch (e) {
          console.error('Final image link update failed:', e)
        }
      }

      // 5. Trigger LLM Description Generation
      try {
        console.log('[DEBUG] Triggering LLM generation for:', propertyId);
        const genRes = await fetch(`${base.replace(/\/$/, '')}/api/property-descriptions/generate/${propertyId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const responseText = await genRes.text();
        let genJson = {};
        try {
          genJson = JSON.parse(responseText);
        } catch (e) {
          console.error('[DEBUG] Failed to parse LLM response:', responseText);
          throw new Error('Server returned non-JSON response: ' + responseText.substring(0, 100));
        }

        if (genRes.ok) {
          console.log('[DEBUG] LLM Generation Success:', genJson.title_suggestion);
          Alert.alert('AI Success', 'Professional listing description generated using AI!');
        } else {
          console.error('[DEBUG] LLM Generation Failed:', genJson);
          Alert.alert('AI Warning', 'Could not generate AI description: ' + (genJson.detail || 'Internal server error'));
        }
      } catch (e) {
        console.error('LLM generation error:', e);
      }

      if (onSuccess) onSuccess(payload)
    } catch (e) {
      Alert.alert('Error', String(e))
    } finally {
      setLoading(false)
    }
  }

  function handleNext() {
    if (step === 0) return setStep(1)
    if (step === 1) {
      const total = Object.values(photos).reduce((s, arr) => s + ((arr && arr.length) || 0), 0)
      if (total < 1) return Alert.alert('Please add at least one photo before continuing')
      return setStep(2)
    }
    return setStep(2)
  }

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>Post Property</Text>

        <View style={styles.tabRow}>
          <TouchableOpacity onPress={() => setStep(0)} style={[styles.tab, step === 0 && styles.tabActive]}><Text style={styles.tabText}>Details</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setStep(1)} style={[styles.tab, step === 1 && styles.tabActive]}><Text style={styles.tabText}>Photos</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setStep(2)} style={[styles.tab, step === 2 && styles.tabActive]}><Text style={styles.tabText}>AR Measure</Text></TouchableOpacity>
        </View>

        {step === 0 && (
          <View>
            <Text style={styles.label}>Name / Title</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} />
            <Text style={styles.label}>Address</Text>
            <TextInput style={styles.input} value={address} onChangeText={setAddress} />
            <Text style={styles.label}>Price</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={price} onChangeText={setPrice} />

            <Text style={[styles.subTitle, { marginTop: 12 }]}>Additional Details</Text>
            <Text style={styles.label}>Water Supply</Text>
            <TextInput style={styles.input} value={waterSupply} onChangeText={setWaterSupply} />
            <Text style={styles.label}>Total Land (sqm)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={totalLand} onChangeText={setTotalLand} />
          </View>
        )}

        {step === 1 && (
          <View>
            {PHOTO_CATEGORIES.map((c) => (
              <View key={c} style={{ marginBottom: 12 }}>
                <Text style={styles.label}>{c.replace('_', ' ').toUpperCase()}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Button color={theme.colors.primary} title={`Add ${c}`} onPress={() => addDummyPhoto(c)} />
                  <Text style={{ marginLeft: 8, color: theme.colors.muted }}>{(photos[c] || []).length} photos</Text>
                </View>

                {measurementsByRoom[c] && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ fontWeight: '700' }}>Measurements for {c.replace('_', ' ')}:</Text>
                    <Text>Area: {(measurementsByRoom[c].area_sqm || 0).toFixed ? (measurementsByRoom[c].area_sqm).toFixed(2) : measurementsByRoom[c].area_sqm} sqm</Text>
                    <Text>Volume: {(measurementsByRoom[c].volume_m3 || 0).toFixed ? (measurementsByRoom[c].volume_m3).toFixed(2) : measurementsByRoom[c].volume_m3} m³</Text>
                    {measurementsByRoom[c].length_m !== undefined && <Text>Length: {measurementsByRoom[c].length_m} m</Text>}
                    {measurementsByRoom[c].width_m !== undefined && <Text>Width: {measurementsByRoom[c].width_m} m</Text>}
                    {measurementsByRoom[c].height_m !== undefined && <Text>Height: {measurementsByRoom[c].height_m} m</Text>}
                    <TouchableOpacity onPress={() => toggleManual(c)} style={{ marginTop: 6 }}>
                      <Text style={{ color: theme.colors.primary }}>Edit / Redo</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
        {step === 2 && (
          <Panel>
            <GradientHeader colors={[theme.colors.gradientStart || '#5ee7df', theme.colors.gradientEnd || '#b490ca']}>
              <HeaderText>Measure Rooms with AR</HeaderText>
            </GradientHeader>
            {/* Per-room measurement controls only for rooms with photos */}
            {/* Per-room measurement controls */}
            {PHOTO_CATEGORIES.map((c) => {
              const hasPhotos = (photos[c] || []).length > 0;
              return (
                <View key={c} style={{ marginBottom: 12, opacity: hasPhotos ? 1 : 0.6 }}>
                  <Text style={{ fontWeight: '700', marginBottom: 6 }}>{c.replace('_', ' ').toUpperCase()}</Text>

                  {!hasPhotos && (
                    <Text style={{ fontSize: 12, color: theme.colors.error, marginBottom: 4 }}>
                      ⚠️ Upload a photo for {c.replace('_', ' ')} to enable scanning
                    </Text>
                  )}

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button
                      color={theme.colors.secondary}
                      title="Manual"
                      onPress={() => hasPhotos ? toggleManual(c) : Alert.alert('Photo Needed', `Please upload a ${c.replace('_', ' ')} photo first.`)}
                      disabled={!hasPhotos}
                    />
                    <Button
                      color={theme.colors.accent}
                      title={arLoadingRoom === c ? 'Scanning...' : 'AR Scan'}
                      onPress={() => hasPhotos ? startArForCategory(c) : Alert.alert('Photo Needed', `Please upload a ${c.replace('_', ' ')} photo first.`)}
                      disabled={!hasPhotos || (arLoadingRoom && arLoadingRoom !== c)}
                    />
                  </View>

                  {/* Manual Input Form */}
                  {manualOpen[c] && (
                    <View style={{ marginTop: 8, padding: 8, backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: 8 }}>
                      <Text style={{ fontWeight: '700' }}>Manual input for {c.replace('_', ' ')}</Text>
                      <View style={{ flexDirection: 'row', marginTop: 8, marginBottom: 6 }}>
                        <Text style={{ flex: 1, fontWeight: '600', color: theme.colors.muted, textAlign: 'center' }}>Length (m)</Text>
                        <Text style={{ flex: 1, fontWeight: '600', color: theme.colors.muted, textAlign: 'center' }}>Width (m)</Text>
                        <Text style={{ flex: 1, fontWeight: '600', color: theme.colors.muted, textAlign: 'center' }}>Height (m)</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TextInput placeholder="L" keyboardType="numeric" style={[styles.input, { flex: 1 }]} value={(manualDrafts[c] && manualDrafts[c].length_m) || ''} onChangeText={(t) => updateManualDraft(c, 'length_m', t)} />
                        <TextInput placeholder="W" keyboardType="numeric" style={[styles.input, { flex: 1 }]} value={(manualDrafts[c] && manualDrafts[c].width_m) || ''} onChangeText={(t) => updateManualDraft(c, 'width_m', t)} />
                        <TextInput placeholder="H" keyboardType="numeric" style={[styles.input, { flex: 1 }]} value={(manualDrafts[c] && manualDrafts[c].height_m) || ''} onChangeText={(t) => updateManualDraft(c, 'height_m', t)} />
                      </View>
                      <View style={{ marginTop: 8 }}>
                        <Text style={{ color: theme.colors.muted, fontSize: 13 }}>Computed</Text>
                        <Text>Area (sqm): {(manualDrafts[c] && manualDrafts[c].area_sqm) || '—'}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                        <Button title="Save" onPress={() => saveManual(c)} />
                      </View>
                    </View>
                  )}

                  {/* Existing Measurements Display */}
                  {measurementsByRoom[c] && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={{ fontWeight: '700' }}>Measurements for {c.replace('_', ' ')}:</Text>
                      <Text>Area: {(measurementsByRoom[c].area_sqm || 0).toFixed ? (measurementsByRoom[c].area_sqm).toFixed(2) : measurementsByRoom[c].area_sqm} sqm</Text>
                      <Text>Volume: {(measurementsByRoom[c].volume_m3 || 0).toFixed ? (measurementsByRoom[c].volume_m3).toFixed(2) : measurementsByRoom[c].volume_m3} m³</Text>
                      {measurementsByRoom[c].length_m !== undefined && <Text>Length: {measurementsByRoom[c].length_m} m</Text>}
                      {measurementsByRoom[c].width_m !== undefined && <Text>Width: {measurementsByRoom[c].width_m} m</Text>}
                      {measurementsByRoom[c].height_m !== undefined && <Text>Height: {measurementsByRoom[c].height_m} m</Text>}
                      <TouchableOpacity onPress={() => toggleManual(c)} style={{ marginTop: 6 }}>
                        <Text style={{ color: theme.colors.primary }}>Edit / Redo</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )
            })}
            {/* Interactive feature cards with animation */}
          </Panel>
        )}

        {step === 2 && (
          <Panel>
            <GradientHeader colors={[theme.colors.gradientStart || '#5ee7df', theme.colors.gradientEnd || '#b490ca']}>
              <HeaderText>Measure Rooms with AR</HeaderText>
            </GradientHeader>

            {/* Interactive feature cards with animation */}
            {/* <CardsRow>
              <FeatureCard icon={'⚡️'} label={'Fast AR Room Scans'} onPress={() => handleTakeAR()} />
              <FeatureCard icon={'📏'} label={'Accurate Area & Volume'} onPress={() => Alert.alert('Accurate Area & Volume', 'Learn more')} />
            </CardsRow>
            <CardsRow>
              <FeatureCard icon={'💾'} label={'Save & Export'} onPress={() => Alert.alert('Save & Export', 'Export OBJ and more')} />
              <FeatureCard icon={'📴'} label={'Works Offline'} onPress={() => Alert.alert('Works Offline', 'Scan without internet')} />
            </CardsRow> */}

            {/* Generic AR Scan removed to enforce per-category photo restriction */}
          </Panel>
        )}

        <View style={styles.buttonsRow}>
          <Button title="Cancel" onPress={onCancel} disabled={loading} />
          {step < 2 ? (
            <Button color={theme.colors.primary} title="Next" onPress={handleNext} disabled={loading} />
          ) : (
            (loading ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <Button color={theme.colors.primary} title="Save Property" onPress={handleSave} />
            ))
          )}
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
    backgroundColor: theme.colors.background
  },
  card: { backgroundColor: theme.colors.card, padding: theme.spacing.md, borderRadius: 12, ...theme.shadow },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12, color: theme.colors.primary },
  label: { marginTop: 8, color: theme.colors.muted },
  input: { borderWidth: 1, borderColor: theme.colors.border, padding: 8, borderRadius: 8, backgroundColor: '#fff' },
  buttonsRow: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between' },
  tabRow: { flexDirection: 'row', marginBottom: 12 },
  tab: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, backgroundColor: '#eee', marginRight: 8 },
  tabActive: { backgroundColor: theme.colors.primary },
  tabText: { color: theme.colors.text },
  subTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.text }
})

// Styled components for AR header / features
const Panel = styled.View`
  margin-top: 12px;
`

const GradientHeader = styled(LinearGradient)`
  padding: 18px;
  border-radius: 12px;
  margin-bottom: 12px;
`

const HeaderText = styled.Text`
  color: #fff;
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 6px;
`

const SubText = styled.Text`
  color: rgba(255,255,255,0.9);
  font-size: 13px;
`

const FeaturesRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: 14px;
`

const FeatureItem = styled.View`
  align-items: center;
  flex: 1;
`

const FeatureIcon = styled.Text`
  font-size: 26px;
  margin-bottom: 6px;
`

const FeatureLabel = styled.Text`
  font-size: 12px;
  color: ${theme.colors.text};
`

const ActionRow = styled.View`
  flex-direction: row;
  justify-content: center;
  margin-bottom: 12px;
`

const ActionButton = styled.Button``

const MeasurementBox = styled.View`
  background-color: rgba(0,0,0,0.04);
  padding: 10px;
  border-radius: 8px;
`

const MeasurementTitle = styled.Text`
  font-weight: 700;
  margin-bottom: 6px;
`

const MeasurementText = styled.Text`
  color: ${theme.colors.text};
`

const NoMeasurementText = styled.Text`
  color: ${theme.colors.muted};
`

// Feature card styles
const CardsRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: 10px;
`

const FeatureCardWrap = styled.TouchableOpacity`
  flex: 1;
  margin-horizontal: 6px;
  background-color: #fff;
  padding: 12px;
  border-radius: 10px;
  align-items: center;
  elevation: 2;
`

const AnimatedIcon = styled(Animated.Text)`
  font-size: 26px;
  margin-bottom: 8px;
`

const CardLabel = styled.Text`
  font-size: 13px;
  text-align: center;
  color: ${theme.colors.text};
`

// Small FeatureCard component with touch feedback + icon animation
function FeatureCard({ icon, label, onPress }) {
  const scale = useRef(new Animated.Value(1)).current
  const rot = useRef(new Animated.Value(0)).current

  function animatePress() {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, { toValue: 0.94, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(rot, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true })
      ]),
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
        Animated.timing(rot, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true })
      ])
    ]).start()
  }

  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '10deg'] })

  return (
    <FeatureCardWrap activeOpacity={0.85} onPress={() => { animatePress(); if (onPress) onPress() }}>
      <AnimatedIcon style={{ transform: [{ scale }, { rotate }] }}>{icon}</AnimatedIcon>
      <CardLabel>{label}</CardLabel>
    </FeatureCardWrap>
  )
}
