import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { searchCustomers } from '../application/customerService';
import { validateNewCustomerDraft, looksLikePhoneNumber, Customer } from '../domain/customer';

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
                value={query}
                onChangeText={setQuery}
                placeholder="ابحث بالاسم أو رقم الجوال"
                autoFocus
              />
              {searching && <ActivityIndicator style={styles.spinner} />}
              {results.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.resultRow}
                  onPress={() => onSelect({ id: c.id, name: c.name, phone: c.phone, points: c.points })}>
                  <Text style={styles.resultName}>{c.name}</Text>
                  <Text style={styles.resultPhone}>{c.phone || ''}</Text>
                  {c.points > 0 && <Text style={styles.resultPoints}>{c.points} نقطة</Text>}
                </TouchableOpacity>
              ))}
              {query.trim().length >= 2 && (
                <TouchableOpacity style={styles.newRow} onPress={openNewForm}>
                  <Text style={styles.newRowText}>+ إضافة عميل جديد</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>عميل جديد</Text>
              <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="الاسم" />
              <TextInput
                style={styles.input}
                value={newPhone}
                onChangeText={setNewPhone}
                placeholder="رقم الجوال"
                keyboardType="phone-pad"
              />
              {!validation.valid && (
                <Text style={styles.errorText}>{validation.errors.join(' — ')}</Text>
              )}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setShowNewForm(false)}>
                  <Text style={styles.cancelText}>رجوع</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmButton, !validation.valid && styles.confirmButtonDisabled]}
                  onPress={handleCreateNew}
                  disabled={!validation.valid}>
                  <Text style={styles.confirmText}>متابعة</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '80%' },
  title: { fontSize: 16, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 10 },
  spinner: { marginBottom: 10 },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f2f5f0',
    marginBottom: 6,
  },
  resultName: { fontWeight: '700', fontSize: 13, flex: 1 },
  resultPhone: { fontSize: 12, color: '#666', marginEnd: 8 },
  resultPoints: { fontSize: 11, color: '#8bc34a', fontWeight: '700' },
  newRow: { padding: 12, alignItems: 'center', marginTop: 4, marginBottom: 10 },
  newRowText: { color: '#3f51b5', fontWeight: '700' },
  errorText: { color: '#c0392b', fontSize: 12, marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 10 },
  cancelButton: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: '#eee', borderRadius: 10 },
  cancelText: { fontWeight: '700', color: '#444' },
  confirmButton: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: '#8bc34a', borderRadius: 10 },
  confirmButtonDisabled: { backgroundColor: '#ccc' },
  confirmText: { fontWeight: '700', color: '#1a1a1a' },
});
