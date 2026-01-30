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
import { LightSensor, Accelerometer } from 'expo-sensors';

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
  const [lightLevel, setLightLevel] = useState<number | null>(null);
  const [sensorType, setSensorType] = useState<'light' | 'motion' | 'none'>('none');

  const coinIdRef = useRef(0);
  const chachingSoundRef = useRef<Audio.Sound | null>(null);
  const repScale = useRef(new Animated.Value(1)).current;
  const walletScale = useRef(new Animated.Value(1)).current;

  // Sensor refs
  const lightSubRef = useRef<any>(null);
  const accelSubRef = useRef<any>(null);
  const lastRepTimeRef = useRef(0);
  
  // Light-based detection
  const baselineLightRef = useRef<number | null>(null);
  const lightHistoryRef = useRef<number[]>([]);
  const wasBlockedRef = useRef(false);
  
  // Motion-based detection (fallback)
  const motionHistoryRef = useRef<number[]>([]);
  const motionBaselineRef = useRef<number | null>(null);
  const wasMovingRef = useRef(false);

  useEffect(() => {
    checkSensors();
    loadSound();
    return () => {
      stopTracking();
      if (chachingSoundRef.current) chachingSoundRef.current.unloadAsync();
    };
  }, []);

  const checkSensors = async () => {
    // Check if light sensor is available (Android only typically)
    const lightAvailable = await LightSensor.isAvailableAsync();
    const accelAvailable = await Accelerometer.isAvailableAsync();
    
    if (lightAvailable) {
      setSensorType('light');
    } else if (accelAvailable) {
      setSensorType('motion');
    } else {
      setSensorType('none');
    }
  };

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
      Vibration.vibrate(300);
    } catch (error) {}
  };

  const animateCoin = () => {
    const coinId = coinIdRef.current++;
    const translateY = new Animated.Value(0);
    const translateX = new Animated.Value(0);
    const opacity = new Animated.Value(1);
    const scale = new Animated.Value(3);

    setCoinAnimations((prev) => [...prev, { id: coinId, translateY, translateX, opacity, scale }]);

    Animated.parallel([
      Animated.timing(translateY, { toValue: -height * 0.35, duration: 400, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: width * 0.3, duration: 400, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.2, duration: 400, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(250),
        Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]),
    ]).start(() => {
      setCoinAnimations((prev) => prev.filter((c) => c.id !== coinId));
      Animated.sequence([
        Animated.timing(walletScale, { toValue: 2.2, duration: 40, useNativeDriver: true }),
        Animated.timing(walletScale, { toValue: 1, duration: 40, useNativeDriver: true }),
      ]).start();
    });
  };

  const countRep = useCallback(() => {
    const now = Date.now();
    if (now - lastRepTimeRef.current < 500) return;
    lastRepTimeRef.current = now;

    setRepCount((prev) => prev + 1);
    setCoinsEarned((prev) => prev + 1);
    setSessionStats((prev) => ({
      ...prev,
      [exerciseType === 'pushup' ? 'pushups' : 'situps']: 
        prev[exerciseType === 'pushup' ? 'pushups' : 'situps'] + 1,
    }));

    Animated.sequence([
      Animated.timing(repScale, { toValue: 2.2, duration: 40, useNativeDriver: true }),
      Animated.timing(repScale, { toValue: 1, duration: 40, useNativeDriver: true }),
    ]).start();

    playChaChing();
    animateCoin();
    saveRepToBackend();
    setStatusMessage('💰 REP COUNTED!');
    setTimeout(() => setStatusMessage('Keep going...'), 500);
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

  const startLightTracking = () => {
    setStatusMessage('Calibrating light...');
    baselineLightRef.current = null;
    lightHistoryRef.current = [];
    wasBlockedRef.current = false;

    LightSensor.setUpdateInterval(50);
    
    let calibrationSamples: number[] = [];

    lightSubRef.current = LightSensor.addListener(({ illuminance }) => {
      setLightLevel(illuminance);
      
      // Calibration phase
      if (baselineLightRef.current === null) {
        calibrationSamples.push(illuminance);
        if (calibrationSamples.length >= 30) {
          baselineLightRef.current = calibrationSamples.reduce((a, b) => a + b, 0) / calibrationSamples.length;
          setStatusMessage('GO! Start your reps');
        }
        return;
      }

      // Track light history
      lightHistoryRef.current.push(illuminance);
      if (lightHistoryRef.current.length > 10) lightHistoryRef.current.shift();

      const avgLight = lightHistoryRef.current.reduce((a, b) => a + b, 0) / lightHistoryRef.current.length;
      const baseline = baselineLightRef.current;
      
      // Detect light blocked (body over phone) - typically 30%+ drop
      const dropThreshold = baseline * 0.7; // 30% drop
      const returnThreshold = baseline * 0.85; // Within 15% of baseline

      if (!wasBlockedRef.current && avgLight < dropThreshold) {
        // Light blocked - going DOWN
        wasBlockedRef.current = true;
        setStatusMessage('⬇️ DOWN detected');
      } else if (wasBlockedRef.current && avgLight > returnThreshold) {
        // Light returned - going UP = REP!
        wasBlockedRef.current = false;
        countRep();
      }
    });
  };

  const startMotionTracking = () => {
    setStatusMessage('Calibrating motion...');
    motionBaselineRef.current = null;
    motionHistoryRef.current = [];
    wasMovingRef.current = false;

    Accelerometer.setUpdateInterval(50);
    
    let calibrationSamples: number[] = [];

    accelSubRef.current = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      
      // Calibration phase
      if (motionBaselineRef.current === null) {
        calibrationSamples.push(magnitude);
        if (calibrationSamples.length >= 30) {
          motionBaselineRef.current = calibrationSamples.reduce((a, b) => a + b, 0) / calibrationSamples.length;
          setStatusMessage('GO! Start your reps');
        }
        return;
      }

      // Track motion history
      motionHistoryRef.current.push(magnitude);
      if (motionHistoryRef.current.length > 10) motionHistoryRef.current.shift();

      const avgMotion = motionHistoryRef.current.reduce((a, b) => a + b, 0) / motionHistoryRef.current.length;
      const baseline = motionBaselineRef.current;
      const deviation = Math.abs(avgMotion - baseline);

      // Detect significant motion
      const motionThreshold = 0.05;
      const restThreshold = 0.02;

      if (!wasMovingRef.current && deviation > motionThreshold) {
        // Started moving
        wasMovingRef.current = true;
        setStatusMessage('⬇️ Movement detected');
      } else if (wasMovingRef.current && deviation < restThreshold) {
        // Returned to rest = REP!
        wasMovingRef.current = false;
        countRep();
      }
    });
  };

  const startTracking = () => {
    setIsTracking(true);
    
    if (sensorType === 'light') {
      startLightTracking();
    } else {
      startMotionTracking();
    }
  };

  const stopTracking = () => {
    setIsTracking(false);
    setStatusMessage('Press START');
    
    if (lightSubRef.current) {
      lightSubRef.current.remove();
      lightSubRef.current = null;
    }
    if (accelSubRef.current) {
      accelSubRef.current.remove();
      accelSubRef.current = null;
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
          <Text style={styles.permissionTitle}>Camera Access</Text>
          <Text style={styles.permissionText}>Enable camera to see yourself during workout.</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Enable Camera</Text>
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

        {/* Sensor indicator */}
        <View style={styles.sensorBadge}>
          <Ionicons 
            name={sensorType === 'light' ? 'sunny' : sensorType === 'motion' ? 'speedometer' : 'alert-circle'} 
            size={16} 
            color={sensorType !== 'none' ? '#4CAF50' : '#FF6B6B'} 
          />
          <Text style={[styles.sensorText, { color: sensorType !== 'none' ? '#4CAF50' : '#FF6B6B' }]}>
            {sensorType === 'light' ? 'Light Sensor' : sensorType === 'motion' ? 'Motion Sensor' : 'No Sensor'}
          </Text>
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
          <Animated.View style={[styles.repCounter, { transform: [{ scale: repScale }] }]}>
            <Text style={styles.repNumber}>{repCount}</Text>
            <Text style={styles.repLabel}>REPS</Text>
          </Animated.View>
          
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>

          {/* Light level display */}
          {isTracking && lightLevel !== null && (
            <Text style={styles.lightDisplay}>Light: {Math.round(lightLevel)} lux</Text>
          )}
        </View>

        {/* Instructions */}
        {isTracking && (
          <View style={styles.instructionBox}>
            {sensorType === 'light' ? (
              <>
                <Text style={styles.instructionTitle}>📱 Place phone on floor facing UP</Text>
                <Text style={styles.instructionText}>Your body will block light when going down</Text>
              </>
            ) : (
              <>
                <Text style={styles.instructionTitle}>📱 Hold phone or place nearby</Text>
                <Text style={styles.instructionText}>Motion will be detected automatically</Text>
              </>
            )}
          </View>
        )}

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

        {/* Bottom controls */}
        <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity style={styles.endButton} onPress={endWorkout}>
            <Ionicons name="stop-circle" size={50} color="#FF4444" />
            <Text style={styles.endButtonText}>END</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mainButton, isTracking && styles.mainButtonActive]}
            onPress={toggleTracking}
          >
            <Ionicons name={isTracking ? 'pause' : 'fitness'} size={55} color="#000" />
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
  sensorBadge: {
    position: 'absolute', top: 80, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  sensorText: { fontSize: 12, fontWeight: '600', marginLeft: 6 },
  exerciseSelector: {
    position: 'absolute', top: 120, left: 16, right: 16,
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
    width: 170, height: 170, borderRadius: 85,
    backgroundColor: 'rgba(0,0,0,0.9)', borderWidth: 7, borderColor: '#FFD700',
    alignItems: 'center', justifyContent: 'center',
  },
  repNumber: { fontSize: 85, fontWeight: 'bold', color: '#FFD700' },
  repLabel: { fontSize: 20, color: '#888', marginTop: -10, fontWeight: '700' },
  statusBadge: {
    marginTop: 20, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 25,
    backgroundColor: '#4CAF50',
  },
  statusText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  lightDisplay: { color: '#888', fontSize: 12, marginTop: 10 },
  instructionBox: {
    position: 'absolute', top: height * 0.52, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)', padding: 16, borderRadius: 16,
    maxWidth: width - 40,
  },
  instructionTitle: { color: '#FFD700', fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  instructionText: { color: '#FFF', fontSize: 13 },
  flyingCoin: { position: 'absolute', top: height * 0.42, alignSelf: 'center', zIndex: 100 },
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
    alignItems: 'center', justifyContent: 'center', width: 140, height: 140, borderRadius: 70,
    backgroundColor: '#FFD700',
  },
  mainButtonActive: { backgroundColor: '#4CAF50' },
  mainButtonText: { color: '#000', fontSize: 16, fontWeight: 'bold', marginTop: 4 },
  permissionContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  permissionTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginTop: 24, marginBottom: 16 },
  permissionText: { fontSize: 16, color: '#AAA', textAlign: 'center', marginBottom: 32 },
  permissionButton: { backgroundColor: '#FFD700', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 30 },
  permissionButtonText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  backButton: { marginTop: 16, padding: 12 },
  backButtonText: { color: '#888', fontSize: 14 },
});
