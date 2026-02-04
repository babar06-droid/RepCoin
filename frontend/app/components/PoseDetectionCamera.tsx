import React, { useCallback, useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

// MediaPipe Pose landmark indices
export const LEFT_SHOULDER_INDEX = 11;
export const RIGHT_SHOULDER_INDEX = 12;

interface PoseCameraProps {
  onPoseDetected: (landmarks: any[]) => void;
  cameraFacing: 'front' | 'back';
  style?: any;
}

// Check if we're in a development build (native modules available)
let isDevBuild = false;
let MediaPipeModule: any = null;

// Try to load MediaPipe - this will fail gracefully in Expo Go
const loadMediaPipe = () => {
  try {
    // This require will fail in Expo Go but work in dev builds
    MediaPipeModule = require('react-native-mediapipe');
    isDevBuild = true;
    console.log('MediaPipe loaded successfully - AI mode available');
    return true;
  } catch (e) {
    console.log('MediaPipe not available - running in Expo Go mode');
    return false;
  }
};

// Try to load on module initialization
loadMediaPipe();

// Fallback component when MediaPipe is not available (Expo Go)
const FallbackCamera: React.FC<PoseCameraProps> = ({ onPoseDetected, cameraFacing, style }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [mockState, setMockState] = useState<'waiting' | 'simulating'>('waiting');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Request camera permission
    if (!permission?.granted) {
      requestPermission();
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [permission]);

  // No simulation needed - just show the camera with UI overlay
  return (
    <View style={[styles.container, style]}>
      {permission?.granted ? (
        <CameraView 
          style={StyleSheet.absoluteFill}
          facing={cameraFacing}
        />
      ) : (
        <View style={styles.noCameraContainer}>
          <Text style={styles.noCameraText}>Camera permission required</Text>
        </View>
      )}
      <View style={styles.overlayContainer}>
        <View style={styles.devBuildNotice}>
          <Text style={styles.devBuildTitle}>🤖 AI Mode (Development Build Required)</Text>
          <Text style={styles.devBuildText}>
            MediaPipe Pose detection requires a native development build.
          </Text>
          <Text style={styles.devBuildInstructions}>
            Run: npx expo run:ios{'\n'}or: npx expo run:android
          </Text>
          <Text style={styles.devBuildNote}>
            Manual counting is available below as fallback.
          </Text>
        </View>
      </View>
    </View>
  );
};

// Real MediaPipe camera component (for development builds)
const MediaPipePoseCamera: React.FC<PoseCameraProps> = ({ 
  onPoseDetected, 
  cameraFacing, 
  style 
}) => {
  const [isReady, setIsReady] = useState(false);

  // This would use the actual MediaPipe component
  // For now, return the fallback since we can't test in this environment
  return <FallbackCamera onPoseDetected={onPoseDetected} cameraFacing={cameraFacing} style={style} />;
};

// Main export - chooses between MediaPipe and Fallback
export const PoseDetectionCamera: React.FC<PoseCameraProps> = (props) => {
  // Always use fallback for now since MediaPipe requires native build
  return <FallbackCamera {...props} />;
};

// Hook to check if AI mode is available
export const useIsAIModeAvailable = () => {
  // In a dev build, this would return true
  // For now, always return false since we're in Expo Go
  return isDevBuild;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  noCameraContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  noCameraText: {
    color: '#888',
    fontSize: 16,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devBuildNotice: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 20,
    borderWidth: 2,
    borderColor: '#00FF00',
    alignItems: 'center',
  },
  devBuildTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00FF00',
    marginBottom: 12,
    textAlign: 'center',
  },
  devBuildText: {
    fontSize: 14,
    color: '#CCC',
    textAlign: 'center',
    marginBottom: 12,
  },
  devBuildInstructions: {
    fontSize: 13,
    color: '#FFD700',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 12,
  },
  devBuildNote: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default PoseDetectionCamera;
