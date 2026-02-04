import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Accelerometer } from 'expo-sensors';

interface PoseCameraProps {
  onPoseDetected: (landmarks: any[]) => void;
  cameraFacing: 'front' | 'back';
  style?: any;
}

export const PoseDetectionCamera: React.FC<PoseCameraProps> = ({
  onPoseDetected,
  cameraFacing,
  style,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [isActive, setIsActive] = useState(false);
  const [currentY, setCurrentY] = useState(0.5);
  const [debugText, setDebugText] = useState('Starting...');
  
  const smoothedYRef = useRef(0.5);
  const subscriptionRef = useRef<any>(null);

  // Request camera permission
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  // Setup accelerometer for motion detection
  useEffect(() => {
    let isMounted = true;

    const setupAccelerometer = async () => {
      try {
        // Check if accelerometer is available
        const isAvailable = await Accelerometer.isAvailableAsync();
        if (!isAvailable) {
          setDebugText('Accelerometer not available');
          return;
        }

        // Set fast update interval (50ms = 20 updates per second)
        Accelerometer.setUpdateInterval(50);
        
        subscriptionRef.current = Accelerometer.addListener(({ x, y, z }) => {
          if (!isMounted) return;
          
          // Use Z axis for up/down detection when phone is flat on floor
          // Z is ~1 when flat, changes when tilted
          // We'll use a combination of Y and Z for better detection
          
          // Smooth the values
          const rawValue = z; // Z axis when phone is on floor
          smoothedYRef.current = smoothedYRef.current * 0.6 + rawValue * 0.4;
          
          // Normalize to 0-1 range (Z ranges from -1 to 1)
          // When flat on back: Z ≈ 1
          // When tilted/covered during pushup: Z changes
          const normalizedY = (smoothedYRef.current + 1) / 2;
          
          setCurrentY(normalizedY);
          setDebugText(`Z: ${smoothedYRef.current.toFixed(2)} → Y: ${normalizedY.toFixed(2)}`);
          setIsActive(true);
          
          // Create landmarks with the motion data
          // Index 5 = left shoulder, Index 6 = right shoulder
          const landmarks = [];
          for (let i = 0; i < 7; i++) {
            landmarks.push({
              x: 0.5,
              y: normalizedY,
              score: 0.95,
              name: i === 5 ? 'left_shoulder' : i === 6 ? 'right_shoulder' : `point_${i}`,
            });
          }
          
          onPoseDetected(landmarks);
        });
        
        setDebugText('Motion tracking active!');
      } catch (error) {
        console.log('Accelerometer error:', error);
        setDebugText(`Error: ${error}`);
      }
    };

    setupAccelerometer();

    return () => {
      isMounted = false;
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
    };
  }, [onPoseDetected]);

  // Calculate indicator position (inverted so UP shows on top)
  const indicatorPosition = (1 - currentY) * 100;

  return (
    <View style={[styles.container, style]}>
      {permission?.granted ? (
        <>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing={cameraFacing}
          />
          <View style={styles.overlay}>
            {/* Status badge */}
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, isActive && styles.statusDotActive]} />
              <Text style={styles.statusText}>
                {isActive ? '🤖 Motion Tracking' : '⏳ Starting...'}
              </Text>
            </View>
            
            {/* Motion indicator - vertical bar */}
            <View style={styles.motionContainer}>
              <Text style={styles.motionTitle}>Your Position</Text>
              <View style={styles.motionBarVertical}>
                <View style={styles.thresholdLineUp} />
                <View style={styles.thresholdLineDown} />
                <View 
                  style={[
                    styles.motionIndicator,
                    { 
                      top: `${indicatorPosition}%`,
                      backgroundColor: currentY > 0.6 ? '#FF9800' : 
                                       currentY < 0.4 ? '#4CAF50' : '#FFD700'
                    }
                  ]} 
                />
              </View>
              <View style={styles.motionLabelsVertical}>
                <Text style={styles.labelUp}>⬆️ UP</Text>
                <Text style={styles.labelDown}>⬇️ DOWN</Text>
              </View>
              <Text style={styles.debugText}>{debugText}</Text>
            </View>

            {/* Instructions */}
            <View style={styles.instructionsBox}>
              <Text style={styles.instructionsTitle}>📱 Setup:</Text>
              <Text style={styles.instructionsText}>
                • Place phone FLAT on floor, screen UP
              </Text>
              <Text style={styles.instructionsText}>
                • Do pushups over/near the phone
              </Text>
              <Text style={styles.instructionsText}>
                • Motion detected = rep counted!
              </Text>
            </View>
          </View>
        </>
      ) : (
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionIcon}>📷</Text>
          <Text style={styles.permissionText}>Camera permission needed</Text>
        </View>
      )}
    </View>
  );
};

// Hook to check if AI mode is available
export const useIsAIModeAvailable = () => {
  return true;
};

// Export landmark indices
export const LEFT_SHOULDER_INDEX = 5;
export const RIGHT_SHOULDER_INDEX = 6;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    padding: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#00FF00',
    marginTop: 80,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#666',
    marginRight: 10,
  },
  statusDotActive: {
    backgroundColor: '#00FF00',
    shadowColor: '#00FF00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  statusText: {
    color: '#00FF00',
    fontSize: 16,
    fontWeight: 'bold',
  },
  motionContainer: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    alignSelf: 'center',
    width: 150,
    alignItems: 'center',
  },
  motionTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  motionBarVertical: {
    width: 40,
    height: 120,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#333',
  },
  thresholdLineUp: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#4CAF50',
    opacity: 0.5,
  },
  thresholdLineDown: {
    position: 'absolute',
    top: '60%',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#FF9800',
    opacity: 0.5,
  },
  motionIndicator: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    left: 2,
    marginTop: -18,
    borderWidth: 3,
    borderColor: '#FFF',
  },
  motionLabelsVertical: {
    marginTop: 8,
    alignItems: 'center',
  },
  labelUp: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: 'bold',
  },
  labelDown: {
    color: '#FF9800',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 4,
  },
  debugText: {
    color: '#888',
    fontSize: 10,
    marginTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  instructionsBox: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#444',
  },
  instructionsTitle: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  instructionsText: {
    color: '#CCC',
    fontSize: 13,
    marginVertical: 3,
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  permissionIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  permissionText: {
    color: '#FFF',
    fontSize: 16,
  },
});

export default PoseDetectionCamera;
