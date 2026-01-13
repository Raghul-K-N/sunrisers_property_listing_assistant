import React, { useEffect } from 'react'
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { View } from 'react-native'

export default function FadeView({ visible = true, duration = 300, style, children }) {
  const opacity = useSharedValue(visible ? 1 : 0)

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration })
  }, [visible])

  const aStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Animated.View style={[style, aStyle]}>
      {children}
    </Animated.View>
  )
}
