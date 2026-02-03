import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ImageBackground,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';

const { width, height } = Dimensions.get('window');
const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [repPoints, setRepPoints] = useState(0);
  const [totalWorkouts, setTotalWorkouts] = useState(0);

  // Auto-refresh REP points when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchRepPoints();
      fetchStats();
    }, [])
  );

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

  const fetchStats = async () => {
    try {
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/wallet/stats`);
      const data = await res.json();
      if (data.sessions_count !== undefined) {
        setTotalWorkouts(data.sessions_count);
      }
    } catch (error) {
      console.log('Fetch stats error:', error);
    }
  };

  const shareChallenge = async () => {
    const challengeMessage = `💪 REP COIN CHALLENGE! 💪

I've earned ${repPoints} REP Points and completed ${totalWorkouts} workouts!

🏆 Think you can beat me?

Download REP Coin and prove it! 
Earn crypto while you burn calories! 🔥

#REPCoin #FitnessChallenge #WorkoutMotivation`;

    try {
      const canShare = await Sharing.isAvailableAsync();
      
      if (Platform.OS === 'web') {
        // Web fallback - try native share or copy to clipboard
        if (navigator.share) {
          await navigator.share({
            title: 'REP Coin Challenge',
            text: challengeMessage,
          });
        } else {
          // Copy to clipboard fallback
          await navigator.clipboard.writeText(challengeMessage);
          Alert.alert('Copied!', 'Challenge message copied to clipboard. Paste it on your social media!');
        }
      } else if (canShare) {
        // On mobile, we can share text directly
        Alert.alert(
          '🔥 Share Your Challenge!',
          challengeMessage,
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Copy & Share', 
              onPress: async () => {
                // For mobile, show the share sheet
                // Since expo-sharing requires a file, we'll show an alert with copy option
                Alert.alert(
                  'Challenge Ready!',
                  'Copy this message and share it on your favorite social media:\n\n' + challengeMessage
                );
              }
            },
          ]
        );
      } else {
        Alert.alert('Share Your Challenge!', challengeMessage);
      }
    } catch (error) {
      console.log('Share error:', error);
      Alert.alert('Share Your Challenge!', challengeMessage);
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
        {/* Start Workout Button with REP Counter */}
        <View style={styles.startButtonRow}>
          <TouchableOpacity
            style={styles.startButton}
            onPress={() => router.push('/workout')}
            activeOpacity={0.8}
          >
            <Ionicons name="fitness" size={28} color="#000" />
            <Text style={styles.startButtonText}>START WORKOUT</Text>
          </TouchableOpacity>
          
          {/* REP Counter on right side */}
          <TouchableOpacity style={styles.repCounter} onPress={() => router.push('/wallet')}>
            <View style={styles.repCounterContent}>
              <Text style={styles.repCounterText}>🔥 REP: {repPoints}</Text>
              <Text style={styles.repSubtext}>Earn REP with every rep</Text>
            </View>
          </TouchableOpacity>
        </View>

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
            style={[styles.secondaryButton, styles.glowingChallengeButton]}
            onPress={() => router.push('/challenge')}
            activeOpacity={0.8}
          >
            <Ionicons name="trophy" size={22} color="#FFD700" />
            <Text style={[styles.secondaryButtonText, { color: '#FFD700' }]}>Challenge</Text>
          </TouchableOpacity>
        </View>

        {/* Share Challenge Button */}
        <TouchableOpacity
          style={styles.shareButton}
          onPress={shareChallenge}
          activeOpacity={0.8}
        >
          <Ionicons name="share-social" size={22} color="#FFF" />
          <Text style={styles.shareButtonText}>Share Challenge to the World</Text>
          <Ionicons name="globe-outline" size={18} color="#FFF" />
        </TouchableOpacity>
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
  startButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  startButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#FFD700',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 30,
  },
  startButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  repCounter: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.9)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FF6B00',
  },
  repCounterContent: {
    alignItems: 'center',
  },
  repCounterText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  repSubtext: {
    fontSize: 8,
    color: '#AAA',
    marginTop: 2,
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
  glowingChallengeButton: {
    borderColor: '#FFD700',
    borderWidth: 2,
    backgroundColor: 'rgba(255,215,0,0.2)',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 10,
  },
  secondaryButtonText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 25,
    backgroundColor: '#4CAF50',
  },
  shareButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
