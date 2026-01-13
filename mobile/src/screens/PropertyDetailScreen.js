import React from 'react'
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, SafeAreaView, Dimensions, Platform, StatusBar, Alert } from 'react-native'
import theme from '../styles/theme'

const { width } = Dimensions.get('window')

export default function PropertyDetailScreen({ property, onBack }) {
    const API_BASE = 'http://127.0.0.1:8000' // Using localhost with adb reverse for stability

    if (!property) return null

    const images = property.images && property.images.length > 0 ? property.images : []
    const heroImage = images.length > 0 ? { uri: `${API_BASE}${images[0]}` } : null

    // Find active AI description
    const activeDescription = property.descriptions?.find(d => d.is_active) || property.descriptions?.[0];
    const keyFeatures = activeDescription?.key_features || [];

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
            <ScrollView bounces={false} style={styles.scrollView} contentContainerStyle={styles.scrollContent}>

                {/* Hero Image Section */}
                <View style={styles.heroContainer}>
                    {heroImage ? (
                        <Image source={heroImage} style={styles.heroImage} />
                    ) : (
                        <View style={[styles.heroImage, styles.placeholderHero]}>
                            <Text style={styles.placeholderText}>No Image Available</Text>
                        </View>
                    )}

                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={onBack}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.backButtonText}>←</Text>
                    </TouchableOpacity>

                    <View style={styles.heroOverlay}>
                        <View style={styles.priceTag}>
                            <Text style={styles.priceText}>₹ {property.price?.toLocaleString() || 'Contact for Price'}</Text>
                        </View>
                    </View>
                </View>

                {/* Content Section */}
                <View style={styles.content}>
                    <Text style={styles.title}>{property.title}</Text>
                    <View style={styles.locationContainer}>
                        <Text style={styles.locationIcon}>📍</Text>
                        <Text style={styles.address}>{property.address || 'Location information not available'}</Text>
                    </View>

                    <View style={styles.divider} />

                    {/* Quick Stats Grid */}
                    <View style={styles.statsGrid}>
                        <View style={styles.statBox}>
                            <Text style={styles.statIcon}>📏</Text>
                            <Text style={styles.statLabel}>Total Land</Text>
                            <Text style={styles.statValue}>{property.total_land || '--'} sqm</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statIcon}>💧</Text>
                            <Text style={styles.statLabel}>Water Supply</Text>
                            <Text style={styles.statValue}>{property.water_supply || 'N/A'}</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statIcon}>🛏️</Text>
                            <Text style={styles.statLabel}>Bedrooms</Text>
                            <Text style={styles.statValue}>{property.bedrooms || '0'}</Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    {/* Photo GallerySection */}
                    {images.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Property Photos ({images.length})</Text>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.galleryScroll}
                            >
                                {images.map((img, index) => (
                                    <View key={index} style={styles.galleryImageContainer}>
                                        <Image
                                            source={{ uri: `${API_BASE}${img}` }}
                                            style={styles.galleryImage}
                                        />
                                    </View>
                                ))}
                            </ScrollView>
                        </View>
                    )}

                    {/* Description Section */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>
                            {activeDescription ? "AI-Generated Description" : "About this Property"}
                        </Text>
                        <Text style={styles.description}>
                            {activeDescription?.detailed_description || activeDescription?.short_description || property.description || "Beautiful property located in a prime area. Recently updated with modern features and high-quality finishes throughout."}
                        </Text>
                    </View>

                    {/* Key Features Section */}
                    {keyFeatures.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Key Features</Text>
                            <View style={styles.featuresContainer}>
                                {keyFeatures.map((feature, idx) => (
                                    <View key={idx} style={styles.featureBadge}>
                                        <Text style={styles.featureText}>✓ {feature}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* Contact Agent Button */}
                    <TouchableOpacity
                        style={styles.contactButton}
                        activeOpacity={0.9}
                        onPress={() => {
                            const contactUser = property.agent || property.owner;
                            if (contactUser) {
                                const name = `${contactUser.first_name || ''} ${contactUser.last_name || ''}`.trim() || contactUser.username;
                                const email = contactUser.email;
                                const phone = contactUser.phone_number || 'Not provided';

                                Alert.alert(
                                    'Contact Information',
                                    `Name: ${name}\nEmail: ${email}\nPhone: ${phone}`,
                                    [{ text: 'OK' }]
                                );
                            } else {
                                Alert.alert('Info', 'Contact information is not available for this property.');
                            }
                        }}
                    >
                        <Text style={styles.contactButtonText}>Contact Agent</Text>
                    </TouchableOpacity>

                    <View style={{ height: 40 }} />
                </View>
            </ScrollView>
        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 20,
    },
    heroContainer: {
        height: 400,
        width: width,
        position: 'relative',
    },
    heroImage: {
        width: '100%',
        height: '100%',
        backgroundColor: '#ddd',
    },
    placeholderHero: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#eee',
    },
    placeholderText: {
        color: '#999',
        fontSize: 16,
    },
    heroOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 20,
        flexDirection: 'row',
        justifyContent: 'flex-start',
    },
    priceTag: {
        backgroundColor: theme.colors.primary,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 6,
    },
    priceText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '800',
    },
    backButton: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 0) + 12,
        left: 20,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    backButtonText: {
        color: '#fff',
        fontSize: 24,
        fontWeight: '700',
    },
    content: {
        padding: 20,
        marginTop: -20,
        backgroundColor: theme.colors.background,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        minHeight: 500,
    },
    title: {
        fontSize: 26,
        fontWeight: '800',
        color: theme.colors.text,
        marginBottom: 8,
    },
    locationContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    locationIcon: {
        marginRight: 6,
        fontSize: 16,
    },
    address: {
        fontSize: 16,
        color: theme.colors.muted,
        flex: 1,
    },
    divider: {
        height: 1,
        backgroundColor: theme.colors.border,
        width: '100%',
        marginVertical: 15,
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 5,
    },
    statBox: {
        flex: 1,
        alignItems: 'center',
        padding: 10,
    },
    statIcon: {
        fontSize: 24,
        marginBottom: 6,
    },
    statLabel: {
        fontSize: 12,
        color: theme.colors.muted,
        marginBottom: 2,
    },
    statValue: {
        fontSize: 14,
        fontWeight: '700',
        color: theme.colors.text,
    },
    section: {
        marginTop: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: theme.colors.text,
        marginBottom: 12,
    },
    galleryScroll: {
        marginHorizontal: -20,
        paddingLeft: 20,
    },
    galleryImageContainer: {
        width: 200,
        height: 150,
        marginRight: 12,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#eee',
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    galleryImage: {
        width: '100%',
        height: '100%',
    },
    description: {
        fontSize: 16,
        lineHeight: 24,
        color: theme.colors.text,
        opacity: 0.8,
    },
    contactButton: {
        backgroundColor: theme.colors.accent,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 30,
        shadowColor: theme.colors.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 5,
    },
    contactButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
    featuresContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 5,
    },
    featureBadge: {
        backgroundColor: '#e7f5ff',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 10,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#d0ebff',
    },
    featureText: {
        color: '#1971c2',
        fontSize: 14,
        fontWeight: '600',
    }
})
