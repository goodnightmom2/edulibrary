import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import type { UserProfile } from '../types/library.ts';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<UserProfile>;
  signInAsAdmin: (email: string, password: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const firebaseUserRef = useRef<FirebaseUser | null>(null);
  const adminTokenRef = useRef<string | null>(null);

  const getBearerToken = useCallback(async (): Promise<string | null> => {
    if (adminTokenRef.current) return adminTokenRef.current;
    if (firebaseUserRef.current) {
      try {
        return await firebaseUserRef.current.getIdToken();
      } catch {
        return null;
      }
    }
    return null;
  }, []);

  const apiFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const token = await getBearerToken();
      const headers = new Headers(init.headers);
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return fetch(input, {
        ...init,
        headers,
        credentials: 'include',
      });
    },
    [getBearerToken]
  );

  const refreshProfile = useCallback(async () => {
    try {
      const res = await apiFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user ?? null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      firebaseUserRef.current = fbUser;
      if (fbUser) {
        try {
          const idToken = await fbUser.getIdToken();
          const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            credentials: 'include',
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error('Google sync error:', err);
        }
      }
      await refreshProfile();
    });
    return () => unsubscribe();
  }, [refreshProfile]);

  const signInWithGoogle = useCallback(async (): Promise<UserProfile> => {
    const result = await signInWithPopup(auth, googleAuthProvider);
    firebaseUserRef.current = result.user;
    const idToken = await result.user.getIdToken();
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Đăng nhập Google thất bại.');
    }
    setUser(data.user);
    return data.user;
  }, []);

  const signInAsAdmin = useCallback(async (email: string, password: string): Promise<UserProfile> => {
    const res = await fetch('/api/auth/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Đăng nhập quản trị thất bại.');
    }
    adminTokenRef.current = data.token || null;
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    adminTokenRef.current = null;
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // ignore
    }
    if (firebaseUserRef.current) {
      await signOut(auth);
      firebaseUserRef.current = null;
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithGoogle,
        signInAsAdmin,
        logout,
        refreshProfile,
        apiFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
