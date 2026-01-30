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
  const [motionStatus, setMotionStatus] = useState('Tap START to begin');
  const [debugInfo, setDebugInfo] = useState('');

  // Refs
  const coinIdRef = useRef(0);
  const chachingSoundRef = useRef<Audio.Sound | null>(null);
  const repScale = useRef(new Animated.Value(1)).current;
  const walletScale = useRef(new Animated.Value(1)).current;
  const buttonPulse = useRef(new Animated.Value(1)).current;

  // Motion detection refs - SIMPLIFIED
  const subscriptionRef = useRef<any>(null);
  const lastRepTimeRef = useRef(0);
  const isGoingDownRef = useRef(false);
  const maxValueRef = useRef(-999);
  const minValueRef = useRef(999);
  const baselineRef = useRef(0);
  const samplesRef = useRef<number[]>([]);

  // MUCH MORE SENSITIVE thresholds
  const REP_THRESHOLD = 0.08; // Very low threshold for sensitivity
  const MIN_REP_INTERVAL = 500; // 500ms between reps

  useEffect(() => {
    loadSound();
    return () => {
      if (chachingSoundRef.current) {
        chachingSoundRef.current.unloadAsync();
      }
      stopTracking();
    };
  }, []);

  useEffect(() => {
    if (isTracking) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(buttonPulse, { toValue: 1.1, duration: 500, useNativeDriver: true }),
          Animated.timing(buttonPulse, { toValue: 1, duration: 500, useNativeDriver: true }),
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
      
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/chaching.mp3'),
        { shouldPlay: false, volume: 1.0 }
      );
      chachingSoundRef.current = sound;
      console.log('Sound loaded!');
    } catch (error) {
      console.log('Loading sound from URL...');
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: 'https://www.myinstants.com/media/sounds/cha-ching.mp3' },
          { shouldPlay: false, volume: 1.0 }
        );
        chachingSoundRef.current = sound;
      } catch (err) {
        console.log('Could not load sound');
      }
    }
  };

  const playChaChing = async () => {
    try {
      if (chachingSoundRef.current) {
        await chachingSoundRef.current.setPositionAsync(0);
        await chachingSoundRef.current.playAsync();
      }
      Vibration.vibrate(150);
    } catch (error) {
      console.log('Sound error:', error);
    }
  };

  const animateCoin = () => {
    const coinId = coinIdRef.current++;
    const translateY = new Animated.Value(0);
    const translateX = new Animated.Value(0);
    const opacity = new Animated.Value(1);
    const scale = new Animated.Value(2);

    setCoinAnimations((prev) => [...prev, { id: coinId, translateY, translateX, opacity, scale }]);

    Animated.parallel([
      Animated.timing(translateY, { toValue: -height * 0.4, duration: 600, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: width * 0.3, duration: 600, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(350),
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]),
    ]).start(() => {
      setCoinAnimations((prev) => prev.filter((c) => c.id !== coinId));
      Animated.sequence([
        Animated.timing(walletScale, { toValue: 1.6, duration: 70, useNativeDriver: true }),
        Animated.timing(walletScale, { toValue: 1, duration: 70, useNativeDriver: true }),
      ]).start();
    });
  };

  const triggerRep = useCallback(() => {
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
      Animated.timing(repScale, { toValue: 1.6, duration: 70, useNativeDriver: true }),
      Animated.timing(repScale, { toValue: 1, duration: 70, useNativeDriver: true }),
    ]).start();

    playChaChing();
    animateCoin();
    saveRepToBackend();
    setMotionStatus('REP COUNTED! 💪');
    setTimeout(() => setMotionStatus('Keep going...'), 800);
  }, [exerciseType]);

  const saveRepToBackend = async () => {
    try {
      await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/reps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercise_type: exerciseType, coins_earned: 1 }),
      });
    } catch (error) {
      console.log('Save error:', error);
    }
  };

  const startTracking = async () => {
    const available = await Accelerometer.isAvailableAsync();
    if (!available) {
      setMotionStatus('Accelerometer not available on this device');
      return;
    }

    setIsTracking(true);
    setMotionStatus('Calibrating... hold still');
    
    // Reset
    isGoingDownRef.current = false;
    maxValueRef.current = -999;
    minValueRef.current = 999;
    samplesRef.current = [];

    Accelerometer.setUpdateInterval(30); // ~33 Hz for smoother detection

    // Calibrate for 1 second
    let calibrationSamples: number[] = [];
    
    subscriptionRef.current = Accelerometer.addListener(({ x, y, z }) => {
      // Calculate total acceleration magnitude (works regardless of phone orientation)
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      
      // Also track individual axes
      const vertical = y; // Usually vertical when phone is upright
      const forward = z;  // Usually forward/back
      
      // Use the axis with most variation, or magnitude
      const value = magnitude;
      
      // Calibration phase (first 30 samples = ~1 second)
      if (calibrationSamples.length < 30) {
        calibrationSamples.push(value);
        setDebugInfo(`Calibrating: ${calibrationSamples.length}/30`);
        if (calibrationSamples.length === 30) {
          baselineRef.current = calibrationSamples.reduce((a, b) => a + b, 0) / calibrationSamples.length;
          setMotionStatus('Ready! Start your reps');
          setDebugInfo(`Baseline: ${baselineRef.current.toFixed(2)}`);
        }
        return;
      }

      // Smooth the value
      samplesRef.current.push(value);
      if (samplesRef.current.length > 5) samplesRef.current.shift();
      const smoothed = samplesRef.current.reduce((a, b) => a + b, 0) / samplesRef.current.length;
      
      // Calculate deviation from baseline
      const deviation = smoothed - baselineRef.current;
      
      // Update debug info
      setDebugInfo(`Val: ${deviation.toFixed(3)}`);
      
      // Track max and min for the current motion
      if (deviation > maxValueRef.current) maxValueRef.current = deviation;
      if (deviation < minValueRef.current) minValueRef.current = deviation;
      
      // Detect rep: significant drop followed by rise back up
      const range = maxValueRef.current - minValueRef.current;
      
      if (!isGoingDownRef.current) {
        // Looking for downward motion
        if (deviation < -REP_THRESHOLD) {
          isGoingDownRef.current = true;
          setMotionStatus('Going DOWN...');
          minValueRef.current = deviation;
        }
      } else {
        // Already going down, look for coming back up
        if (deviation < minValueRef.current) {
          minValueRef.current = deviation;
        }
        
        // Check if we've come back up significantly
        if (deviation > minValueRef.current + REP_THRESHOLD * 2) {
          // REP COMPLETED!
          triggerRep();
          
          // Reset for next rep
          isGoingDownRef.current = false;
          maxValueRef.current = -999;
          minValueRef.current = 999;
        }
      }
    });
  };

  const stopTracking = () => {
    setIsTracking(false);
    setMotionStatus('Tap START to begin');
    setDebugInfo('');
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
    triggerRep();
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
      console.log('Session save error:', error);
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
            onPress={() => setExerciseType('pushup')}
          >
            <MaterialCommunityIcons name="arm-flex" size={22} color={exerciseType === 'pushup' ? '#000' : '#FFF'} />
            <Text style={[styles.exerciseButtonText, exerciseType === 'pushup' && styles.exerciseButtonTextActive]}>
              Push-ups
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.exerciseButton, exerciseType === 'situp' && styles.exerciseButtonActive]}
            onPress={() => setExerciseType('situp')}
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
          
          {/* Status */}
          <View style={[styles.statusBadge, isTracking && styles.statusBadgeActive]}>
            <Text style={styles.statusText}>{motionStatus}</Text>
          </View>
          
          {/* Debug info */}
          {isTracking && debugInfo ? (
            <Text style={styles.debugText}>{debugInfo}</Text>
          ) : null}
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
            <Ionicons name="stop-circle" size={36} color="#FF4444" />
            <Text style={styles.sideButtonText}>END</Text>
          </TouchableOpacity>

          {/* Main tracking button */}
          <Animated.View style={{ transform: [{ scale: buttonPulse }] }}>
            <TouchableOpacity
              style={[styles.mainButton, isTracking && styles.mainButtonActive]}
              onPress={toggleTracking}
              activeOpacity={0.8}
            >
              <Ionicons name={isTracking ? 'pause' : 'play'} size={50} color="#000" />
              <Text style={styles.mainButtonText}>{isTracking ? 'PAUSE' : 'START'}</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Manual tap button - BIGGER */}
          <TouchableOpacity style={styles.tapButton} onPress={handleManualRep}>
            <Text style={styles.tapButtonText}>TAP</Text>
            <Text style={styles.tapButtonSubtext}>+1 REP</Text>
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
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: '#FFD700',
  },
  walletCoins: {
    color: '#FFD700',
    fontSize: 24,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  exerciseSelector: {
    position: 'absolute',
    top: 115,
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
    paddingVertical: 12,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderWidth: 2,
    borderColor: '#555',
  },
  exerciseButtonActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  exerciseButtonText: {
    color: '#FFF',
    marginLeft: 8,
    fontWeight: '700',
    fontSize: 15,
  },
  exerciseButtonTextActive: {
    color: '#000',
  },
  repDisplay: {
    position: 'absolute',
    top: height * 0.2,
    alignSelf: 'center',
    alignItems: 'center',
  },
  repCounter: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderWidth: 6,
    borderColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 25,
    elevation: 15,
  },
  repNumber: {
    fontSize: 72,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  repLabel: {
    fontSize: 18,
    color: '#AAA',
    marginTop: -8,
    fontWeight: '700',
  },
  statusBadge: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderWidth: 2,
    borderColor: '#555',
  },
  statusBadgeActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.4)',
    borderColor: '#4CAF50',
  },
  statusText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  debugText: {
    color: '#888',
    fontSize: 12,
    marginTop: 8,
  },
  flyingCoin: {
    position: 'absolute',
    top: height * 0.45,
    alignSelf: 'center',
    zIndex: 100,
  },
  coinIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
    borderColor: '#DAA520',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 25,
    elevation: 20,
  },
  coinText: {
    fontSize: 42,
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
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
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
    fontSize: 12,
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
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 15,
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
  tapButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 75,
    height: 75,
    borderRadius: 38,
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  tapButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  tapButtonSubtext: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
    opacity: 0.9,
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
