import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
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

// Rep detection thresholds
const PUSHUP_THRESHOLD = 0.3; // Acceleration change threshold
const SITUP_THRESHOLD = 0.4;
const MIN_REP_TIME = 800; // Minimum time between reps in ms (prevents double counting)

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
  const [repPhase, setRepPhase] = useState<'ready' | 'down' | 'up'>('ready');

  // Sound refs
  const coinIdRef = useRef(0);
  const chachingSoundRef = useRef<Audio.Sound | null>(null);
  const [soundLoaded, setSoundLoaded] = useState(false);

  // Animation values
  const repScale = useRef(new Animated.Value(1)).current;
  const walletScale = useRef(new Animated.Value(1)).current;
  const buttonPulse = useRef(new Animated.Value(1)).current;

  // Accelerometer tracking
  const lastRepTimeRef = useRef(0);
  const baselineRef = useRef({ x: 0, y: 0, z: 0 });
  const phaseRef = useRef<'neutral' | 'down' | 'up'>('neutral');
  const peakValueRef = useRef(0);
  const subscriptionRef = useRef<any>(null);

  // Load sound effect on mount
  useEffect(() => {
    loadSound();
    return () => {
      if (chachingSoundRef.current) {
        chachingSoundRef.current.unloadAsync();
      }
      stopTracking();
    };
  }, []);

  // Button pulse animation when tracking
  useEffect(() => {
    if (isTracking) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(buttonPulse, {
            toValue: 1.1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(buttonPulse, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
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
        playThroughEarpieceAndroid: false,
      });
      
      // Load a crisp cha-ching/coin sound
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://assets.mixkit.co/active_storage/sfx/888/888-preview.mp3' },
        { shouldPlay: false, volume: 1.0 }
      );
      chachingSoundRef.current = sound;
      setSoundLoaded(true);
      console.log('Cha-ching sound loaded successfully');
    } catch (error) {
      console.log('Error loading primary sound, trying backup:', error);
      try {
        // Backup: coin drop sound
        const { sound } = await Audio.Sound.createAsync(
          { uri: 'https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3' },
          { shouldPlay: false, volume: 1.0 }
        );
        chachingSoundRef.current = sound;
        setSoundLoaded(true);
        console.log('Backup sound loaded');
      } catch (err) {
        console.log('Could not load sounds:', err);
      }
    }
  };

  // Play cha-ching sound
  const playChaChing = async () => {
    try {
      if (chachingSoundRef.current && soundLoaded) {
        await chachingSoundRef.current.setPositionAsync(0);
        await chachingSoundRef.current.playAsync();
      } else {
        // Fallback: create and play immediately
        const { sound } = await Audio.Sound.createAsync(
          { uri: 'https://assets.mixkit.co/active_storage/sfx/888/888-preview.mp3' },
          { shouldPlay: true, volume: 1.0 }
        );
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync();
          }
        });
      }
    } catch (error) {
      console.log('Error playing sound:', error);
    }
  };

  // Animate coin flying to wallet
  const animateCoin = () => {
    const coinId = coinIdRef.current++;
    const translateY = new Animated.Value(0);
    const translateX = new Animated.Value(0);
    const opacity = new Animated.Value(1);
    const scale = new Animated.Value(1.5);

    const newCoin: CoinAnimation = {
      id: coinId,
      translateY,
      translateX,
      opacity,
      scale,
    };

    setCoinAnimations((prev) => [...prev, newCoin]);

    // Animate coin to wallet
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -height * 0.35,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: width * 0.35,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.4,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(500),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      setCoinAnimations((prev) => prev.filter((c) => c.id !== coinId));
      
      // Animate wallet when coin arrives
      Animated.sequence([
        Animated.timing(walletScale, {
          toValue: 1.4,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(walletScale, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  // Handle rep completion
  const onRepCompleted = useCallback(() => {
    const now = Date.now();
    // Prevent double counting - must wait MIN_REP_TIME between reps
    if (now - lastRepTimeRef.current < MIN_REP_TIME) {
      return;
    }
    lastRepTimeRef.current = now;

    setRepCount((prev) => prev + 1);
    setCoinsEarned((prev) => prev + 1);
    setSessionStats((prev) => ({
      ...prev,
      [exerciseType === 'pushup' ? 'pushups' : 'situps']: prev[exerciseType === 'pushup' ? 'pushups' : 'situps'] + 1,
    }));

    // Animate rep counter
    Animated.sequence([
      Animated.timing(repScale, {
        toValue: 1.4,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(repScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    // Play sound and animate coin
    playChaChing();
    animateCoin();

    // Save to backend
    saveRepToBackend();
  }, [exerciseType]);

  // Save rep to backend
  const saveRepToBackend = async () => {
    try {
      await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/reps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exercise_type: exerciseType,
          coins_earned: 1,
        }),
      });
    } catch (error) {
      console.log('Error saving rep:', error);
    }
  };

  // Start accelerometer tracking
  const startTracking = async () => {
    setIsTracking(true);
    phaseRef.current = 'neutral';
    peakValueRef.current = 0;
    
    // Set accelerometer update interval
    Accelerometer.setUpdateInterval(50); // 20 updates per second

    // Get initial baseline
    const initial = await Accelerometer.isAvailableAsync();
    if (!initial) {
      console.log('Accelerometer not available');
      return;
    }

    subscriptionRef.current = Accelerometer.addListener(({ x, y, z }) => {
      // Calculate acceleration magnitude change
      const threshold = exerciseType === 'pushup' ? PUSHUP_THRESHOLD : SITUP_THRESHOLD;
      
      // For push-ups, we mainly track Y-axis (vertical movement)
      // For sit-ups, we track Z-axis (forward/backward movement)
      const relevantAxis = exerciseType === 'pushup' ? y : z;
      
      // Detect rep phases based on acceleration
      // Phase 1: Going down (negative acceleration)
      // Phase 2: Going up (positive acceleration) - rep complete!
      
      if (phaseRef.current === 'neutral') {
        // Waiting for downward movement
        if (relevantAxis < -threshold) {
          phaseRef.current = 'down';
          setRepPhase('down');
          peakValueRef.current = relevantAxis;
        }
      } else if (phaseRef.current === 'down') {
        // Track the lowest point
        if (relevantAxis < peakValueRef.current) {
          peakValueRef.current = relevantAxis;
        }
        // Detect upward movement (coming back up)
        if (relevantAxis > peakValueRef.current + threshold) {
          phaseRef.current = 'up';
          setRepPhase('up');
        }
      } else if (phaseRef.current === 'up') {
        // Wait until we're back to neutral position
        if (Math.abs(relevantAxis) < threshold * 0.5) {
          // Full rep completed!
          onRepCompleted();
          phaseRef.current = 'neutral';
          setRepPhase('ready');
          peakValueRef.current = 0;
        }
      }
    });
  };

  // Stop accelerometer tracking
  const stopTracking = () => {
    setIsTracking(false);
    setRepPhase('ready');
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
  };

  // Toggle tracking
  const toggleTracking = () => {
    if (isTracking) {
      stopTracking();
    } else {
      startTracking();
    }
  };

  // Manual rep button
  const handleManualRep = () => {
    onRepCompleted();
  };

  // Toggle camera facing
  const toggleCameraFacing = () => {
    setFacing((prev) => (prev === 'front' ? 'back' : 'front'));
  };

  // End workout session
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

  // Get phase color
  const getPhaseColor = () => {
    switch (repPhase) {
      case 'down': return '#FF6B6B';
      case 'up': return '#4CAF50';
      default: return '#FFD700';
    }
  };

  // Permission screens
  if (!permission) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.permissionText}>Requesting camera permission...</Text>
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
            onPress={() => { setExerciseType('pushup'); stopTracking(); }}
          >
            <MaterialCommunityIcons name="arm-flex" size={24} color={exerciseType === 'pushup' ? '#000' : '#FFF'} />
            <Text style={[styles.exerciseButtonText, exerciseType === 'pushup' && styles.exerciseButtonTextActive]}>
              Push-ups
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.exerciseButton, exerciseType === 'situp' && styles.exerciseButtonActive]}
            onPress={() => { setExerciseType('situp'); stopTracking(); }}
          >
            <MaterialCommunityIcons name="human" size={24} color={exerciseType === 'situp' ? '#000' : '#FFF'} />
            <Text style={[styles.exerciseButtonText, exerciseType === 'situp' && styles.exerciseButtonTextActive]}>
              Sit-ups
            </Text>
          </TouchableOpacity>
        </View>

        {/* Rep counter */}
        <View style={styles.repDisplay}>
          <Animated.View style={[styles.repCounter, { transform: [{ scale: repScale }], borderColor: getPhaseColor() }]}>
            <Text style={styles.repNumber}>{repCount}</Text>
            <Text style={styles.repLabel}>REPS</Text>
          </Animated.View>
          
          {/* Phase indicator */}
          {isTracking && (
            <View style={[styles.phaseIndicator, { backgroundColor: getPhaseColor() }]}>
              <Text style={styles.phaseText}>
                {repPhase === 'down' ? 'DOWN' : repPhase === 'up' ? 'UP' : 'READY'}
              </Text>
            </View>
          )}
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
              <Text style={styles.coinText}>R</Text>
            </View>
          </Animated.View>
        ))}

        {/* Bottom controls */}
        <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 20 }]}>
          {/* End button */}
          <TouchableOpacity style={styles.endButton} onPress={endWorkout}>
            <Ionicons name="stop" size={28} color="#FF4444" />
            <Text style={styles.endButtonText}>END</Text>
          </TouchableOpacity>

          {/* Main tracking button */}
          <Animated.View style={{ transform: [{ scale: buttonPulse }] }}>
            <TouchableOpacity
              style={[styles.trackingButton, isTracking && styles.trackingButtonActive]}
              onPress={toggleTracking}
              activeOpacity={0.7}
            >
              <Ionicons name={isTracking ? 'pause' : 'play'} size={40} color="#000" />
              <Text style={styles.trackingButtonText}>
                {isTracking ? 'TRACKING' : 'START'}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Manual tap button */}
          <TouchableOpacity style={styles.manualButton} onPress={handleManualRep}>
            <Ionicons name="add" size={28} color="#FFF" />
            <Text style={styles.manualButtonText}>TAP</Text>
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  walletCoins: {
    color: '#FFD700',
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  exerciseSelector: {
    position: 'absolute',
    top: 100,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  exerciseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderWidth: 1,
    borderColor: '#444',
  },
  exerciseButtonActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  exerciseButtonText: {
    color: '#FFF',
    marginLeft: 8,
    fontWeight: '600',
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
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderWidth: 5,
    borderColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
  },
  repNumber: {
    fontSize: 56,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  repLabel: {
    fontSize: 14,
    color: '#888',
    marginTop: -4,
  },
  phaseIndicator: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 16,
  },
  phaseText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
  },
  flyingCoin: {
    position: 'absolute',
    top: height * 0.5,
    alignSelf: 'center',
    zIndex: 100,
  },
  coinIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#B8860B',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 10,
  },
  coinText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#8B4513',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingTop: 20,
  },
  endButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 65,
    height: 65,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
    borderWidth: 2,
    borderColor: '#FF4444',
  },
  endButtonText: {
    color: '#FF4444',
    fontSize: 10,
    marginTop: 2,
    fontWeight: 'bold',
  },
  trackingButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  trackingButtonActive: {
    backgroundColor: '#4CAF50',
  },
  trackingButtonText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 4,
  },
  manualButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 65,
    height: 65,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: '#888',
  },
  manualButtonText: {
    color: '#FFF',
    fontSize: 10,
    marginTop: 2,
    fontWeight: '600',
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
