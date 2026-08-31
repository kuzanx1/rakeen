import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { ModifierDefinition, CartLineConfig, buildDefaultConfig } from '../domain/cart';

/**
 * The real "customize" flow for a product with modifier groups (single-
 * select and multi-select), per rakeen-pos.js's openProductFlow's
 * customize path. Box/meal products are out of scope this checkpoint
 * (see domain/cart.ts) -- this modal only ever receives a standard
 * ModifierDefinition.
 */
export default function ModifierModal({
  visible,
  productName,
  modDef,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  productName: string;
  modDef: ModifierDefinition;
  onConfirm: (config: CartLineConfig) => void;
  onCancel: () => void;
}) {
  const [config, setConfig] = useState<CartLineConfig>(() => buildDefaultConfig(modDef) || {});

  const selectSingle = (groupId: string, optionId: string) => {
    setConfig(prev => ({ ...prev, [groupId]: optionId }));
  };

  const toggleMulti = (groupId: string, optionId: string, max: number | null) => {
    setConfig(prev => {
      const current = Array.isArray(prev[groupId]) ? (prev[groupId] as string[]) : [];
      const has = current.includes(optionId);
      let next: string[];
      if (has) {
        next = current.filter(id => id !== optionId);
      } else if (max != null && current.length >= max) {
        next = current; // at max -- matches the source's implicit cap via `max_select`, no toast, just a no-op
      } else {
        next = [...current, optionId];
      }
      return { ...prev, [groupId]: next };
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{productName}</Text>
          <ScrollView>
            {modDef.groups.map(group => (
              <View key={group.id} style={styles.group}>
                <Text style={styles.groupTitle}>
                  {group.name} {group.required ? '(مطلوب)' : ''}
                </Text>
                {group.options.map(opt => {
                  const selected =
                    group.type === 'single'
                      ? config[group.id] === opt.id
                      : Array.isArray(config[group.id]) && (config[group.id] as string[]).includes(opt.id);
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.option, selected && styles.optionSelected]}
                      onPress={() =>
                        group.type === 'single'
                          ? selectSingle(group.id, opt.id)
                          : toggleMulti(group.id, opt.id, group.max)
                      }>
                      <Text style={styles.optionText}>{opt.name}</Text>
                      {opt.price !== 0 && (
                        <Text style={styles.optionPrice}>
                          {opt.price > 0 ? '+' : ''}
                          {opt.price.toFixed(2)}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmButton} onPress={() => onConfirm(config)}>
              <Text style={styles.confirmText}>إضافة</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '80%' },
  title: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  group: { marginBottom: 14 },
  groupTitle: { fontSize: 13, fontWeight: '700', marginBottom: 6, color: '#333' },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 6,
  },
  optionSelected: { borderColor: '#8bc34a', backgroundColor: '#f1f8e9' },
  optionText: { fontSize: 13 },
  optionPrice: { fontSize: 12, color: '#2e7d32' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  cancelButton: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: '#eee', borderRadius: 10 },
  cancelText: { fontWeight: '700', color: '#444' },
  confirmButton: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: '#8bc34a', borderRadius: 10 },
  confirmText: { fontWeight: '700', color: '#1a1a1a' },
});
