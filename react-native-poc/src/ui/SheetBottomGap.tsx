import React from 'react';
import { Dimensions, Platform, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The last child of a bottom sheet's overlay: keeps the sheet (and its
 * «إضافة» button) above the system navigation bar.
 *
 * A <Modal> is drawn edge to edge, under the navigation bar, but on older
 * Android (SUNMI D2 mini, Android 8) neither the safe-area insets nor a
 * SafeAreaView inside the modal report that bar -- both say 0, and the
 * button sat under «رجوع / الرئيسية». The activity window, though, still
 * stops above the bar there, so the screen/window difference is the bar's
 * height. Newer Android draws the activity edge to edge too (no difference)
 * and reports the real inset instead; the larger of the two is used.
 */
export default function SheetBottomGap() {
  const { bottom } = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const legacy = Platform.OS === 'android' ? Math.max(0, Dimensions.get('screen').height - windowHeight) : 0;
  return <View style={{ height: Math.max(bottom, legacy) }} />;
}
