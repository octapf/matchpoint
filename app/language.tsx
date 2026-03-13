import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { LANGUAGES, i18n, useTranslation } from '@/lib/i18n';
import type { Language } from '@/lib/i18n';
import { useLanguageStore } from '@/store/useLanguageStore';
import { useUserStore } from '@/store/useUserStore';

const LANGUAGE_FLAG_IMAGES: Record<Language, ImageSourcePropType> = {
  en: require('../assets/images/flags/gb.png'),
  es: require('../assets/images/flags/es.png'),
  it: require('../assets/images/flags/it.png'),
};

export default function LanguageScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const user = useUserStore((s) => s.user);

  const handleSelectLanguage = (lang: Language) => {
    setLanguage(lang);
    i18n.locale = lang;
    router.replace(user ? '/(tabs)' : '/(auth)/sign-in');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('settings.chooseLanguage')}</Text>

      <View style={styles.flagsRow}>
        {LANGUAGES.map((lang) => (
          <Pressable
            key={lang}
            onPress={() => handleSelectLanguage(lang)}
            accessibilityRole="button"
            accessibilityLabel={lang.toUpperCase()}
            style={({ pressed }) => [styles.flagButton, pressed && styles.flagButtonPressed]}
          >
            <Image
              source={LANGUAGE_FLAG_IMAGES[lang]}
              style={styles.flagImage}
              resizeMode="cover"
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    width: '84%',
    alignSelf: 'center',
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  flagsRow: {
    width: '84%',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  flagButton: {
    flex: 1,
    flexBasis: 0,
    height: 52,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    backgroundColor: Colors.surface,
  },
  flagButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  flagImage: {
    width: '100%',
    height: '100%',
  },
});
