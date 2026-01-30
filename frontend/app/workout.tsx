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
  const [statusMessage, setStatusMessage] = useState('Tap START to begin');
  
  // Debug display
  const [accelData, setAccelData] = useState({ x: 0, y: 0, z: 0 });
  const [gyroData, setGyroData] = useState({ x: 0, y: 0, z: 0 });
  const [sensorAvailable, setSensorAvailable] = useState<string>('Checking...');

  const coinIdRef = useRef(0);
  const chachingSoundRef = useRef<Audio.Sound | null>(null);
  const repScale = useRef(new Animated.Value(1)).current;
  const walletScale = useRef(new Animated.Value(1)).current;

  // Sensor subscriptions
  const accelSubRef = useRef<any>(null);
  const gyroSubRef = useRef<any>(null);
  
  // Rep detection
  const lastRepTimeRef = useRef(0);
  const movementPhaseRef = useRef<'rest' | 'active'>('rest');
  const peakGyroRef = useRef(0);
  const samplesRef = useRef<number[]>([]);

  // Check sensor availability on mount
  useEffect(() => {
    checkSensors();
    loadSound();
    return () => {
      stopAllSensors();
      if (chachingSoundRef.current) chachingSoundRef.current.unloadAsync();
    };
  }, []);

  const checkSensors = async () => {
    const accelAvail = await Accelerometer.isAvailableAsync();
    const gyroAvail = await Gyroscope.isAvailableAsync();
    
    let status = '';
    if (Platform.OS === 'web') {
      status = '⚠️ Web browser - sensors limited. Use Expo Go app on phone!';
    } else if (accelAvail && gyroAvail) {
      status = '✅ Sensors ready';
    } else if (accelAvail) {
      status = '✅ Accelerometer ready (no gyro)';
    } else if (gyroAvail) {
      status = '✅ Gyroscope ready (no accel)';
    } else {
      status = '❌ No motion sensors available';
    }
    setSensorAvailable(status);
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
      Animated.timing(translateY, { toValue: -height * 0.4, duration: 500, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: width * 0.3, duration: 500, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.3, duration: 500, useNativeDriver: true }),
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
    if (now - lastRepTimeRef.current < 350) return;
    lastRepTimeRef.current = now;

    setRepCount((prev) => prev + 1);
    setCoinsEarned((prev) => prev + 1);
    setSessionStats((prev) => ({
      ...prev,
      [exerciseType === 'pushup' ? 'pushups' : 'situps']: 
        prev[exerciseType === 'pushup' ? 'pushups' : 'situps'] + 1,
    }));

    Animated.sequence([
      Animated.timing(repScale, { toValue: 1.8, duration: 50, useNativeDriver: true }),
      Animated.timing(repScale, { toValue: 1, duration: 50, useNativeDriver: true }),
    ]).start();

    playChaChing();
    animateCoin();
    saveRepToBackend();
    setStatusMessage('💰 CHA-CHING!');
    setTimeout(() => setStatusMessage('Keep going!'), 500);
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
    setStatusMessage('Tracking motion...');
    movementPhaseRef.current = 'rest';
    peakGyroRef.current = 0;
    samplesRef.current = [];

    // Start accelerometer
    Accelerometer.setUpdateInterval(50);
    accelSubRef.current = Accelerometer.addListener(({ x, y, z }) => {
      setAccelData({ x, y, z });
      
      // Simple motion detection based on acceleration changes
      const magnitude = Math.sqrt(x*x + y*y + z*z);
      samplesRef.current.push(magnitude);
      if (samplesRef.current.length > 10) samplesRef.current.shift();
      
      // Calculate variance in recent samples
      if (samplesRef.current.length >= 5) {
        const avg = samplesRef.current.reduce((a,b) => a+b, 0) / samplesRef.current.length;
        const variance = samplesRef.current.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / samplesRef.current.length;
        
        // High variance = movement
        if (variance > 0.01) { // Very sensitive
          if (movementPhaseRef.current === 'rest') {
            movementPhaseRef.current = 'active';
            setStatusMessage('⬇️ Moving...');
          }
        } else {
          // Low variance = stopped moving
          if (movementPhaseRef.current === 'active') {
            // Movement stopped = rep complete!
            countRep();
            movementPhaseRef.current = 'rest';
          }
        }
      }
    });

    // Start gyroscope for rotation detection (backup)
    Gyroscope.setUpdateInterval(50);
    gyroSubRef.current = Gyroscope.addListener(({ x, y, z }) => {
      setGyroData({ x, y, z });
      
      // Track peak rotation
      const rotMag = Math.sqrt(x*x + y*y + z*z);
      if (rotMag > peakGyroRef.current) {
        peakGyroRef.current = rotMag;
      }
      
      // Significant rotation can also trigger rep detection
      if (rotMag > 1.5 && movementPhaseRef.current === 'rest') {
        movementPhaseRef.current = 'active';
        setStatusMessage('🔄 Rotation detected');
      } else if (rotMag < 0.3 && movementPhaseRef.current === 'active' && peakGyroRef.current > 1.5) {
        countRep();
        movementPhaseRef.current = 'rest';
        peakGyroRef.current = 0;
      }
    });
  };

  const stopAllSensors = () => {
    if (accelSubRef.current) {
      accelSubRef.current.remove();
      accelSubRef.current = null;
    }
    if (gyroSubRef.current) {
      gyroSubRef.current.remove();
      gyroSubRef.current = null;
    }
  };

  const stopTracking = () => {
    setIsTracking(false);
    setStatusMessage('Tap START to begin');
    stopAllSensors();
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

        {/* Sensor Status - IMPORTANT FOR DEBUGGING */}
        <View style={styles.sensorStatus}>
          <Text style={styles.sensorStatusText}>{sensorAvailable}</Text>
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
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>
        </View>

        {/* Live Sensor Data - Shows if sensors are working */}
        {isTracking && (
          <View style={styles.sensorDataBox}>
            <Text style={styles.sensorTitle}>📊 LIVE SENSOR DATA</Text>
            <Text style={styles.sensorLine}>
              Accel: X:{accelData.x.toFixed(2)} Y:{accelData.y.toFixed(2)} Z:{accelData.z.toFixed(2)}
            </Text>
            <Text style={styles.sensorLine}>
              Gyro: X:{gyroData.x.toFixed(2)} Y:{gyroData.y.toFixed(2)} Z:{gyroData.z.toFixed(2)}
            </Text>
            <Text style={styles.sensorHint}>
              Move your phone - numbers should change!
            </Text>
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
        <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.endButton} onPress={endWorkout}>
            <Ionicons name="stop-circle" size={40} color="#FF4444" />
            <Text style={styles.endButtonText}>END</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mainButton, isTracking && styles.mainButtonActive]}
            onPress={toggleTracking}
          >
            <Ionicons name={isTracking ? 'pause' : 'play'} size={50} color="#000" />
            <Text style={styles.mainButtonText}>{isTracking ? 'STOP' : 'START'}</Text>
          </TouchableOpacity>

          {/* BIG TAP BUTTON - Primary way to count */}
          <TouchableOpacity style={styles.tapButton} onPress={handleManualRep}>
            <Text style={styles.tapButtonBig}>TAP</Text>
            <Text style={styles.tapButtonSmall}>each rep</Text>
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
  sensorStatus: {
    position: 'absolute', top: 75, left: 16, right: 16,
    backgroundColor: 'rgba(0,0,0,0.8)', padding: 10, borderRadius: 10,
  },
  sensorStatusText: { color: '#FFF', fontSize: 12, textAlign: 'center' },
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
  repDisplay: { position: 'absolute', top: height * 0.18, alignSelf: 'center', alignItems: 'center' },
  repCounter: {
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(0,0,0,0.9)', borderWidth: 6, borderColor: '#FFD700',
    alignItems: 'center', justifyContent: 'center',
  },
  repNumber: { fontSize: 76, fontWeight: 'bold', color: '#FFD700' },
  repLabel: { fontSize: 18, color: '#AAA', marginTop: -8, fontWeight: '700' },
  statusBadge: {
    marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 2, borderColor: '#555',
  },
  statusBadgeActive: { backgroundColor: 'rgba(76,175,80,0.5)', borderColor: '#4CAF50' },
  statusText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  sensorDataBox: {
    position: 'absolute', top: height * 0.48, left: 16, right: 16,
    backgroundColor: 'rgba(0,0,0,0.9)', padding: 12, borderRadius: 12,
    borderWidth: 1, borderColor: '#444',
  },
  sensorTitle: { color: '#FFD700', fontSize: 12, fontWeight: 'bold', marginBottom: 6 },
  sensorLine: { color: '#0F0', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  sensorHint: { color: '#888', fontSize: 10, marginTop: 6, fontStyle: 'italic' },
  flyingCoin: { position: 'absolute', top: height * 0.42, alignSelf: 'center', zIndex: 100 },
  coinIcon: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: '#FFD700', alignItems: 'center', justifyContent: 'center',
    borderWidth: 6, borderColor: '#DAA520',
  },
  coinText: { fontSize: 48, fontWeight: 'bold', color: '#8B4513' },
  bottomControls: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    paddingHorizontal: 10, backgroundColor: 'rgba(0,0,0,0.9)', paddingTop: 16,
  },
  endButton: { alignItems: 'center', width: 70 },
  endButtonText: { color: '#FF4444', fontSize: 12, marginTop: 2, fontWeight: 'bold' },
  mainButton: {
    alignItems: 'center', justifyContent: 'center', width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#FFD700',
  },
  mainButtonActive: { backgroundColor: '#4CAF50' },
  mainButtonText: { color: '#000', fontSize: 14, fontWeight: 'bold', marginTop: 2 },
  tapButton: {
    alignItems: 'center', justifyContent: 'center', width: 85, height: 85, borderRadius: 42,
    backgroundColor: '#2196F3',
  },
  tapButtonBig: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  tapButtonSmall: { color: '#FFF', fontSize: 10, opacity: 0.8 },
  permissionContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  permissionTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginTop: 24, marginBottom: 16 },
  permissionText: { fontSize: 16, color: '#AAA', textAlign: 'center', marginBottom: 32 },
  permissionButton: { backgroundColor: '#FFD700', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 30 },
  permissionButtonText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  backButton: { marginTop: 16, padding: 12 },
  backButtonText: { color: '#888', fontSize: 14 },
});
