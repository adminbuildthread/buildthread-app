const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*'] },
  {
    rules: {
      // Subscription setup and Animated values set state or read a mutable
      // object during render. The React Compiler rules flag those patterns.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
    },
  },
]);
