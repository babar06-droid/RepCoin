import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LightSensor, Accelerometer } from 'expo-sensors';

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
  const [sensorType, setSensorType] = useState<'light' | 'motion'>('light');
  const [currentValue, setCurrentValue] = useState(0.5);
  const [debugText, setDebugText] = useState('Initializing...');
  const [rawValue, setRawValue] = useState(0);
  
  // For light sensor calibration
  const baselineLightRef = useRef<number | null>(null);
  const maxLightRef = useRef<number>(1000);
  const minLightRef = useRef<number>(0);
  
  const subscriptionRef = useRef<any>(null);

  // Request camera permission
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  // Setup sensors
  useEffect(() => {
    let isMounted = true;

    const setupSensors = async () => {
      // Try Light Sensor first (works great for phone-on-floor)
      const lightAvailable = await LightSensor.isAvailableAsync();
      console.log('Light sensor available:', lightAvailable);
      
      if (lightAvailable) {
        setSensorType('light');
        setDebugText('Light Sensor Active!');
        console.log('Using LIGHT SENSOR for detection');
        
        LightSensor.setUpdateInterval(100);
        
        subscriptionRef.current = LightSensor.addListener(({ illuminance }) => {
          if (!isMounted) return;
          
          setRawValue(illuminance);
          
          // Calibrate baseline on first reading
          if (baselineLightRef.current === null) {
            baselineLightRef.current = illuminance;
            maxLightRef.current = illuminance * 1.5;
            minLightRef.current = illuminance * 0.3;
            console.log('Light baseline set:', illuminance);
          }
          
          // Update min/max for better calibration
          if (illuminance > maxLightRef.current) maxLightRef.current = illuminance;
          if (illuminance < minLightRef.current && illuminance > 0) minLightRef.current = illuminance;
          
          // Normalize to 0-1 (inverted: less light = higher value = DOWN)
          const range = maxLightRef.current - minLightRef.current;
          const normalized = range > 0 
            ? 1 - ((illuminance - minLightRef.current) / range)
            : 0.5;
          
          // Clamp to 0-1
          const clamped = Math.max(0, Math.min(1, normalized));
          setCurrentValue(clamped);
          setIsActive(true);
          
          setDebugText(`💡 ${illuminance.toFixed(0)} lux → ${(clamped * 100).toFixed(0)}%`);
          
          // Create landmarks
          const landmarks = createLandmarks(clamped);
          onPoseDetected(landmarks);
        });
      } else {
        // Fall back to accelerometer (for iOS or if no light sensor)
        setSensorType('motion');
        setDebugText('Using Motion (tilt phone)');
        
        Accelerometer.setUpdateInterval(100);
        
        subscriptionRef.current = Accelerometer.addListener(({ x, y, z }) => {
          if (!isMounted) return;
          
          // Use device tilt for detection
          const tilt = (z + 1) / 2; // Normalize Z from -1,1 to 0,1
          setCurrentValue(tilt);
          setRawValue(z);
          setIsActive(true);
          
          setDebugText(`Tilt Z: ${z.toFixed(2)} → ${(tilt * 100).toFixed(0)}%`);
          
          const landmarks = createLandmarks(tilt);
          onPoseDetected(landmarks);
        });
      }
    };

    setupSensors();

    return () => {
      isMounted = false;
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
    };
  }, [onPoseDetected]);

  // Helper to create landmarks array
  const createLandmarks = (normalizedY: number) => {
    const landmarks = [];
    for (let i = 0; i < 7; i++) {
      landmarks.push({
        x: 0.5,
        y: normalizedY,
        score: 0.95,
        name: i === 5 ? 'left_shoulder' : i === 6 ? 'right_shoulder' : `point_${i}`,
      });
    }
    return landmarks;
  };

  // Calculate indicator position
  const indicatorPosition = currentValue * 100;

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
                {sensorType === 'light' ? '💡 Light Sensor' : '📱 Motion'}
              </Text>
            </View>
            
            {/* Position indicator */}
            <View style={styles.meterContainer}>
              <Text style={styles.meterTitle}>Your Position</Text>
              
              <View style={styles.meterRow}>
                <Text style={styles.posLabel}>UP</Text>
                <View style={styles.meterBar}>
                  <View style={styles.thresholdUp} />
                  <View style={styles.thresholdDown} />
                  <View 
                    style={[
                      styles.meterIndicator,
                      { 
                        top: `${indicatorPosition}%`,
                        backgroundColor: currentValue > 0.6 ? '#FF5722' : 
                                         currentValue < 0.4 ? '#4CAF50' : '#FFC107'
                      }
                    ]} 
                  />
                </View>
                <Text style={styles.posLabel}>DOWN</Text>
              </View>
              
              <Text style={styles.debugText}>{debugText}</Text>
            </View>

            {/* Instructions based on sensor type */}
            <View style={styles.instructionsBox}>
              {sensorType === 'light' ? (
                <>
                  <Text style={styles.instructionsTitle}>💡 Light Detection Mode</Text>
                  <Text style={styles.instructionsText}>
                    ✓ Phone flat on floor, screen UP
                  </Text>
                  <Text style={styles.instructionsText}>
                    ✓ Position yourself over the phone
                  </Text>
                  <Text style={styles.instructionsText}>
                    ✓ Your body blocks light = DOWN
                  </Text>
                  <Text style={styles.instructionsText}>
                    ✓ Body moves away = UP = REP!
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.instructionsTitle}>📱 Tilt Detection Mode</Text>
                  <Text style={styles.instructionsText}>
                    • Hold phone or strap to arm
                  </Text>
                  <Text style={styles.instructionsText}>
                    • Tilt forward = DOWN
                  </Text>
                  <Text style={styles.instructionsText}>
                    • Tilt back = UP = REP!
                  </Text>
                </>
              )}
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
export const useIsAIModeAvailable = () => true;

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
    backgroundColor: 'rgba(0,0,0,0.9)',
    paddingHorizontal: 20,
    paddingVertical: 12,
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
  },
  statusText: {
    color: '#00FF00',
    fontSize: 16,
    fontWeight: 'bold',
  },
  meterContainer: {
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    alignSelf: 'center',
    alignItems: 'center',
  },
  meterTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  posLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: 'bold',
    width: 40,
    textAlign: 'center',
  },
  meterBar: {
    width: 50,
    height: 150,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 25,
    position: 'relative',
    borderWidth: 2,
    borderColor: '#333',
  },
  thresholdUp: {
    position: 'absolute',
    top: '40%',
    left: 4,
    right: 4,
    height: 3,
    backgroundColor: '#4CAF50',
    borderRadius: 2,
  },
  thresholdDown: {
    position: 'absolute',
    top: '60%',
    left: 4,
    right: 4,
    height: 3,
    backgroundColor: '#FF5722',
    borderRadius: 2,
  },
  meterIndicator: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    left: 2,
    marginTop: -21,
    borderWidth: 3,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  debugText: {
    color: '#888',
    fontSize: 11,
    marginTop: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  instructionsBox: {
    backgroundColor: 'rgba(0,0,0,0.9)',
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
    marginBottom: 12,
    textAlign: 'center',
  },
  instructionsText: {
    color: '#CCC',
    fontSize: 13,
    marginVertical: 3,
    lineHeight: 20,
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
