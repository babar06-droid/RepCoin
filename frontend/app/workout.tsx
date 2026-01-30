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
import { DeviceMotion } from 'expo-sensors';

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

  const [exerciseType, setExerciseType] = useState<ExerciseType>('pushup');
  const [repCount, setRepCount] = useState(0);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [facing, setFacing] = useState<CameraType>('front');
  const [coinAnimations, setCoinAnimations] = useState<CoinAnimation[]>([]);
  const [sessionStats, setSessionStats] = useState({ pushups: 0, situps: 0 });
  const [isTracking, setIsTracking] = useState(false);
  const [motionStatus, setMotionStatus] = useState('Press START');
  const [sensorData, setSensorData] = useState('Waiting...');

  const coinIdRef = useRef(0);
  const chachingSoundRef = useRef<Audio.Sound | null>(null);
  const repScale = useRef(new Animated.Value(1)).current;
  const walletScale = useRef(new Animated.Value(1)).current;
  const buttonPulse = useRef(new Animated.Value(1)).current;

  // Motion detection
  const subscriptionRef = useRef<any>(null);
  const lastRepTimeRef = useRef(0);
  const motionStateRef = useRef<'idle' | 'moving_down' | 'moving_up'>('idle');
  const peakValueRef = useRef(0);
  const valleyValueRef = useRef(0);
  const lastValuesRef = useRef<number[]>([]);
  const baselineRef = useRef(0);
  const calibratedRef = useRef(false);

  useEffect(() => {
    loadSound();
    return () => {
      if (chachingSoundRef.current) chachingSoundRef.current.unloadAsync();
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
    } catch (error) {
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: 'https://www.myinstants.com/media/sounds/cha-ching.mp3' },
          { shouldPlay: false, volume: 1.0 }
        );
        chachingSoundRef.current = sound;
      } catch (err) {
        console.log('Sound load failed');
      }
    }
  };

  const playChaChing = async () => {
    try {
      if (chachingSoundRef.current) {
        await chachingSoundRef.current.setPositionAsync(0);
        await chachingSoundRef.current.playAsync();
      }
      Vibration.vibrate(200);
    } catch (error) {}
  };

  const animateCoin = () => {
    const coinId = coinIdRef.current++;
    const translateY = new Animated.Value(0);
    const translateX = new Animated.Value(0);
    const opacity = new Animated.Value(1);
    const scale = new Animated.Value(2.5);

    setCoinAnimations((prev) => [...prev, { id: coinId, translateY, translateX, opacity, scale }]);

    Animated.parallel([
      Animated.timing(translateY, { toValue: -height * 0.42, duration: 500, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: width * 0.28, duration: 500, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.25, duration: 500, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(300),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
    ]).start(() => {
      setCoinAnimations((prev) => prev.filter((c) => c.id !== coinId));
      Animated.sequence([
        Animated.timing(walletScale, { toValue: 1.8, duration: 60, useNativeDriver: true }),
        Animated.timing(walletScale, { toValue: 1, duration: 60, useNativeDriver: true }),
      ]).start();
    });
  };

  const countRep = useCallback(() => {
    const now = Date.now();
    if (now - lastRepTimeRef.current < 400) return; // Min 400ms between reps
    lastRepTimeRef.current = now;

    setRepCount((prev) => prev + 1);
    setCoinsEarned((prev) => prev + 1);
    setSessionStats((prev) => ({
      ...prev,
      [exerciseType === 'pushup' ? 'pushups' : 'situps']: 
        prev[exerciseType === 'pushup' ? 'pushups' : 'situps'] + 1,
    }));

    Animated.sequence([
      Animated.timing(repScale, { toValue: 1.7, duration: 60, useNativeDriver: true }),
      Animated.timing(repScale, { toValue: 1, duration: 60, useNativeDriver: true }),
    ]).start();

    playChaChing();
    animateCoin();
    saveRepToBackend();
    setMotionStatus('🎉 REP!');
    setTimeout(() => setMotionStatus('Keep going!'), 600);
  }, [exerciseType]);

  const saveRepToBackend = async () => {
    try {
      await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/reps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercise_type: exerciseType, coins_earned: 1 }),
      });
    } catch (error) {}
  };

  const startTracking = async () => {
    const available = await DeviceMotion.isAvailableAsync();
    if (!available) {
      setMotionStatus('Motion sensor not available');
      setSensorData('Device motion not supported');
      return;
    }

    setIsTracking(true);
    setMotionStatus('Hold still to calibrate...');
    
    // Reset state
    motionStateRef.current = 'idle';
    lastValuesRef.current = [];
    calibratedRef.current = false;
    peakValueRef.current = -999;
    valleyValueRef.current = 999;

    DeviceMotion.setUpdateInterval(25); // 40Hz

    let calibrationValues: number[] = [];

    subscriptionRef.current = DeviceMotion.addListener((data) => {
      if (!data.acceleration) {
        setSensorData('No acceleration data');
        return;
      }

      const { x, y, z } = data.acceleration;
      
      // Use total acceleration for orientation-independent detection
      const accel = Math.sqrt(x * x + y * y + z * z);
      
      // Calibration phase
      if (!calibratedRef.current) {
        calibrationValues.push(accel);
        setSensorData(`Calibrating: ${calibrationValues.length}/20`);
        
        if (calibrationValues.length >= 20) {
          baselineRef.current = calibrationValues.reduce((a, b) => a + b, 0) / calibrationValues.length;
          calibratedRef.current = true;
          setMotionStatus('GO! Start exercising');
          setSensorData(`Baseline: ${baselineRef.current.toFixed(2)}`);
        }
        return;
      }

      // Smooth the value
      lastValuesRef.current.push(accel);
      if (lastValuesRef.current.length > 3) lastValuesRef.current.shift();
      const smoothed = lastValuesRef.current.reduce((a, b) => a + b, 0) / lastValuesRef.current.length;
      
      // Deviation from baseline
      const deviation = smoothed - baselineRef.current;
      
      setSensorData(`Dev: ${deviation.toFixed(3)}`);

      // Very simple peak detection - just look for significant changes
      const THRESHOLD = 0.03; // Very low threshold

      // Track peaks and valleys
      if (deviation > peakValueRef.current) peakValueRef.current = deviation;
      if (deviation < valleyValueRef.current) valleyValueRef.current = deviation;

      const range = peakValueRef.current - valleyValueRef.current;

      // State machine for rep detection
      if (motionStateRef.current === 'idle') {
        // Look for any significant movement
        if (Math.abs(deviation) > THRESHOLD) {
          if (deviation < 0) {
            motionStateRef.current = 'moving_down';
            setMotionStatus('⬇️ DOWN');
            valleyValueRef.current = deviation;
          } else {
            motionStateRef.current = 'moving_up';
            setMotionStatus('⬆️ UP');
            peakValueRef.current = deviation;
          }
        }
      } else if (motionStateRef.current === 'moving_down') {
        // Track the lowest point
        if (deviation < valleyValueRef.current) {
          valleyValueRef.current = deviation;
        }
        // Look for reversal (going back up)
        if (deviation > valleyValueRef.current + THRESHOLD * 2) {
          motionStateRef.current = 'moving_up';
          setMotionStatus('⬆️ UP');
          peakValueRef.current = deviation;
        }
      } else if (motionStateRef.current === 'moving_up') {
        // Track the highest point
        if (deviation > peakValueRef.current) {
          peakValueRef.current = deviation;
        }
        // Look for return to neutral OR going back down
        if (deviation < peakValueRef.current - THRESHOLD * 2 || Math.abs(deviation) < THRESHOLD * 0.5) {
          // Check if we had enough range of motion
          const totalRange = peakValueRef.current - valleyValueRef.current;
          if (totalRange > THRESHOLD * 3) {
            // FULL REP COMPLETED!
            countRep();
          }
          // Reset for next rep
          motionStateRef.current = 'idle';
          peakValueRef.current = -999;
          valleyValueRef.current = 999;
        }
      }
    });
  };

  const stopTracking = () => {
    setIsTracking(false);
    setMotionStatus('Press START');
    setSensorData('');
    calibratedRef.current = false;
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
  };

  const toggleTracking = () => {
    if (isTracking) stopTracking();
    else startTracking();
  };

  const handleManualRep = () => countRep();

  const toggleCameraFacing = () => setFacing((prev) => (prev === 'front' ? 'back' : 'front'));

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
    } catch (error) {}
    router.push('/wallet');
  };

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
          <Text style={styles.permissionText}>Allow camera to see yourself during workout.</Text>
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
            <Ionicons name="wallet" size={26} color="#FFD700" />
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
            <MaterialCommunityIcons name="arm-flex" size={20} color={exerciseType === 'pushup' ? '#000' : '#FFF'} />
            <Text style={[styles.exerciseButtonText, exerciseType === 'pushup' && styles.exerciseButtonTextActive]}>Push-ups</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exerciseButton, exerciseType === 'situp' && styles.exerciseButtonActive]}
            onPress={() => setExerciseType('situp')}
          >
            <MaterialCommunityIcons name="human" size={20} color={exerciseType === 'situp' ? '#000' : '#FFF'} />
            <Text style={[styles.exerciseButtonText, exerciseType === 'situp' && styles.exerciseButtonTextActive]}>Sit-ups</Text>
          </TouchableOpacity>
        </View>

        {/* Rep counter */}
        <View style={styles.repDisplay}>
          <Animated.View style={[styles.repCounter, { transform: [{ scale: repScale }] }]}>
            <Text style={styles.repNumber}>{repCount}</Text>
            <Text style={styles.repLabel}>REPS</Text>
          </Animated.View>
          <View style={[styles.statusBadge, isTracking && styles.statusBadgeActive]}>
            <Text style={styles.statusText}>{motionStatus}</Text>
          </View>
          {sensorData ? <Text style={styles.debugText}>{sensorData}</Text> : null}
        </View>

        {/* Coin animations */}
        {coinAnimations.map((coin) => (
          <Animated.View
            key={coin.id}
            style={[styles.flyingCoin, {
              transform: [{ translateY: coin.translateY }, { translateX: coin.translateX }, { scale: coin.scale }],
              opacity: coin.opacity,
            }]}
          >
            <View style={styles.coinIcon}>
              <Text style={styles.coinText}>$</Text>
            </View>
          </Animated.View>
        ))}

        {/* Instructions when tracking */}
        {isTracking && (
          <View style={styles.instructions}>
            <Text style={styles.instructionText}>📱 Hold phone or place on surface</Text>
            <Text style={styles.instructionText}>🏋️ Do your reps - motion will be detected</Text>
          </View>
        )}

        {/* Bottom controls */}
        <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.endButton} onPress={endWorkout}>
            <Ionicons name="stop-circle" size={40} color="#FF4444" />
            <Text style={styles.endButtonText}>END</Text>
          </TouchableOpacity>

          <Animated.View style={{ transform: [{ scale: buttonPulse }] }}>
            <TouchableOpacity
              style={[styles.mainButton, isTracking && styles.mainButtonActive]}
              onPress={toggleTracking}
            >
              <Ionicons name={isTracking ? 'pause' : 'play'} size={55} color="#000" />
              <Text style={styles.mainButtonText}>{isTracking ? 'STOP' : 'START'}</Text>
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity style={styles.tapButton} onPress={handleManualRep}>
            <Ionicons name="add-circle" size={50} color="#FFF" />
            <Text style={styles.tapButtonText}>TAP</Text>
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  camera: { flex: 1 },
  loadingText: { color: '#FFF', fontSize: 18, textAlign: 'center', marginTop: 100 },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, zIndex: 10,
  },
  headerButton: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  walletIndicator: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 22, paddingVertical: 14,
    borderRadius: 35, borderWidth: 3, borderColor: '#FFD700',
  },
  walletCoins: { color: '#FFD700', fontSize: 28, fontWeight: 'bold', marginLeft: 10 },
  exerciseSelector: {
    position: 'absolute', top: 120, left: 16, right: 16,
    flexDirection: 'row', justifyContent: 'center', gap: 10,
  },
  exerciseButton: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 2, borderColor: '#555',
  },
  exerciseButtonActive: { backgroundColor: '#FFD700', borderColor: '#FFD700' },
  exerciseButtonText: { color: '#FFF', marginLeft: 6, fontWeight: '700', fontSize: 14 },
  exerciseButtonTextActive: { color: '#000' },
  repDisplay: { position: 'absolute', top: height * 0.2, alignSelf: 'center', alignItems: 'center' },
  repCounter: {
    width: 170, height: 170, borderRadius: 85,
    backgroundColor: 'rgba(0,0,0,0.9)', borderWidth: 7, borderColor: '#FFD700',
    alignItems: 'center', justifyContent: 'center',
  },
  repNumber: { fontSize: 80, fontWeight: 'bold', color: '#FFD700' },
  repLabel: { fontSize: 20, color: '#AAA', marginTop: -10, fontWeight: '700' },
  statusBadge: {
    marginTop: 20, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 2, borderColor: '#555',
  },
  statusBadgeActive: { backgroundColor: 'rgba(76,175,80,0.5)', borderColor: '#4CAF50' },
  statusText: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  debugText: { color: '#888', fontSize: 12, marginTop: 8 },
  flyingCoin: { position: 'absolute', top: height * 0.45, alignSelf: 'center', zIndex: 100 },
  coinIcon: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: '#FFD700', alignItems: 'center', justifyContent: 'center',
    borderWidth: 7, borderColor: '#DAA520',
  },
  coinText: { fontSize: 50, fontWeight: 'bold', color: '#8B4513' },
  instructions: {
    position: 'absolute', top: height * 0.52, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)', padding: 16, borderRadius: 12,
  },
  instructionText: { color: '#FFF', fontSize: 13, marginBottom: 4 },
  bottomControls: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    paddingHorizontal: 10, backgroundColor: 'rgba(0,0,0,0.9)', paddingTop: 16,
  },
  endButton: { alignItems: 'center', width: 70 },
  endButtonText: { color: '#FF4444', fontSize: 12, marginTop: 2, fontWeight: 'bold' },
  mainButton: {
    alignItems: 'center', justifyContent: 'center', width: 140, height: 140, borderRadius: 70,
    backgroundColor: '#FFD700',
  },
  mainButtonActive: { backgroundColor: '#4CAF50' },
  mainButtonText: { color: '#000', fontSize: 16, fontWeight: 'bold', marginTop: 2 },
  tapButton: {
    alignItems: 'center', justifyContent: 'center', width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#2196F3',
  },
  tapButtonText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginTop: -2 },
  permissionContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  permissionTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginTop: 24, marginBottom: 16 },
  permissionText: { fontSize: 16, color: '#AAA', textAlign: 'center', marginBottom: 32 },
  permissionButton: { backgroundColor: '#FFD700', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 30 },
  permissionButtonText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  backButton: { marginTop: 16, padding: 12 },
  backButtonText: { color: '#888', fontSize: 14 },
});
