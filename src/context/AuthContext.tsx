import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { db, initAllCollections } from '../data/store';
import { Staff } from '../types';

interface AuthState {
  user: Staff | null;
  ready: boolean;
  login: (staffId: string, pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  ready: false,
  login: async () => false,
  logout: async () => {},
});

const SESSION_KEY = 'sf.session.v1';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Staff | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await initAllCollections();
      const savedId = await AsyncStorage.getItem(SESSION_KEY);
      if (savedId) {
        const staff = db.staff.get(savedId);
        if (staff && staff.active) setUser(staff);
      }
      setReady(true);
    })();
  }, []);

  // Keep the logged-in user in sync if their own record is edited (e.g. renamed).
  useEffect(() => {
    return db.staff.subscribe(() => {
      setUser((current) => (current ? db.staff.get(current.id) ?? null : null));
    });
  }, []);

  const login = async (staffId: string, pin: string) => {
    await db.staff.init();
    const staff = db.staff.get(staffId);
    if (!staff || !staff.active || staff.pin !== pin) return false;
    setUser(staff);
    await AsyncStorage.setItem(SESSION_KEY, staff.id);
    return true;
  };

  const logout = async () => {
    setUser(null);
    await AsyncStorage.removeItem(SESSION_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
