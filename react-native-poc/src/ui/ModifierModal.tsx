import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { ModifierDefinition, CartLineConfig, buildDefaultConfig } from '../domain/cart';
import { createStyles, fonts, gradients, radii, spacing } from './theme';

/**
 * The real "customize" flow for a product with modifier groups (single-
 * select and multi-select), per rakeen-pos.js's openProductFlow's
 * customize path. Box/meal products are out of scope this checkpoint
 * (see domain/cart.ts) -- this modal only ever receives a standard
 * ModifierDefinition.
 *
 * Visuals: .mod-group/.mod-group-badge/.mod-chip/.modifier-footer/
 * .modifier-qty/.mqty-btn/.modifier-add-btn match rakeen-pos.css
 * value-for-value. Matches PaymentModal's pattern of a single
 * full-width gradient CTA instead of a 50/50 cancel/confirm row --
 * closing is a corner X, same as every other real PWA modal.
 *
 * The qty stepper was a real, disclosed gap found in this pass: the
 * confirm handler always hardcoded qty=1 even though useCart's own
 * addWithConfig(productId, config, qty) already accepts a real
 * quantity -- only the UI to choose one was missing, not the plumbing.
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
  onConfirm: (config: CartLineConfig, qty: number) => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const [config, setConfig] = useState<CartLineConfig>(() => buildDefaultConfig(modDef) || {});
  const [qty, setQty] = useState(1);

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
          <View style={styles.head}>
            <Text style={styles.title}>{productName}</Text>
            <TouchableOpacity onPress={onCancel} style={styles.closeCircle}>
              <Text style={styles.closeCircleText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
            {modDef.groups.map(group => (
              <View key={group.id} style={styles.group}>
                <View style={styles.groupHead}>
                  <Text style={styles.groupTitle}>{group.name}</Text>
                  <View style={[styles.groupBadge, group.required && styles.groupBadgeRequired]}>
                    <Text style={[styles.groupBadgeText, group.required && styles.groupBadgeTextRequired]}>
                      {group.required ? 'مطلوب' : 'اختياري'}
                    </Text>
                  </View>
                </View>
                <View style={styles.options}>
                  {group.options.map(opt => {
                    const selected =
                      group.type === 'single'
                        ? config[group.id] === opt.id
                        : Array.isArray(config[group.id]) && (config[group.id] as string[]).includes(opt.id);
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[styles.chip, selected && styles.chipSelected]}
                        onPress={() =>
                          group.type === 'single'
                            ? selectSingle(group.id, opt.id)
                            : toggleMulti(group.id, opt.id, group.max)
                        }
                        activeOpacity={0.8}>
                        <Text style={styles.chipText}>{opt.name}</Text>
                        {opt.price !== 0 && (
                          <Text style={styles.chipPrice}>
                            {opt.price > 0 ? '+' : ''}
                            {opt.price.toFixed(2)}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={styles.footer}>
            {/* .modifier-qty / .mqty-btn */}
            <View style={styles.qtyStepper}>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty(q => Math.max(1, q - 1))} activeOpacity={0.8}>
                <Text style={styles.qtyBtnText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.qtyValue}>{qty}</Text>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty(q => q + 1)} activeOpacity={0.8}>
                <Text style={styles.qtyBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.confirmWrap} onPress={() => onConfirm(config, qty)} activeOpacity={0.85}>
              <LinearGradient colors={gradients.payButton.colors} start={gradients.payButton.start} end={gradients.payButton.end} style={styles.confirmButton}>
                <Text style={styles.confirmText}>إضافة</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.modalOverlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.cardBg, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing[4], maxHeight: '80%' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[3] },
  title: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text },
  closeCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' },
  closeCircleText: { color: colors.muted, fontSize: 13 },
  // .mod-group
  group: { marginBottom: spacing[5] },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[2] },
  groupTitle: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.text },
  // .mod-group-badge
  groupBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radii.full, backgroundColor: colors.surf2 },
  groupBadgeRequired: { backgroundColor: `rgba(${colors.dangerRgb},0.14)` },
  groupBadgeText: { fontFamily: fonts.sansBold, fontSize: 10, color: colors.muted },
  groupBadgeTextRequired: { color: colors.danger },
  // .mod-options
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  // .mod-chip
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 42,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: radii.full,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
  },
  chipSelected: { borderColor: colors.limeDeep, backgroundColor: `rgba(${colors.limeRgb},0.13)` },
  chipText: { fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.text },
  // .mod-chip-price -- --lime-deep, overridden to --lime in dark
  chipPrice: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.accentText, writingDirection: 'ltr' },
  // .modifier-footer
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: spacing[2], paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.line },
  // .modifier-qty
  qtyStepper: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: 11, borderRadius: radii.full, backgroundColor: colors.surf1, borderWidth: 1, borderColor: colors.line },
  // .mqty-btn
  qtyBtn: { width: 27, height: 27, borderRadius: 14, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
  qtyValue: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.text, minWidth: 16, textAlign: 'center' },
  // .modifier-footer .modifier-add-btn
  confirmWrap: { flex: 1 },
  confirmButton: { paddingVertical: 15, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  confirmText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.flagGreenDeep },
  }),
);
