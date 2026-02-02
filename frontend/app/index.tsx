import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Animations
  const coinRotation = useRef(new Animated.Value(0)).current;
  const coinScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.5)).current;
  const titleScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    // Coin rotation animation
    Animated.loop(
      Animated.timing(coinRotation, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    ).start();

    // Coin pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(coinScale, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(coinScale, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Glow animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0.5,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Title entrance
    Animated.spring(titleScale, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();
  }, []);

  const spin = coinRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Background gradient */}
      <View style={styles.gradientOverlay}>
        <View style={styles.gradientTop} />
        <View style={styles.gradientBottom} />
      </View>

      {/* Glow effect */}
      <Animated.View
        style={[
          styles.glow,
          { opacity: glowOpacity },
        ]}
      />

      {/* Main content */}
      <View style={styles.content}>
        {/* Logo and title */}
        <Animated.View
          style={[
            styles.titleContainer,
            { transform: [{ scale: titleScale }] },
          ]}
        >
          {/* Animated coin logo */}
          <Animated.View
            style={[
              styles.coinContainer,
              { transform: [{ rotate: spin }, { scale: coinScale }] },
            ]}
          >
            <View style={styles.coin}>
              <Text style={styles.coinSymbol}>R</Text>
            </View>
          </Animated.View>

          <Text style={styles.title}>REP</Text>
          <Text style={styles.titleCoin}>COIN</Text>
          <Text style={styles.tagline}>Earn While You Burn</Text>
        </Animated.View>

        {/* Description */}
        <View style={styles.descriptionContainer}>
          <Text style={styles.description}>
            Track your push-ups and sit-ups with AI-powered detection.{' '}
            <Text style={styles.highlight}>Every rep earns you crypto coins!</Text>
          </Text>
        </View>

        {/* Feature list */}
        <View style={styles.features}>
          <View style={styles.featureItem}>
            <Ionicons name="camera" size={24} color="#FFD700" />
            <Text style={styles.featureText}>AI Rep Detection</Text>
          </View>
          <View style={styles.featureItem}>
            <MaterialCommunityIcons name="cash-multiple" size={24} color="#4CAF50" />
            <Text style={styles.featureText}>Earn Crypto Coins</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="wallet" size={24} color="#2196F3" />
            <Text style={styles.featureText}>Track Your Earnings</Text>
          </View>
        </View>

        {/* Start button */}
        <TouchableOpacity
          style={styles.startButton}
          onPress={() => router.push('/workout')}
          activeOpacity={0.8}
        >
          <View style={styles.startButtonGradient}>
            <Text style={styles.startButtonText}>START WORKOUT</Text>
            <Ionicons name="arrow-forward" size={24} color="#000" />
          </View>
        </TouchableOpacity>

        {/* Wallet button */}
        <TouchableOpacity
          style={styles.walletButton}
          onPress={() => router.push('/wallet')}
          activeOpacity={0.8}
        >
          <Ionicons name="wallet-outline" size={20} color="#FFD700" />
          <Text style={styles.walletButtonText}>View Wallet</Text>
        </TouchableOpacity>

        {/* Voice Studio button */}
        <TouchableOpacity
          style={styles.voiceStudioButton}
          onPress={() => router.push('/voice-studio')}
          activeOpacity={0.8}
        >
          <Ionicons name="mic-outline" size={20} color="#FF6B6B" />
          <Text style={styles.voiceStudioButtonText}>Voice Studio</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  gradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: height * 0.4,
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
  },
  gradientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: height * 0.4,
    backgroundColor: 'rgba(76, 175, 80, 0.05)',
  },
  glow: {
    position: 'absolute',
    top: height * 0.15,
    alignSelf: 'center',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 50,
    elevation: 20,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  coinContainer: {
    marginBottom: 16,
  },
  coin: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#B8860B',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  coinSymbol: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#8B4513',
  },
  title: {
    fontSize: 56,
    fontWeight: 'bold',
    color: '#FFD700',
    textShadowColor: 'rgba(255, 215, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  titleCoin: {
    fontSize: 56,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: -10,
    textShadowColor: 'rgba(76, 175, 80, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  tagline: {
    fontSize: 18,
    color: '#888',
    marginTop: 8,
    fontStyle: 'italic',
  },
  descriptionContainer: {
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  description: {
    fontSize: 16,
    color: '#AAA',
    textAlign: 'center',
    lineHeight: 24,
  },
  highlight: {
    color: '#FFD700',
    fontWeight: 'bold',
  },
  features: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 40,
    paddingHorizontal: 8,
  },
  featureItem: {
    alignItems: 'center',
    flex: 1,
  },
  featureText: {
    color: '#CCC',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  startButton: {
    width: '100%',
    marginBottom: 16,
  },
  startButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD700',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 30,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  startButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 8,
  },
  walletButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  walletButtonText: {
    color: '#FFD700',
    fontSize: 16,
    marginLeft: 8,
  },
  voiceStudioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#FF6B6B',
    marginTop: 12,
  },
  voiceStudioButtonText: {
    color: '#FF6B6B',
    fontSize: 16,
    marginLeft: 8,
  },
});
