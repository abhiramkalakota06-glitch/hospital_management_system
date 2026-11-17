import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PermissionMatrix, User } from '../types/hms';
import { apiFetch, clearStoredToken, getStoredToken, setStoredToken } from '../utils/api';

interface SystemSnippet {
  platformName: string;
  currencySymbol: string;
  defaultTaxRate: number;
  appointmentSlotMinutes: number;
  workingHoursStart: string;
  workingHoursEnd: string;
}

export interface PatientRegistrationPayload {
  fullName: string;
  email: string;
  username?: string;
  phone: string;
  dateOfBirth: string;
  gender: 'Male' | 'Female' | 'Other';
  bloodGroup: string;
  address?: string;
  emergencyContact?: string;
  password: string;
}

interface AuthContextValue {
  user: User | null;
  permissions: PermissionMatrix | null;
  systemConfig: SystemSnippet;
  loading: boolean;
  wsConnected: boolean;
  login: (identifier: string, password: string, rememberMe: boolean) => Promise<User>;
  registerPatient: (payload: PatientRegistrationPayload) => Promise<{ user: User; patientCode: string }>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  subscribeEvent: (event: string, handler: (payload: unknown) => void) => () => void;
}

const defaultSys: SystemSnippet = {
  platformName: 'CarePlus Health Network',
  currencySymbol: '₹',
  defaultTaxRate: 5,
  appointmentSlotMinutes: 30,
  workingHoursStart: '08:00',
  workingHoursEnd: '20:00',
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<PermissionMatrix | null>(null);
  const [systemConfig, setSystemConfig] = useState<SystemSnippet>(defaultSys);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);

  const listenersRef = useRef<Map<string, Set<(payload: unknown) => void>>>(new Map());

  const subscribeEvent = useCallback((event: string, handler: (payload: unknown) => void) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(handler);
    return () => {
      listenersRef.current.get(event)?.delete(handler);
    };
  }, []);

  const refreshMe = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<{ user: User; permissions: PermissionMatrix | null; systemConfig: SystemSnippet }>('/auth/me');
      setUser(data.user);
      setPermissions(data.permissions);
      if (data.systemConfig) setSystemConfig(data.systemConfig);
    } catch {
      clearStoredToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  // Real WebSocket connection for live queue & notifications across all roles
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${window.location.host}/ws`);

      ws.onopen = () => {
        if (!unmounted) setWsConnected(true);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data) as { event: string; payload: unknown };
          const handlers = listenersRef.current.get(msg.event);
          handlers?.forEach((fn) => fn(msg.payload));
          const wildcard = listenersRef.current.get('*');
          wildcard?.forEach((fn) => fn(msg));
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!unmounted) {
          setWsConnected(false);
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();
    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const login = async (identifier: string, password: string, rememberMe: boolean) => {
    const res = await apiFetch<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password, rememberMe }),
    });
    setStoredToken(res.token, rememberMe);
    await refreshMe();
    return res.user;
  };

  const registerPatient = async (payload: PatientRegistrationPayload) => {
    const res = await apiFetch<{ token: string; user: User; patient: { patientCode: string } }>('/auth/register-patient', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoredToken(res.token, true);
    await refreshMe();
    return { user: res.user, patientCode: res.patient.patientCode };
  };

  const logout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    clearStoredToken();
    setUser(null);
    setPermissions(null);
  };

  return (
    <AuthContext.Provider value={{ user, permissions, systemConfig, loading, wsConnected, login, registerPatient, logout, refreshMe, subscribeEvent }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
