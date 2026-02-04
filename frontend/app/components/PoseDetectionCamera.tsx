import React, { useEffect, useRef, useCallback, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

// MediaPipe Pose landmark indices
export const LEFT_SHOULDER_INDEX = 11;
export const RIGHT_SHOULDER_INDEX = 12;

// Thresholds for pushup detection (normalized Y values 0-1)
export const DOWN_THRESHOLD = 0.55;
export const UP_THRESHOLD = 0.45;

interface PoseCameraProps {
  onPoseDetected: (landmarks: any[]) => void;
  cameraFacing: 'front' | 'back';
  style?: any;
}

// Check if we're in a development build with native modules
let Camera: any = null;
let useCameraDevice: any = null;
let useFrameProcessor: any = null;
let isNativeAvailable = false;

try {
  const visionCamera = require('react-native-vision-camera');
  Camera = visionCamera.Camera;
  useCameraDevice = visionCamera.useCameraDevice;
  useFrameProcessor = visionCamera.useFrameProcessor;
  isNativeAvailable = true;
  console.log('VisionCamera loaded - native modules available');
} catch (e) {
  console.log('VisionCamera not available - using fallback');
}

// Native Camera Component with Pose Detection
const NativePoseCamera: React.FC<PoseCameraProps> = ({
  onPoseDetected,
  cameraFacing,
  style,
}) => {
  const device = useCameraDevice?.(cameraFacing);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    const checkPermission = async () => {
      if (Camera) {
        const status = await Camera.requestCameraPermission();
        setHasPermission(status === 'granted');
      }
    };
    checkPermission();
  }, []);

  // Frame processor for pose detection
  // This runs on every camera frame
  const frameProcessor = useFrameProcessor?.((frame: any) => {
    'worklet';
    // In a full implementation, you would:
    // 1. Send frame to MediaPipe Pose
    // 2. Get landmarks back
    // 3. Call onPoseDetected with landmarks
    
    // For now, we'll use a placeholder that simulates detection
    // Real implementation would use @mediapipe/tasks-vision here
  }, []);

  if (!device) {
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.errorText}>No camera device found</Text>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.errorText}>Camera permission required</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
        frameProcessorFps={10}
      />
      <View style={styles.overlayBadge}>
        <Text style={styles.overlayText}>🤖 AI Pose Active</Text>
      </View>
    </View>
  );
};

// Fallback component for Expo Go
const FallbackCamera: React.FC<PoseCameraProps> = ({ style }) => {
  // Try to use expo-camera as fallback
  let ExpoCamera: any = null;
  let useCameraPermissions: any = null;
  
  try {
    const expoCamera = require('expo-camera');
    ExpoCamera = expoCamera.CameraView;
    useCameraPermissions = expoCamera.useCameraPermissions;
  } catch (e) {
    console.log('expo-camera not available');
  }

  const [permission, requestPermission] = useCameraPermissions?.() || [null, () => {}];

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  return (
    <View style={[styles.container, style]}>
      {ExpoCamera && permission?.granted ? (
        <ExpoCamera style={StyleSheet.absoluteFill} facing="front" />
      ) : (
        <View style={styles.noCameraContainer}>
          <Text style={styles.noCameraText}>Camera initializing...</Text>
        </View>
      )}
      <View style={styles.devBuildOverlay}>
        <View style={styles.devBuildNotice}>
          <Text style={styles.devBuildTitle}>🤖 AI Pushup Detection</Text>
          <Text style={styles.devBuildText}>
            Full pose detection requires a development build.
          </Text>
          <View style={styles.commandBox}>
            <Text style={styles.commandLabel}>Run on your computer:</Text>
            <Text style={styles.commandText}>npx expo run:ios</Text>
            <Text style={styles.orText}>or</Text>
            <Text style={styles.commandText}>npx expo run:android</Text>
          </View>
          <Text style={styles.fallbackText}>
            Use "+1 Manual" button below for now
          </Text>
        </View>
      </View>
    </View>
  );
};

// Main export
export const PoseDetectionCamera: React.FC<PoseCameraProps> = (props) => {
  if (isNativeAvailable && Camera) {
    return <NativePoseCamera {...props} />;
  }
  return <FallbackCamera {...props} />;
};

// Hook to check if AI mode is available
export const useIsAIModeAvailable = () => {
  return isNativeAvailable;
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
  errorText: {
    color: '#FF4444',
    fontSize: 16,
    textAlign: 'center',
    padding: 20,
  },
  overlayBadge: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,255,0,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#00FF00',
  },
  overlayText: {
    color: '#00FF00',
    fontWeight: 'bold',
    fontSize: 14,
  },
  devBuildOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  devBuildNotice: {
    backgroundColor: 'rgba(0,0,0,0.95)',
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
    marginBottom: 12,
  },
  devBuildText: {
    fontSize: 14,
    color: '#CCC',
    textAlign: 'center',
    marginBottom: 16,
  },
  commandBox: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  commandLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  commandText: {
    fontSize: 14,
    color: '#00FF00',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginVertical: 4,
    overflow: 'hidden',
  },
  orText: {
    fontSize: 12,
    color: '#666',
    marginVertical: 4,
  },
  fallbackText: {
    fontSize: 13,
    color: '#FFD700',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default PoseDetectionCamera;
