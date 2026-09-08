const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
/**
 * `shared/` خارج جذر المشروع، وMetro لا يرى ما لا يراقب.
 *
 * ومحرّك الطباعة هناك: مصدرٌ واحد يستورده التطبيق مباشرةً ويُبنى منه
 * ملفُّ الويب. فلو لم يُراقَب لَما حُزم، ولَعاد كلُّ عميلٍ إلى نسخته --
 * وهو ما جُمع أصلاً ليُمنع.
 *
 * والمُراقَبُ هو `shared/` وحده لا المستودعُ كلُّه: مجلّدٌ صغير، فلا
 * يبطؤ الإقلاع.
 */
const shared = path.resolve(__dirname, '..', 'shared');

const config = {
  watchFolders: [shared],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
