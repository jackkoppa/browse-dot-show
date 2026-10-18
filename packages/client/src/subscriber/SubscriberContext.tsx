import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import siteConfig, { type SubscriberAccessClientConfig } from '../config/site-config';
import { log } from '../utils/logging';
import { completeLogin as completeLoginRequest, refreshSession } from './api';
import { readSubscriberPreviewFlag } from './preview-flag';
import { clearSession, loadSession, saveSession, shouldRefresh, type SubscriberSession } from './session';
import type { SubscriberLoginProvider } from '@browse-dot-show/sites';

/**
 * Subscriber access for the client (see scratchpad/subscriber-access/PLAN.md). `available` is
 * false on sites without it, and without the `?subscriberPreview=1` flag (every site is in
 * preview): then the site behaves exactly as before.
 */
export interface SubscriberState {
  available: boolean;
  config: SubscriberAccessClientConfig | null;
  /** Providers to offer */
  providers: SubscriberLoginProvider[];
  session: SubscriberSession | null;
  isSubscriber: boolean;
  /** A message to show after the session was rejected */
  notice: string | null;
  completeLogin(provider: SubscriberLoginProvider, params: Record<string, string>): Promise<boolean>;
  logout(): void;
  /** Call when the subscriber API rejects the session: logs out, with a notice */
  handleUnauthorized(message?: string): void;
  dismissNotice(): void;
}

const SubscriberContext = createContext<SubscriberState | null>(null);

function availableConfig(previewFlag: boolean): SubscriberAccessClientConfig | null {
  const config = siteConfig.subscriberAccess;
  if (!config || !config.authApiUrl) return null;
  // Every site is in preview for now: nothing shows without the flag
  return previewFlag ? config : null;
}

export function SubscriberProvider({ children }: { children: ReactNode }) {
  const [config] = useState(() => availableConfig(readSubscriberPreviewFlag()));
  const [session, setSession] = useState<SubscriberSession | null>(() => (config ? loadSession(siteConfig.id) : null));
  const [notice, setNotice] = useState<string | null>(null);

  const logout = useCallback(() => {
    clearSession(siteConfig.id);
    setSession(null);
  }, []);

  const handleUnauthorized = useCallback((message = 'Your subscriber login has expired. Please log in again.') => {
    logout();
    setNotice(message);
  }, [logout]);

  // Refresh the session once a day (re-checks the subscription, where the provider can)
  useEffect(() => {
    if (!config || !session || !shouldRefresh(session)) return;
    refreshSession(config.authApiUrl, siteConfig.id, session)
      .then(renewed => {
        if (renewed) {
          setSession(saveSession(siteConfig.id, renewed));
        } else {
          handleUnauthorized('Your subscription is no longer active, so you have been logged out.');
        }
      })
      .catch(error => log.warn('[subscriber] Session refresh failed; will retry next visit', error));
  }, [config, session, handleUnauthorized]);

  const completeLogin = useCallback(async (provider: SubscriberLoginProvider, params: Record<string, string>) => {
    if (!config) return false;
    const newSession = await completeLoginRequest(config.authApiUrl, { siteId: siteConfig.id, provider, params });
    if (!newSession) return false;
    setSession(saveSession(siteConfig.id, newSession));
    setNotice(null);
    return true;
  }, [config]);

  const value = useMemo<SubscriberState>(() => ({
    available: Boolean(config),
    config,
    providers: config ? config.providers : [],
    session,
    isSubscriber: Boolean(config && session),
    notice,
    completeLogin,
    logout,
    handleUnauthorized,
    dismissNotice: () => setNotice(null),
  }), [config, session, notice, completeLogin, logout, handleUnauthorized]);

  return <SubscriberContext.Provider value={value}>{children}</SubscriberContext.Provider>;
}

/** Subscriber state; outside a SubscriberProvider (e.g. in tests), the feature is unavailable */
export function useSubscriber(): SubscriberState {
  return useContext(SubscriberContext) ?? {
    available: false,
    config: null,
    providers: [],
    session: null,
    isSubscriber: false,
    notice: null,
    completeLogin: async () => false,
    logout: () => {},
    handleUnauthorized: () => {},
    dismissNotice: () => {},
  };
}
