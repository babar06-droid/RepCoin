import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface ChampionInfo {
  exercise_type: string;
  champion_name: string;
  champion_photo: string | null;
  best_reps: number;
  best_time_seconds: number;
  date_achieved: string | null;
}

export default function ChallengeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [champions, setChampions] = useState<{ pushup: ChampionInfo; situp: ChampionInfo } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedExercise, setSelectedExercise] = useState<'pushup' | 'situp'>('pushup');
  const [showChallenge, setShowChallenge] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [playerPhoto, setPlayerPhoto] = useState<string | null>(null);
  const [takingPhoto, setTakingPhoto] = useState(false);

  useEffect(() => {
    fetchChampions();
  }, []);

  const fetchChampions = async () => {
    try {
      const res = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/challenge`);
      const data = await res.json();
      setChampions(data);
    } catch (error) {
      console.log('Fetch champions error:', error);
    } finally {
      setLoading(false);
    }
  };

  const takeChampionPhoto = async () => {
    if (!cameraRef.current) return;
    
    setTakingPhoto(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.5,
      });
      if (photo?.base64) {
        setPlayerPhoto(photo.base64);
      }
    } catch (error) {
      console.log('Photo error:', error);
    } finally {
      setTakingPhoto(false);
    }
  };

  const startChallenge = () => {
    if (!playerName.trim()) {
      Alert.alert('Name Required', 'Please enter your name to compete!');
      return;
    }
    
    // Navigate to workout with challenge mode enabled
    router.push({
      pathname: '/workout',
      params: {
        challengeMode: 'true',
        exerciseType: selectedExercise,
        playerName: playerName,
        playerPhoto: playerPhoto || '',
        currentRecord: champions?.[selectedExercise]?.best_reps.toString() || '0',
      },
    });
  };

  const currentChamp = champions?.[selectedExercise];

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🏆 Challenge Mode</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Champion Card */}
        <View style={styles.championCard}>
          <Text style={styles.championTitle}>👑 CURRENT CHAMPION</Text>
          
          {/* Exercise Selector */}
          <View style={styles.exerciseSelector}>
            <TouchableOpacity
              style={[styles.exerciseBtn, selectedExercise === 'pushup' && styles.exerciseBtnActive]}
              onPress={() => setSelectedExercise('pushup')}
            >
              <MaterialCommunityIcons name="arm-flex" size={24} color={selectedExercise === 'pushup' ? '#000' : '#FFF'} />
              <Text style={[styles.exerciseBtnText, selectedExercise === 'pushup' && styles.exerciseBtnTextActive]}>Push-ups</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.exerciseBtn, selectedExercise === 'situp' && styles.exerciseBtnActive]}
              onPress={() => setSelectedExercise('situp')}
            >
              <MaterialCommunityIcons name="human" size={24} color={selectedExercise === 'situp' ? '#000' : '#FFF'} />
              <Text style={[styles.exerciseBtnText, selectedExercise === 'situp' && styles.exerciseBtnTextActive]}>Sit-ups</Text>
            </TouchableOpacity>
          </View>

          {/* Champion Photo */}
          <View style={styles.championPhotoContainer}>
            {currentChamp?.champion_photo ? (
              <Image
                source={{ uri: `data:image/jpeg;base64,${currentChamp.champion_photo}` }}
                style={styles.championPhoto}
              />
            ) : (
              <View style={styles.noChampionPhoto}>
                <Ionicons name="trophy" size={60} color="#FFD700" />
              </View>
            )}
            <View style={styles.crownBadge}>
              <Text style={styles.crownEmoji}>👑</Text>
            </View>
          </View>

          {/* Champion Info */}
          <Text style={styles.championName}>{currentChamp?.champion_name || 'Be the first!'}</Text>
          <View style={styles.recordContainer}>
            <Text style={styles.recordLabel}>RECORD TO BEAT</Text>
            <Text style={styles.recordNumber}>{currentChamp?.best_reps || 0}</Text>
            <Text style={styles.recordUnit}>REPS</Text>
          </View>
          
          {currentChamp?.date_achieved && (
            <Text style={styles.dateText}>
              Since {new Date(currentChamp.date_achieved).toLocaleDateString()}
            </Text>
          )}
        </View>

        {/* Challenge Entry */}
        {!showChallenge ? (
          <TouchableOpacity style={styles.challengeBtn} onPress={() => setShowChallenge(true)}>
            <Ionicons name="flame" size={28} color="#000" />
            <Text style={styles.challengeBtnText}>CHALLENGE THE CHAMPION</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.entryCard}>
            <Text style={styles.entryTitle}>Enter the Challenge</Text>
            
            {/* Name Input */}
            <Text style={styles.inputLabel}>Your Name</Text>
            <TextInput
              style={styles.nameInput}
              value={playerName}
              onChangeText={setPlayerName}
              placeholder="Enter your name"
              placeholderTextColor="#666"
              maxLength={20}
            />

            {/* Photo Section */}
            <Text style={styles.inputLabel}>Your Champion Photo</Text>
            {permission?.granted ? (
              <View style={styles.photoSection}>
                {playerPhoto ? (
                  <View style={styles.photoPreview}>
                    <Image
                      source={{ uri: `data:image/jpeg;base64,${playerPhoto}` }}
                      style={styles.previewImage}
                    />
                    <TouchableOpacity style={styles.retakeBtn} onPress={() => setPlayerPhoto(null)}>
                      <Ionicons name="refresh" size={20} color="#FFF" />
                      <Text style={styles.retakeBtnText}>Retake</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.cameraContainer}>
                    <CameraView
                      ref={cameraRef}
                      style={styles.camera}
                      facing="front"
                    />
                    <TouchableOpacity 
                      style={styles.captureBtn} 
                      onPress={takeChampionPhoto}
                      disabled={takingPhoto}
                    >
                      {takingPhoto ? (
                        <ActivityIndicator color="#000" />
                      ) : (
                        <Ionicons name="camera" size={32} color="#000" />
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
                <Ionicons name="camera" size={24} color="#FFD700" />
                <Text style={styles.permissionText}>Enable Camera for Photo</Text>
              </TouchableOpacity>
            )}

            {/* Start Button */}
            <TouchableOpacity style={styles.startChallengeBtn} onPress={startChallenge}>
              <Text style={styles.startChallengeBtnText}>START CHALLENGE</Text>
              <Ionicons name="arrow-forward" size={24} color="#000" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowChallenge(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Rules */}
        <View style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>📋 Challenge Rules</Text>
          <Text style={styles.ruleText}>• Complete as many reps as possible</Text>
          <Text style={styles.ruleText}>• Beat the current record to become champion</Text>
          <Text style={styles.ruleText}>• Your photo will be shown to all challengers</Text>
          <Text style={styles.ruleText}>• Hold the title until someone beats you!</Text>
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
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
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
    color: '#FFD700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  championCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFD700',
    marginBottom: 20,
  },
  championTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 16,
  },
  exerciseSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  exerciseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: '#333',
  },
  exerciseBtnActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  exerciseBtnText: {
    color: '#FFF',
    fontWeight: '600',
  },
  exerciseBtnTextActive: {
    color: '#000',
  },
  championPhotoContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  championPhoto: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#FFD700',
  },
  noChampionPhoto: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#FFD700',
  },
  crownBadge: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 4,
  },
  crownEmoji: {
    fontSize: 28,
  },
  championName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 12,
  },
  recordContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,215,0,0.1)',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
  },
  recordLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  recordNumber: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  recordUnit: {
    fontSize: 14,
    color: '#FFD700',
  },
  dateText: {
    fontSize: 12,
    color: '#666',
    marginTop: 12,
  },
  challengeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#FF4444',
    paddingVertical: 18,
    borderRadius: 30,
    marginBottom: 20,
  },
  challengeBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  entryCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  entryTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  nameInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 18,
    color: '#FFF',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  photoSection: {
    marginBottom: 20,
  },
  cameraContainer: {
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  captureBtn: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    backgroundColor: '#FFD700',
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPreview: {
    alignItems: 'center',
  },
  previewImage: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 3,
    borderColor: '#FFD700',
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  retakeBtnText: {
    color: '#FFF',
    fontSize: 14,
  },
  permissionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFD700',
    marginBottom: 20,
  },
  permissionText: {
    color: '#FFD700',
    fontSize: 14,
  },
  startChallengeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFD700',
    paddingVertical: 16,
    borderRadius: 30,
    marginBottom: 12,
  },
  startChallengeBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelBtnText: {
    color: '#888',
    fontSize: 14,
  },
  rulesCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
  },
  rulesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 12,
  },
  ruleText: {
    fontSize: 14,
    color: '#AAA',
    marginVertical: 4,
  },
});
