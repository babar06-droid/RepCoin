import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Vibration,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Motivation phrase slots
const MOTIVATION_SLOTS = [
  { id: 'phrase1', label: 'Phrase 1', suggestion: '"YEAH BABY!"' },
  { id: 'phrase2', label: 'Phrase 2', suggestion: '"LET\'S GO!"' },
  { id: 'phrase3', label: 'Phrase 3', suggestion: '"KEEP PUSHING!"' },
  { id: 'phrase4', label: 'Phrase 4', suggestion: '"BEAST MODE!"' },
  { id: 'phrase5', label: 'Phrase 5', suggestion: '"YOU GOT THIS!"' },
];

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
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    setupAudio();
    loadRecordings();
    
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = async () => {
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
      }
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
    } catch {}
  };

  const setupAudio = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      setPermissionGranted(status === 'granted');
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
    } catch (error) {
      console.log('Audio setup error:', error);
    }
  };

  const loadRecordings = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        setRecordings(JSON.parse(stored));
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
    if (!permissionGranted) {
      Alert.alert('Permission Required', 'Please grant microphone access.');
      setupAudio();
      return;
    }

    // Stop any playback
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      } catch {}
    }
    setIsPlaying(null);

    try {
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      
      recordingRef.current = recording;
      setRecordingId(phraseId);
      setIsRecording(true);
      startTimeRef.current = Date.now();
      Vibration.vibrate(50);
      
    } catch (error) {
      console.log('Start recording error:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current || !recordingId) return;

    try {
      setIsRecording(false);
      const duration = (Date.now() - startTimeRef.current) / 1000;
      
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      
      if (uri) {
        const newRecording: RecordingInfo = {
          id: recordingId,
          uri: uri,
          duration: duration,
        };
        
        const updated = { ...recordings, [recordingId]: newRecording };
        setRecordings(updated);
        await saveRecordings(updated);
        Vibration.vibrate(100);
      }
      
      recordingRef.current = null;
      setRecordingId(null);
      
    } catch (error) {
      console.log('Stop recording error:', error);
      setIsRecording(false);
      setRecordingId(null);
    }
  };

  const playRecording = async (phraseId: string) => {
    const recording = recordings[phraseId];
    if (!recording) return;

    // Stop current playback
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      } catch {}
    }

    if (isPlaying === phraseId) {
      setIsPlaying(null);
      return;
    }

    try {
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

  const deleteRecording = (phraseId: string) => {
    Alert.alert('Delete Recording', 'Delete this recording?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const updated = { ...recordings };
          delete updated[phraseId];
          setRecordings(updated);
          await saveRecordings(updated);
        },
      },
    ]);
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
        {/* Info */}
        <View style={styles.infoCard}>
          <Ionicons name="mic" size={32} color="#FFD700" />
          <Text style={styles.infoTitle}>Record Your Voice</Text>
          <Text style={styles.infoText}>
            Record motivation phrases that play every 10 reps.
          </Text>
          <Text style={styles.progressText}>{recordedCount}/5 recorded</Text>
        </View>

        {/* Recording Slots */}
        {MOTIVATION_SLOTS.map((slot) => {
          const hasRecording = !!recordings[slot.id];
          const isThisRecording = recordingId === slot.id && isRecording;
          const isThisPlaying = isPlaying === slot.id;
          
          return (
            <View key={slot.id} style={styles.slotCard}>
              <View style={styles.slotHeader}>
                <Text style={styles.slotLabel}>{slot.label}</Text>
                <Text style={styles.slotStatus}>
                  {hasRecording ? '✓ Recorded' : slot.suggestion}
                </Text>
              </View>
              
              <View style={styles.slotActions}>
                {/* Record/Stop Button */}
                <TouchableOpacity
                  style={[styles.actionBtn, isThisRecording && styles.recordingBtn]}
                  onPress={() => isThisRecording ? stopRecording() : startRecording(slot.id)}
                  disabled={isRecording && !isThisRecording}
                >
                  <Ionicons 
                    name={isThisRecording ? 'stop' : 'mic'} 
                    size={22} 
                    color={isThisRecording ? '#FFF' : '#FF4444'} 
                  />
                  <Text style={[styles.actionBtnText, isThisRecording && styles.recordingText]}>
                    {isThisRecording ? 'Stop' : 'Record'}
                  </Text>
                </TouchableOpacity>
                
                {/* Play Button */}
                {hasRecording && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.playBtn]}
                    onPress={() => playRecording(slot.id)}
                  >
                    <Ionicons 
                      name={isThisPlaying ? 'stop' : 'play'} 
                      size={22} 
                      color="#4CAF50" 
                    />
                    <Text style={styles.playBtnText}>
                      {isThisPlaying ? 'Stop' : 'Play'}
                    </Text>
                  </TouchableOpacity>
                )}
                
                {/* Delete Button */}
                {hasRecording && (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => deleteRecording(slot.id)}
                  >
                    <Ionicons name="trash-outline" size={20} color="#FF4444" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        {/* Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>💡 Tips</Text>
          <Text style={styles.tipText}>• Speak loudly and clearly</Text>
          <Text style={styles.tipText}>• Keep phrases 1-3 seconds</Text>
          <Text style={styles.tipText}>• Use an energetic tone</Text>
        </View>
      </ScrollView>

      {/* Permission Warning */}
      {!permissionGranted && (
        <TouchableOpacity style={styles.permissionBanner} onPress={setupAudio}>
          <Ionicons name="warning" size={20} color="#FFD700" />
          <Text style={styles.permissionText}>Tap to enable microphone</Text>
        </TouchableOpacity>
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
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
    marginTop: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 4,
  },
  progressText: {
    fontSize: 14,
    color: '#4CAF50',
    marginTop: 8,
    fontWeight: '600',
  },
  slotCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  slotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  slotLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  slotStatus: {
    fontSize: 13,
    color: '#888',
  },
  slotActions: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(255,68,68,0.1)',
    borderWidth: 1,
    borderColor: '#FF4444',
  },
  recordingBtn: {
    backgroundColor: '#FF4444',
    borderColor: '#FF4444',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF4444',
  },
  recordingText: {
    color: '#FFF',
  },
  playBtn: {
    backgroundColor: 'rgba(76,175,80,0.1)',
    borderColor: '#4CAF50',
  },
  playBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  deleteBtn: {
    padding: 10,
    marginLeft: 'auto',
  },
  tipsCard: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  tipsTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 6,
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
    backgroundColor: 'rgba(255,215,0,0.15)',
    paddingVertical: 14,
  },
  permissionText: {
    fontSize: 14,
    color: '#FFD700',
    fontWeight: '600',
  },
});
