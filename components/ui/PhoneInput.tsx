import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { useTheme } from '@/lib/theme/useTheme';
import {
  buildE164,
  findCountryByIso2,
  getDefaultCountryCode,
  parseE164ToLocal,
  filterCountries,
  allCountries,
  type CountryData,
} from '@/lib/phone/phone';

type PhoneInputProps = {
  /** Stored value: E.164 (+...) or empty */
  value: string;
  onChange: (e164: string) => void;
};

export function PhoneInput({ value, onChange }: PhoneInputProps) {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const fallbackIso = useMemo(() => getDefaultCountryCode(), []);
  const [iso2, setIso2] = useState(fallbackIso);
  const [national, setNational] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const { iso2: i, national: n } = parseE164ToLocal(value, fallbackIso);
    setIso2(i);
    setNational(n);
  }, [value, fallbackIso]);

  const selected = findCountryByIso2(iso2) ?? findCountryByIso2(fallbackIso) ?? allCountries[0]!;

  const listData = useMemo(() => filterCountries(search), [search]);

  const applyCountry = (c: CountryData) => {
    setIso2(c.countryCode);
    onChange(buildE164(c.countryCode, national));
    setPickerOpen(false);
    setSearch('');
  };

  const onNationalChange = (text: string) => {
    const digits = text.replace(/\D/g, '');
    setNational(digits);
    onChange(buildE164(iso2, digits));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          onPress={() => setPickerOpen(true)}
          style={({ pressed }) => [styles.countryBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('phone.selectCountry')}
        >
          <Text style={styles.flag}>{selected.flag}</Text>
          <TextInput
            style={styles.dialInput}
            value={`+${selected.countryCallingCode}`}
            editable={false}
            pointerEvents="none"
            allowFontScaling={false}
          />
          <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
        </Pressable>
        <TextInput
          style={styles.input}
          value={national}
          onChangeText={onNationalChange}
          placeholder={t('phone.nationalPlaceholder')}
          placeholderTextColor={Colors.textMuted}
          keyboardType="phone-pad"
          autoComplete="tel-national"
          textContentType="telephoneNumber"
          accessibilityLabel={t('profile.phone')}
          allowFontScaling={false}
        />
      </View>

      <Modal visible={pickerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPickerOpen(false)}>
        <KeyboardAvoidingView
          style={[styles.modalRoot, { paddingTop: insets.top }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('phone.selectCountry')}</Text>
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={12} accessibilityRole="button">
              <Ionicons name="close" size={28} color={Colors.text} />
            </Pressable>
          </View>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={20} color={Colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={t('phone.searchPlaceholder')}
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <FlatList
            data={listData}
            keyExtractor={(item, index) => `${item.countryCode}-${item.countryCallingCode}-${index}`}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            windowSize={10}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.countryRow, pressed && styles.pressed]}
                onPress={() => applyCountry(item)}
              >
                <Text style={styles.countryRowFlag}>{item.flag}</Text>
                <View style={styles.countryRowText}>
                  <Text style={styles.countryRowName} numberOfLines={1}>
                    {item.countryNameEn}
                  </Text>
                </View>
                <Text style={styles.countryRowDial}>+{item.countryCallingCode}</Text>
                {item.countryCode === iso2 ? (
                  <Ionicons name="checkmark-circle" size={22} color={tokens.accent} />
                ) : (
                  <View style={{ width: 22 }} />
                )}
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          />
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    minWidth: 118,
  },
  flag: { fontSize: 18, lineHeight: 20 },
  // Use TextInput so Android renders identical metrics to the phone number input.
  dialInput: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
    color: Colors.text,
    includeFontPadding: false,
    textAlignVertical: 'center',
    minWidth: 44,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
    color: Colors.text,
    includeFontPadding: false,
    textAlignVertical: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  pressed: { opacity: 0.85 },
  modalRoot: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  countryRowFlag: { fontSize: 24 },
  countryRowText: { flex: 1, minWidth: 0 },
  countryRowName: { fontSize: 16, color: Colors.text, fontWeight: '500' },
  countryRowDial: { fontSize: 15, color: Colors.textSecondary, fontWeight: '600', minWidth: 52, textAlign: 'right' },
  sep: { height: 1, backgroundColor: Colors.surfaceLight, marginLeft: 68 },
});
