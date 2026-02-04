import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  Vibration,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

const { width, height } = Dimensions.get('window');
const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const REP_POINTS_KEY = '@rep_points';

type ExerciseType = 'pushup' | 'situp';
type CountDirection = 'up' | 'down';
type CountMode = 'manual' | 'auto';

interface CoinAnimation {
  id: number;
  translateY: Animated.Value;
  translateX: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
}

const MOTIVATION_PHRASES = [
  "YEAH BABY!",
  "LET'S GOOO!",
  "KEEP PUSHING!",
  "YOU GOT THIS!",
  "BEAST MODE!",
  "CRUSHING IT!",
  "UNSTOPPABLE!",
  "POWER UP!",
  "NO LIMITS!",
  "BRING IT!",
  "FEEL THE BURN!",
  "CHAMPION!",
];

const VOICE_STORAGE_KEY = 'custom_voice_recordings_v2';

interface RecordingInfo {
  id: string;
  uri: string;
}

export default function WorkoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');

  const [exerciseType, setExerciseType] = useState<ExerciseType>('pushup');
  const [countDirection, setCountDirection] = useState<CountDirection>('up');
  const [countMode, setCountMode] = useState<CountMode>('manual');
  const [autoInterval, setAutoInterval] = useState('2'); // seconds between auto reps
  const [targetReps, setTargetReps] = useState('20');
  const [currentRep, setCurrentRep] = useState(0);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [coinAnimations, setCoinAnimations] = useState<CoinAnimation[]>([]);
  const [sessionStats, setSessionStats] = useState({ pushups: 0, situps: 0 });
  const [isWorkoutStarted, setIsWorkoutStarted] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const coinIdRef = useRef(0);
  const chachingSoundRef = useRef<Audio.Sound | null>(null);
  const motivationSoundRef = useRef<Audio.Sound | null>(null);
  const repScale = useRef(new Animated.Value(1)).current;
  const walletScale = useRef(new Animated.Value(1)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const countdownScale = useRef(new Animated.Value(1)).current;
  const autoTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Custom voice recordings
  const [customRecordings, setCustomRecordings] = useState<RecordingInfo[]>([]);
  const customRecordingsRef = useRef<RecordingInfo[]>([]);
  const customRecordingIndexRef = useRef(0);

  // Video recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideoUri, setRecordedVideoUri] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();

  useEffect(() => {
    loadSound();
    loadCustomRecordings();
    return () => {
      if (chachingSoundRef.current) chachingSoundRef.current.unloadAsync();
      if (motivationSoundRef.current) motivationSoundRef.current.unloadAsync();
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      Speech.stop();
    };
  }, []);

  const loadCustomRecordings = async () => {
    try {
      const stored = await AsyncStorage.getItem(VOICE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const recordings = Object.values(parsed) as RecordingInfo[];
        setCustomRecordings(recordings);
        customRecordingsRef.current = recordings; // Also set ref for use in intervals
        console.log(`Loaded ${recordings.length} custom voice recordings`);
      }
    } catch (error) {
      console.log('Load custom recordings error:', error);
    }
  };

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
      console.log('Sound load error:', error);
    }
  };

  const playCoinSound = async () => {
    try {
      if (chachingSoundRef.current) {
        await chachingSoundRef.current.setPositionAsync(0);
        await chachingSoundRef.current.playAsync();
      }
    } catch (error) {
      console.log('Sound play error:', error);
    }
  };

  // Video Recording Functions
  const startRecording = async () => {
    if (!cameraRef.current || Platform.OS === 'web') {
      Alert.alert('Not Available', 'Video recording is only available on mobile devices (Expo Go)');
      return;
    }

    try {
      setIsRecording(true);
      setRecordingDuration(0);
      
      // Start duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      const video = await cameraRef.current.recordAsync({
        maxDuration: 60, // Max 60 seconds
      });
      
      if (video?.uri) {
        setRecordedVideoUri(video.uri);
        setShowShareModal(true);
      }
    } catch (error) {
      console.log('Recording error:', error);
      Alert.alert('Recording Error', 'Could not start video recording');
    } finally {
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  const stopRecording = async () => {
    if (cameraRef.current && isRecording) {
      try {
        await cameraRef.current.stopRecording();
      } catch (error) {
        console.log('Stop recording error:', error);
      }
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
  };

  const saveAndShareVideo = async () => {
    if (!recordedVideoUri) return;

    try {
      // Request media library permission if needed
      if (!mediaLibraryPermission?.granted) {
        const { granted } = await requestMediaLibraryPermission();
        if (!granted) {
          Alert.alert('Permission Required', 'Please allow access to save the video');
          return;
        }
      }

      // Save to media library
      const asset = await MediaLibrary.createAssetAsync(recordedVideoUri);
      
      // Check if sharing is available
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(recordedVideoUri, {
          mimeType: 'video/mp4',
          dialogTitle: `🔥 ${currentRep} ${exerciseType === 'pushup' ? 'Push-ups' : 'Sit-ups'} Challenge! Can you beat this?`,
        });
      } else {
        Alert.alert('Video Saved!', 'Your workout video has been saved to your gallery. Share it manually to challenge your friends!');
      }

      setShowShareModal(false);
      setRecordedVideoUri(null);
    } catch (error) {
      console.log('Save/Share error:', error);
      Alert.alert('Error', 'Could not save or share the video');
    }
  };

  const discardVideo = () => {
    setShowShareModal(false);
    setRecordedVideoUri(null);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const speakMotivation = async (phrase: string) => {
    // Try to play custom recording first - use ref for reliable access in intervals
    const recordings = customRecordingsRef.current;
    
    if (recordings.length > 0) {
      try {
        // Stop any previous motivation sound
        if (motivationSoundRef.current) {
          await motivationSoundRef.current.unloadAsync();
          motivationSoundRef.current = null;
        }
        
        // Get next recording in rotation
        const recording = recordings[customRecordingIndexRef.current % recordings.length];
        customRecordingIndexRef.current++;
        
        console.log('Playing custom voice:', recording.uri);
        
        const { sound } = await Audio.Sound.createAsync(
          { uri: recording.uri },
          { shouldPlay: true, volume: 1.0 }
        );
        motivationSoundRef.current = sound;
        console.log('Playing custom voice recording');
        return;
      } catch (error) {
        console.log('Custom recording playback error:', error);
        // Fall back to text-to-speech
      }
    }
    
    // Fallback: Big, strong, powerful voice settings
    Speech.speak(phrase, {
      language: 'en-US',
      pitch: 0.8,    // Lower pitch for deeper voice
      rate: 0.85,    // Slightly slower for more impact
      volume: 1.0,   // Full volume
    });
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
        Animated.timing(walletScale, { toValue: 1.3, duration: 100, useNativeDriver: true }),
        Animated.timing(walletScale, { toValue: 1, duration: 100, useNativeDriver: true }),
      ]).start();
    });
  };

  const animateButton = () => {
    Animated.sequence([
      Animated.timing(buttonScale, { toValue: 0.9, duration: 50, useNativeDriver: true }),
      Animated.timing(buttonScale, { toValue: 1, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const animateRepCounter = () => {
    Animated.sequence([
      Animated.timing(repScale, { toValue: 1.3, duration: 100, useNativeDriver: true }),
      Animated.timing(repScale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  const animateCountdown = () => {
    countdownScale.setValue(1.5);
    Animated.timing(countdownScale, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  };

  // Stop auto counter
  const stopAutoCounter = () => {
    if (autoTimerRef.current) {
      clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  };

  const handleRepCount = useCallback(() => {
    if (isCompleted) return;

    animateButton();
    animateRepCounter();
    Vibration.vibrate(50);

    const target = parseInt(targetReps) || 0;
    let newRep: number;
    let totalRepsCompleted: number;

    if (countDirection === 'up') {
      newRep = currentRep + 1;
      totalRepsCompleted = newRep;
    } else {
      // Counting down
      newRep = currentRep - 1;
      totalRepsCompleted = target - newRep; // How many reps done
    }

    setCurrentRep(newRep);

    // Update session stats
    setSessionStats((prev) => ({
      ...prev,
      [exerciseType === 'pushup' ? 'pushups' : 'situps']: 
        prev[exerciseType === 'pushup' ? 'pushups' : 'situps'] + 1,
    }));

    // Every 5 reps - coin sound and animation
    if (totalRepsCompleted > 0 && totalRepsCompleted % 5 === 0) {
      playCoinSound();
      animateCoin();
      setCoinsEarned((prev) => prev + 1);
    }

    // Every 10 reps - verbal motivation
    if (totalRepsCompleted > 0 && totalRepsCompleted % 10 === 0) {
      const randomPhrase = MOTIVATION_PHRASES[Math.floor(Math.random() * MOTIVATION_PHRASES.length)];
      speakMotivation(randomPhrase);
    }

    // Check if workout is complete
    if (countDirection === 'up' && newRep >= target) {
      setIsCompleted(true);
      stopAutoCounter();
      speakMotivation("WORKOUT COMPLETE! YOU'RE A CHAMPION!");
      playCoinSound();
      animateCoin();
      setCoinsEarned((prev) => prev + 2); // Bonus coins for completion
    } else if (countDirection === 'down' && newRep <= 0) {
      setIsCompleted(true);
      stopAutoCounter();
      speakMotivation("WORKOUT COMPLETE! YOU'RE A CHAMPION!");
      playCoinSound();
      animateCoin();
      setCoinsEarned((prev) => prev + 2); // Bonus coins for completion
    }

    // Save rep to backend (both old endpoint and new REP points endpoint)
    fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/reps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercise_type: exerciseType, coins_earned: totalRepsCompleted % 5 === 0 ? 1 : 0 }),
    }).catch(() => {});
    
    // Also increment REP points
    fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/add_rep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});

  }, [currentRep, countDirection, targetReps, exerciseType, isCompleted]);

  // Start auto counting with interval - must be after handleRepCount
  const startAutoCounter = useCallback(() => {
    const intervalMs = (parseFloat(autoInterval) || 2) * 1000;
    autoTimerRef.current = setInterval(() => {
      // Use functional update to avoid stale state
      setCurrentRep((prevRep) => {
        const target = parseInt(targetReps) || 0;
        let newRep: number;
        let totalRepsCompleted: number;

        if (countDirection === 'up') {
          newRep = prevRep + 1;
          totalRepsCompleted = newRep;
        } else {
          newRep = prevRep - 1;
          totalRepsCompleted = target - newRep;
        }

        // Animations and sounds
        animateButton();
        animateRepCounter();
        Vibration.vibrate(50);

        // Update session stats
        setSessionStats((prev) => ({
          ...prev,
          [exerciseType === 'pushup' ? 'pushups' : 'situps']: 
            prev[exerciseType === 'pushup' ? 'pushups' : 'situps'] + 1,
        }));

        // Every 5 reps - coin sound and animation
        if (totalRepsCompleted > 0 && totalRepsCompleted % 5 === 0) {
          playCoinSound();
          animateCoin();
          setCoinsEarned((prev) => prev + 1);
        }

        // Every 10 reps - verbal motivation
        if (totalRepsCompleted > 0 && totalRepsCompleted % 10 === 0) {
          const randomPhrase = MOTIVATION_PHRASES[Math.floor(Math.random() * MOTIVATION_PHRASES.length)];
          speakMotivation(randomPhrase);
        }

        // Check if workout is complete
        if (countDirection === 'up' && newRep >= target) {
          setIsCompleted(true);
          stopAutoCounter();
          speakMotivation("WORKOUT COMPLETE! YOU'RE A CHAMPION!");
          playCoinSound();
          animateCoin();
          setCoinsEarned((prev) => prev + 2);
        } else if (countDirection === 'down' && newRep <= 0) {
          setIsCompleted(true);
          stopAutoCounter();
          speakMotivation("WORKOUT COMPLETE! YOU'RE A CHAMPION!");
          playCoinSound();
          animateCoin();
          setCoinsEarned((prev) => prev + 2);
        }

        // Save rep to backend
        fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/reps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exercise_type: exerciseType, coins_earned: totalRepsCompleted % 5 === 0 ? 1 : 0 }),
        }).catch(() => {});

        return newRep;
      });
    }, intervalMs);
  }, [autoInterval, countDirection, targetReps, exerciseType]);

  // Pause/Resume for auto mode
  const togglePause = () => {
    if (isPaused) {
      // Resume
      setIsPaused(false);
      startAutoCounter();
    } else {
      // Pause
      setIsPaused(true);
      stopAutoCounter();
    }
  };

  const startWorkout = () => {
    const target = parseInt(targetReps) || 20;
    if (countDirection === 'down') {
      setCurrentRep(target);
    } else {
      setCurrentRep(0);
    }
    setIsWorkoutStarted(true);
    setIsCompleted(false);
    setCoinsEarned(0);
    setSessionStats({ pushups: 0, situps: 0 });
    setIsPaused(false);
    
    // If auto mode, start 3 second countdown
    if (countMode === 'auto') {
      setCountdown(3);
      animateCountdown();
      
      setTimeout(() => {
        setCountdown(2);
        animateCountdown();
      }, 1000);
      
      setTimeout(() => {
        setCountdown(1);
        animateCountdown();
      }, 2000);
      
      setTimeout(() => {
        setCountdown(null);
        speakMotivation("GO!");
        startAutoCounter();
      }, 3000);
    } else {
      speakMotivation("LET'S GO!");
    }
  };

  const resetWorkout = () => {
    stopAutoCounter();
    setIsWorkoutStarted(false);
    setIsCompleted(false);
    setCurrentRep(0);
    setCountdown(null);
    setIsPaused(false);
  };

  const endWorkout = async () => {
    stopAutoCounter();
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

  const getDisplayCount = () => {
    return currentRep;
  };

  const getProgress = () => {
    const target = parseInt(targetReps) || 1;
    if (countDirection === 'up') {
      return Math.min(currentRep / target, 1);
    } else {
      return Math.min((target - currentRep) / target, 1);
    }
  };

  // Setup screen (before workout starts)
  if (!isWorkoutStarted) {
    return (
      <KeyboardAvoidingView 
        style={[styles.container, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.setupContainer}>
          {/* Header */}
          <View style={styles.setupHeader}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.setupTitle}>Setup Workout</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Exercise Type */}
          <Text style={styles.sectionLabel}>Exercise Type</Text>
          <View style={styles.exerciseSelector}>
            <TouchableOpacity
              style={[styles.exerciseBtn, exerciseType === 'pushup' && styles.exerciseBtnActive]}
              onPress={() => setExerciseType('pushup')}
            >
              <MaterialCommunityIcons name="arm-flex" size={28} color={exerciseType === 'pushup' ? '#000' : '#FFF'} />
              <Text style={[styles.exerciseBtnText, exerciseType === 'pushup' && styles.exerciseBtnTextActive]}>Push-ups</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.exerciseBtn, exerciseType === 'situp' && styles.exerciseBtnActive]}
              onPress={() => setExerciseType('situp')}
            >
              <MaterialCommunityIcons name="human" size={28} color={exerciseType === 'situp' ? '#000' : '#FFF'} />
              <Text style={[styles.exerciseBtnText, exerciseType === 'situp' && styles.exerciseBtnTextActive]}>Sit-ups</Text>
            </TouchableOpacity>
          </View>

          {/* Target Reps */}
          <Text style={styles.sectionLabel}>Target Reps</Text>
          <TextInput
            style={styles.repInput}
            value={targetReps}
            onChangeText={setTargetReps}
            keyboardType="number-pad"
            placeholder="20"
            placeholderTextColor="#666"
            maxLength={3}
          />

          {/* Count Direction */}
          <Text style={styles.sectionLabel}>Count Direction</Text>
          <View style={styles.directionSelector}>
            <TouchableOpacity
              style={[styles.directionBtn, countDirection === 'up' && styles.directionBtnActive]}
              onPress={() => setCountDirection('up')}
            >
              <Ionicons name="arrow-up" size={24} color={countDirection === 'up' ? '#000' : '#FFF'} />
              <Text style={[styles.directionBtnText, countDirection === 'up' && styles.directionBtnTextActive]}>
                Count UP{'\n'}0 → {targetReps || '20'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.directionBtn, countDirection === 'down' && styles.directionBtnActive]}
              onPress={() => setCountDirection('down')}
            >
              <Ionicons name="arrow-down" size={24} color={countDirection === 'down' ? '#000' : '#FFF'} />
              <Text style={[styles.directionBtnText, countDirection === 'down' && styles.directionBtnTextActive]}>
                Count DOWN{'\n'}{targetReps || '20'} → 0
              </Text>
            </TouchableOpacity>
          </View>

          {/* Count Mode */}
          <Text style={styles.sectionLabel}>Count Mode</Text>
          <View style={styles.directionSelector}>
            <TouchableOpacity
              style={[styles.directionBtn, countMode === 'manual' && styles.directionBtnActive]}
              onPress={() => setCountMode('manual')}
            >
              <Ionicons name="hand-left" size={24} color={countMode === 'manual' ? '#000' : '#FFF'} />
              <Text style={[styles.directionBtnText, countMode === 'manual' && styles.directionBtnTextActive]}>
                Manual{'\n'}Tap to count
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.directionBtn, countMode === 'auto' && styles.autoModeActive]}
              onPress={() => setCountMode('auto')}
            >
              <Ionicons name="timer" size={24} color={countMode === 'auto' ? '#000' : '#FFF'} />
              <Text style={[styles.directionBtnText, countMode === 'auto' && styles.directionBtnTextActive]}>
                Auto{'\n'}Timed counter
              </Text>
            </TouchableOpacity>
          </View>

          {/* Auto Interval (only shown in auto mode) */}
          {countMode === 'auto' && (
            <>
              <Text style={styles.sectionLabel}>Seconds per Rep</Text>
              <View style={styles.intervalSelector}>
                {['1', '2', '3', '4', '5'].map((sec) => (
                  <TouchableOpacity
                    key={sec}
                    style={[styles.intervalBtn, autoInterval === sec && styles.intervalBtnActive]}
                    onPress={() => setAutoInterval(sec)}
                  >
                    <Text style={[styles.intervalBtnText, autoInterval === sec && styles.intervalBtnTextActive]}>
                      {sec}s
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Rewards Info */}
          <View style={styles.rewardsInfo}>
            <Text style={styles.rewardsTitle}>🎁 Rewards</Text>
            <Text style={styles.rewardsText}>💰 Every 5 reps = Coin sound + animation</Text>
            <Text style={styles.rewardsText}>🎤 Every 10 reps = Verbal motivation</Text>
            <Text style={styles.rewardsText}>🏆 Complete workout = Bonus coins!</Text>
          </View>

          {/* Simulate Rep Button - for quick testing */}
          <TouchableOpacity 
            style={styles.simulateRepBtn} 
            onPress={async () => {
              try {
                const res = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/add_rep`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                });
                const data = await res.json();
                // Vibrate for feedback instead of popup
                Vibration.vibrate(100);
              } catch (e) {
                console.log('Error adding rep');
              }
            }}
          >
            <Ionicons name="add-circle" size={24} color="#4CAF50" />
            <Text style={styles.simulateRepBtnText}>Simulate Rep (+1 REP Point)</Text>
          </TouchableOpacity>

          {/* Start Button */}
          <TouchableOpacity style={styles.startBtn} onPress={startWorkout}>
            <Ionicons name="fitness" size={28} color="#000" />
            <Text style={styles.startBtnText}>START WORKOUT</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Active workout screen
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Share Video Modal */}
      <Modal
        visible={showShareModal}
        transparent={true}
        animationType="slide"
        onRequestClose={discardVideo}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.shareModal}>
            <Text style={styles.shareModalTitle}>🎬 Workout Recorded!</Text>
            <Text style={styles.shareModalSubtitle}>
              {currentRep} {exerciseType === 'pushup' ? 'Push-ups' : 'Sit-ups'} Challenge
            </Text>
            <Text style={styles.shareModalText}>
              Share this video and challenge your friends to beat your record!
            </Text>
            
            <TouchableOpacity style={styles.shareBtn} onPress={saveAndShareVideo}>
              <Ionicons name="share-social" size={24} color="#000" />
              <Text style={styles.shareBtnText}>Share Challenge</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.discardBtn} onPress={discardVideo}>
              <Text style={styles.discardBtnText}>Discard Video</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Camera Background */}
      {permission?.granted ? (
        <CameraView 
          ref={cameraRef}
          style={styles.cameraBackground}
          facing={cameraFacing}
          mode="video"
        >
          {/* Camera Overlay UI */}
          <View style={styles.cameraOverlay}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity style={styles.headerBtn} onPress={resetWorkout}>
                <Ionicons name="arrow-back" size={24} color="#FFF" />
              </TouchableOpacity>
              
              <Animated.View style={[styles.walletBadge, { transform: [{ scale: walletScale }] }]}>
                <Ionicons name="wallet" size={24} color="#FFD700" />
                <Text style={styles.walletText}>{coinsEarned}</Text>
              </Animated.View>

              <TouchableOpacity style={styles.headerBtn} onPress={endWorkout}>
                <Ionicons name="stop-circle" size={24} color="#FF4444" />
              </TouchableOpacity>
            </View>

            {/* Exercise Badge & Camera Flip & Record Button */}
            <View style={styles.topControls}>
              <View style={styles.exerciseBadge}>
                <MaterialCommunityIcons 
                  name={exerciseType === 'pushup' ? 'arm-flex' : 'human'} 
                  size={20} 
                  color="#FFD700" 
                />
                <Text style={styles.exerciseBadgeText}>
                  {exerciseType === 'pushup' ? 'PUSH-UPS' : 'SIT-UPS'}
                </Text>
              </View>
              
              {/* Record Video Button */}
              <TouchableOpacity 
                style={[styles.recordBtn, isRecording && styles.recordingActive]}
                onPress={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? (
                  <>
                    <View style={styles.recordingIndicator} />
                    <Text style={styles.recordingText}>{formatDuration(recordingDuration)}</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="videocam" size={20} color="#FFF" />
                    <Text style={styles.recordBtnText}>REC</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.flipCameraBtn}
                onPress={() => setCameraFacing(prev => prev === 'front' ? 'back' : 'front')}
              >
                <Ionicons name="camera-reverse" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { width: `${getProgress() * 100}%` }]} />
            </View>

            {/* Main Counter Display */}
            <View style={styles.counterContainer}>
              {/* Countdown overlay */}
              {countdown !== null && (
                <Animated.View style={[styles.countdownOverlay, { transform: [{ scale: countdownScale }] }]}>
                  <Text style={styles.countdownNumber}>{countdown}</Text>
                  <Text style={styles.countdownLabel}>GET READY!</Text>
                </Animated.View>
              )}
              
              {countdown === null && (
                <Animated.View style={[styles.counterCircle, { transform: [{ scale: repScale }] }]}>
                  <Text style={styles.counterNumber}>{getDisplayCount()}</Text>
                  <Text style={styles.counterLabel}>
                    {countDirection === 'up' ? `of ${targetReps}` : 'remaining'}
                  </Text>
                </Animated.View>
              )}
            </View>

            {/* Completion Message */}
            {isCompleted && (
              <View style={styles.completionBanner}>
                <Text style={styles.completionText}>🎉 WORKOUT COMPLETE! 🎉</Text>
                <Text style={styles.completionSubtext}>+{coinsEarned} coins earned!</Text>
              </View>
            )}

            {/* Coin Animations */}
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

            {/* Big Tap Button / Auto Mode Controls */}
            <View style={styles.bottomSection}>
              {!isCompleted ? (
                countMode === 'manual' ? (
                  // Manual mode - tap button
                  <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                    <TouchableOpacity 
                      style={styles.tapButton} 
                      onPress={handleRepCount}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.tapButtonText}>TAP</Text>
                      <Text style={styles.tapButtonSubtext}>for each rep</Text>
                    </TouchableOpacity>
                  </Animated.View>
                ) : (
                  // Auto mode - pause/resume button
                  countdown === null && (
                    <TouchableOpacity 
                      style={[styles.tapButton, isPaused && styles.pausedButton]} 
                      onPress={togglePause}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={isPaused ? 'play' : 'pause'} size={48} color="#000" />
                      <Text style={styles.tapButtonSubtext}>{isPaused ? 'Resume' : 'Pause'}</Text>
                    </TouchableOpacity>
                  )
                )
              ) : (
                <TouchableOpacity style={styles.finishButton} onPress={endWorkout}>
                  <Ionicons name="trophy" size={32} color="#000" />
                  <Text style={styles.finishButtonText}>VIEW RESULTS</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </CameraView>
      ) : (
        // No camera permission - show regular UI without camera
        <View style={styles.noCameraContainer}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={resetWorkout}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            
            <Animated.View style={[styles.walletBadge, { transform: [{ scale: walletScale }] }]}>
              <Ionicons name="wallet" size={24} color="#FFD700" />
              <Text style={styles.walletText}>{coinsEarned}</Text>
            </Animated.View>

            <TouchableOpacity style={styles.headerBtn} onPress={endWorkout}>
              <Ionicons name="stop-circle" size={24} color="#FF4444" />
            </TouchableOpacity>
          </View>

          {/* Request permission button */}
          <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
            <Ionicons name="camera" size={32} color="#FFD700" />
            <Text style={styles.permissionText}>Enable Camera</Text>
          </TouchableOpacity>

          {/* Exercise Badge */}
          <View style={styles.exerciseBadge}>
            <MaterialCommunityIcons 
              name={exerciseType === 'pushup' ? 'arm-flex' : 'human'} 
              size={20} 
              color="#FFD700" 
            />
            <Text style={styles.exerciseBadgeText}>
              {exerciseType === 'pushup' ? 'PUSH-UPS' : 'SIT-UPS'}
            </Text>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${getProgress() * 100}%` }]} />
          </View>

          {/* Main Counter Display */}
          <View style={styles.counterContainer}>
            {countdown !== null && (
              <Animated.View style={[styles.countdownOverlay, { transform: [{ scale: countdownScale }] }]}>
                <Text style={styles.countdownNumber}>{countdown}</Text>
                <Text style={styles.countdownLabel}>GET READY!</Text>
              </Animated.View>
            )}
            
            {countdown === null && (
              <Animated.View style={[styles.counterCircle, { transform: [{ scale: repScale }] }]}>
                <Text style={styles.counterNumber}>{getDisplayCount()}</Text>
                <Text style={styles.counterLabel}>
                  {countDirection === 'up' ? `of ${targetReps}` : 'remaining'}
                </Text>
              </Animated.View>
            )}
          </View>

          {/* Completion Message */}
          {isCompleted && (
            <View style={styles.completionBanner}>
              <Text style={styles.completionText}>🎉 WORKOUT COMPLETE! 🎉</Text>
              <Text style={styles.completionSubtext}>+{coinsEarned} coins earned!</Text>
            </View>
          )}

          {/* Coin Animations */}
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

          {/* Big Tap Button / Auto Mode Controls */}
          <View style={styles.bottomSection}>
            {!isCompleted ? (
              countMode === 'manual' ? (
                <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                  <TouchableOpacity 
                    style={styles.tapButton} 
                    onPress={handleRepCount}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.tapButtonText}>TAP</Text>
                    <Text style={styles.tapButtonSubtext}>for each rep</Text>
                  </TouchableOpacity>
                </Animated.View>
              ) : (
                countdown === null && (
                  <TouchableOpacity 
                    style={[styles.tapButton, isPaused && styles.pausedButton]} 
                    onPress={togglePause}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={isPaused ? 'play' : 'pause'} size={48} color="#000" />
                    <Text style={styles.tapButtonSubtext}>{isPaused ? 'Resume' : 'Pause'}</Text>
                  </TouchableOpacity>
                )
              )
            ) : (
              <TouchableOpacity style={styles.finishButton} onPress={endWorkout}>
                <Ionicons name="trophy" size={32} color="#000" />
                <Text style={styles.finishButtonText}>VIEW RESULTS</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0a0a0a' 
  },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  shareModal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 350,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  shareModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 8,
  },
  shareModalSubtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 8,
  },
  shareModalText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFD700',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    width: '100%',
    marginBottom: 12,
  },
  shareBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  discardBtn: {
    paddingVertical: 12,
  },
  discardBtnText: {
    fontSize: 14,
    color: '#888',
  },

  // Record button styles
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,68,68,0.3)',
    borderWidth: 2,
    borderColor: '#FF4444',
  },
  recordingActive: {
    backgroundColor: '#FF4444',
  },
  recordingIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFF',
  },
  recordingText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFF',
  },
  recordBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FF4444',
  },
  
  // Camera styles
  cameraBackground: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  noCameraContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
  },
  flipCameraBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionBtn: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(255,215,0,0.2)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFD700',
    marginVertical: 20,
  },
  permissionText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  
  // Setup Screen
  setupContainer: {
    flexGrow: 1,
    padding: 20,
  },
  setupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
    marginBottom: 12,
    marginTop: 20,
  },
  exerciseSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  exerciseBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: '#333',
  },
  exerciseBtnActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  exerciseBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  exerciseBtnTextActive: {
    color: '#000',
  },
  repInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
    borderWidth: 2,
    borderColor: '#333',
  },
  directionSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  directionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: '#333',
  },
  directionBtnActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  directionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    textAlign: 'center',
  },
  directionBtnTextActive: {
    color: '#000',
  },
  rewardsInfo: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderRadius: 16,
    padding: 16,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  rewardsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 8,
  },
  rewardsText: {
    fontSize: 14,
    color: '#CCC',
    marginVertical: 4,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#FFD700',
    paddingVertical: 20,
    borderRadius: 30,
    marginTop: 30,
  },
  startBtnText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  simulateRepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(76,175,80,0.1)',
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  simulateRepBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },

  // Active Workout Screen
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#FFD700',
    gap: 8,
  },
  walletText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  exerciseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,215,0,0.2)',
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 8,
  },
  exerciseBadgeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  progressContainer: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  counterContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderWidth: 6,
    borderColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterNumber: {
    fontSize: 80,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  counterLabel: {
    fontSize: 16,
    color: '#888',
    marginTop: -8,
  },
  completionBanner: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    alignItems: 'center',
    marginHorizontal: 20,
    borderRadius: 16,
    marginBottom: 20,
  },
  completionText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  completionSubtext: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
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
  },
  coinText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#8B4513',
  },
  bottomSection: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  tapButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  tapButtonText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#000',
  },
  tapButtonSubtext: {
    fontSize: 14,
    color: 'rgba(0,0,0,0.6)',
    marginTop: 4,
  },
  finishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#FFD700',
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: 30,
  },
  finishButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  // Auto mode styles
  autoModeActive: {
    backgroundColor: '#FF9800',
    borderColor: '#FF9800',
  },
  intervalSelector: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  intervalBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#333',
  },
  intervalBtnActive: {
    backgroundColor: '#FF9800',
    borderColor: '#FF9800',
  },
  intervalBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  intervalBtnTextActive: {
    color: '#000',
  },
  countdownOverlay: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,152,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownNumber: {
    fontSize: 100,
    fontWeight: 'bold',
    color: '#000',
  },
  countdownLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginTop: -10,
  },
  pausedButton: {
    backgroundColor: '#4CAF50',
  },
});
