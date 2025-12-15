import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type AiProviderPreference = 'auto' | 'gemini' | 'openrouter';

type ApiKeyContextValue = {
  apiKey: string;
  openRouterApiKey: string;
  aiProviderPreference: AiProviderPreference;
  openRouterModel: string;
  setApiKey: (nextKey: string) => void;
  setOpenRouterApiKey: (nextKey: string) => void;
  setAiProviderPreference: (nextProvider: AiProviderPreference) => void;
  setOpenRouterModel: (nextModel: string) => void;
  clearApiKey: () => void;
  clearOpenRouterApiKey: () => void;
};

const GEMINI_STORAGE_KEY = 'smartcalendar:geminiApiKey';
const OPENROUTER_STORAGE_KEY = 'smartcalendar:openRouterApiKey';
const AI_PROVIDER_STORAGE_KEY = 'smartcalendar:aiProviderPreference';
const OPENROUTER_MODEL_STORAGE_KEY = 'smartcalendar:openRouterModel';

const ApiKeyContext = createContext<ApiKeyContextValue | undefined>(undefined);

export function ApiKeyProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState(() => {
    const existing = localStorage.getItem(GEMINI_STORAGE_KEY);
    return (existing ?? '').trim();
  });
  const [openRouterApiKey, setOpenRouterApiKeyState] = useState(() => {
    const existing = localStorage.getItem(OPENROUTER_STORAGE_KEY);
    return (existing ?? '').trim();
  });
  const [aiProviderPreference, setAiProviderPreferenceState] = useState<AiProviderPreference>(() => {
    const existing = (localStorage.getItem(AI_PROVIDER_STORAGE_KEY) ?? '').trim();
    if (existing === 'auto' || existing === 'gemini' || existing === 'openrouter') return existing;
    return 'auto';
  });
  const [openRouterModel, setOpenRouterModelState] = useState(() => {
    const existing = localStorage.getItem(OPENROUTER_MODEL_STORAGE_KEY);
    return (existing ?? '').trim();
  });

  const setApiKey = useCallback((nextKey: string) => {
    const cleaned = nextKey.trim();
    setApiKeyState(cleaned);
    if (cleaned) {
      localStorage.setItem(GEMINI_STORAGE_KEY, cleaned);
    } else {
      localStorage.removeItem(GEMINI_STORAGE_KEY);
    }
  }, []);

  const setOpenRouterApiKey = useCallback((nextKey: string) => {
    const cleaned = nextKey.trim();
    setOpenRouterApiKeyState(cleaned);
    if (cleaned) {
      localStorage.setItem(OPENROUTER_STORAGE_KEY, cleaned);
    } else {
      localStorage.removeItem(OPENROUTER_STORAGE_KEY);
    }
  }, []);

  const setAiProviderPreference = useCallback((nextProvider: AiProviderPreference) => {
    setAiProviderPreferenceState(nextProvider);
    localStorage.setItem(AI_PROVIDER_STORAGE_KEY, nextProvider);
  }, []);

  const setOpenRouterModel = useCallback((nextModel: string) => {
    const cleaned = nextModel.trim();
    setOpenRouterModelState(cleaned);
    if (cleaned) {
      localStorage.setItem(OPENROUTER_MODEL_STORAGE_KEY, cleaned);
    } else {
      localStorage.removeItem(OPENROUTER_MODEL_STORAGE_KEY);
    }
  }, []);

  const clearApiKey = useCallback(() => {
    setApiKey('');
  }, [setApiKey]);

  const clearOpenRouterApiKey = useCallback(() => {
    setOpenRouterApiKey('');
  }, [setOpenRouterApiKey]);

  const value = useMemo<ApiKeyContextValue>(
    () => ({
      apiKey,
      openRouterApiKey,
      aiProviderPreference,
      openRouterModel,
      setApiKey,
      setOpenRouterApiKey,
      setAiProviderPreference,
      setOpenRouterModel,
      clearApiKey,
      clearOpenRouterApiKey,
    }),
    [
      apiKey,
      openRouterApiKey,
      aiProviderPreference,
      openRouterModel,
      setApiKey,
      setOpenRouterApiKey,
      setAiProviderPreference,
      setOpenRouterModel,
      clearApiKey,
      clearOpenRouterApiKey,
    ],
  );

  return <ApiKeyContext.Provider value={value}>{children}</ApiKeyContext.Provider>;
}

export function useApiKey() {
  const ctx = useContext(ApiKeyContext);
  if (!ctx) {
    throw new Error('useApiKey must be used within an ApiKeyProvider');
  }
  return ctx;
}
