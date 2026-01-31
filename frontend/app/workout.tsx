import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  Vibration,
  ActivityIndicator,
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
  const cameraRef = useRef<any>(null);

  const [exerciseType, setExerciseType] = useState<ExerciseType>('pushup');
  const [repCount, setRepCount] = useState(0);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [facing, setFacing] = useState<CameraType>('front');
  const [coinAnimations, setCoinAnimations] = useState<CoinAnimation[]>([]);
  const [sessionStats, setSessionStats] = useState({ pushups: 0, situps: 0 });
  const [isTracking, setIsTracking] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Press START');
  const [currentPosition, setCurrentPosition] = useState<'up' | 'down' | 'unknown'>('unknown');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const coinIdRef = useRef(0);
  const chachingSoundRef = useRef<Audio.Sound | null>(null);
  const repScale = useRef(new Animated.Value(1)).current;
  const walletScale = useRef(new Animated.Value(1)).current;
  
  // Position tracking for rep counting
  const lastPositionRef = useRef<'up' | 'down' | 'unknown'>('unknown');
  const wasDownRef = useRef(false);
  const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastRepTimeRef = useRef(0);

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
      });
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/chaching.mp3'),
        { shouldPlay: false, volume: 1.0 }
      );
      chachingSoundRef.current = sound;
    } catch (error) {
      console.log('Sound error:', error);
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
    const scale = new Animated.Value(2.5);

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
        Animated.timing(walletScale, { toValue: 2, duration: 50, useNativeDriver: true }),
        Animated.timing(walletScale, { toValue: 1, duration: 50, useNativeDriver: true }),
      ]).start();
    });
  };

  const countRep = useCallback(() => {
    const now = Date.now();
    if (now - lastRepTimeRef.current < 1000) return; // Min 1 second between reps
    lastRepTimeRef.current = now;

    setRepCount((prev) => prev + 1);
    setCoinsEarned((prev) => prev + 1);
    setSessionStats((prev) => ({
      ...prev,
      [exerciseType === 'pushup' ? 'pushups' : 'situps']: 
        prev[exerciseType === 'pushup' ? 'pushups' : 'situps'] + 1,
    }));

    Animated.sequence([
      Animated.timing(repScale, { toValue: 2, duration: 50, useNativeDriver: true }),
      Animated.timing(repScale, { toValue: 1, duration: 50, useNativeDriver: true }),
    ]).start();

    playChaChing();
    animateCoin();
    saveRepToBackend();
    setStatusMessage('💰 REP COUNTED!');
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

  // Capture and analyze camera frame
  const analyzeFrame = async () => {
    if (!cameraRef.current || isAnalyzing) return;

    try {
      setIsAnalyzing(true);
      
      // Capture photo from camera
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.3, // Low quality for faster upload
        skipProcessing: true,
      });

      if (!photo?.base64) {
        setIsAnalyzing(false);
        return;
      }

      // Send to AI for analysis
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/analyze-pose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: photo.base64,
          exercise_type: exerciseType,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const newPosition = result.position;
        
        setCurrentPosition(newPosition);
        
        // Rep counting logic: DOWN -> UP = 1 rep
        if (newPosition === 'down') {
          wasDownRef.current = true;
          setStatusMessage('⬇️ DOWN - Keep going!');
        } else if (newPosition === 'up' && wasDownRef.current) {
          // Completed a full rep!
          wasDownRef.current = false;
          countRep();
        } else if (newPosition === 'up') {
          setStatusMessage('⬆️ UP - Go down to start');
        } else {
          setStatusMessage('📷 Analyzing...');
        }
        
        lastPositionRef.current = newPosition;
      }
    } catch (error) {
      console.log('Analysis error:', error);
      setStatusMessage('Analyzing...');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startTracking = () => {
    setIsTracking(true);
    setStatusMessage('📷 AI watching your form...');
    wasDownRef.current = false;
    lastPositionRef.current = 'unknown';
    
    // Analyze frames every 1.5 seconds
    analysisIntervalRef.current = setInterval(() => {
      analyzeFrame();
    }, 1500);
  };

  const stopTracking = () => {
    setIsTracking(false);
    setStatusMessage('Press START');
    setCurrentPosition('unknown');
    
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
      analysisIntervalRef.current = null;
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

  const getPositionColor = () => {
    switch (currentPosition) {
      case 'down': return '#FF6B6B';
      case 'up': return '#4CAF50';
      default: return '#FFD700';
    }
  };

  if (!permission) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={80} color="#FFD700" />
          <Text style={styles.permissionTitle}>Camera Required</Text>
          <Text style={styles.permissionText}>
            Rep Coin needs camera access to watch your form and count reps using AI.
          </Text>
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
      <CameraView 
        ref={cameraRef}
        style={styles.camera} 
        facing={facing}
      >
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

        {/* AI Badge */}
        {isTracking && (
          <View style={styles.aiBadge}>
            <Ionicons name="eye" size={16} color="#4CAF50" />
            <Text style={styles.aiBadgeText}>AI Vision Active</Text>
            {isAnalyzing && <ActivityIndicator size="small" color="#4CAF50" style={{ marginLeft: 8 }} />}
          </View>
        )}

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
          <Animated.View style={[styles.repCounter, { transform: [{ scale: repScale }], borderColor: getPositionColor() }]}>
            <Text style={[styles.repNumber, { color: getPositionColor() }]}>{repCount}</Text>
            <Text style={styles.repLabel}>REPS</Text>
          </Animated.View>
          
          <View style={[styles.statusBadge, { backgroundColor: getPositionColor() }]}>
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>

          {/* Position indicator */}
          {isTracking && currentPosition !== 'unknown' && (
            <View style={[styles.positionIndicator, { backgroundColor: getPositionColor() }]}>
              <Text style={styles.positionText}>
                {currentPosition === 'down' ? '⬇️ DOWN' : '⬆️ UP'}
              </Text>
            </View>
          )}
        </View>

        {/* Instructions */}
        {isTracking && (
          <View style={styles.instructionBox}>
            <Text style={styles.instructionTitle}>🤖 AI Rep Detection</Text>
            <Text style={styles.instructionText}>• Position yourself in camera view</Text>
            <Text style={styles.instructionText}>• Do FULL reps: DOWN then UP</Text>
            <Text style={styles.instructionText}>• Rep counts when you complete UP</Text>
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
  aiBadge: {
    position: 'absolute', top: 80, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#4CAF50',
  },
  aiBadgeText: { color: '#4CAF50', fontSize: 12, fontWeight: '600', marginLeft: 6 },
  exerciseSelector: {
    position: 'absolute', top: 115, left: 16, right: 16,
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
  repDisplay: { position: 'absolute', top: height * 0.18, alignSelf: 'center', alignItems: 'center' },
  repCounter: {
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(0,0,0,0.9)', borderWidth: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  repNumber: { fontSize: 90, fontWeight: 'bold' },
  repLabel: { fontSize: 22, color: '#888', marginTop: -10, fontWeight: '700' },
  statusBadge: {
    marginTop: 20, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 30,
  },
  statusText: { color: '#000', fontSize: 14, fontWeight: '800' },
  positionIndicator: {
    marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20,
  },
  positionText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
  instructionBox: {
    position: 'absolute', top: height * 0.52, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.9)', padding: 16, borderRadius: 16,
    maxWidth: width - 40, borderWidth: 1, borderColor: '#333',
  },
  instructionTitle: { color: '#FFD700', fontSize: 15, fontWeight: 'bold', marginBottom: 10 },
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
  permissionText: { fontSize: 16, color: '#AAA', textAlign: 'center', marginBottom: 32, lineHeight: 24 },
  permissionButton: { backgroundColor: '#FFD700', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 30 },
  permissionButtonText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  backButton: { marginTop: 16, padding: 12 },
  backButtonText: { color: '#888', fontSize: 14 },
});
