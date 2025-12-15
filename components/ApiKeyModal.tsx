import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { AiProviderPreference } from '../contexts/ApiKeyContext';
import {
  BUILTIN_EVENT_OVERRIDES_STORAGE_KEY,
  BUILTIN_EVENT_OVERRIDES_UPDATED_EVENT,
  CalendarEventSource,
  DEFAULT_EVENT_CATEGORY,
  EVENT_CATEGORIES,
  EventCategory,
  USER_EVENTS_STORAGE_KEY,
  USER_EVENTS_UPDATED_EVENT,
} from '../types';

type ApiKeyModalProps = {
  isOpen: boolean;
  onClose: () => void;
  geminiApiKey: string;
  openRouterApiKey: string;
  aiProviderPreference: AiProviderPreference;
  openRouterModel: string;
  onSaveGemini: (nextKey: string) => void;
  onSaveOpenRouter: (nextKey: string) => void;
  onSaveAiProviderPreference: (nextProvider: AiProviderPreference) => void;
  onSaveOpenRouterModel: (nextModel: string) => void;
  onClearGemini: () => void;
  onClearOpenRouter: () => void;
};

const GOOGLE_AI_STUDIO_API_KEY_URL = 'https://aistudio.google.com/app/apikey';
const OPENROUTER_KEYS_URL = 'https://openrouter.ai/keys';

const BACKUP_FILE_VERSION = 1 as const;

type StoredUserEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  category: EventCategory;
  source: CalendarEventSource;
};

type StoredBuiltinEventOverride = {
  date?: string;
  title?: string;
  category?: EventCategory;
};

type BackupFileV1 = {
  version: typeof BACKUP_FILE_VERSION;
  createdAt: string;
  year: number;
  userEvents: StoredUserEvent[];
  builtinEventOverrides: Record<string, StoredBuiltinEventOverride>;
};

const isDateKeyLike = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

const isEventCategory = (value: unknown): value is EventCategory =>
  typeof value === 'string' && EVENT_CATEGORIES.includes(value as EventCategory);

const isCalendarEventSource = (value: unknown): value is CalendarEventSource => value === 'manual' || value === 'ai';

const yearFromDateKey = (dateKey: string): number | null => {
  if (!isDateKeyLike(dateKey)) return null;
  const year = Number(dateKey.slice(0, 4));
  return Number.isFinite(year) ? year : null;
};

const yearFromBuiltinEventId = (eventId: string): number | null => {
  const match = /^event-(\d{4})-/.exec(eventId);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
};

const loadStoredUserEvents = (): StoredUserEvent[] => {
  try {
    const raw = localStorage.getItem(USER_EVENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const events: StoredUserEvent[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const candidate = item as Record<string, unknown>;
      const id = candidate.id;
      const date = candidate.date;
      const title = candidate.title;
      const category = candidate.category;
      const source = candidate.source;

      if (typeof id !== 'string' || !id) continue;
      if (!isDateKeyLike(date)) continue;
      if (typeof title !== 'string' || !title.trim()) continue;

      events.push({
        id,
        date,
        title: title.trim(),
        category: isEventCategory(category) ? category : DEFAULT_EVENT_CATEGORY,
        source: isCalendarEventSource(source) ? source : 'manual',
      });
    }

    return events;
  } catch {
    return [];
  }
};

const saveStoredUserEvents = (events: StoredUserEvent[]) => {
  localStorage.setItem(USER_EVENTS_STORAGE_KEY, JSON.stringify(events));
  window.dispatchEvent(new CustomEvent(USER_EVENTS_UPDATED_EVENT));
};

const loadStoredBuiltinOverrides = (): Record<string, StoredBuiltinEventOverride> => {
  try {
    const raw = localStorage.getItem(BUILTIN_EVENT_OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const overrides: Record<string, StoredBuiltinEventOverride> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const candidate = value as Record<string, unknown>;

      const next: StoredBuiltinEventOverride = {};
      if (isDateKeyLike(candidate.date)) next.date = candidate.date;
      if (typeof candidate.title === 'string' && candidate.title.trim()) next.title = candidate.title.trim();
      if (isEventCategory(candidate.category)) next.category = candidate.category;

      if (next.date || next.title || next.category) {
        overrides[id] = next;
      }
    }

    return overrides;
  } catch {
    return {};
  }
};

const saveStoredBuiltinOverrides = (overrides: Record<string, StoredBuiltinEventOverride>) => {
  localStorage.setItem(BUILTIN_EVENT_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
  window.dispatchEvent(new CustomEvent(BUILTIN_EVENT_OVERRIDES_UPDATED_EVENT));
};

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  geminiApiKey,
  openRouterApiKey,
  aiProviderPreference,
  openRouterModel,
  onSaveGemini,
  onSaveOpenRouter,
  onSaveAiProviderPreference,
  onSaveOpenRouterModel,
  onClearGemini,
  onClearOpenRouter,
}) => {
  const { colors } = useTheme();
  const [geminiDraft, setGeminiDraft] = useState(geminiApiKey);
  const [openRouterDraft, setOpenRouterDraft] = useState(openRouterApiKey);
  const [providerDraft, setProviderDraft] = useState<AiProviderPreference>(aiProviderPreference);
  const [openRouterModelDraft, setOpenRouterModelDraft] = useState(openRouterModel);
  const [isGeminiVisible, setIsGeminiVisible] = useState(false);
  const [isOpenRouterVisible, setIsOpenRouterVisible] = useState(false);
  const [backupYear, setBackupYear] = useState<number>(() => new Date().getFullYear());
  const [transferStatus, setTransferStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setGeminiDraft(geminiApiKey);
    setOpenRouterDraft(openRouterApiKey);
    setProviderDraft(aiProviderPreference);
    setOpenRouterModelDraft(openRouterModel);
    setIsGeminiVisible(false);
    setIsOpenRouterVisible(false);
    setBackupYear(new Date().getFullYear());
    setTransferStatus(null);
  }, [isOpen, geminiApiKey, openRouterApiKey, aiProviderPreference, openRouterModel]);

  const maskedGemini = useMemo(() => {
    if (!geminiApiKey) return '';
    if (geminiApiKey.length <= 8) return '*'.repeat(geminiApiKey.length);
    return `${geminiApiKey.slice(0, 4)}${'*'.repeat(geminiApiKey.length - 8)}${geminiApiKey.slice(-4)}`;
  }, [geminiApiKey]);

  const maskedOpenRouter = useMemo(() => {
    if (!openRouterApiKey) return '';
    if (openRouterApiKey.length <= 10) return '*'.repeat(openRouterApiKey.length);
    return `${openRouterApiKey.slice(0, 6)}${'*'.repeat(openRouterApiKey.length - 10)}${openRouterApiKey.slice(-4)}`;
  }, [openRouterApiKey]);

  const resolvedProvider = useMemo(() => {
    const hasGemini = Boolean(geminiDraft.trim());
    const hasOpenRouter = Boolean(openRouterDraft.trim());

    if (providerDraft === 'gemini') return hasGemini ? 'gemini' : hasOpenRouter ? 'openrouter' : null;
    if (providerDraft === 'openrouter') return hasOpenRouter ? 'openrouter' : hasGemini ? 'gemini' : null;
    return hasGemini ? 'gemini' : hasOpenRouter ? 'openrouter' : null;
  }, [providerDraft, geminiDraft, openRouterDraft]);

  const showGeminiSection = providerDraft === 'auto' || providerDraft === 'gemini';
  const showOpenRouterSection = providerDraft === 'auto' || providerDraft === 'openrouter';

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveGemini(geminiDraft);
    onSaveOpenRouter(openRouterDraft);
    onSaveAiProviderPreference(providerDraft);
    onSaveOpenRouterModel(openRouterModelDraft);
    onClose();
  };

  const handleClear = () => {
    onClearGemini();
    onClearOpenRouter();
    setGeminiDraft('');
    setOpenRouterDraft('');
    onClose();
  };

  const buildBackupForYear = (year: number): BackupFileV1 => {
    const userEvents = loadStoredUserEvents().filter(ev => yearFromDateKey(ev.date) === year);

    const existingOverrides = loadStoredBuiltinOverrides();
    const builtinEventOverrides: Record<string, StoredBuiltinEventOverride> = {};
    for (const [id, override] of Object.entries(existingOverrides)) {
      const effectiveYear = (override.date && yearFromDateKey(override.date)) ?? yearFromBuiltinEventId(id);
      if (effectiveYear === year) {
        builtinEventOverrides[id] = override;
      }
    }

    return {
      version: BACKUP_FILE_VERSION,
      createdAt: new Date().toISOString(),
      year,
      userEvents,
      builtinEventOverrides,
    };
  };

  const downloadJsonFile = (filename: string, jsonText: string) => {
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportBackup = () => {
    setTransferStatus(null);

    const year = Math.trunc(backupYear);
    if (!Number.isFinite(year) || year < 1900 || year > 9999) {
      setTransferStatus({ type: 'error', message: '연도 값을 확인해주세요.' });
      return;
    }

    try {
      const backup = buildBackupForYear(year);
      const json = JSON.stringify(backup, null, 2);
      downloadJsonFile(`smart-calendar-backup-${year}.json`, json);
      setTransferStatus({ type: 'success', message: `${year}년 백업 파일을 생성했습니다.` });
    } catch (e) {
      setTransferStatus({
        type: 'error',
        message: e instanceof Error ? e.message : '백업 생성 중 오류가 발생했습니다.',
      });
    }
  };

  const normalizeBackupPayload = (payload: unknown): BackupFileV1 => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('백업 파일 형식이 올바르지 않습니다.');
    }

    const candidate = payload as Record<string, unknown>;
    const version = candidate.version;
    const versionNumber = typeof version === 'number' ? version : version === undefined ? 0 : NaN;
    if (versionNumber !== 0 && versionNumber !== BACKUP_FILE_VERSION) {
      throw new Error('지원하지 않는 백업 파일 버전입니다.');
    }

    const year = candidate.year;
    if (typeof year !== 'number' || !Number.isFinite(year)) {
      throw new Error('백업 파일 형식이 올바르지 않습니다. (year)');
    }
    const normalizedYear = Math.trunc(year);

    const userEventsRaw = (candidate.userEvents ?? candidate.events) as unknown;
    if (!Array.isArray(userEventsRaw)) {
      throw new Error('백업 파일 형식이 올바르지 않습니다. (userEvents)');
    }

    const builtinOverridesRaw = (candidate.builtinEventOverrides ?? candidate.builtinOverrides ?? candidate.overrides) as unknown;
    if (builtinOverridesRaw !== undefined && (typeof builtinOverridesRaw !== 'object' || builtinOverridesRaw === null || Array.isArray(builtinOverridesRaw))) {
      throw new Error('백업 파일 형식이 올바르지 않습니다. (builtinEventOverrides)');
    }

    const normalizedUserEvents: StoredUserEvent[] = [];
    for (const item of userEventsRaw) {
      if (!item || typeof item !== 'object') continue;
      const ev = item as Record<string, unknown>;
      const id = ev.id;
      const date = ev.date;
      const title = ev.title;
      const category = ev.category;
      const source = ev.source;

      if (typeof id !== 'string' || !id) continue;
      if (!isDateKeyLike(date)) continue;
      if (typeof title !== 'string' || !title.trim()) continue;

      const eventYear = yearFromDateKey(date);
      if (eventYear !== normalizedYear) continue;

      normalizedUserEvents.push({
        id,
        date,
        title: title.trim(),
        category: isEventCategory(category) ? category : DEFAULT_EVENT_CATEGORY,
        source: isCalendarEventSource(source) ? source : 'manual',
      });
    }

    const normalizedBuiltinOverrides: Record<string, StoredBuiltinEventOverride> = {};
    if (builtinOverridesRaw && typeof builtinOverridesRaw === 'object' && !Array.isArray(builtinOverridesRaw)) {
      for (const [id, value] of Object.entries(builtinOverridesRaw as Record<string, unknown>)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const override = value as Record<string, unknown>;

        const next: StoredBuiltinEventOverride = {};
        if (isDateKeyLike(override.date)) next.date = override.date;
        if (typeof override.title === 'string' && override.title.trim()) next.title = override.title.trim();
        if (isEventCategory(override.category)) next.category = override.category;

        const effectiveYear = (next.date && yearFromDateKey(next.date)) ?? yearFromBuiltinEventId(id);
        if (effectiveYear !== normalizedYear) continue;

        if (next.date || next.title || next.category) {
          normalizedBuiltinOverrides[id] = next;
        }
      }
    }

    return {
      version: BACKUP_FILE_VERSION,
      createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
      year: normalizedYear,
      userEvents: normalizedUserEvents,
      builtinEventOverrides: normalizedBuiltinOverrides,
    };
  };

  const handleImportBackupFile = async (file: File) => {
    setTransferStatus(null);

    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const backup = normalizeBackupPayload(parsed);

      const existingUserEvents = loadStoredUserEvents();
      const remainingUserEvents = existingUserEvents.filter(ev => yearFromDateKey(ev.date) !== backup.year);
      saveStoredUserEvents([...backup.userEvents, ...remainingUserEvents]);

      const existingOverrides = loadStoredBuiltinOverrides();
      const remainingOverrides: Record<string, StoredBuiltinEventOverride> = {};
      for (const [id, override] of Object.entries(existingOverrides)) {
        const effectiveYear = (override.date && yearFromDateKey(override.date)) ?? yearFromBuiltinEventId(id);
        if (effectiveYear !== backup.year) remainingOverrides[id] = override;
      }
      saveStoredBuiltinOverrides({ ...remainingOverrides, ...backup.builtinEventOverrides });

      setTransferStatus({
        type: 'success',
        message: `${backup.year}년 백업을 가져왔습니다. (일정 ${backup.userEvents.length}개 / 기본일정 수정 ${Object.keys(backup.builtinEventOverrides).length}건)`,
      });
    } catch (e) {
      setTransferStatus({
        type: 'error',
        message: e instanceof Error ? e.message : '백업 파일 형식이 올바르지 않습니다.',
      });
    }
  };

  const handleImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleImportBackupFile(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin ${colors.componentBg} border ${colors.border} rounded-xl shadow-xl p-5`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className={`text-lg font-semibold ${colors.accentColor}`}>API Key 설정</h2>
            <p className={`text-xs ${colors.textSecondary} mt-1`}>
              키는 브라우저의 로컬 저장소(localStorage)에만 저장됩니다. (보안상 공용 PC에서는 사용을 피하세요)
            </p>
          </div>
          <button
            onClick={onClose}
            className={`${colors.textSecondary} hover:${colors.textPrimary} px-2 py-1 rounded-md ${colors.hoverEffect}`}
            aria-label="닫기"
          >
            닫기
          </button>
        </div>

        <div className="mt-4 space-y-5">
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className={`text-sm ${colors.textPrimary} block`} htmlFor="ai-provider-select">
                AI Provider
              </label>
              <span className={`text-xs ${colors.textSecondary}`}>
                현재 사용: {resolvedProvider ?? '미설정'}
              </span>
            </div>
            <select
              id="ai-provider-select"
              value={providerDraft}
              onChange={(e) => setProviderDraft(e.target.value as AiProviderPreference)}
              className={`w-full p-2.5 ${colors.inputBg} border ${colors.border} rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none text-sm`}
            >
              <option value="auto">자동(추천)</option>
              <option value="gemini">Google AI Studio (Gemini)</option>
              <option value="openrouter">OpenRouter</option>
            </select>
            <p className={`text-[11px] ${colors.textSecondary} leading-relaxed`}>
              선택한 Provider의 키가 없으면, 사용 가능한 Provider로 자동 전환됩니다. (Google 검색 근거는 Gemini에서만 제공됩니다)
            </p>
          </section>

          {showGeminiSection && (
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className={`text-sm ${colors.textPrimary} block`} htmlFor="gemini-api-key-input">
                  Gemini API Key
                </label>
                <a
                  href={GOOGLE_AI_STUDIO_API_KEY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-xs ${colors.textSecondary} hover:${colors.textPrimary} underline`}
                >
                  키 발급받기
                </a>
              </div>
              <input
                id="gemini-api-key-input"
                type={isGeminiVisible ? 'text' : 'password'}
                value={geminiDraft}
                onChange={(e) => setGeminiDraft(e.target.value)}
                placeholder="AIza... 형태의 키를 붙여넣으세요"
                className={`w-full p-2.5 ${colors.inputBg} border ${colors.border} rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none text-sm placeholder-slate-500`}
              />
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setIsGeminiVisible((v) => !v)}
                  className={`text-xs ${colors.textSecondary} hover:${colors.textPrimary}`}
                  type="button"
                >
                  {isGeminiVisible ? '숨기기' : '보이기'}
                </button>
                {geminiApiKey && (
                  <div className={`text-xs ${colors.textSecondary}`}>
                    저장됨: {maskedGemini}
                  </div>
                )}
              </div>
              <ol className={`text-[11px] ${colors.textSecondary} leading-relaxed list-decimal list-inside mt-2 space-y-0.5`}>
                <li>Google AI Studio에서 API Key를 생성합니다.</li>
                <li>생성한 키를 붙여넣고 저장합니다.</li>
              </ol>
            </section>
          )}

          {showOpenRouterSection && (
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className={`text-sm ${colors.textPrimary} block`} htmlFor="openrouter-api-key-input">
                  OpenRouter API Key
                </label>
                <a
                  href={OPENROUTER_KEYS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-xs ${colors.textSecondary} hover:${colors.textPrimary} underline`}
                >
                  키 발급/관리
                </a>
              </div>
              <input
                id="openrouter-api-key-input"
                type={isOpenRouterVisible ? 'text' : 'password'}
                value={openRouterDraft}
                onChange={(e) => setOpenRouterDraft(e.target.value)}
                placeholder="sk-or-v1-... 형태의 키를 붙여넣으세요"
                className={`w-full p-2.5 ${colors.inputBg} border ${colors.border} rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none text-sm placeholder-slate-500`}
              />
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setIsOpenRouterVisible((v) => !v)}
                  className={`text-xs ${colors.textSecondary} hover:${colors.textPrimary}`}
                  type="button"
                >
                  {isOpenRouterVisible ? '숨기기' : '보이기'}
                </button>
                {openRouterApiKey && (
                  <div className={`text-xs ${colors.textSecondary}`}>
                    저장됨: {maskedOpenRouter}
                  </div>
                )}
              </div>

              <div className="mt-2 space-y-1">
                <label className={`text-xs ${colors.textSecondary} block`} htmlFor="openrouter-model-input">
                  OpenRouter 모델 (선택)
                </label>
                <input
                  id="openrouter-model-input"
                  type="text"
                  value={openRouterModelDraft}
                  onChange={(e) => setOpenRouterModelDraft(e.target.value)}
                  placeholder="(빈칸이면 무료 모델을 자동으로 순차 시도합니다)"
                  className={`w-full p-2.5 ${colors.inputBg} border ${colors.border} rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none text-sm placeholder-slate-500`}
                />
                <p className={`text-[11px] ${colors.textSecondary} leading-relaxed`}>
                  예: <span className="font-mono">mistralai/mistral-7b-instruct:free</span> · <span className="font-mono">google/gemma-3-4b-it:free</span>
                </p>
              </div>

              <ol className={`text-[11px] ${colors.textSecondary} leading-relaxed list-decimal list-inside mt-2 space-y-0.5`}>
                <li>OpenRouter 가입 후 Keys 페이지에서 API Key를 생성합니다.</li>
                <li>생성한 키를 붙여넣고 저장합니다.</li>
              </ol>
            </section>
          )}

          <p className={`text-[11px] ${colors.textSecondary} leading-relaxed`}>
            자동(추천)을 선택하면 Gemini 키가 있을 때 Gemini를 사용하고, 없으면 OpenRouter를 사용합니다.
          </p>

          <section className={`space-y-2 pt-4 border-t ${colors.border}`}>
            <div className="flex items-center justify-between gap-3">
              <h3 className={`text-sm font-semibold ${colors.textPrimary}`}>백업 / 가져오기</h3>
              <span className={`text-[11px] ${colors.textSecondary}`}>연도별 JSON 내보내기</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
              <div>
                <label className={`text-xs ${colors.textSecondary} block mb-1`} htmlFor="backup-year-input">
                  연도
                </label>
                <input
                  id="backup-year-input"
                  type="number"
                  value={backupYear}
                  onChange={(e) => setBackupYear(Number(e.target.value))}
                  className={`w-full p-2.5 ${colors.inputBg} border ${colors.border} rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none text-sm`}
                  min={1900}
                  max={9999}
                />
              </div>
              <button
                type="button"
                onClick={handleExportBackup}
                className={`${colors.buttonBg} ${colors.hoverEffect} ${colors.buttonText} font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm w-full`}
              >
                백업 생성
              </button>
              <label
                className={`${colors.accentBg} hover:opacity-90 ${colors.buttonText} font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm w-full text-center cursor-pointer`}
              >
                <input type="file" accept="application/json" className="hidden" onChange={handleImportChange} />
                백업 가져오기
              </label>
            </div>

            {transferStatus && (
              <div
                className={`text-xs p-2 rounded-md border ${transferStatus.type === 'success'
                  ? 'text-green-200 bg-green-900/20 border-green-700'
                  : 'text-red-200 bg-red-900/20 border-red-700'
                  }`}
              >
                {transferStatus.message}
              </div>
            )}

            <p className={`text-[11px] ${colors.textSecondary} leading-relaxed`}>
              가져오기는 해당 연도의 사용자 일정/기본일정 수정 데이터를 덮어씁니다. (API Key는 포함되지 않습니다)
            </p>
          </section>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={handleClear}
            className={`${colors.eventBuiltinBg} hover:opacity-90 ${colors.buttonText} font-semibold py-2 px-4 rounded-lg transition-colors`}
            type="button"
          >
            모두 삭제
          </button>
          <button
            onClick={handleSave}
            className={`${colors.accentBg} hover:opacity-90 ${colors.buttonText} font-semibold py-2 px-4 rounded-lg transition-colors`}
            type="button"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;
