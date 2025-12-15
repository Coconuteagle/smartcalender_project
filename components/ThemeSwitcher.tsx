import React from 'react';
import { Theme, useTheme } from '../contexts/ThemeContext';

const ThemeSwitcher: React.FC = () => {
    const { theme, setTheme } = useTheme();

    const themes: { id: Theme; label: string; bgClass: string }[] = [
        { id: 'dark', label: 'Dark', bgClass: 'bg-slate-900' },
        { id: 'light', label: 'White', bgClass: 'bg-slate-50' },
        { id: 'beige', label: 'Beige', bgClass: 'bg-[#f5f5dc]' },
    ];

    return (
        <div className="flex bg-tertiary p-1 rounded-lg border border-border-secondary">
            {themes.map((t) => (
                <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`
            px-3 py-1.5 text-xs font-medium rounded-md transition-all
            ${theme === t.id
                            ? 'bg-accent-primary text-white shadow-sm'
                            : 'text-text-secondary hover:text-text-primary hover:bg-main/50'
                        }
          `}
                    title={`${t.label} 테마로 변경`}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );
};

export default ThemeSwitcher;
