import React from 'react';
import { StyleSheet } from 'react-native';
import { Text } from './Text';
import { TouchableOpacity } from './tappable';
import { useI18n } from './i18n';
import { createStyles, fonts } from './theme';

/**
 * زر اللغة على بطاقات الدخول -- قبل تسجيل الدخول.
 *
 * زر الشريط العلوي لا يظهر إلا بعد الدخول، فمن لا يقرأ العربية كان يقف
 * أمام «رمز الفرع» بلا مخرج. نفس toggle() ونفس الحفظ؛ يظهر عليه اللغة
 * التي ينقل إليها، مثل زر الشريط. وفي الويب: .pos-auth-lang.
 */
export default function AuthLangButton() {
  const { lang, toggle } = useI18n();
  const styles = useStyles();
  return (
    <TouchableOpacity
      onPress={toggle}
      style={styles.btn}
      accessibilityLabel="Language / اللغة"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Text style={styles.text}>{lang === 'ar' ? 'EN' : 'ع'}</Text>
    </TouchableOpacity>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
    btn: {
      position: 'absolute',
      top: 18,
      left: 18,
      minWidth: 44,
      height: 34,
      paddingHorizontal: 12,
      borderRadius: 17,
      borderWidth: 1.5,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    text: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.text },
  }),
);
