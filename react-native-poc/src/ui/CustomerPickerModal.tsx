import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
import { searchCustomers } from '../application/customerService';
import { validateNewCustomerDraft, looksLikePhoneNumber, Customer } from '../domain/customer';
import { createStyles, fonts, gradients, radii, spacing, useTheme } from './theme';

/**
 * Feature Parity Pass -- Customer Management. Ported from the PWA's
 * real renderCustomerStep/renderNewCustomerStep (public/pos/rakeen-pos.js):
 * debounced name-or-phone search (250ms, matched here), a "+ إضافة عميل
 * جديد" fallback row when there's no exact match, and a new-customer
 * form pre-filling whichever field (name vs phone) the cashier already
 * typed, detected via the same digit-first heuristic. No standalone
 * customer directory -- that quick action is a real, disclosed
 * placeholder in the PWA itself (a toast, not a screen), so nothing to
 * port there.
 *
 * Visuals: .customer-panel input / .customer-suggest(-avatar/-name/-phone/
 * -points/-new) match rakeen-pos.css value-for-value.
 */
export default function CustomerPickerModal({
  visible,
  businessId,
  onCancel,
  onSelect,
}: {
  visible: boolean;
  businessId: number;
  onCancel: () => void;
  onSelect: (customer: { id: number | null; name: string; phone: string | null; points: number }) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      setShowNewForm(false);
      setNewName('');
      setNewPhone('');
    }
  }, [visible]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchCustomers(businessId, query);
        setResults(found);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, businessId]);

  const openNewForm = () => {
    if (looksLikePhoneNumber(query)) {
      setNewPhone(query.trim());
      setNewName('');
    } else {
      setNewName(query.trim());
      setNewPhone('');
    }
    setShowNewForm(true);
  };

  const validation = validateNewCustomerDraft({ name: newName, phone: newPhone });

  const handleCreateNew = () => {
    if (!validation.valid) return;
    // customer_id stays null -- complete_pos_order/register_dine_in_order
    // find-or-create by phone server-side (real RPC behavior, not
    // something this client re-implements).
    onSelect({ id: null, name: newName.trim(), phone: newPhone.trim(), points: 0 });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {!showNewForm ? (
            <>
              <Text style={styles.title}>اختر عميلًا</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor={colors.muted}
                value={query}
                onChangeText={setQuery}
                placeholder="ابحث بالاسم أو رقم الجوال"
                autoFocus
              />
              {searching && <ActivityIndicator style={styles.spinner} color={colors.accentText} />}
              {results.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.suggest}
                  onPress={() => onSelect({ id: c.id, name: c.name, phone: c.phone, points: c.points })}
                  activeOpacity={0.8}>
                  <View style={styles.suggestAvatar}>
                    <Text style={styles.suggestAvatarText}>{c.name.trim().charAt(0) || '؟'}</Text>
                  </View>
                  <View style={styles.suggestInfo}>
                    <Text style={styles.suggestName} numberOfLines={1}>{c.name}</Text>
                    {!!c.phone && <Text style={styles.suggestPhone}>{c.phone}</Text>}
                  </View>
                  {c.points > 0 && (
                    <View style={styles.suggestPoints}>
                      <Text style={styles.suggestPointsText}>{c.points} نقطة</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
              {query.trim().length >= 2 && (
                <TouchableOpacity style={[styles.suggest, styles.suggestNew]} onPress={openNewForm} activeOpacity={0.8}>
                  <View style={[styles.suggestAvatar, styles.suggestAvatarNew]}>
                    <Text style={styles.suggestAvatarText}>+</Text>
                  </View>
                  <Text style={styles.newRowText}>إضافة عميل جديد</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>عميل جديد</Text>
              <TextInput style={styles.input} placeholderTextColor={colors.muted} value={newName} onChangeText={setNewName} placeholder="الاسم" />
              <TextInput
                style={styles.input}
                placeholderTextColor={colors.muted}
                value={newPhone}
                onChangeText={setNewPhone}
                placeholder="رقم الجوال"
                keyboardType="phone-pad"
              />
              {!validation.valid && (
                <Text style={styles.errorText}>{validation.errors.join(' — ')}</Text>
              )}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.backButton} onPress={() => setShowNewForm(false)}>
                  <Text style={styles.cancelText}>رجوع</Text>
                </TouchableOpacity>
                {validation.valid ? (
                  <TouchableOpacity style={styles.confirmWrap} onPress={handleCreateNew} activeOpacity={0.85}>
                    <View style={styles.confirmButton}>
                      <GradientFill gradient={gradients.payButton} radius={radii.md} />
                      <Text style={styles.confirmText}>متابعة</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.confirmButton, styles.confirmButtonDisabled]}>
                    <Text style={[styles.confirmText, styles.confirmTextDisabled]}>متابعة</Text>
                  </View>
                )}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.modalOverlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.cardBg, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing[5], maxHeight: '80%' },
  title: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text, marginBottom: spacing[3], textAlign: 'center' },
  // .customer-panel input
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.sm,
    backgroundColor: colors.surf1,
    color: colors.text,
    padding: 10,
    fontFamily: fonts.sansSemiBold,
    fontSize: 12.5,
    marginBottom: spacing[2],
    textAlign: 'right',
  },
  spinner: { marginBottom: spacing[2] },
  // .customer-suggest
  suggest: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', padding: 8, borderRadius: radii.md, backgroundColor: colors.surf2, marginBottom: 6 },
  suggestNew: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line },
  // .customer-suggest-avatar
  suggestAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: `rgba(${colors.limeRgb},0.22)` },
  suggestAvatarNew: { backgroundColor: colors.surf1 },
  suggestAvatarText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.flagGreenDeep },
  suggestInfo: { flex: 1, minWidth: 0, gap: 1 },
  suggestName: { fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.text },
  suggestPhone: { fontFamily: fonts.sansSemiBold, fontSize: 10.5, color: colors.muted },
  // .customer-suggest-points
  suggestPoints: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.full, backgroundColor: colors.lime },
  suggestPointsText: { fontFamily: fonts.sansBold, fontSize: 10, color: colors.flagGreenDeep },
  newRowText: { fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.muted },
  errorText: { fontFamily: fonts.sansBold, color: colors.danger, fontSize: 12, marginBottom: spacing[2] },
  actions: { flexDirection: 'row', gap: 10, marginTop: spacing[2] },
  backButton: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: colors.surf1, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md },
  cancelButton: { padding: 14, alignItems: 'center', marginTop: 4 },
  cancelText: { fontFamily: fonts.sansBold, color: colors.muted },
  confirmWrap: { flex: 1 },
  confirmButton: { flex: 1, padding: 14, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.lime },
  confirmButtonDisabled: { backgroundColor: colors.surf2 },
  confirmText: { fontFamily: fonts.sansBold, color: colors.flagGreenDeep },
  confirmTextDisabled: { color: colors.muted },
  }),
);
