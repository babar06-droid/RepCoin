import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MOTIVATION_SLOTS = [
  { id: 'phrase1', label: 'Phrase 1', suggestion: '"YEAH BABY!"' },
  { id: 'phrase2', label: 'Phrase 2', suggestion: '"LET\'S GO!"' },
  { id: 'phrase3', label: 'Phrase 3', suggestion: '"KEEP PUSHING!"' },
  { id: 'phrase4', label: 'Phrase 4', suggestion: '"BEAST MODE!"' },
  { id: 'phrase5', label: 'Phrase 5', suggestion: '"YOU GOT THIS!"' },
];

const STORAGE_KEY = 'custom_voice_recordings_v2';

interface RecordingInfo {
  id: string;
  uri: string;
}

export default function VoiceStudioScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [recordings, setRecordings] = useState<Record<string, RecordingInfo>>({});
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  
  const recordingObjRef = useRef<Audio.Recording | null>(null);
  const soundObjRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    initAudio();
    loadSavedRecordings();
    return () => {
      cleanupAudio();
    };
  }, []);

  const cleanupAudio = async () => {
    if (recordingObjRef.current) {
      try { await recordingObjRef.current.stopAndUnloadAsync(); } catch {}
    }
    if (soundObjRef.current) {
      try { await soundObjRef.current.unloadAsync(); } catch {}
    }
  };

  const initAudio = async () => {
    try {
      setStatusMsg('Requesting permission...');
      
      // Request permission
      const permResponse = await Audio.requestPermissionsAsync();
      const granted = permResponse.status === 'granted';
      setHasPermission(granted);
      
      if (!granted) {
        setStatusMsg('Microphone permission denied');
        return;
      }

      // Configure audio mode for Android recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      
      setStatusMsg('Ready to record');
    } catch (error) {
      console.log('initAudio error:', error);
      setStatusMsg('Audio init failed');
    }
  };

  const loadSavedRecordings = async () => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        setRecordings(JSON.parse(data));
      }
    } catch (e) {
      console.log('Load error:', e);
    }
  };

  const saveRecordingsToStorage = async (recs: Record<string, RecordingInfo>) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recs));
    } catch (e) {
      console.log('Save error:', e);
    }
  };

  const handleRecord = async (phraseId: string) => {
    // If already recording this phrase, stop it
    if (activeRecordingId === phraseId) {
      await stopRecording();
      return;
    }

    // If recording another phrase, stop that first
    if (activeRecordingId) {
      await stopRecording();
    }

    // Stop any playback
    await stopPlayback();

    // Start new recording
    await startRecording(phraseId);
  };

  const startRecording = async (phraseId: string) => {
    if (!hasPermission) {
      Alert.alert('Permission Needed', 'Please allow microphone access');
      await initAudio();
      return;
    }

    try {
      setStatusMsg('Starting recording...');
      
      // Ensure audio mode is set for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const newRecording = new Audio.Recording();
      
      await newRecording.prepareToRecordAsync({
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100,
          numberOfChannels: 2,
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
      
      await newRecording.startAsync();
      
      recordingObjRef.current = newRecording;
      setActiveRecordingId(phraseId);
      setStatusMsg('🔴 Recording... Tap to stop');
      
    } catch (error) {
      console.log('startRecording error:', error);
      setStatusMsg('Failed to start recording');
      Alert.alert('Error', 'Could not start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    if (!recordingObjRef.current || !activeRecordingId) {
      setActiveRecordingId(null);
      return;
    }

    try {
      setStatusMsg('Saving...');
      
      await recordingObjRef.current.stopAndUnloadAsync();
      const uri = recordingObjRef.current.getURI();
      
      if (uri) {
        const newRec: RecordingInfo = { id: activeRecordingId, uri };
        const updated = { ...recordings, [activeRecordingId]: newRec };
        setRecordings(updated);
        await saveRecordingsToStorage(updated);
        setStatusMsg('✓ Saved!');
      } else {
        setStatusMsg('No audio captured');
      }
      
    } catch (error) {
      console.log('stopRecording error:', error);
      setStatusMsg('Save failed');
    } finally {
      recordingObjRef.current = null;
      setActiveRecordingId(null);
    }
  };

  const handlePlay = async (phraseId: string) => {
    // If already playing this, stop it
    if (activePlayingId === phraseId) {
      await stopPlayback();
      return;
    }

    // Stop any current playback
    await stopPlayback();

    // Stop any recording
    if (activeRecordingId) {
      await stopRecording();
    }

    // Play the recording
    await playRecording(phraseId);
  };

  const playRecording = async (phraseId: string) => {
    const rec = recordings[phraseId];
    if (!rec?.uri) {
      setStatusMsg('No recording found');
      return;
    }

    try {
      setStatusMsg('Playing...');
      
      // Set audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: rec.uri },
        { shouldPlay: true, volume: 1.0 }
      );
      
      soundObjRef.current = sound;
      setActivePlayingId(phraseId);
      
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setActivePlayingId(null);
          setStatusMsg('Ready');
        }
      });
      
    } catch (error) {
      console.log('playRecording error:', error);
      setStatusMsg('Playback failed');
      setActivePlayingId(null);
    }
  };

  const stopPlayback = async () => {
    if (soundObjRef.current) {
      try {
        await soundObjRef.current.stopAsync();
        await soundObjRef.current.unloadAsync();
      } catch {}
      soundObjRef.current = null;
    }
    setActivePlayingId(null);
  };

  const handleDelete = (phraseId: string) => {
    Alert.alert('Delete?', 'Remove this recording?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const updated = { ...recordings };
          delete updated[phraseId];
          setRecordings(updated);
          await saveRecordingsToStorage(updated);
          setStatusMsg('Deleted');
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

      {/* Status Bar */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>{statusMsg}</Text>
        <Text style={styles.countText}>{recordedCount}/5 saved</Text>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Permission check */}
        {hasPermission === false && (
          <TouchableOpacity style={styles.permissionCard} onPress={initAudio}>
            <Ionicons name="mic-off" size={32} color="#FF4444" />
            <Text style={styles.permissionTitle}>Microphone Access Needed</Text>
            <Text style={styles.permissionText}>Tap here to grant permission</Text>
          </TouchableOpacity>
        )}

        {/* Recording slots */}
        {MOTIVATION_SLOTS.map((slot) => {
          const hasRec = !!recordings[slot.id];
          const isRecording = activeRecordingId === slot.id;
          const isPlaying = activePlayingId === slot.id;
          
          return (
            <View key={slot.id} style={styles.slotCard}>
              <View style={styles.slotTop}>
                <Text style={styles.slotLabel}>{slot.label}</Text>
                {hasRec && <Text style={styles.savedBadge}>✓ Saved</Text>}
              </View>
              
              <Text style={styles.suggestion}>{slot.suggestion}</Text>
              
              <View style={styles.buttons}>
                {/* Record Button */}
                <TouchableOpacity
                  style={[styles.recBtn, isRecording && styles.recBtnActive]}
                  onPress={() => handleRecord(slot.id)}
                >
                  <Ionicons 
                    name={isRecording ? 'stop-circle' : 'mic'} 
                    size={24} 
                    color={isRecording ? '#FFF' : '#FF4444'} 
                  />
                  <Text style={[styles.recBtnText, isRecording && styles.recBtnTextActive]}>
                    {isRecording ? 'STOP' : 'REC'}
                  </Text>
                </TouchableOpacity>
                
                {/* Play Button - only show if has recording */}
                {hasRec && (
                  <TouchableOpacity
                    style={[styles.playBtn, isPlaying && styles.playBtnActive]}
                    onPress={() => handlePlay(slot.id)}
                  >
                    <Ionicons 
                      name={isPlaying ? 'stop' : 'play'} 
                      size={24} 
                      color={isPlaying ? '#FFF' : '#4CAF50'} 
                    />
                    <Text style={[styles.playBtnText, isPlaying && styles.playBtnTextActive]}>
                      {isPlaying ? 'STOP' : 'PLAY'}
                    </Text>
                  </TouchableOpacity>
                )}
                
                {/* Delete Button */}
                {hasRec && (
                  <TouchableOpacity style={styles.delBtn} onPress={() => handleDelete(slot.id)}>
                    <Ionicons name="trash" size={20} color="#FF4444" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        {/* Instructions */}
        <View style={styles.instructions}>
          <Text style={styles.instructTitle}>How to Record:</Text>
          <Text style={styles.instructText}>1. Tap REC to start recording</Text>
          <Text style={styles.instructText}>2. Say your motivation phrase</Text>
          <Text style={styles.instructText}>3. Tap STOP to save</Text>
          <Text style={styles.instructText}>4. Tap PLAY to preview</Text>
        </View>
      </ScrollView>
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
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#1a1a1a',
  },
  statusText: {
    color: '#FFD700',
    fontSize: 14,
  },
  countText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  permissionCard: {
    backgroundColor: '#2a1a1a',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FF4444',
  },
  permissionTitle: {
    color: '#FF4444',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 12,
  },
  permissionText: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  slotCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  slotTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  slotLabel: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  savedBadge: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
  },
  suggestion: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 12,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  recBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    backgroundColor: 'rgba(255,68,68,0.15)',
    borderWidth: 2,
    borderColor: '#FF4444',
  },
  recBtnActive: {
    backgroundColor: '#FF4444',
  },
  recBtnText: {
    color: '#FF4444',
    fontWeight: 'bold',
    fontSize: 14,
  },
  recBtnTextActive: {
    color: '#FFF',
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    backgroundColor: 'rgba(76,175,80,0.15)',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  playBtnActive: {
    backgroundColor: '#4CAF50',
  },
  playBtnText: {
    color: '#4CAF50',
    fontWeight: 'bold',
    fontSize: 14,
  },
  playBtnTextActive: {
    color: '#FFF',
  },
  delBtn: {
    marginLeft: 'auto',
    padding: 10,
  },
  instructions: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  instructTitle: {
    color: '#FFD700',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  instructText: {
    color: '#AAA',
    fontSize: 13,
    marginVertical: 2,
  },
});
