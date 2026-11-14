import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { UserProfile } from '../types/library.ts';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<UserProfile>;
  register: (fullName: string, email: string, password: string) => Promise<UserProfile>;
  signInAsAdmin: (email: string, password: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  const apiFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (tokenRef.current && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${tokenRef.current}`);
    }
    return fetch(input, {
      ...init,
      headers,
      credentials: 'include',
    });
  }, []);

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
    refreshProfile();
  }, [refreshProfile]);

  const signIn = useCallback(async (email: string, password: string): Promise<UserProfile> => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Đăng nhập thất bại.');
    }
    tokenRef.current = data.token || null;
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(
    async (fullName: string, email: string, password: string): Promise<UserProfile> => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fullName, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Đăng ký tài khoản thất bại.');
      }
      tokenRef.current = data.token || null;
      setUser(data.user);
      return data.user;
    },
    []
  );

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
    tokenRef.current = data.token || null;
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    tokenRef.current = null;
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // ignore
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        register,
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
