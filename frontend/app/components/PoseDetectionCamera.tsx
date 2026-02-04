import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

// MediaPipe Pose landmark indices (for reference when building development build)
export const LEFT_SHOULDER_INDEX = 11;
export const RIGHT_SHOULDER_INDEX = 12;

interface PoseCameraProps {
  onPoseDetected: (landmarks: any[]) => void;
  cameraFacing: 'front' | 'back';
  style?: any;
}

// AI Mode Camera Component
// In Expo Go: Shows camera with instructions for dev build
// In Dev Build: Would use actual MediaPipe for pose detection
export const PoseDetectionCamera: React.FC<PoseCameraProps> = ({ 
  onPoseDetected, 
  cameraFacing, 
  style 
}) => {
  const [permission, requestPermission] = useCameraPermissions();
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
          <Text style={styles.devBuildTitle}>🤖 AI Pushup Detection</Text>
          <Text style={styles.devBuildText}>
            MediaPipe Pose detection requires a native development build.
          </Text>
          <View style={styles.instructionsBox}>
            <Text style={styles.devBuildInstructions}>
              To enable AI counting:
            </Text>
            <Text style={styles.commandText}>npx expo run:ios</Text>
            <Text style={styles.orText}>or</Text>
            <Text style={styles.commandText}>npx expo run:android</Text>
          </View>
          <Text style={styles.devBuildNote}>
            Use the "+1 Manual" button below as fallback.
          </Text>
        </View>
      </View>
    </View>
  );
};

// Hook to check if AI mode is fully available
// Returns false in Expo Go, would return true in dev build with MediaPipe
export const useIsAIModeAvailable = () => {
  // For now always return false since we can't use native modules in Expo Go
  // In a development build, this would check if MediaPipe is properly initialized
  return false;
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
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 20,
    borderWidth: 2,
    borderColor: '#00FF00',
    alignItems: 'center',
    maxWidth: 320,
  },
  devBuildTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#00FF00',
    marginBottom: 16,
    textAlign: 'center',
  },
  devBuildText: {
    fontSize: 14,
    color: '#CCC',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  instructionsBox: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
  },
  devBuildInstructions: {
    fontSize: 13,
    color: '#FFD700',
    textAlign: 'center',
    marginBottom: 8,
  },
  commandText: {
    fontSize: 14,
    color: '#00FF00',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: 'rgba(0,255,0,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginVertical: 4,
  },
  orText: {
    fontSize: 12,
    color: '#666',
    marginVertical: 4,
  },
  devBuildNote: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default PoseDetectionCamera;
