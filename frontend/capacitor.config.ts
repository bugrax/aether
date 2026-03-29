import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aether.app',
  appName: 'Aether',
  webDir: 'dist',
  server: {
    // In production, the app loads from the local dist/ bundle
    // For development, uncomment the url below to use live reload:
    // url: 'http://YOUR_LOCAL_IP:5173',
    androidScheme: 'https',
    iosScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'Aether',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#0e0e0e',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0e0e0e',
    },
  },
};

export default config;
