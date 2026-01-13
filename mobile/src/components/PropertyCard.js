import React from 'react'
import { View, Text, StyleSheet, Image, TouchableOpacity, Platform } from 'react-native'
import theme from '../styles/theme'

const API_BASE = 'http://127.0.0.1:8000'

export default function PropertyCard({ item, onPress }) {
    const imageUrl = (item.images && item.images.length > 0)
        ? { uri: `${API_BASE}${item.images[0]}` }
        : { uri: 'https://via.placeholder.com/400x200?text=No+Image' }

    return (
        <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
            <Image source={imageUrl} style={styles.image} resizeMode="cover" />
            <View style={styles.info}>
                <Text style={styles.title}>{item.title || 'Untitled property'}</Text>
                <Text style={styles.sub}>{item.address || item.location || ''}</Text>
                <Text style={styles.price}>{item.price ? `₹${item.price.toLocaleString()}` : ''}</Text>
            </View>
        </TouchableOpacity>
    )
}

const styles = StyleSheet.create({
    card: {
        padding: 0,
        borderRadius: 12,
        backgroundColor: theme.colors.card,
        marginHorizontal: 12,
        marginVertical: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        overflow: 'hidden',
        ...theme.shadow
    },
    image: { width: '100%', height: 180 },
    info: { padding: 12 },
    title: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
    sub: { color: theme.colors.muted, marginTop: 4, fontSize: 13 },
    price: { color: theme.colors.primary, marginTop: 8, fontWeight: '800', fontSize: 16 }
})
