import React, { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from 'react-native';
import { TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
import { ModifierDefinition, CartLineConfig, buildDefaultConfig } from '../domain/cart';
import type { BoxDefinition } from '../domain/cart';
import Money from './Money';
import { createStyles, fonts, gradients, radii, spacing, useTheme } from './theme';
import { useI18n } from './i18n';

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
  basePrice = 0,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  productName: string;
  modDef: ModifierDefinition;
  /** The box's own price. It never changes with the mix, so the add
   *  button can show it up front. */
  basePrice?: number;
  onConfirm: (config: CartLineConfig, qty: number) => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [config, setConfig] = useState<CartLineConfig>(() => buildDefaultConfig(modDef) || {});
  const [qty, setQty] = useState(1);

  /**
   * renderBoxBuilder() (rakeen-pos.js:902). A box is not a set of modifier
   * GROUPS -- it is one pool of eligible items with a piece budget, so it
   * gets its own body rather than being forced through the chip UI.
   */
  const box = modDef as unknown as BoxDefinition;
  const isBox = box.isBox === true;
  const [picks, setPicks] = useState<Record<string, number>>({});
  const pickedTotal = Object.values(picks).reduce((a, b) => a + b, 0);
  const slotsLeft = box.slots - pickedTotal;
  const boxComplete = isBox && pickedTotal === box.slots;
  const [boxNotice, setBoxNotice] = useState('');

  const bumpPick = (id: string, delta: number) => {
    setBoxNotice('');
    if (delta > 0 && pickedTotal >= box.slots) {
      // The source toasts rather than silently ignoring the tap, so the
      // cashier knows the box is full and not that the button is broken.
      setBoxNotice(`البوكس مكتمل — ${box.slots} اختيار`);
      return;
    }
    setPicks(prev => {
      const next = (prev[id] || 0) + delta;
      if (next < 0) return prev;
      return { ...prev, [id]: next };
    });
  };

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
            {isBox ? (
              box.items.length === 0 ? (
                // The owner has not chosen what may go in this box yet.
                // Says where to fix it rather than showing an empty grid.
                <View style={styles.boxEmpty}>
                  <Text style={styles.boxEmptyText}>
                    هذا البوكس ما له أصناف محددة بعد — لازم تحدد الأصناف اللي يقدر العميل يختار منها الأول.
                  </Text>
                  <Text style={styles.boxEmptyHint}>
                    من لوحة التحكم: القائمة ← عدّل هذا المنتج ← تبويب "التكلفة والمخزون" ← حدد الأصناف المؤهلة.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.boxProgressLabel}>
                    {pickedTotal} / {box.slots} اختيار
                  </Text>
                  <View style={styles.boxProgress}>
                    <View
                      style={[
                        styles.boxProgressBar,
                        { width: `${Math.min(100, Math.round((pickedTotal / (box.slots || 1)) * 100))}%` },
                      ]}
                    />
                  </View>
                  <View style={styles.boxGrid}>
                    {box.items.map(it => (
                      <View key={it.id} style={styles.boxItem}>
                        <Text style={styles.boxItemName} numberOfLines={2}>
                          {it.name}
                        </Text>
                        <View style={styles.boxItemQty}>
                          <TouchableOpacity style={styles.qtyBtn} onPress={() => bumpPick(it.id, -1)}>
                            <Text style={styles.qtyBtnText}>{'−'}</Text>
                          </TouchableOpacity>
                          <Text style={styles.qtyVal}>{picks[it.id] || 0}</Text>
                          <TouchableOpacity style={styles.qtyBtn} onPress={() => bumpPick(it.id, 1)}>
                            <Text style={styles.qtyBtnText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                  {!!boxNotice && <Text style={styles.boxNotice}>{boxNotice}</Text>}
                </>
              )
            ) : (
            modDef.groups.map(group => (
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
                        {/* .mod-chip-price is one of the few money-ish
                            figures the source does NOT put through
                            rkMoney(): it prints the RAW number with a sign
                            and no riyal mark (rakeen-pos.js:856), so a +2
                            delta reads "+2", not "+2.00". */}
                        {opt.price !== 0 && (
                          <Text style={styles.chipPrice}>
                            {opt.price > 0 ? '+' : ''}
                            {opt.price}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )))}
          </ScrollView>
          {/* A box has no quantity stepper: the source adds exactly one
              box, because the pieces INSIDE it are the quantity. Its add
              button stays disabled until every slot is filled -- a
              half-filled box would decrement stock for a product the
              customer did not actually get. */}
          {isBox ? (
            <View style={styles.footer}>
              {boxComplete ? (
                <TouchableOpacity
                  style={styles.confirmWrap}
                  onPress={() => onConfirm({ selections: picks } as unknown as CartLineConfig, 1)}
                  activeOpacity={0.85}>
                  <View style={styles.confirmButton}>
                    <GradientFill gradient={gradients.payButton} radius={radii.md} />
                    <View style={styles.confirmRow}>
                      <Text style={styles.confirmText}>{t('أضف')} — </Text>
                      <Money value={basePrice} size={14} color={colors.flagGreenDeep} />
                    </View>
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={[styles.confirmWrap, styles.confirmButton, styles.confirmDisabled]}>
                  <Text style={[styles.confirmText, styles.confirmTextDisabled]}>
                    {box.items.length === 0
                      ? 'ما فيه أصناف متاحة'
                      : `اكمل باقي الاختيارات (${slotsLeft} متبقي)`}
                  </Text>
                </View>
              )}
            </View>
          ) : (
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
              <View style={styles.confirmButton}>
                <GradientFill gradient={gradients.payButton} radius={radii.md} />
                <Text style={styles.confirmText}>إضافة</Text>
              </View>
            </TouchableOpacity>
          </View>
          )}
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
  // .box-progress-label
  boxProgressLabel: { textAlign: 'center', fontFamily: fonts.sansBold, fontSize: 15, color: colors.text, marginBottom: 9 },
  // .box-progress / .box-progress-bar
  boxProgress: { height: 9, borderRadius: radii.full, backgroundColor: colors.surf2, overflow: 'hidden', marginBottom: 20 },
  boxProgressBar: { height: '100%', borderRadius: radii.full, backgroundColor: colors.limeDeep },
  // .box-items-grid -- a column, despite the name
  boxGrid: { flexDirection: 'column', gap: 10, marginBottom: 16 },
  // .box-item
  boxItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: radii.md,
    backgroundColor: colors.surf1,
    borderWidth: 1,
    borderColor: colors.line,
  },
  boxItemName: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text, flex: 1 },
  // .box-item-qty
  boxItemQty: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
  qtyVal: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.text, minWidth: 18, textAlign: 'center' },
  // the full-box notice, shown inline instead of as a toast
  boxNotice: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted, textAlign: 'center', marginBottom: 10 },
  // .box-empty-state
  boxEmpty: { alignItems: 'center', paddingVertical: 26, paddingHorizontal: 10 },
  boxEmptyText: { fontFamily: fonts.sansBold, fontSize: 13, lineHeight: 20.8, color: colors.muted, textAlign: 'center', marginBottom: 10 },
  boxEmptyHint: { fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.muted, opacity: 0.85, textAlign: 'center' },
  confirmRow: { flexDirection: 'row', alignItems: 'center' },
  confirmDisabled: { backgroundColor: colors.surf2 },
  confirmTextDisabled: { color: colors.muted },
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
  confirmButton: { paddingVertical: 15, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lime },
  confirmText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.flagGreenDeep },
  }),
);
