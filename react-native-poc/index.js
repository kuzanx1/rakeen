/**
 * @format
 */

// Must be imported before anything that uses @supabase/supabase-js --
// Hermes (React Native's JS engine) doesn't fully implement URL/
// URLSearchParams, which the Supabase SDK relies on. Documented Supabase
// React Native requirement, not a guess.
import 'react-native-url-polyfill/auto';
import { AppRegistry, I18nManager } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// The PWA runs entirely under <html lang="ar" dir="rtl"> (app/layout.tsx),
// so every row in it lays out right-to-left: the category rail sits on the
// RIGHT of the products grid and the order panel on the LEFT
// (.home-zones' children in .cat-sidebar -> .products-zone -> .order-panel
// source order). Without this, React Native lays those same rows out
// left-to-right and the whole app is a mirror image of the source --
// order panel on the wrong side, keypads and card content reversed.
//
// Set here rather than in a component because RN reads these flags when it
// creates native views: it has to happen before AppRegistry hands the root
// component over, not during the first render.
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

// ...but NOT React Native's extra left/right mirroring, which is on by
// default. CSS has two distinct concepts and rakeen-pos.css uses both:
// physical (`left:15px` pins .search-box's magnifier to the literal left
// edge in either direction) and logical (`inset-inline-end`,
// `border-inline-start`, which do flip). RN's default swap collapses that
// distinction by mirroring `left`/`right` too, so a ported `left:15`
// would land on the opposite edge from the source. With the swap off,
// `left`/`right` mean literal sides exactly like CSS, and `start`/`end`
// remain the auto-flipping pair that maps to `inset-inline-*`.
I18nManager.swapLeftAndRightInRTL(false);

AppRegistry.registerComponent(appName, () => App);
