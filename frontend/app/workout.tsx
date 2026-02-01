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

// State machine thresholds for rep counting
// Based on observed values: UP ~0.28-0.42, DOWN should be higher
const DOWN_THRESHOLD = 0.50;  // shoulder_y above this = DOWN position
const UP_THRESHOLD = 0.35;    // shoulder_y below this = UP position

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
  const [currentPosition, setCurrentPosition] = useState<string>('unknown');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiStatus, setAiStatus] = useState('Ready');

  const coinIdRef = useRef(0);
  const chachingSoundRef = useRef<Audio.Sound | null>(null);
  const repScale = useRef(new Animated.Value(1)).current;
  const walletScale = useRef(new Animated.Value(1)).current;
  
  // State machine for rep detection
  // state: "up" or "down" - based on shoulder position
  const currentStateRef = useRef<'up' | 'down'>('up'); // Start in UP position
  const lastRepTimeRef = useRef(0);
  const analysisLoopRef = useRef<NodeJS.Timeout | null>(null);
  const isTrackingRef = useRef(false);
  
  // Smoothing: keep last 5 shoulder_y values
  const shoulderYHistoryRef = useRef<number[]>([]);

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
      console.log('Sound load error');
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

  // ONLY called when AI confirms DOWN -> UP transition
  const triggerRepCount = useCallback(() => {
    const now = Date.now();
    // Prevent double counting - minimum 1.5 seconds between reps
    if (now - lastRepTimeRef.current < 1500) {
      console.log('Too soon for another rep');
      return;
    }
    lastRepTimeRef.current = now;

    console.log('=== REP COUNTED ===');
    
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
    
    // Save to backend
    fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/reps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercise_type: exerciseType, coins_earned: 1 }),
    }).catch(() => {});

    setStatusMessage('💰 REP COUNTED!');
  }, [exerciseType]);

  // Capture frame and send to AI for analysis
  const captureAndAnalyze = async () => {
    if (!isTrackingRef.current || !cameraRef.current || isAnalyzing) {
      return;
    }

    setIsAnalyzing(true);
    setAiStatus('Analyzing...');

    try {
      // Capture photo
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.2,
        skipProcessing: true,
      });

      if (!photo?.base64) {
        setAiStatus('Camera error');
        setIsAnalyzing(false);
        return;
      }

      // Send to AI
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/analyze-pose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: photo.base64,
          exercise_type: exerciseType,
        }),
      });

      if (!response.ok) {
        setAiStatus('AI error');
        setIsAnalyzing(false);
        return;
      }

      const result = await response.json();
      const rawShoulderY = result.shoulder_y || 0.5;
      
      // Add to history for smoothing
      shoulderYHistoryRef.current.push(rawShoulderY);
      if (shoulderYHistoryRef.current.length > 5) {
        shoulderYHistoryRef.current.shift(); // Keep only last 5
      }
      
      // Calculate smoothed average
      const smoothedY = shoulderYHistoryRef.current.reduce((a, b) => a + b, 0) / shoulderYHistoryRef.current.length;
      
      const currentState = currentStateRef.current;
      
      console.log(`AI: raw=${rawShoulderY.toFixed(2)}, smoothed=${smoothedY.toFixed(2)}, state=${currentState}, history=${shoulderYHistoryRef.current.length}`);
      
      setCurrentPosition(result.position);
      setAiStatus(`Y: ${smoothedY.toFixed(2)} | ${currentState.toUpperCase()}`);

      // STATE MACHINE LOGIC with smoothed values:
      // if(state === "up" && smoothedY > DOWN_THRESHOLD) { state = "down" }
      // if(state === "down" && smoothedY < UP_THRESHOLD) { count++; state = "up" }
      
      if (currentState === 'up' && smoothedY > DOWN_THRESHOLD) {
        // Transition: UP -> DOWN
        currentStateRef.current = 'down';
        setStatusMessage(`⬇️ DOWN (${smoothedY.toFixed(2)}) - Push UP!`);
        console.log(`State change: UP -> DOWN at smoothedY=${smoothedY.toFixed(2)}`);
      } 
      else if (currentState === 'down' && smoothedY < UP_THRESHOLD) {
        // Transition: DOWN -> UP = COUNT REP!
        currentStateRef.current = 'up';
        console.log(`State change: DOWN -> UP at smoothedY=${smoothedY.toFixed(2)} = REP COUNTED!`);
        triggerRepCount();
      }
      else {
        // No state change - waiting for movement
        if (currentState === 'up') {
          setStatusMessage(`⬆️ UP (${smoothedY.toFixed(2)}) - Go DOWN`);
        } else {
          setStatusMessage(`⬇️ DOWN (${smoothedY.toFixed(2)}) - Push UP`);
        }
      }

    } catch (error) {
      console.log('Analysis error:', error);
      setAiStatus('Error');
      setStatusMessage('AI analyzing...');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startTracking = () => {
    console.log('Starting tracking...');
    setIsTracking(true);
    isTrackingRef.current = true;
    currentStateRef.current = 'up';  // Start in UP position
    setStatusMessage('📷 Get in position - Start in UP');
    setAiStatus('Starting...');
    
    // Start analysis loop - analyze every 1.5 seconds
    const runAnalysis = async () => {
      if (isTrackingRef.current) {
        await captureAndAnalyze();
        // Schedule next analysis
        analysisLoopRef.current = setTimeout(runAnalysis, 1500);
      }
    };
    
    // Start after a short delay
    analysisLoopRef.current = setTimeout(runAnalysis, 1000);
  };

  const stopTracking = () => {
    console.log('Stopping tracking...');
    setIsTracking(false);
    isTrackingRef.current = false;
    setStatusMessage('Press START');
    setCurrentPosition('unknown');
    setAiStatus('Ready');
    currentStateRef.current = 'up';  // Reset state
    
    if (analysisLoopRef.current) {
      clearTimeout(analysisLoopRef.current);
      analysisLoopRef.current = null;
    }
  };

  const toggleTracking = () => {
    if (isTracking) {
      stopTracking();
    } else {
      startTracking();
    }
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
    if (currentPosition === 'down') return '#FF6B6B';
    if (currentPosition === 'up') return '#4CAF50';
    return '#FFD700';
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

        {/* AI Status Badge */}
        {isTracking && (
          <View style={styles.aiBadge}>
            <Ionicons name="eye" size={16} color={isAnalyzing ? '#FFA500' : '#4CAF50'} />
            <Text style={[styles.aiBadgeText, { color: isAnalyzing ? '#FFA500' : '#4CAF50' }]}>
              {aiStatus}
            </Text>
            {isAnalyzing && <ActivityIndicator size="small" color="#FFA500" style={{ marginLeft: 8 }} />}
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

          {/* Current position indicator */}
          {isTracking && currentPosition !== 'unknown' && (
            <View style={[styles.positionBox, { borderColor: getPositionColor() }]}>
              <Text style={[styles.positionLabel, { color: getPositionColor() }]}>
                Position: {currentPosition.toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* Instructions */}
        {isTracking && (
          <View style={styles.instructionBox}>
            <Text style={styles.instructionTitle}>🤖 AI Rep Counter</Text>
            <Text style={styles.instructionText}>1. Start in UP position (arms extended)</Text>
            <Text style={styles.instructionText}>2. Go DOWN (lower your body)</Text>
            <Text style={styles.instructionText}>3. Push UP to count rep!</Text>
            <Text style={styles.instructionNote}>Rep counts on: DOWN → UP transition</Text>
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
            <Text style={styles.mainButtonText}>{isTracking ? 'STOP' : 'START'}</Text>
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
    backgroundColor: 'rgba(0,0,0,0.9)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1, borderColor: '#4CAF50',
  },
  aiBadgeText: { fontSize: 13, fontWeight: '700', marginLeft: 6 },
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
    backgroundColor: 'rgba(0,0,0,0.9)', borderWidth: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  repNumber: { fontSize: 85, fontWeight: 'bold' },
  repLabel: { fontSize: 20, color: '#888', marginTop: -8, fontWeight: '700' },
  statusBadge: {
    marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 25,
  },
  statusText: { color: '#000', fontSize: 14, fontWeight: '800' },
  positionBox: {
    marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.8)', borderWidth: 2,
  },
  positionLabel: { fontSize: 14, fontWeight: 'bold' },
  instructionBox: {
    position: 'absolute', top: height * 0.5, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.9)', padding: 16, borderRadius: 16,
    maxWidth: width - 40, borderWidth: 1, borderColor: '#333',
  },
  instructionTitle: { color: '#FFD700', fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  instructionText: { color: '#FFF', fontSize: 14, marginBottom: 4 },
  instructionNote: { color: '#4CAF50', fontSize: 12, marginTop: 8, fontStyle: 'italic' },
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
