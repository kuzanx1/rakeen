module.exports = {
  // Linked by `npx react-native-asset`, which registers them in the Xcode
  // project's resources and copies the sounds into android/app/src/main/
  // res/raw with sanitised names (notify-general.mp3 -> notify_general).
  // RakeenSoundModule's own lookup tables use exactly those two spellings.
  assets: ['./assets/fonts', './assets/sounds'],
};
