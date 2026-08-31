import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { loadCatalog, getBusinessType, CatalogResult } from '../application/catalogService';
import type { Product } from '../domain/catalog';
import type { CashierProfile } from '../domain/auth';

/**
 * Checkpoint 3 (docs/react-native-migration/01-roadmap.md) -- the real
 * product/category screen, scoped deliberately: shows the actual
 * business's real categories and products (menu_items or services,
 * matching rakeen-pos.js's own business-type branch), same negative-id
 * convention for services. Tapping a product doesn't add to a cart yet --
 * Cart is Checkpoint 4, kept separate on purpose rather than building
 * ahead of the roadmap.
 */
export default function ProductsScreen({ cashier }: { cashier: CashierProfile }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState<CatalogResult | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [tappedProductId, setTappedProductId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const businessType = await getBusinessType(cashier.business_id);
        const result = await loadCatalog(cashier.business_id, businessType);
        setCatalog(result);
        if (result.categories.length > 0) {
          setActiveCategoryId(result.categories[0].id);
        }
      } catch (e) {
        setError('تعذر تحميل المنتجات — تحقق من الاتصال.');
      } finally {
        setLoading(false);
      }
    })();
  }, [cashier.business_id]);

  const visibleProducts = useMemo<Product[]>(() => {
    if (!catalog) return [];
    if (!activeCategoryId) return catalog.products;
    return catalog.products.filter(p => p.categoryId === activeCategoryId);
  }, [catalog, activeCategoryId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!catalog || catalog.categories.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.subtitle}>لا يوجد منتجات لهذا المشروع.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {catalog.usingOfflineSnapshot && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>لا يوجد اتصال — يعمل بمنيو محفوظ محليًا</Text>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryBar}>
        {catalog.categories.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.categoryTab, activeCategoryId === cat.id && styles.categoryTabActive]}
            onPress={() => setActiveCategoryId(cat.id)}>
            <Text
              style={[styles.categoryTabText, activeCategoryId === cat.id && styles.categoryTabTextActive]}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={visibleProducts}
        keyExtractor={p => String(p.id)}
        numColumns={2}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.productCard, tappedProductId === item.id && styles.productCardTapped]}
            onPress={() => setTappedProductId(item.id)}>
            <Text style={styles.productName} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.productPrice}>{item.price.toFixed(2)} ر.س</Text>
            {item.isService && item.durationMinutes ? (
              <Text style={styles.productMeta}>{item.durationMinutes} د</Text>
            ) : null}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.subtitle}>لا يوجد منتجات في هذا التصنيف.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f2f5f0' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  subtitle: { fontSize: 13, color: '#666', textAlign: 'center' },
  error: { color: '#c0392b', fontSize: 14, textAlign: 'center' },
  offlineBanner: { backgroundColor: '#fff3cd', padding: 8 },
  offlineBannerText: { fontSize: 12, color: '#856404', textAlign: 'center' },
  categoryBar: { flexGrow: 0, paddingHorizontal: 8, paddingVertical: 10 },
  categoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  categoryTabActive: { backgroundColor: '#8bc34a', borderColor: '#8bc34a' },
  categoryTabText: { fontSize: 13, color: '#444' },
  categoryTabTextActive: { color: '#1a1a1a', fontWeight: '700' },
  grid: { padding: 8 },
  productCard: {
    flex: 1,
    margin: 6,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    minHeight: 90,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  productCardTapped: { borderColor: '#8bc34a', borderWidth: 2 },
  productName: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  productPrice: { fontSize: 13, color: '#2e7d32', fontWeight: '600' },
  productMeta: { fontSize: 11, color: '#888', marginTop: 4 },
});
