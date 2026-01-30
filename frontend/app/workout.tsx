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

  // Sound refs
  const coinIdRef = useRef(0);

  // Animation values
  const repScale = useRef(new Animated.Value(1)).current;
  const walletScale = useRef(new Animated.Value(1)).current;

  // Sound loaded state
  const [soundLoaded, setSoundLoaded] = useState(false);
  const chachingSoundRef = useRef<Audio.Sound | null>(null);

  // Load sound effect on mount
  useEffect(() => {
    loadSound();
    return () => {
      if (chachingSoundRef.current) {
        chachingSoundRef.current.unloadAsync();
      }
    };
  }, []);

  const loadSound = async () => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      
      // Preload cha-ching sound from reliable source
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://assets.mixkit.co/active_storage/sfx/2058/2058-preview.mp3' },
        { shouldPlay: false, volume: 1.0 }
      );
      chachingSoundRef.current = sound;
      setSoundLoaded(true);
      console.log('Cha-ching sound loaded successfully');
    } catch (error) {
      console.log('Error loading sound:', error);
      // Try alternative sound source
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: 'https://cdn.freesound.org/previews/352/352661_5121236-lq.mp3' },
          { shouldPlay: false, volume: 1.0 }
        );
        chachingSoundRef.current = sound;
        setSoundLoaded(true);
        console.log('Alternative cha-ching sound loaded');
      } catch (err) {
        console.log('Could not load any sound:', err);
      }
    }
  };

  // Play cha-ching sound
  const playChaChing = async () => {
    try {
      if (chachingSoundRef.current && soundLoaded) {
        // Rewind and play
        await chachingSoundRef.current.setPositionAsync(0);
        await chachingSoundRef.current.playAsync();
        console.log('Playing cha-ching sound');
      } else {
        // Fallback: try to create and play immediately
        const { sound } = await Audio.Sound.createAsync(
          { uri: 'https://assets.mixkit.co/active_storage/sfx/2058/2058-preview.mp3' },
          { shouldPlay: true, volume: 1.0 }
        );
        // Clean up after playing
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
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: width * 0.35,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 0.5,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(700),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      // Remove coin after animation
      setCoinAnimations((prev) => prev.filter((c) => c.id !== coinId));
      
      // Animate wallet when coin arrives
      Animated.sequence([
        Animated.timing(walletScale, {
          toValue: 1.3,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(walletScale, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  // Handle rep completion
  const onRepCompleted = useCallback(() => {
    setRepCount((prev) => prev + 1);
    setCoinsEarned((prev) => prev + 1);
    setSessionStats((prev) => ({
      ...prev,
      [exerciseType === 'pushup' ? 'pushups' : 'situps']: prev[exerciseType === 'pushup' ? 'pushups' : 'situps'] + 1,
    }));

    // Animate rep counter
    Animated.sequence([
      Animated.timing(repScale, {
        toValue: 1.3,
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
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/reps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          exercise_type: exerciseType,
          coins_earned: 1,
        }),
      });
      if (!response.ok) {
        console.log('Failed to save rep');
      }
    } catch (error) {
      console.log('Error saving rep:', error);
    }
  };

  // Manual rep button (for when AI detection isn't available)
  const handleManualRep = () => {
    onRepCompleted();
  };

  // Toggle camera facing
  const toggleCameraFacing = () => {
    setFacing((prev) => (prev === 'front' ? 'back' : 'front'));
  };

  // End workout session
  const endWorkout = async () => {
    setIsTracking(false);

    // Save session
    try {
      await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

  // Permission request screen
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
            Rep Coin needs camera access to track your exercises and count reps automatically.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Camera view */}
      <CameraView style={styles.camera} facing={facing}>
        {/* Pose overlay guide */}
        <View style={styles.poseOverlay}>
          {isTracking && (
            <View style={styles.poseGuide}>
              <View style={styles.bodyOutline}>
                <View style={[styles.jointDot, { top: 10, alignSelf: 'center' }]} />
                <View style={[styles.jointDot, { top: 40, left: 20 }]} />
                <View style={[styles.jointDot, { top: 40, right: 20 }]} />
                <View style={[styles.jointDot, { top: 80, left: 10 }]} />
                <View style={[styles.jointDot, { top: 80, right: 10 }]} />
                <View style={[styles.jointDot, { bottom: 30, left: 25 }]} />
                <View style={[styles.jointDot, { bottom: 30, right: 25 }]} />
              </View>
            </View>
          )}
        </View>

        {/* Header controls */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>

          <Animated.View
            style={[
              styles.walletIndicator,
              { transform: [{ scale: walletScale }] },
            ]}
          >
            <Ionicons name="wallet" size={24} color="#FFD700" />
            <Text style={styles.walletCoins}>{coinsEarned}</Text>
          </Animated.View>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={toggleCameraFacing}
          >
            <Ionicons name="camera-reverse" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Exercise type selector */}
        <View style={styles.exerciseSelector}>
          <TouchableOpacity
            style={[
              styles.exerciseButton,
              exerciseType === 'pushup' && styles.exerciseButtonActive,
            ]}
            onPress={() => setExerciseType('pushup')}
          >
            <MaterialCommunityIcons
              name="arm-flex"
              size={24}
              color={exerciseType === 'pushup' ? '#000' : '#FFF'}
            />
            <Text
              style={[
                styles.exerciseButtonText,
                exerciseType === 'pushup' && styles.exerciseButtonTextActive,
              ]}
            >
              Push-ups
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.exerciseButton,
              exerciseType === 'situp' && styles.exerciseButtonActive,
            ]}
            onPress={() => setExerciseType('situp')}
          >
            <MaterialCommunityIcons
              name="human"
              size={24}
              color={exerciseType === 'situp' ? '#000' : '#FFF'}
            />
            <Text
              style={[
                styles.exerciseButtonText,
                exerciseType === 'situp' && styles.exerciseButtonTextActive,
              ]}
            >
              Sit-ups
            </Text>
          </TouchableOpacity>
        </View>

        {/* Rep counter display */}
        <View style={styles.repDisplay}>
          <Animated.View
            style={[
              styles.repCounter,
              { transform: [{ scale: repScale }] },
            ]}
          >
            <Text style={styles.repNumber}>{repCount}</Text>
            <Text style={styles.repLabel}>REPS</Text>
          </Animated.View>

          {/* Pose phase indicator */}
          {isTracking && (
            <View style={styles.phaseIndicator}>
              <View
                style={[
                  styles.phaseDot,
                  posePhase === 'up' && styles.phaseDotActive,
                ]}
              />
              <Text style={styles.phaseText}>
                {posePhase === 'up' ? 'UP' : 'DOWN'}
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
          {/* End workout button */}
          <TouchableOpacity
            style={styles.endButton}
            onPress={endWorkout}
          >
            <Ionicons name="stop" size={28} color="#FF4444" />
            <Text style={styles.endButtonText}>END</Text>
          </TouchableOpacity>

          {/* Main TAP FOR REP button - now the primary action */}
          <TouchableOpacity
            style={styles.mainRepButton}
            onPress={handleManualRep}
            activeOpacity={0.7}
          >
            <View style={styles.mainRepButtonInner}>
              <Ionicons name="add-circle" size={48} color="#000" />
              <Text style={styles.mainRepButtonText}>TAP FOR REP</Text>
            </View>
          </TouchableOpacity>

          {/* Camera flip button */}
          <TouchableOpacity
            style={styles.flipButton}
            onPress={toggleCameraFacing}
          >
            <Ionicons name="camera-reverse" size={28} color="#FFF" />
            <Text style={styles.flipButtonText}>FLIP</Text>
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
  poseOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  poseGuide: {
    width: 150,
    height: 200,
    borderWidth: 2,
    borderColor: 'rgba(255, 215, 0, 0.5)',
    borderRadius: 20,
    borderStyle: 'dashed',
  },
  bodyOutline: {
    flex: 1,
    position: 'relative',
  },
  jointDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#FFF',
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
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  walletCoins: {
    color: '#FFD700',
    fontSize: 18,
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
    top: height * 0.25,
    alignSelf: 'center',
    alignItems: 'center',
  },
  repCounter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderWidth: 4,
    borderColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
  },
  repNumber: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  repLabel: {
    fontSize: 14,
    color: '#888',
    marginTop: -4,
  },
  phaseIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  phaseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#666',
    marginRight: 8,
  },
  phaseDotActive: {
    backgroundColor: '#4CAF50',
  },
  phaseText: {
    color: '#FFF',
    fontWeight: '600',
  },
  flyingCoin: {
    position: 'absolute',
    top: height * 0.55,
    alignSelf: 'center',
    zIndex: 100,
  },
  coinIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#B8860B',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 10,
  },
  coinText: {
    fontSize: 24,
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingTop: 16,
  },
  endButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
    borderWidth: 2,
    borderColor: '#FF4444',
  },
  endButtonText: {
    color: '#FF4444',
    fontSize: 9,
    marginTop: 2,
    fontWeight: 'bold',
  },
  mainRepButton: {
    flex: 1,
    marginHorizontal: 16,
  },
  mainRepButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD700',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 30,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  mainRepButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  flipButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: '#666',
  },
  flipButtonText: {
    color: '#FFF',
    fontSize: 9,
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
