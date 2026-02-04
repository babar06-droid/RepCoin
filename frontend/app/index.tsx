import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');
const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const REP_POINTS_KEY = '@rep_points';

// Image aspect ratio is 4:5 (1000x1250) - portrait orientation
// Calculate image size to fit above the buttons area (~280px for buttons)
const BUTTONS_AREA_HEIGHT = 280;
const AVAILABLE_HEIGHT = height - BUTTONS_AREA_HEIGHT;
// Use available height and calculate width to maintain aspect ratio
const IMAGE_HEIGHT = AVAILABLE_HEIGHT;
const IMAGE_WIDTH = IMAGE_HEIGHT * 0.8; // 4:5 aspect ratio means width = height * 0.8

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [repPoints, setRepPoints] = useState<number | null>(null);
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Load REP points from AsyncStorage on mount
  useEffect(() => {
    loadRepPointsFromStorage();
  }, []);

  // Auto-refresh REP points when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadRepPointsFromStorage();
      fetchStats();
    }, [])
  );

  const loadRepPointsFromStorage = async () => {
    try {
      const storedRep = await AsyncStorage.getItem(REP_POINTS_KEY);
      if (storedRep !== null) {
        setRepPoints(parseInt(storedRep, 10));
      } else {
        setRepPoints(0);
      }
    } catch (error) {
      console.log('Load rep points error:', error);
      setRepPoints(0);
    } finally {
      setIsLoading(false);
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
    <View style={styles.container}>
      {/* Background Image - scaled to fit screen */}
      <Image
        source={require('../assets/repcoin-hero.png')}
        style={styles.backgroundImage}
      />
      
      {/* Dark gradient overlay at bottom for readability */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)']}
        style={styles.gradientOverlay}
      />
      
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
              <Text style={styles.repCounterText}>🔥 REP: {repPoints ?? 0}</Text>
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
          <Text style={styles.shareButtonText}>Share Challenge the World</Text>
          <Ionicons name="globe-outline" size={18} color="#FFF" />
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
  backgroundImage: {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    alignSelf: 'center',
    marginTop: 0,
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  bottomContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 20,
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
