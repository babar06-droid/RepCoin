import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ImageBackground,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');
const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [repPoints, setRepPoints] = useState(0);

  useEffect(() => {
    fetchRepPoints();
  }, []);

  const fetchRepPoints = async () => {
    try {
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/wallet`);
      const data = await res.json();
      if (data.rep_points !== undefined) {
        setRepPoints(data.rep_points);
      }
    } catch (error) {
      console.log('Fetch rep points error:', error);
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.imageContainer}>
        <ImageBackground
          source={require('../assets/repcoin-hero.png')}
          style={styles.heroImage}
          resizeMode="contain"
        />
      </View>
      
      {/* Bottom content area */}
      <View style={[styles.bottomContent, { paddingBottom: insets.bottom + 20 }]}>
        {/* Start Workout Button */}
        <TouchableOpacity
          style={styles.startButton}
          onPress={() => router.push('/workout')}
          activeOpacity={0.8}
        >
          <Ionicons name="fitness" size={28} color="#000" />
          <Text style={styles.startButtonText}>START WORKOUT</Text>
        </TouchableOpacity>

        {/* Secondary buttons row */}
        <View style={styles.secondaryButtons}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/wallet')}
            activeOpacity={0.8}
          >
            <Ionicons name="wallet-outline" size={22} color="#FFD700" />
            <Text style={styles.secondaryButtonText}>Wallet</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/voice-studio')}
            activeOpacity={0.8}
          >
            <Ionicons name="mic-outline" size={22} color="#FF6B6B" />
            <Text style={[styles.secondaryButtonText, { color: '#FF6B6B' }]}>Coach</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, styles.challengeButton]}
            onPress={() => router.push('/challenge')}
            activeOpacity={0.8}
          >
            <Ionicons name="trophy" size={22} color="#FF4444" />
            <Text style={[styles.secondaryButtonText, { color: '#FF4444' }]}>Challenge</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  bottomContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#FFD700',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 30,
  },
  startButtonText: {
    color: '#000',
    fontSize: 20,
    fontWeight: 'bold',
  },
  secondaryButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  challengeButton: {
    borderColor: '#FF4444',
    backgroundColor: 'rgba(255,68,68,0.1)',
  },
  secondaryButtonText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
  },
});
