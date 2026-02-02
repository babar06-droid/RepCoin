import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface StoreItem {
  item_id: string;
  name: string;
  cost: number;
  unlocked: boolean;
}

export default function StoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [repPoints, setRepPoints] = useState(0);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    fetchStore();
  }, []);

  const fetchStore = async () => {
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/store`);
      const data = await response.json();
      setItems(data.items);
      setRepPoints(data.rep_points);
    } catch (error) {
      console.log('Fetch store error:', error);
    } finally {
      setLoading(false);
    }
  };

  const purchaseItem = async (itemId: string) => {
    setPurchasing(itemId);
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/store/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId }),
      });
      const data = await response.json();
      
      if (data.success) {
        Alert.alert('Success! 🎉', data.message);
        setRepPoints(data.rep_points);
        // Update item status
        setItems(prev => prev.map(item => 
          item.item_id === itemId ? { ...item, unlocked: true } : item
        ));
      } else {
        Alert.alert('Cannot Purchase', data.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to purchase item');
    } finally {
      setPurchasing(null);
    }
  };

  const getItemIcon = (itemId: string) => {
    switch (itemId) {
      case 'badge':
        return <MaterialCommunityIcons name="medal" size={48} color="#FFD700" />;
      case 'premium':
        return <MaterialCommunityIcons name="star-circle" size={48} color="#9C27B0" />;
      default:
        return <Ionicons name="gift" size={48} color="#FFF" />;
    }
  };

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
        <Text style={styles.headerTitle}>Store</Text>
        <View style={styles.pointsBadge}>
          <Text style={styles.pointsText}>{repPoints} REP</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Store Banner */}
        <View style={styles.banner}>
          <Ionicons name="storefront" size={40} color="#FFD700" />
          <Text style={styles.bannerTitle}>REP Store</Text>
          <Text style={styles.bannerSubtitle}>Spend your hard-earned REP Points!</Text>
        </View>

        {/* Store Items */}
        <Text style={styles.sectionTitle}>Available Items</Text>
        
        {items.map((item) => (
          <View key={item.item_id} style={styles.itemCard}>
            <View style={styles.itemIconContainer}>
              {getItemIcon(item.item_id)}
              {item.unlocked && (
                <View style={styles.unlockedBadge}>
                  <Ionicons name="checkmark" size={16} color="#FFF" />
                </View>
              )}
            </View>
            
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemCost}>
                {item.unlocked ? '✓ Unlocked' : `${item.cost} REP`}
              </Text>
            </View>
            
            <TouchableOpacity
              style={[
                styles.buyButton,
                item.unlocked && styles.buyButtonUnlocked,
                repPoints < item.cost && !item.unlocked && styles.buyButtonDisabled,
              ]}
              onPress={() => !item.unlocked && purchaseItem(item.item_id)}
              disabled={item.unlocked || purchasing === item.item_id}
            >
              {purchasing === item.item_id ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={[
                  styles.buyButtonText,
                  item.unlocked && styles.buyButtonTextUnlocked,
                ]}>
                  {item.unlocked ? 'Owned' : 'Buy'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ))}

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color="#4CAF50" />
          <Text style={styles.infoText}>
            Earn REP Points by completing reps in your workouts. 
            Each rep earns you 1 REP Point!
          </Text>
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
    color: '#FFF',
  },
  pointsBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pointsText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  banner: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 24,
  },
  bannerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFD700',
    marginTop: 12,
  },
  bannerSubtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 16,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  itemIconContainer: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  unlockedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    marginLeft: 16,
  },
  itemName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
  itemCost: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  buyButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  buyButtonUnlocked: {
    backgroundColor: '#4CAF50',
  },
  buyButtonDisabled: {
    backgroundColor: '#555',
  },
  buyButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
  },
  buyButtonTextUnlocked: {
    color: '#FFF',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76,175,80,0.1)',
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.3)',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#CCC',
    lineHeight: 18,
  },
});
