/**
 * @format
 */

// Must be imported before anything that uses @supabase/supabase-js --
// Hermes (React Native's JS engine) doesn't fully implement URL/
// URLSearchParams, which the Supabase SDK relies on. Documented Supabase
// React Native requirement, not a guess.
import 'react-native-url-polyfill/auto';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
