import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface WalletData {
  total_coins: number;
  total_pushups: number;
  total_situps: number;
  sessions_count: number;
}

interface RepPointsData {
  rep_points: number;
  message: string;
}

interface Session {
  id: string;
  pushups: number;
  situps: number;
  total_coins: number;
  timestamp: string;
}

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [walletData, setWalletData] = useState<WalletData>({
    total_coins: 0,
    total_pushups: 0,
    total_situps: 0,
    sessions_count: 0,
  });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [repPoints, setRepPoints] = useState(0);

  // Animations
  const coinScale = useRef(new Animated.Value(0)).current;
  const coinRotation = useRef(new Animated.Value(0)).current;
  const statsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance animations
    Animated.sequence([
      Animated.spring(coinScale, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
      Animated.timing(statsOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    // Coin shimmer animation
    Animated.loop(
      Animated.timing(coinRotation, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  // Auto-refresh REP points when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchWalletData();
    }, [])
  );

  const fetchWalletData = async () => {
    try {
      // Fetch REP points from main wallet endpoint
      const repRes = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/wallet`);
      if (repRes.ok) {
        const repData = await repRes.json();
        if (repData.rep_points !== undefined) {
          setRepPoints(repData.rep_points);
        }
      }

      // Fetch workout stats from stats endpoint
      const statsRes = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/wallet/stats`);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setWalletData({
          total_coins: statsData.total_coins || 0,
          total_pushups: statsData.total_pushups || 0,
          total_situps: statsData.total_situps || 0,
          sessions_count: statsData.sessions_count || 0,
        });
      }

      // Fetch sessions
      const sessionsRes = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/sessions`);
      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        if (Array.isArray(data)) {
          setSessions(data.slice(0, 10)); // Get last 10 sessions
        }
      }
    } catch (error) {
      console.log('Error fetching wallet data:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWalletData();
    setRefreshing(false);
  };

  const shimmer = coinRotation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['-15deg', '15deg', '-15deg'],
  });

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Wallet</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FFD700"
          />
        }
      >
        {/* Main wallet card */}
        <Animated.View
          style={[
            styles.walletCard,
            { transform: [{ scale: coinScale }] },
          ]}
        >
          {/* Large coin display */}
          <Animated.View
            style={[
              styles.largeCoin,
              { transform: [{ rotate: shimmer }] },
            ]}
          >
            <View style={styles.coinInner}>
              <Text style={styles.coinLetter}>R</Text>
            </View>
          </Animated.View>

          <Text style={styles.balanceLabel}>Total Balance</Text>
          <Text style={styles.balanceAmount}>
            {repPoints.toLocaleString()}
          </Text>
          <Text style={styles.currencyName}>REP POINTS</Text>

          {/* Quick Add Rep Button */}
          <TouchableOpacity
            style={styles.addRepButton}
            onPress={async () => {
              try {
                const res = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/add_rep`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                });
                if (res.ok) {
                  const data = await res.json();
                  setRepPoints(data.rep_points);
                  // Animate coin
                  Animated.sequence([
                    Animated.timing(coinScale, { toValue: 1.2, duration: 100, useNativeDriver: true }),
                    Animated.timing(coinScale, { toValue: 1, duration: 100, useNativeDriver: true }),
                  ]).start();
                }
              } catch (error) {
                console.log('Add rep error:', error);
              }
            }}
          >
            <Ionicons name="add-circle" size={18} color="#4CAF50" />
            <Text style={styles.addRepButtonText}>+1 REP</Text>
          </TouchableOpacity>

          {/* Go to Store button */}
          <TouchableOpacity
            style={styles.storeButton}
            onPress={() => router.push('/store')}
          >
            <Ionicons name="storefront" size={18} color="#FFD700" />
            <Text style={styles.storeButtonText}>Visit Store</Text>
          </TouchableOpacity>

          {/* Decorative elements */}
          <View style={styles.cardDecor}>
            <View style={styles.decorDot} />
            <View style={styles.decorLine} />
            <View style={styles.decorDot} />
          </View>
        </Animated.View>

        {/* Stats cards */}
        <Animated.View style={[styles.statsContainer, { opacity: statsOpacity }]}>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="arm-flex" size={32} color="#FFD700" />
            <Text style={styles.statNumber}>{walletData.total_pushups}</Text>
            <Text style={styles.statLabel}>Push-ups</Text>
          </View>

          <View style={styles.statCard}>
            <MaterialCommunityIcons name="human" size={32} color="#4CAF50" />
            <Text style={styles.statNumber}>{walletData.total_situps}</Text>
            <Text style={styles.statLabel}>Sit-ups</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="fitness" size={32} color="#2196F3" />
            <Text style={styles.statNumber}>{walletData.sessions_count}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
        </Animated.View>

        {/* Earnings info */}
        <View style={styles.earningsInfo}>
          <Ionicons name="information-circle" size={20} color="#888" />
          <Text style={styles.earningsText}>
            Earn 1 REP COIN for every completed rep. Keep working out to grow your crypto wallet!
          </Text>
        </View>

        {/* Recent sessions */}
        <View style={styles.sessionsSection}>
          <Text style={styles.sectionTitle}>Recent Sessions</Text>

          {sessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="fitness-outline" size={48} color="#444" />
              <Text style={styles.emptyStateText}>No sessions yet</Text>
              <Text style={styles.emptyStateSubtext}>
                Start a workout to earn your first coins!
              </Text>
            </View>
          ) : (
            sessions.map((session, index) => (
              <View key={session.id || index} style={styles.sessionCard}>
                <View style={styles.sessionLeft}>
                  <View style={styles.sessionIcon}>
                    <Ionicons name="barbell" size={20} color="#FFD700" />
                  </View>
                  <View style={styles.sessionInfo}>
                    <Text style={styles.sessionTitle}>Workout Session</Text>
                    <Text style={styles.sessionDate}>
                      {formatDate(session.timestamp)}
                    </Text>
                  </View>
                </View>
                <View style={styles.sessionRight}>
                  <View style={styles.sessionStats}>
                    <Text style={styles.sessionStatText}>
                      {session.pushups} push-ups
                    </Text>
                    <Text style={styles.sessionStatText}>
                      {session.situps} sit-ups
                    </Text>
                  </View>
                  <View style={styles.sessionCoins}>
                    <Text style={styles.sessionCoinsText}>+{session.total_coins}</Text>
                    <MaterialCommunityIcons name="circle" size={16} color="#FFD700" />
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Bottom action button */}
      <View style={[styles.bottomAction, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.workoutButton}
          onPress={() => router.push('/workout')}
        >
          <Ionicons name="flash" size={24} color="#000" />
          <Text style={styles.workoutButtonText}>Start New Workout</Text>
        </TouchableOpacity>
      </View>
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
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
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
    paddingBottom: 100,
  },
  walletCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 24,
    overflow: 'hidden',
  },
  largeCoin: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  coinInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#B8860B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFD700',
  },
  coinLetter: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFF',
  },
  currencyName: {
    fontSize: 16,
    color: '#FFD700',
    fontWeight: '600',
    marginTop: 4,
  },
  storeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FFD700',
    backgroundColor: 'rgba(255,215,0,0.1)',
  },
  storeButtonText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
  },
  cardDecor: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
  },
  decorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  decorLine: {
    width: 60,
    height: 2,
    backgroundColor: '#333',
    marginHorizontal: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#333',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  earningsInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  earningsText: {
    flex: 1,
    fontSize: 14,
    color: '#AAA',
    marginLeft: 12,
    lineHeight: 20,
  },
  sessionsSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#444',
    marginTop: 8,
  },
  sessionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  sessionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sessionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionInfo: {
    marginLeft: 12,
  },
  sessionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  sessionDate: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  sessionRight: {
    alignItems: 'flex-end',
  },
  sessionStats: {
    alignItems: 'flex-end',
  },
  sessionStatText: {
    fontSize: 11,
    color: '#888',
  },
  sessionCoins: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  sessionCoinsText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginRight: 4,
  },
  bottomAction: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: 'rgba(10, 10, 10, 0.95)',
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  workoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD700',
    paddingVertical: 16,
    borderRadius: 30,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  workoutButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});
