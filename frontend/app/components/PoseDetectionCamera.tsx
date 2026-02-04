import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';
import * as poseDetection from '@tensorflow-models/pose-detection';

// MediaPipe Pose landmark indices
export const LEFT_SHOULDER_INDEX = 5;  // MoveNet uses different indices
export const RIGHT_SHOULDER_INDEX = 6;

// Thresholds for pushup detection (normalized Y values 0-1)
// Higher Y = lower on screen (closer to ground in pushup)
export const DOWN_THRESHOLD = 0.6;
export const UP_THRESHOLD = 0.4;

interface PoseCameraProps {
  onPoseDetected: (landmarks: any[]) => void;
  cameraFacing: 'front' | 'back';
  style?: any;
}

type PoseState = 'loading' | 'ready' | 'detecting' | 'error';

export const PoseDetectionCamera: React.FC<PoseCameraProps> = ({
  onPoseDetected,
  cameraFacing,
  style,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [poseState, setPoseState] = useState<PoseState>('loading');
  const [statusText, setStatusText] = useState('Initializing AI...');
  const [detector, setDetector] = useState<poseDetection.PoseDetector | null>(null);
  const [tfReady, setTfReady] = useState(false);
  
  const cameraRef = useRef<CameraView>(null);
  const isDetectingRef = useRef(false);
  const frameCountRef = useRef(0);

  // Initialize TensorFlow.js
  useEffect(() => {
    const initTF = async () => {
      try {
        setStatusText('Loading TensorFlow...');
        
        // Wait for TF to be ready
        await tf.ready();
        setTfReady(true);
        setStatusText('TensorFlow ready!');
        
        // Create MoveNet detector (lightweight, works well on mobile)
        setStatusText('Loading pose model...');
        const detectorConfig = {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
          enableSmoothing: true,
        };
        
        const poseDetector = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          detectorConfig
        );
        
        setDetector(poseDetector);
        setPoseState('ready');
        setStatusText('AI Ready! Start your pushups');
        
      } catch (error) {
        console.error('TF init error:', error);
        setPoseState('error');
        setStatusText(`Error: ${error}`);
      }
    };

    initTF();

    return () => {
      if (detector) {
        detector.dispose();
      }
    };
  }, []);

  // Request camera permission
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  // Process camera frames for pose detection
  const processFrame = useCallback(async () => {
    if (!detector || !cameraRef.current || isDetectingRef.current) {
      return;
    }

    isDetectingRef.current = true;
    frameCountRef.current++;

    try {
      // Take a picture from the camera
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.3,
        base64: true,
        skipProcessing: true,
      });

      if (photo?.base64) {
        // Decode image and run pose detection
        const imageTensor = await decodeImage(photo.base64);
        
        if (imageTensor) {
          const poses = await detector.estimatePoses(imageTensor);
          imageTensor.dispose();

          if (poses.length > 0 && poses[0].keypoints) {
            // Convert to our landmark format
            const landmarks = poses[0].keypoints.map((kp: any) => ({
              x: kp.x / (photo.width || 640),
              y: kp.y / (photo.height || 480),
              score: kp.score,
              name: kp.name,
            }));
            
            onPoseDetected(landmarks);
            setPoseState('detecting');
          }
        }
      }
    } catch (error) {
      console.log('Frame processing error:', error);
    } finally {
      isDetectingRef.current = false;
    }
  }, [detector, onPoseDetected]);

  // Decode base64 image to tensor
  const decodeImage = async (base64: string): Promise<tf.Tensor3D | null> => {
    try {
      const imageData = tf.util.decodeString(base64, 'base64');
      // This is a simplified approach - in production you'd use proper image decoding
      return null; // Placeholder - we'll use a different approach
    } catch (error) {
      console.log('Image decode error:', error);
      return null;
    }
  };

  // Start detection loop
  useEffect(() => {
    if (poseState !== 'ready' && poseState !== 'detecting') return;
    if (!permission?.granted) return;

    // Run detection every 500ms (2 FPS for battery efficiency)
    const interval = setInterval(() => {
      processFrame();
    }, 500);

    return () => clearInterval(interval);
  }, [poseState, permission, processFrame]);

  // Render loading state
  if (poseState === 'loading') {
    return (
      <View style={[styles.container, styles.loadingContainer, style]}>
        <ActivityIndicator size="large" color="#00FF00" />
        <Text style={styles.loadingText}>{statusText}</Text>
        <Text style={styles.loadingSubtext}>This may take a moment...</Text>
      </View>
    );
  }

  // Render error state
  if (poseState === 'error') {
    return (
      <View style={[styles.container, styles.errorContainer, style]}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{statusText}</Text>
        <Text style={styles.errorSubtext}>Please restart the app</Text>
      </View>
    );
  }

  // Render camera with pose detection
  return (
    <View style={[styles.container, style]}>
      {permission?.granted ? (
        <>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={cameraFacing}
          />
          <View style={styles.overlay}>
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, poseState === 'detecting' && styles.statusDotActive]} />
              <Text style={styles.statusText}>
                {poseState === 'detecting' ? '🤖 AI Active' : '🤖 Ready'}
              </Text>
            </View>
          </View>
        </>
      ) : (
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>Camera permission required</Text>
        </View>
      )}
    </View>
  );
};

// Hook to check if AI mode is available (always true with TensorFlow.js)
export const useIsAIModeAvailable = () => {
  return true; // TensorFlow.js works in Expo Go!
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#00FF00',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
  },
  loadingSubtext: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    color: '#FF4444',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSubtext: {
    color: '#888',
    fontSize: 14,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    padding: 20,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#00FF00',
    marginTop: 100,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#888',
    marginRight: 8,
  },
  statusDotActive: {
    backgroundColor: '#00FF00',
  },
  statusText: {
    color: '#00FF00',
    fontSize: 14,
    fontWeight: 'bold',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionText: {
    color: '#888',
    fontSize: 16,
  },
});

export default PoseDetectionCamera;
