import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  Vibration,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import { Accelerometer } from 'expo-sensors';

const { width, height } = Dimensions.get('window');

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

type ExerciseType = 'pushup' | 'situp';

interface CoinAnimation {
  id: number;
  translateY: Animated.Value;
  translateX: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
}

export default function WorkoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  // State
  const [exerciseType, setExerciseType] = useState<ExerciseType>('pushup');
  const [repCount, setRepCount] = useState(0);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [facing, setFacing] = useState<CameraType>('front');
  const [coinAnimations, setCoinAnimations] = useState<CoinAnimation[]>([]);
  const [sessionStats, setSessionStats] = useState({ pushups: 0, situps: 0 });
  const [isTracking, setIsTracking] = useState(false);
  const [motionStatus, setMotionStatus] = useState<string>('Press START');

  // Refs
  const coinIdRef = useRef(0);
  const chachingSoundRef = useRef<Audio.Sound | null>(null);
  const repScale = useRef(new Animated.Value(1)).current;
  const walletScale = useRef(new Animated.Value(1)).current;
  const buttonPulse = useRef(new Animated.Value(1)).current;

  // Motion detection refs
  const subscriptionRef = useRef<any>(null);
  const lastRepTimeRef = useRef(0);
  const motionHistoryRef = useRef<number[]>([]);
  const peakDetectedRef = useRef(false);
  const valleyDetectedRef = useRef(false);
  const lastValueRef = useRef(0);
  const smoothedValueRef = useRef(0);

  // Constants for motion detection
  const MIN_REP_INTERVAL = 600; // Minimum ms between reps
  const MOTION_THRESHOLD = 0.15; // Sensitivity threshold
  const HISTORY_SIZE = 10; // Smoothing window

  useEffect(() => {
    loadSound();
    return () => {
      if (chachingSoundRef.current) {
        chachingSoundRef.current.unloadAsync();
      }
      stopTracking();
    };
  }, []);

  // Pulse animation when tracking
  useEffect(() => {
    if (isTracking) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(buttonPulse, { toValue: 1.08, duration: 600, useNativeDriver: true }),
          Animated.timing(buttonPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      buttonPulse.setValue(1);
    }
  }, [isTracking]);

  const loadSound = async () => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
      
      // Load the cha-ching sound from assets
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/chaching.mp3'),
        { shouldPlay: false, volume: 1.0 }
      );
      chachingSoundRef.current = sound;
      console.log('Cha-ching sound loaded!');
    } catch (error) {
      console.log('Error loading sound from assets, trying URL:', error);
      try {
        // Fallback to online sound
        const { sound } = await Audio.Sound.createAsync(
          { uri: 'https://www.myinstants.com/media/sounds/cha-ching.mp3' },
          { shouldPlay: false, volume: 1.0 }
        );
        chachingSoundRef.current = sound;
      } catch (err) {
        console.log('Could not load sound:', err);
      }
    }
  };

  const playChaChing = async () => {
    try {
      if (chachingSoundRef.current) {
        await chachingSoundRef.current.setPositionAsync(0);
        await chachingSoundRef.current.playAsync();
      }
      // Also vibrate for feedback
      Vibration.vibrate(100);
    } catch (error) {
      console.log('Error playing sound:', error);
    }
  };

  const animateCoin = () => {
    const coinId = coinIdRef.current++;
    const translateY = new Animated.Value(0);
    const translateX = new Animated.Value(0);
    const opacity = new Animated.Value(1);
    const scale = new Animated.Value(1.8);

    setCoinAnimations((prev) => [...prev, {
      id: coinId, translateY, translateX, opacity, scale,
    }]);

    Animated.parallel([
      Animated.timing(translateY, { toValue: -height * 0.4, duration: 700, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: width * 0.3, duration: 700, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
    ]).start(() => {
      setCoinAnimations((prev) => prev.filter((c) => c.id !== coinId));
      Animated.sequence([
        Animated.timing(walletScale, { toValue: 1.5, duration: 80, useNativeDriver: true }),
        Animated.timing(walletScale, { toValue: 1, duration: 80, useNativeDriver: true }),
      ]).start();
    });
  };

  const onRepCompleted = useCallback(() => {
    const now = Date.now();
    if (now - lastRepTimeRef.current < MIN_REP_INTERVAL) return;
    lastRepTimeRef.current = now;

    setRepCount((prev) => prev + 1);
    setCoinsEarned((prev) => prev + 1);
    setSessionStats((prev) => ({
      ...prev,
      [exerciseType === 'pushup' ? 'pushups' : 'situps']: 
        prev[exerciseType === 'pushup' ? 'pushups' : 'situps'] + 1,
    }));

    Animated.sequence([
      Animated.timing(repScale, { toValue: 1.5, duration: 80, useNativeDriver: true }),
      Animated.timing(repScale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();

    playChaChing();
    animateCoin();
    saveRepToBackend();
  }, [exerciseType]);

  const saveRepToBackend = async () => {
    try {
      await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/reps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercise_type: exerciseType, coins_earned: 1 }),
      });
    } catch (error) {
      console.log('Error saving rep:', error);
    }
  };

  const startTracking = async () => {
    const available = await Accelerometer.isAvailableAsync();
    if (!available) {
      setMotionStatus('Accelerometer not available');
      return;
    }

    setIsTracking(true);
    setMotionStatus('Move to start...');
    
    // Reset detection state
    motionHistoryRef.current = [];
    peakDetectedRef.current = false;
    valleyDetectedRef.current = false;
    lastValueRef.current = 0;
    smoothedValueRef.current = 0;

    Accelerometer.setUpdateInterval(50); // 20 Hz

    subscriptionRef.current = Accelerometer.addListener(({ x, y, z }) => {
      // Use Y-axis for push-ups (up/down when phone is face-down or on floor)
      // Use Z-axis for sit-ups (forward/back movement)
      const rawValue = exerciseType === 'pushup' ? y : z;
      
      // Add to history for smoothing
      motionHistoryRef.current.push(rawValue);
      if (motionHistoryRef.current.length > HISTORY_SIZE) {
        motionHistoryRef.current.shift();
      }

      // Calculate smoothed value (moving average)
      const smoothed = motionHistoryRef.current.reduce((a, b) => a + b, 0) / motionHistoryRef.current.length;
      const delta = smoothed - smoothedValueRef.current;
      smoothedValueRef.current = smoothed;

      // Simple peak-valley detection for rep counting
      // A rep is: neutral -> down (valley) -> up (peak) -> neutral
      
      if (!valleyDetectedRef.current) {
        // Looking for downward movement (valley)
        if (smoothed < -MOTION_THRESHOLD) {
          valleyDetectedRef.current = true;
          setMotionStatus('DOWN - keep going!');
        }
      } else if (!peakDetectedRef.current) {
        // Already went down, looking for upward movement (peak)
        if (smoothed > MOTION_THRESHOLD) {
          peakDetectedRef.current = true;
          setMotionStatus('UP - almost there!');
        }
      } else {
        // Both valley and peak detected, wait for return to neutral
        if (Math.abs(smoothed) < MOTION_THRESHOLD * 0.5) {
          // Full rep completed!
          onRepCompleted();
          setMotionStatus('REP! Keep going...');
          
          // Reset for next rep
          valleyDetectedRef.current = false;
          peakDetectedRef.current = false;
          
          // Brief delay then reset status
          setTimeout(() => {
            if (isTracking) setMotionStatus('Ready for next rep');
          }, 500);
        }
      }
    });
  };

  const stopTracking = () => {
    setIsTracking(false);
    setMotionStatus('Press START');
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
  };

  const toggleTracking = () => {
    if (isTracking) {
      stopTracking();
    } else {
      startTracking();
    }
  };

  const handleManualRep = () => {
    onRepCompleted();
    setMotionStatus('Manual rep added!');
    setTimeout(() => setMotionStatus(isTracking ? 'Ready for next rep' : 'Press START'), 1000);
  };

  const toggleCameraFacing = () => {
    setFacing((prev) => (prev === 'front' ? 'back' : 'front'));
  };

  const endWorkout = async () => {
    stopTracking();
    try {
      await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pushups: sessionStats.pushups,
          situps: sessionStats.situps,
          total_coins: coinsEarned,
        }),
      });
    } catch (error) {
      console.log('Error saving session:', error);
    }
    router.push('/wallet');
  };

  // Permission screens
  if (!permission) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={80} color="#FFD700" />
          <Text style={styles.permissionTitle}>Camera Access Needed</Text>
          <Text style={styles.permissionText}>
            Rep Coin needs camera access to show you during your workout.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <CameraView style={styles.camera} facing={facing}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>

          <Animated.View style={[styles.walletIndicator, { transform: [{ scale: walletScale }] }]}>
            <Ionicons name="wallet" size={24} color="#FFD700" />
            <Text style={styles.walletCoins}>{coinsEarned}</Text>
          </Animated.View>

          <TouchableOpacity style={styles.headerButton} onPress={toggleCameraFacing}>
            <Ionicons name="camera-reverse" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Exercise selector */}
        <View style={styles.exerciseSelector}>
          <TouchableOpacity
            style={[styles.exerciseButton, exerciseType === 'pushup' && styles.exerciseButtonActive]}
            onPress={() => { setExerciseType('pushup'); if (isTracking) { stopTracking(); startTracking(); } }}
          >
            <MaterialCommunityIcons name="arm-flex" size={22} color={exerciseType === 'pushup' ? '#000' : '#FFF'} />
            <Text style={[styles.exerciseButtonText, exerciseType === 'pushup' && styles.exerciseButtonTextActive]}>
              Push-ups
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.exerciseButton, exerciseType === 'situp' && styles.exerciseButtonActive]}
            onPress={() => { setExerciseType('situp'); if (isTracking) { stopTracking(); startTracking(); } }}
          >
            <MaterialCommunityIcons name="human" size={22} color={exerciseType === 'situp' ? '#000' : '#FFF'} />
            <Text style={[styles.exerciseButtonText, exerciseType === 'situp' && styles.exerciseButtonTextActive]}>
              Sit-ups
            </Text>
          </TouchableOpacity>
        </View>

        {/* Rep counter */}
        <View style={styles.repDisplay}>
          <Animated.View style={[styles.repCounter, { transform: [{ scale: repScale }] }]}>
            <Text style={styles.repNumber}>{repCount}</Text>
            <Text style={styles.repLabel}>REPS</Text>
          </Animated.View>
          
          {/* Motion status */}
          <View style={[styles.statusBadge, isTracking && styles.statusBadgeActive]}>
            <Text style={styles.statusText}>{motionStatus}</Text>
          </View>
        </View>

        {/* Coin animations */}
        {coinAnimations.map((coin) => (
          <Animated.View
            key={coin.id}
            style={[
              styles.flyingCoin,
              {
                transform: [
                  { translateY: coin.translateY },
                  { translateX: coin.translateX },
                  { scale: coin.scale },
                ],
                opacity: coin.opacity,
              },
            ]}
          >
            <View style={styles.coinIcon}>
              <Text style={styles.coinText}>$</Text>
            </View>
          </Animated.View>
        ))}

        {/* Bottom controls */}
        <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 20 }]}>
          {/* End button */}
          <TouchableOpacity style={styles.sideButton} onPress={endWorkout}>
            <Ionicons name="stop-circle" size={32} color="#FF4444" />
            <Text style={styles.sideButtonText}>END</Text>
          </TouchableOpacity>

          {/* Main tracking button */}
          <Animated.View style={{ transform: [{ scale: buttonPulse }] }}>
            <TouchableOpacity
              style={[styles.mainButton, isTracking && styles.mainButtonActive]}
              onPress={toggleTracking}
              activeOpacity={0.8}
            >
              <Ionicons name={isTracking ? 'pause' : 'play'} size={48} color="#000" />
              <Text style={styles.mainButtonText}>{isTracking ? 'PAUSE' : 'START'}</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Manual tap button */}
          <TouchableOpacity style={styles.sideButton} onPress={handleManualRep}>
            <Ionicons name="add-circle" size={32} color="#4CAF50" />
            <Text style={[styles.sideButtonText, { color: '#4CAF50' }]}>+1 REP</Text>
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  camera: {
    flex: 1,
  },
  loadingText: {
    color: '#FFF',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 100,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  headerButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  walletCoins: {
    color: '#FFD700',
    fontSize: 22,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  exerciseSelector: {
    position: 'absolute',
    top: 110,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  exerciseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderWidth: 1,
    borderColor: '#555',
  },
  exerciseButtonActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  exerciseButtonText: {
    color: '#FFF',
    marginLeft: 6,
    fontWeight: '600',
    fontSize: 14,
  },
  exerciseButtonTextActive: {
    color: '#000',
  },
  repDisplay: {
    position: 'absolute',
    top: height * 0.22,
    alignSelf: 'center',
    alignItems: 'center',
  },
  repCounter: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderWidth: 6,
    borderColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  repNumber: {
    fontSize: 64,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  repLabel: {
    fontSize: 16,
    color: '#AAA',
    marginTop: -6,
    fontWeight: '600',
  },
  statusBadge: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderWidth: 1,
    borderColor: '#555',
  },
  statusBadgeActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.3)',
    borderColor: '#4CAF50',
  },
  statusText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  flyingCoin: {
    position: 'absolute',
    top: height * 0.48,
    alignSelf: 'center',
    zIndex: 100,
  },
  coinIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: '#DAA520',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 15,
  },
  coinText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#8B4513',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingTop: 20,
  },
  sideButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 70,
    paddingVertical: 8,
  },
  sideButtonText: {
    color: '#FF4444',
    fontSize: 11,
    marginTop: 4,
    fontWeight: 'bold',
  },
  mainButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 12,
  },
  mainButtonActive: {
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
  },
  mainButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 2,
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 24,
    marginBottom: 16,
  },
  permissionText: {
    fontSize: 16,
    color: '#AAA',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
  },
  permissionButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    marginTop: 16,
    padding: 12,
  },
  backButtonText: {
    color: '#888',
    fontSize: 14,
  },
});
