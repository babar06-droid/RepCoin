import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

// Default motivation phrases to record
const MOTIVATION_SLOTS = [
  { id: 'phrase1', label: 'Phrase 1', suggestion: '"YEAH BABY!"' },
  { id: 'phrase2', label: 'Phrase 2', suggestion: '"LET\'S GO!"' },
  { id: 'phrase3', label: 'Phrase 3', suggestion: '"KEEP PUSHING!"' },
  { id: 'phrase4', label: 'Phrase 4', suggestion: '"BEAST MODE!"' },
  { id: 'phrase5', label: 'Phrase 5', suggestion: '"YOU GOT THIS!"' },
];

const RECORDINGS_DIR = (FileSystem.documentDirectory || '') + 'voice_recordings/';
const STORAGE_KEY = 'custom_voice_recordings';

interface RecordingInfo {
  id: string;
  uri: string;
  duration: number;
}

export default function VoiceStudioScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [recordings, setRecordings] = useState<Record<string, RecordingInfo>>({});
  const [currentRecording, setCurrentRecording] = useState<Audio.Recording | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [permissionStatus, setPermissionStatus] = useState<boolean>(false);
  
  const soundRef = useRef<Audio.Sound | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const durationInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setupAudio();
    loadRecordings();
    
    return () => {
      if (currentRecording) {
        currentRecording.stopAndUnloadAsync();
      }
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isRecording) {
      // Pulse animation while recording
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  const setupAudio = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      setPermissionStatus(status === 'granted');
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
      
      // Ensure recordings directory exists
      const dirInfo = await FileSystem.getInfoAsync(RECORDINGS_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });
      }
    } catch (error) {
      console.log('Audio setup error:', error);
    }
  };

  const loadRecordings = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Verify files still exist
        const verified: Record<string, RecordingInfo> = {};
        for (const [id, info] of Object.entries(parsed) as [string, RecordingInfo][]) {
          const fileInfo = await FileSystem.getInfoAsync(info.uri);
          if (fileInfo.exists) {
            verified[id] = info;
          }
        }
        setRecordings(verified);
      }
    } catch (error) {
      console.log('Load recordings error:', error);
    }
  };

  const saveRecordings = async (newRecordings: Record<string, RecordingInfo>) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newRecordings));
    } catch (error) {
      console.log('Save recordings error:', error);
    }
  };

  const startRecording = async (phraseId: string) => {
    if (!permissionStatus) {
      Alert.alert('Permission Required', 'Please grant microphone access to record.');
      return;
    }

    try {
      // Stop any playing sound
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
        setIsPlaying(null);
      }

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      
      setCurrentRecording(recording);
      setRecordingId(phraseId);
      setIsRecording(true);
      setRecordingDuration(0);
      
      // Track duration
      durationInterval.current = setInterval(() => {
        setRecordingDuration(prev => prev + 0.1);
      }, 100);
      
    } catch (error) {
      console.log('Start recording error:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!currentRecording || !recordingId) return;

    try {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }

      await currentRecording.stopAndUnloadAsync();
      const uri = currentRecording.getURI();
      
      if (uri) {
        // Move to permanent location
        const newUri = RECORDINGS_DIR + `${recordingId}_${Date.now()}.m4a`;
        await FileSystem.moveAsync({ from: uri, to: newUri });
        
        const newRecording: RecordingInfo = {
          id: recordingId,
          uri: newUri,
          duration: recordingDuration,
        };
        
        // Delete old recording if exists
        if (recordings[recordingId]) {
          try {
            await FileSystem.deleteAsync(recordings[recordingId].uri, { idempotent: true });
          } catch {}
        }
        
        const updated = { ...recordings, [recordingId]: newRecording };
        setRecordings(updated);
        await saveRecordings(updated);
      }
      
      setCurrentRecording(null);
      setRecordingId(null);
      setIsRecording(false);
      setRecordingDuration(0);
      
    } catch (error) {
      console.log('Stop recording error:', error);
      Alert.alert('Error', 'Failed to save recording');
    }
  };

  const playRecording = async (phraseId: string) => {
    const recording = recordings[phraseId];
    if (!recording) return;

    try {
      // Stop any current playback
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      if (isPlaying === phraseId) {
        setIsPlaying(null);
        return;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: recording.uri },
        { shouldPlay: true }
      );
      
      soundRef.current = sound;
      setIsPlaying(phraseId);
      
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(null);
        }
      });
      
    } catch (error) {
      console.log('Play error:', error);
      setIsPlaying(null);
    }
  };

  const deleteRecording = async (phraseId: string) => {
    Alert.alert(
      'Delete Recording',
      'Are you sure you want to delete this recording?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (recordings[phraseId]) {
                await FileSystem.deleteAsync(recordings[phraseId].uri, { idempotent: true });
                const updated = { ...recordings };
                delete updated[phraseId];
                setRecordings(updated);
                await saveRecordings(updated);
              }
            } catch (error) {
              console.log('Delete error:', error);
            }
          },
        },
      ]
    );
  };

  const formatDuration = (seconds: number) => {
    return `${Math.floor(seconds)}:${Math.floor((seconds % 1) * 10)}`;
  };

  const recordedCount = Object.keys(recordings).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Voice Studio</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="mic" size={32} color="#FFD700" />
          <Text style={styles.infoTitle}>Record Your Voice</Text>
          <Text style={styles.infoText}>
            Record custom motivation phrases that play every 10 reps during your workout.
            Make it personal and powerful!
          </Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${(recordedCount / 5) * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>{recordedCount}/5 phrases recorded</Text>
        </View>

        {/* Recording Slots */}
        <Text style={styles.sectionTitle}>Your Motivation Phrases</Text>
        
        {MOTIVATION_SLOTS.map((slot) => {
          const hasRecording = !!recordings[slot.id];
          const isThisRecording = recordingId === slot.id && isRecording;
          const isThisPlaying = isPlaying === slot.id;
          
          return (
            <View key={slot.id} style={styles.slotCard}>
              <View style={styles.slotHeader}>
                <View style={styles.slotInfo}>
                  <Text style={styles.slotLabel}>{slot.label}</Text>
                  <Text style={styles.slotSuggestion}>
                    {hasRecording 
                      ? `✓ Recorded (${formatDuration(recordings[slot.id].duration)}s)`
                      : `Suggestion: ${slot.suggestion}`
                    }
                  </Text>
                </View>
                
                {hasRecording && (
                  <TouchableOpacity 
                    style={styles.deleteBtn}
                    onPress={() => deleteRecording(slot.id)}
                  >
                    <Ionicons name="trash-outline" size={20} color="#FF4444" />
                  </TouchableOpacity>
                )}
              </View>
              
              <View style={styles.slotActions}>
                {/* Record Button */}
                <TouchableOpacity
                  style={[
                    styles.recordBtn,
                    isThisRecording && styles.recordingActive,
                  ]}
                  onPress={() => isThisRecording ? stopRecording() : startRecording(slot.id)}
                  disabled={isRecording && !isThisRecording}
                >
                  <Animated.View style={isThisRecording ? { transform: [{ scale: pulseAnim }] } : {}}>
                    <Ionicons 
                      name={isThisRecording ? 'stop' : 'mic'} 
                      size={24} 
                      color={isThisRecording ? '#FFF' : '#FF4444'} 
                    />
                  </Animated.View>
                  <Text style={[styles.recordBtnText, isThisRecording && styles.recordingText]}>
                    {isThisRecording ? `Recording ${formatDuration(recordingDuration)}` : 'Record'}
                  </Text>
                </TouchableOpacity>
                
                {/* Play Button */}
                {hasRecording && (
                  <TouchableOpacity
                    style={[styles.playBtn, isThisPlaying && styles.playingActive]}
                    onPress={() => playRecording(slot.id)}
                  >
                    <Ionicons 
                      name={isThisPlaying ? 'stop' : 'play'} 
                      size={24} 
                      color="#4CAF50" 
                    />
                    <Text style={styles.playBtnText}>
                      {isThisPlaying ? 'Stop' : 'Play'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        {/* Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>💡 Recording Tips</Text>
          <Text style={styles.tipText}>• Speak loudly and clearly</Text>
          <Text style={styles.tipText}>• Keep phrases short (1-3 seconds)</Text>
          <Text style={styles.tipText}>• Use an energetic, motivating tone</Text>
          <Text style={styles.tipText}>• Record in a quiet environment</Text>
        </View>
      </ScrollView>

      {/* Permission Warning */}
      {!permissionStatus && (
        <View style={styles.permissionBanner}>
          <Ionicons name="warning" size={20} color="#FFD700" />
          <Text style={styles.permissionText}>
            Microphone permission required for recording
          </Text>
          <TouchableOpacity onPress={setupAudio}>
            <Text style={styles.permissionLink}>Grant</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  infoCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
    marginTop: 12,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#AAA',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 16,
  },
  slotCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  slotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  slotInfo: {
    flex: 1,
  },
  slotLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  slotSuggestion: {
    fontSize: 13,
    color: '#888',
  },
  deleteBtn: {
    padding: 8,
  },
  slotActions: {
    flexDirection: 'row',
    gap: 12,
  },
  recordBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,68,68,0.1)',
    borderWidth: 1,
    borderColor: '#FF4444',
  },
  recordingActive: {
    backgroundColor: '#FF4444',
    borderColor: '#FF4444',
  },
  recordBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF4444',
  },
  recordingText: {
    color: '#FFF',
  },
  playBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(76,175,80,0.1)',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  playingActive: {
    backgroundColor: '#4CAF50',
  },
  playBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  tipsCard: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 13,
    color: '#CCC',
    marginVertical: 2,
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,215,0,0.1)',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  permissionText: {
    fontSize: 13,
    color: '#FFD700',
  },
  permissionLink: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
});
