import React from 'react';
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

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ImageBackground
      source={require('../assets/repcoin-hero.png')}
      style={styles.container}
      resizeMode="cover"
    >
      {/* Dark overlay for better text readability */}
      <View style={styles.overlay}>
        {/* Spacer to push content to bottom */}
        <View style={styles.spacer} />

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
              <Text style={[styles.secondaryButtonText, { color: '#FF6B6B' }]}>Voice Studio</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  spacer: {
    flex: 1,
  },
  bottomContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
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
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  startButtonText: {
    color: '#000',
    fontSize: 20,
    fontWeight: 'bold',
  },
  secondaryButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 16,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  secondaryButtonText: {
    color: '#FFD700',
    fontSize: 15,
    fontWeight: '600',
  },
});
