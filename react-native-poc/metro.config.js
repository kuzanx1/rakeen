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
  resolver: {
    /**
     * حزمُ الشيفرة تُحلّ من داخل التطبيق دائماً.
     *
     * الملفُّ في `shared/` خارجُ جذر المشروع، وBabel يحقن فيه استدعاءَ
     * مساعدٍ من @babel/runtime. فيبحث Metro عنه من موضع الملفّ لا من
     * موضع التطبيق، ويقع في مجلّدٍ ليس فيه ما يحتاج -- فيفشل الحزمُ
     * كلُّه بخطأٍ لا يذكر إلّا اسمَ المساعد.
     *
     * ولا يظهر هذا في jest ولا في tsc: الأوّلُ يحلّ بقواعد node
     * والثاني لا يحلّ شيئاً أصلاً. لا يظهر إلّا في حزمِ الإصدار -- وهو
     * ما يُشحن. (فشل أرشيفُ iOS عند «Bundle React Native code».)
     */
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
