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
  const [debugInfo, setDebugInfo] = useState('');
  const [soundLevel, setSoundLevel] = useState(0);

  const coinIdRef = useRef(0);
  const chachingSoundRef = useRef<Audio.Sound | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const repScale = useRef(new Animated.Value(1)).current;
  const walletScale = useRef(new Animated.Value(1)).current;

  // Audio detection
  const lastRepTimeRef = useRef(0);
  const baselineRef = useRef<number>(-50); // Default baseline
  const wasLoudRef = useRef(false);
  const meteringIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const calibrationCountRef = useRef(0);
  const calibrationSamplesRef = useRef<number[]>([]);

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
        allowsRecordingIOS: true,
      });
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/chaching.mp3'),
        { shouldPlay: false, volume: 1.0 }
      );
      chachingSoundRef.current = sound;
    } catch (error) {
      console.log('Sound load error:', error);
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
    setTimeout(() => setStatusMessage('Keep counting...'), 400);
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

  const startAudioDetection = async () => {
    try {
      setStatusMessage('Requesting mic...');
      setDebugInfo('Starting audio...');

      // Request permission
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setStatusMessage('Mic permission denied');
        setDebugInfo('Permission denied');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      setStatusMessage('Starting recording...');
      
      // Create and start recording with metering enabled
      const recording = new Audio.Recording();
      
      await recording.prepareToRecordAsync({
        isMeteringEnabled: true,
        android: {
          extension: '.m4a',
          outputFormat: 2,
          audioEncoder: 3,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: 'aac' as any,
          audioQuality: 127,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 128000,
        },
      });

      await recording.startAsync();
      recordingRef.current = recording;
      
      setStatusMessage('Calibrating...');
      setDebugInfo('Recording started');
      
      // Reset calibration
      calibrationCountRef.current = 0;
      calibrationSamplesRef.current = [];
      wasLoudRef.current = false;

      // Poll for audio levels
      meteringIntervalRef.current = setInterval(async () => {
        if (!recordingRef.current) return;
        
        try {
          const status = await recordingRef.current.getStatusAsync();
          
          if (!status.isRecording) {
            setDebugInfo('Not recording');
            return;
          }

          // Get metering value (dB, typically -160 to 0)
          const metering = status.metering ?? -60;
          
          // Normalize to 0-100 for display
          const normalizedLevel = Math.max(0, Math.min(100, (metering + 60) * 1.67));
          setSoundLevel(normalizedLevel);
          
          setDebugInfo(`dB: ${metering.toFixed(1)} | Base: ${baselineRef.current.toFixed(1)}`);

          // Calibration phase (first 20 samples)
          if (calibrationCountRef.current < 20) {
            calibrationSamplesRef.current.push(metering);
            calibrationCountRef.current++;
            
            if (calibrationCountRef.current >= 20) {
              const avg = calibrationSamplesRef.current.reduce((a, b) => a + b, 0) / 20;
              baselineRef.current = avg;
              setStatusMessage('GO! Count out loud');
              setDebugInfo(`Calibrated: ${avg.toFixed(1)} dB`);
            }
            return;
          }

          // Detection phase - very sensitive threshold (5dB above baseline)
          const threshold = baselineRef.current + 5;
          const quietThreshold = baselineRef.current + 2;

          if (!wasLoudRef.current && metering > threshold) {
            // Sound spike detected
            wasLoudRef.current = true;
            setStatusMessage('🔊 SOUND!');
          } else if (wasLoudRef.current && metering < quietThreshold) {
            // Sound ended - count rep
            wasLoudRef.current = false;
            countRep();
          }

        } catch (error) {
          setDebugInfo(`Error: ${error}`);
        }
      }, 80); // 12.5 Hz polling

    } catch (error) {
      console.log('Audio error:', error);
      setStatusMessage('Audio error');
      setDebugInfo(`Error: ${error}`);
    }
  };

  const stopTracking = async () => {
    setIsTracking(false);
    setStatusMessage('Press START');
    setSoundLevel(0);
    setDebugInfo('');
    
    if (meteringIntervalRef.current) {
      clearInterval(meteringIntervalRef.current);
      meteringIntervalRef.current = null;
    }
    
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (error) {}
      recordingRef.current = null;
    }
  };

  const startTracking = async () => {
    setIsTracking(true);
    await startAudioDetection();
  };

  const toggleTracking = async () => {
    if (isTracking) await stopTracking();
    else await startTracking();
  };

  const toggleCameraFacing = () => setFacing((prev) => (prev === 'front' ? 'back' : 'front'));

  const endWorkout = async () => {
    await stopTracking();
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

        {/* Audio badge */}
        <View style={styles.audioBadge}>
          <Ionicons name="mic" size={16} color="#4CAF50" />
          <Text style={styles.audioBadgeText}>Voice Detection</Text>
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

          {/* Sound level bar */}
          {isTracking && (
            <View style={styles.soundMeterContainer}>
              <Ionicons name="mic" size={20} color="#4CAF50" />
              <View style={styles.soundBarBg}>
                <View style={[styles.soundBar, { width: `${soundLevel}%` }]} />
              </View>
            </View>
          )}

          {/* Debug info */}
          {debugInfo ? (
            <Text style={styles.debugText}>{debugInfo}</Text>
          ) : null}
        </View>

        {/* Instructions */}
        {isTracking && (
          <View style={styles.instructionBox}>
            <Text style={styles.instructionTitle}>🎤 How to Count Reps:</Text>
            <Text style={styles.instructionText}>• Say "ONE", "TWO", "THREE"...</Text>
            <Text style={styles.instructionText}>• Or CLAP after each rep</Text>
            <Text style={styles.instructionText}>• Any loud sound counts!</Text>
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
  audioBadge: {
    position: 'absolute', top: 80, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  audioBadgeText: { color: '#4CAF50', fontSize: 12, fontWeight: '600', marginLeft: 6 },
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
  repDisplay: { position: 'absolute', top: height * 0.17, alignSelf: 'center', alignItems: 'center' },
  repCounter: {
    width: 170, height: 170, borderRadius: 85,
    backgroundColor: 'rgba(0,0,0,0.9)', borderWidth: 7, borderColor: '#FFD700',
    alignItems: 'center', justifyContent: 'center',
  },
  repNumber: { fontSize: 85, fontWeight: 'bold', color: '#FFD700' },
  repLabel: { fontSize: 20, color: '#888', marginTop: -10, fontWeight: '700' },
  statusBadge: {
    marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 25,
    backgroundColor: '#4CAF50',
  },
  statusText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  soundMeterContainer: {
    flexDirection: 'row', alignItems: 'center', marginTop: 16,
    backgroundColor: 'rgba(0,0,0,0.8)', padding: 12, borderRadius: 25,
  },
  soundBarBg: {
    width: 180, height: 12, backgroundColor: '#333', borderRadius: 6, marginLeft: 12, overflow: 'hidden',
  },
  soundBar: {
    height: '100%', backgroundColor: '#4CAF50', borderRadius: 6,
  },
  debugText: {
    color: '#888', fontSize: 11, marginTop: 10, fontFamily: 'monospace',
  },
  instructionBox: {
    position: 'absolute', top: height * 0.52, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.9)', padding: 16, borderRadius: 16,
    maxWidth: width - 40, borderWidth: 1, borderColor: '#333',
  },
  instructionTitle: { color: '#FFD700', fontSize: 15, fontWeight: 'bold', marginBottom: 10 },
  instructionText: { color: '#FFF', fontSize: 14, marginBottom: 6 },
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
