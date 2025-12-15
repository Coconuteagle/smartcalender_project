import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeType = 'dark' | 'light' | 'beige';
export type Theme = ThemeType;

export type ThemeColors = {
  mainBg: string;
  headerBg: string;
  componentBg: string;
  inputBg: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  accentColor: string;
  accentBg: string;
  activeTabBg: string;
  buttonBg: string;
  buttonText: string;
  hoverEffect: string;
  eventUserBg: string;
  eventBuiltinBg: string;
  eventBuiltinBorder: string;
  placeholderColor: string;
  scrollbarThumb: string;
};

interface ThemeContextType {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'smartcalendar:theme';

const COLORS: ThemeColors = {
  mainBg: 'bg-main',
  headerBg: 'bg-secondary',
  componentBg: 'bg-secondary',
  inputBg: 'bg-tertiary',
  border: 'border-border-primary',
  textPrimary: 'text-text-primary',
  textSecondary: 'text-text-secondary',
  accentColor: 'text-accent-text',
  accentBg: 'bg-accent-primary',
  activeTabBg: 'bg-accent-primary',
  buttonBg: 'bg-tertiary',
  buttonText: 'text-white',
  hoverEffect: 'hover:bg-tertiary/60',
  eventUserBg: 'bg-accent-primary/20',
  eventBuiltinBg: 'bg-tertiary/60',
  eventBuiltinBorder: 'border-border-secondary',
  placeholderColor: 'placeholder:text-text-tertiary',
  scrollbarThumb: '',
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeType>(() => {
    const saved = (localStorage.getItem(THEME_STORAGE_KEY) ?? '').trim();
    return saved === 'light' || saved === 'beige' || saved === 'dark' ? saved : 'beige';
  });

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  const value = useMemo<ThemeContextType>(() => ({ theme, setTheme, colors: COLORS }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
