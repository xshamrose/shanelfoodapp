import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConfirmHost } from './src/components/ui';
import { AuthProvider } from './src/context/AuthContext';
import { useSubscriptionGeneration } from './src/data/useSubscriptions';
import { useAutoFlush } from './src/data/useSync';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  useAutoFlush();
  useSubscriptionGeneration();
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
        <ConfirmHost />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
