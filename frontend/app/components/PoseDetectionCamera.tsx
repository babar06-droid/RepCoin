import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

// Conditional imports for native modules (only available in dev build)
let usePoseDetection: any = null;
let MediapipeCamera: any = null;

// Try to import mediapipe - will fail gracefully in Expo Go
try {
  const mediapipe = require('react-native-mediapipe');
  usePoseDetection = mediapipe.usePoseDetection;
  MediapipeCamera = mediapipe.MediapipeCamera;
} catch (e) {
  console.log('MediaPipe not available - requires development build');
}

// MediaPipe Pose landmark indices
const LEFT_SHOULDER_INDEX = 11;
const RIGHT_SHOULDER_INDEX = 12;

interface PoseCameraProps {
  onPoseDetected: (landmarks: any[]) => void;
  cameraFacing: 'front' | 'back';
  style?: any;
}

// Fallback component when MediaPipe is not available
const FallbackCamera: React.FC<PoseCameraProps> = ({ style }) => {
  return (
    <View style={[styles.fallbackContainer, style]}>
      <Text style={styles.fallbackTitle}>🤖 AI Mode</Text>
      <Text style={styles.fallbackText}>
        MediaPipe requires a development build.
      </Text>
      <Text style={styles.fallbackText}>
        Run: npx expo run:ios or npx expo run:android
      </Text>
      <Text style={styles.fallbackNote}>
        Manual counting is still available.
      </Text>
    </View>
  );
};

// Actual MediaPipe camera component
const MediaPipePoseCamera: React.FC<PoseCameraProps> = ({ 
  onPoseDetected, 
  cameraFacing, 
  style 
}) => {
  const [isReady, setIsReady] = useState(false);
  
  // Initialize pose detection
  const poseDetection = usePoseDetection
    ? usePoseDetection({
        modelPath: 'pose_landmarker_lite.task', // Use lite model for performance
        delegate: Platform.OS === 'ios' ? 'GPU' : 'CPU',
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
    : null;

  // Handle pose detection results
  const handleResults = useCallback((results: any) => {
    if (results?.poseLandmarks && results.poseLandmarks.length > 0) {
      // Get the first detected pose landmarks
      const landmarks = results.poseLandmarks[0];
      onPoseDetected(landmarks);
    }
  }, [onPoseDetected]);

  useEffect(() => {
    if (poseDetection) {
      setIsReady(true);
    }
  }, [poseDetection]);

  if (!MediapipeCamera || !poseDetection) {
    return <FallbackCamera onPoseDetected={onPoseDetected} cameraFacing={cameraFacing} style={style} />;
  }

  return (
    <View style={[styles.container, style]}>
      <MediapipeCamera
        style={StyleSheet.absoluteFill}
        solution={poseDetection}
        activeCamera={cameraFacing}
        onResults={handleResults}
        resizeMode="cover"
      />
      {!isReady && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>Loading AI...</Text>
        </View>
      )}
    </View>
  );
};

// Main export - chooses between MediaPipe and Fallback
export const PoseDetectionCamera: React.FC<PoseCameraProps> = (props) => {
  // Check if MediaPipe is available
  if (!usePoseDetection || !MediapipeCamera) {
    return <FallbackCamera {...props} />;
  }
  
  return <MediaPipePoseCamera {...props} />;
};

// Simple hook to check if AI mode is available
export const useIsAIModeAvailable = () => {
  return usePoseDetection !== null && MediapipeCamera !== null;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  fallbackContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  fallbackTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00FF00',
    marginBottom: 16,
  },
  fallbackText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginVertical: 4,
  },
  fallbackNote: {
    fontSize: 12,
    color: '#FFD700',
    marginTop: 16,
    fontStyle: 'italic',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#00FF00',
    fontWeight: 'bold',
  },
});

export default PoseDetectionCamera;
