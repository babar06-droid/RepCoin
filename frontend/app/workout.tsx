import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  Vibration,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import { Accelerometer, Gyroscope } from 'expo-sensors';

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
  const [statusMessage, setStatusMessage] = useState('Press START');
  const [phase, setPhase] = useState<'rest' | 'down' | 'up'>('rest');

  const coinIdRef = useRef(0);
  const chachingSoundRef = useRef<Audio.Sound | null>(null);
  const repScale = useRef(new Animated.Value(1)).current;
  const walletScale = useRef(new Animated.Value(1)).current;
  const phaseScale = useRef(new Animated.Value(1)).current;

  // Sensor tracking
  const accelSubRef = useRef<any>(null);
  const gyroSubRef = useRef<any>(null);
  const lastRepTimeRef = useRef(0);
  
  // Simplified detection - track total movement
  const movementHistoryRef = useRef<number[]>([]);
  const baselineRef = useRef<number | null>(null);
  const inMotionRef = useRef(false);
  const motionStartTimeRef = useRef(0);
  const peakMotionRef = useRef(0);

  useEffect(() => {
    loadSound();
    return () => {
      stopTracking();
      if (chachingSoundRef.current) chachingSoundRef.current.unloadAsync();
    };
  }, []);

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
      } catch (err) {}
    }
  };

  const playChaChing = async () => {
    try {
      if (chachingSoundRef.current) {
        await chachingSoundRef.current.setPositionAsync(0);
        await chachingSoundRef.current.playAsync();
      }
      Vibration.vibrate(250);
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
      Animated.timing(translateY, { toValue: -height * 0.38, duration: 450, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: width * 0.32, duration: 450, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.25, duration: 450, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(280),
        Animated.timing(opacity, { toValue: 0, duration: 170, useNativeDriver: true }),
      ]),
    ]).start(() => {
      setCoinAnimations((prev) => prev.filter((c) => c.id !== coinId));
      Animated.sequence([
        Animated.timing(walletScale, { toValue: 2, duration: 50, useNativeDriver: true }),
        Animated.timing(walletScale, { toValue: 1, duration: 50, useNativeDriver: true }),
      ]).start();
    });
  };

  const countRep = useCallback(() => {
    const now = Date.now();
    if (now - lastRepTimeRef.current < 300) return;
    lastRepTimeRef.current = now;

    setRepCount((prev) => prev + 1);
    setCoinsEarned((prev) => prev + 1);
    setSessionStats((prev) => ({
      ...prev,
      [exerciseType === 'pushup' ? 'pushups' : 'situps']: 
        prev[exerciseType === 'pushup' ? 'pushups' : 'situps'] + 1,
    }));

    Animated.sequence([
      Animated.timing(repScale, { toValue: 2, duration: 40, useNativeDriver: true }),
      Animated.timing(repScale, { toValue: 1, duration: 40, useNativeDriver: true }),
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
    } catch (error) {}
  };

  const startTracking = async () => {
    setIsTracking(true);
    setStatusMessage('Calibrating...');
    setPhase('rest');
    
    // Reset
    movementHistoryRef.current = [];
    baselineRef.current = null;
    inMotionRef.current = false;
    peakMotionRef.current = 0;

    // Use both accelerometer and gyroscope
    Accelerometer.setUpdateInterval(30);
    Gyroscope.setUpdateInterval(30);

    let calibrationSamples: number[] = [];
    let sampleCount = 0;

    accelSubRef.current = Accelerometer.addListener(({ x, y, z }) => {
      const accelMag = Math.sqrt(x*x + y*y + z*z);
      
      // Calibration (first 20 samples)
      if (baselineRef.current === null) {
        calibrationSamples.push(accelMag);
        sampleCount++;
        if (sampleCount >= 20) {
          baselineRef.current = calibrationSamples.reduce((a,b) => a+b, 0) / calibrationSamples.length;
          setStatusMessage('GO! Start exercising');
        }
        return;
      }

      // Calculate deviation from baseline
      const deviation = Math.abs(accelMag - baselineRef.current);
      
      // Track movement history
      movementHistoryRef.current.push(deviation);
      if (movementHistoryRef.current.length > 8) {
        movementHistoryRef.current.shift();
      }

      // Get average recent movement
      const avgMovement = movementHistoryRef.current.reduce((a,b) => a+b, 0) / movementHistoryRef.current.length;

      // Very low threshold for detection
      const MOTION_START_THRESHOLD = 0.02;
      const MOTION_PEAK_THRESHOLD = 0.05;
      const MOTION_END_THRESHOLD = 0.015;

      if (!inMotionRef.current) {
        // Looking for motion to start
        if (avgMovement > MOTION_START_THRESHOLD) {
          inMotionRef.current = true;
          motionStartTimeRef.current = Date.now();
          peakMotionRef.current = avgMovement;
          setPhase('down');
          setStatusMessage('⬇️ DOWN');
          
          Animated.timing(phaseScale, { toValue: 1.2, duration: 100, useNativeDriver: true }).start();
        }
      } else {
        // Track peak motion
        if (avgMovement > peakMotionRef.current) {
          peakMotionRef.current = avgMovement;
        }

        // Check if motion is ending (returning to rest)
        if (avgMovement < MOTION_END_THRESHOLD) {
          const motionDuration = Date.now() - motionStartTimeRef.current;
          
          // Valid rep: motion lasted at least 200ms and had enough peak movement
          if (motionDuration > 200 && peakMotionRef.current > MOTION_PEAK_THRESHOLD) {
            setPhase('up');
            setStatusMessage('⬆️ UP - REP!');
            countRep();
            
            Animated.sequence([
              Animated.timing(phaseScale, { toValue: 1.5, duration: 50, useNativeDriver: true }),
              Animated.timing(phaseScale, { toValue: 1, duration: 50, useNativeDriver: true }),
            ]).start();

            setTimeout(() => {
              setPhase('rest');
              setStatusMessage('Ready...');
            }, 300);
          } else {
            setPhase('rest');
            setStatusMessage('Ready...');
          }
          
          // Reset for next rep
          inMotionRef.current = false;
          peakMotionRef.current = 0;
        }
      }
    });

    // Also listen to gyroscope as backup
    gyroSubRef.current = Gyroscope.addListener(({ x, y, z }) => {
      const gyroMag = Math.sqrt(x*x + y*y + z*z);
      
      // If we detect significant rotation while not in motion, start motion
      if (!inMotionRef.current && gyroMag > 0.5) {
        inMotionRef.current = true;
        motionStartTimeRef.current = Date.now();
        peakMotionRef.current = 0.1;
        setPhase('down');
        setStatusMessage('🔄 Motion detected');
      }
    });
  };

  const stopTracking = () => {
    setIsTracking(false);
    setStatusMessage('Press START');
    setPhase('rest');
    
    if (accelSubRef.current) {
      accelSubRef.current.remove();
      accelSubRef.current = null;
    }
    if (gyroSubRef.current) {
      gyroSubRef.current.remove();
      gyroSubRef.current = null;
    }
  };

  const toggleTracking = () => {
    if (isTracking) stopTracking();
    else startTracking();
  };

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

  const getPhaseColor = () => {
    switch (phase) {
      case 'down': return '#FF6B6B';
      case 'up': return '#4CAF50';
      default: return '#FFD700';
    }
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
            <Ionicons name="wallet" size={28} color="#FFD700" />
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
            <Text style={[styles.exerciseButtonText, exerciseType === 'pushup' && styles.exerciseButtonTextActive]}>Push-ups</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exerciseButton, exerciseType === 'situp' && styles.exerciseButtonActive]}
            onPress={() => setExerciseType('situp')}
          >
            <MaterialCommunityIcons name="human" size={22} color={exerciseType === 'situp' ? '#000' : '#FFF'} />
            <Text style={[styles.exerciseButtonText, exerciseType === 'situp' && styles.exerciseButtonTextActive]}>Sit-ups</Text>
          </TouchableOpacity>
        </View>

        {/* Rep counter */}
        <View style={styles.repDisplay}>
          <Animated.View style={[styles.repCounter, { transform: [{ scale: repScale }], borderColor: getPhaseColor() }]}>
            <Text style={[styles.repNumber, { color: getPhaseColor() }]}>{repCount}</Text>
            <Text style={styles.repLabel}>REPS</Text>
          </Animated.View>
          
          <Animated.View style={[styles.statusBadge, { backgroundColor: getPhaseColor(), transform: [{ scale: phaseScale }] }]}>
            <Text style={styles.statusText}>{statusMessage}</Text>
          </Animated.View>

          {/* Instructions */}
          {isTracking && (
            <View style={styles.instructionBox}>
              <Text style={styles.instructionText}>📱 Place phone where it can sense your movement</Text>
              <Text style={styles.instructionText}>🏋️ Do full reps - down then up</Text>
            </View>
          )}
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

        {/* Bottom controls - Only START/STOP and END */}
        <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity style={styles.endButton} onPress={endWorkout}>
            <Ionicons name="stop-circle" size={50} color="#FF4444" />
            <Text style={styles.endButtonText}>END</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mainButton, isTracking && styles.mainButtonActive]}
            onPress={toggleTracking}
          >
            <Ionicons name={isTracking ? 'pause' : 'fitness'} size={60} color="#000" />
            <Text style={styles.mainButtonText}>{isTracking ? 'PAUSE' : 'START'}</Text>
          </TouchableOpacity>

          <View style={{ width: 70 }} />
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
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  walletIndicator: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 24, paddingVertical: 16,
    borderRadius: 40, borderWidth: 4, borderColor: '#FFD700',
  },
  walletCoins: { color: '#FFD700', fontSize: 32, fontWeight: 'bold', marginLeft: 12 },
  exerciseSelector: {
    position: 'absolute', top: 110, left: 16, right: 16,
    flexDirection: 'row', justifyContent: 'center', gap: 12,
  },
  exerciseButton: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.7)', borderWidth: 2, borderColor: '#555',
  },
  exerciseButtonActive: { backgroundColor: '#FFD700', borderColor: '#FFD700' },
  exerciseButtonText: { color: '#FFF', marginLeft: 8, fontWeight: '700', fontSize: 16 },
  exerciseButtonTextActive: { color: '#000' },
  repDisplay: { position: 'absolute', top: height * 0.2, alignSelf: 'center', alignItems: 'center' },
  repCounter: {
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(0,0,0,0.9)', borderWidth: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  repNumber: { fontSize: 90, fontWeight: 'bold' },
  repLabel: { fontSize: 20, color: '#888', marginTop: -10, fontWeight: '700' },
  statusBadge: {
    marginTop: 20, paddingHorizontal: 30, paddingVertical: 14, borderRadius: 30,
  },
  statusText: { color: '#000', fontSize: 18, fontWeight: '900' },
  instructionBox: {
    marginTop: 20, backgroundColor: 'rgba(0,0,0,0.8)', padding: 16, borderRadius: 12,
  },
  instructionText: { color: '#FFF', fontSize: 13, marginBottom: 4 },
  flyingCoin: { position: 'absolute', top: height * 0.45, alignSelf: 'center', zIndex: 100 },
  coinIcon: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#FFD700', alignItems: 'center', justifyContent: 'center',
    borderWidth: 8, borderColor: '#DAA520',
  },
  coinText: { fontSize: 55, fontWeight: 'bold', color: '#8B4513' },
  bottomControls: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    paddingHorizontal: 20, backgroundColor: 'rgba(0,0,0,0.9)', paddingTop: 20,
  },
  endButton: { alignItems: 'center', width: 70 },
  endButtonText: { color: '#FF4444', fontSize: 14, marginTop: 4, fontWeight: 'bold' },
  mainButton: {
    alignItems: 'center', justifyContent: 'center', width: 150, height: 150, borderRadius: 75,
    backgroundColor: '#FFD700',
  },
  mainButtonActive: { backgroundColor: '#4CAF50' },
  mainButtonText: { color: '#000', fontSize: 18, fontWeight: 'bold', marginTop: 4 },
  permissionContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  permissionTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginTop: 24, marginBottom: 16 },
  permissionText: { fontSize: 16, color: '#AAA', textAlign: 'center', marginBottom: 32 },
  permissionButton: { backgroundColor: '#FFD700', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 30 },
  permissionButtonText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  backButton: { marginTop: 16, padding: 12 },
  backButtonText: { color: '#888', fontSize: 14 },
});
