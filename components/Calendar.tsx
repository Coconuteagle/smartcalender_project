
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { KOREAN_MONTH_NAMES, KOREAN_DAY_NAMES_SHORT } from '../constants';
import {
  BASE_SCHEDULE_END_YEAR,
  BUILTIN_EVENT_OVERRIDES_STORAGE_KEY,
  BUILTIN_EVENT_OVERRIDES_UPDATED_EVENT,
  CalendarEvent,
  CalendarEventKind,
  CalendarEventSource,
  DEFAULT_EVENT_CATEGORY,
  EVENT_CATEGORIES,
  EventCategory,
  USER_EVENTS_STORAGE_KEY,
  USER_EVENTS_UPDATED_EVENT,
  UserCalendarEvent,
} from '../types';
import WeeklyCalendar from './WeeklyCalendar';
import { GoogleGenAI, GenerateContentResponse, GroundingChunk } from "@google/genai";
import { marked } from 'marked';
import { useApiKey } from '../contexts/ApiKeyContext';
import { useTheme } from '../contexts/ThemeContext';
import { nanoid } from 'nanoid';
import { openRouterChatCompletion } from '../utils/openRouter';


const PrevIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-400 group-hover:text-cyan-400 transition-colors">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
  </svg>
);

const NextIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-400 group-hover:text-cyan-400 transition-colors">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);

const CloseIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CheckIconMini: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className}`}>
    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
  </svg>
);

const SpinnerIconMini: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-cyan-500 ${className}`}></div>
);

const PendingIconMini: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`h-4 w-4 rounded-full border-2 border-slate-500 ${className}`}></div>
);

const PlusIconMini: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 ${className}`}>
    <path d="M10 4.5a.75.75 0 01.75.75v4h4a.75.75 0 010 1.5h-4v4a.75.75 0 01-1.5 0v-4h-4a.75.75 0 010-1.5h4v-4A.75.75 0 0110 4.5z" />
  </svg>
);

type BuiltinEventOverride = {
  date?: string;
  title?: string;
  category?: EventCategory;
};

type BuiltinEventOverrides = Record<string, BuiltinEventOverride>;

interface CalendarProps {
  scheduleText: string;
  manualContextText?: string;
}

const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKeyParts = (dateKey: string) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return { year: y, month: m, day: d }; // month: 1-12
};

const buildDateKeyFromParts = (year: number, month: number, day: number) => {
  const safeYear = String(year).padStart(4, '0');
  const safeMonth = String(month).padStart(2, '0');
  const safeDay = String(day).padStart(2, '0');
  return `${safeYear}-${safeMonth}-${safeDay}`;
};

const isDateKeyLike = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

const isEventCategory = (value: unknown): value is EventCategory =>
  typeof value === 'string' && EVENT_CATEGORIES.includes(value as EventCategory);

const isCalendarEventSource = (value: unknown): value is CalendarEventSource =>
  value === 'manual' || value === 'ai';

const loadUserEventsFromStorage = (): UserCalendarEvent[] => {
  try {
    const raw = localStorage.getItem(USER_EVENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const restored = parsed
      .map((item): UserCalendarEvent | null => {
        if (!item || typeof item !== 'object') return null;
        const candidate = item as Record<string, unknown>;
        const id = candidate.id;
        const date = candidate.date;
        const title = candidate.title;
        const category = candidate.category;
        const source = candidate.source;

        if (typeof id !== 'string') return null;
        if (!isDateKeyLike(date)) return null;
        if (typeof title !== 'string') return null;

        const normalizedCategory = isEventCategory(category) ? category : DEFAULT_EVENT_CATEGORY;
        const normalizedSource = isCalendarEventSource(source) ? source : 'manual';

        return { id, date, title, category: normalizedCategory, kind: 'user', source: normalizedSource };
      })
      .filter((v): v is UserCalendarEvent => Boolean(v));

    return restored;
  } catch {
    return [];
  }
};

const saveUserEventsToStorage = (events: UserCalendarEvent[]) => {
  try {
    const payload = events.map(({ id, date, title, category, source }) => ({ id, date, title, category, source }));
    localStorage.setItem(USER_EVENTS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors (e.g., private mode / quota)
  }
};

const EVENT_FILTERS_STORAGE_KEY = 'smartcalendar:eventFilters';
const ALL_EVENT_SOURCES: CalendarEventSource[] = ['manual', 'ai'];

type StoredEventFilters = {
  categories?: unknown;
  sources?: unknown;
};

const loadEventFiltersFromStorage = (): { categories: EventCategory[]; sources: CalendarEventSource[] } => {
  try {
    const raw = localStorage.getItem(EVENT_FILTERS_STORAGE_KEY);
    if (!raw) {
      return { categories: [...EVENT_CATEGORIES], sources: [...ALL_EVENT_SOURCES] };
    }

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { categories: [...EVENT_CATEGORIES], sources: [...ALL_EVENT_SOURCES] };
    }

    const candidate = parsed as StoredEventFilters;
    const categoriesRaw = candidate.categories;
    const sourcesRaw = candidate.sources;

    const categoriesSet = new Set<EventCategory>();
    if (Array.isArray(categoriesRaw)) {
      for (const c of categoriesRaw) {
        if (isEventCategory(c)) categoriesSet.add(c);
      }
    }

    const sourcesSet = new Set<CalendarEventSource>();
    if (Array.isArray(sourcesRaw)) {
      for (const s of sourcesRaw) {
        if (isCalendarEventSource(s)) sourcesSet.add(s);
      }
    }

    let categories: EventCategory[] = [...EVENT_CATEGORIES];
    if (Array.isArray(categoriesRaw)) {
      categories = EVENT_CATEGORIES.filter(c => categoriesSet.has(c));
      if (categories.length === 0 && categoriesRaw.length > 0) categories = [...EVENT_CATEGORIES];
    }

    let sources: CalendarEventSource[] = [...ALL_EVENT_SOURCES];
    if (Array.isArray(sourcesRaw)) {
      sources = ALL_EVENT_SOURCES.filter(s => sourcesSet.has(s));
      if (sources.length === 0 && sourcesRaw.length > 0) sources = [...ALL_EVENT_SOURCES];
    }

    return { categories, sources };
  } catch {
    return { categories: [...EVENT_CATEGORIES], sources: [...ALL_EVENT_SOURCES] };
  }
};

const saveEventFiltersToStorage = (filters: { categories: EventCategory[]; sources: CalendarEventSource[] }) => {
  try {
    localStorage.setItem(
      EVENT_FILTERS_STORAGE_KEY,
      JSON.stringify({ categories: filters.categories, sources: filters.sources } satisfies StoredEventFilters),
    );
  } catch {
    // ignore storage errors (e.g., private mode / quota)
  }
};

const loadBuiltinEventOverridesFromStorage = (): BuiltinEventOverrides => {
  try {
    const raw = localStorage.getItem(BUILTIN_EVENT_OVERRIDES_STORAGE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const overrides: BuiltinEventOverrides = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const candidate = value as Record<string, unknown>;

      const nextOverride: BuiltinEventOverride = {};
      if (isDateKeyLike(candidate.date)) nextOverride.date = candidate.date;
      if (typeof candidate.title === 'string' && candidate.title.trim()) nextOverride.title = candidate.title.trim();
      if (isEventCategory(candidate.category)) nextOverride.category = candidate.category;

      if (nextOverride.date || nextOverride.title || nextOverride.category) {
        overrides[id] = nextOverride;
      }
    }

    return overrides;
  } catch {
    return {};
  }
};

const saveBuiltinEventOverridesToStorage = (overrides: BuiltinEventOverrides) => {
  try {
    localStorage.setItem(BUILTIN_EVENT_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore storage errors (e.g., private mode / quota)
  }
};

const loadingMessages = [
  "요청 분석 중...",
  "관련 정보 검색 중 (Google Search)...",
  "업무 절차 및 K-에듀파인 연관성 검토 중...",
  "학교행정업무매뉴얼 내용 검토 중...",
  "답변 초안 생성 중...",
  "내용 최종 검토 및 요약 중..."
];

const Calendar: React.FC<CalendarProps> = ({ scheduleText, manualContextText }) => {
  const { apiKey, openRouterApiKey, aiProviderPreference, openRouterModel } = useApiKey();
  const { colors, theme } = useTheme();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [baseEvents, setBaseEvents] = useState<CalendarEvent[]>([]);
  const [builtinEventOverrides, setBuiltinEventOverrides] = useState<BuiltinEventOverrides>({});
  const baseEventsWithOverrides = useMemo(
    () =>
      baseEvents.map((ev) => {
        const override = builtinEventOverrides[ev.id];
        if (!override) return ev;
        return {
          ...ev,
          date: override.date ?? ev.date,
          title: override.title ?? ev.title,
          category: override.category ?? ev.category,
        };
      }),
    [baseEvents, builtinEventOverrides],
  );
  const [userEvents, setUserEvents] = useState<UserCalendarEvent[]>([]);
  const allEvents = useMemo(() => [...baseEventsWithOverrides, ...userEvents], [baseEventsWithOverrides, userEvents]);

  const [{ categories: initialSelectedCategories, sources: initialSelectedSources }] = useState(() => loadEventFiltersFromStorage());
  const [selectedCategories, setSelectedCategories] = useState<EventCategory[]>(initialSelectedCategories);
  const [selectedSources, setSelectedSources] = useState<CalendarEventSource[]>(initialSelectedSources);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    saveEventFiltersToStorage({ categories: selectedCategories, sources: selectedSources });
  }, [selectedCategories, selectedSources]);

  useEffect(() => {
    if (!isFilterOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      const container = filterDropdownRef.current;
      if (!container) return;
      if (e.target instanceof Node && container.contains(e.target)) return;
      setIsFilterOpen(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [isFilterOpen]);

  const selectedCategorySet = useMemo(() => new Set(selectedCategories), [selectedCategories]);
  const selectedSourceSet = useMemo(() => new Set(selectedSources), [selectedSources]);
  const filteredEvents = useMemo(() => {
    const categorySet = new Set(selectedCategories);
    const sourceSet = new Set(selectedSources);
    return allEvents.filter((event) => categorySet.has(event.category) && sourceSet.has(event.source));
  }, [allEvents, selectedCategories, selectedSources]);

  const isAllFiltersSelected =
    selectedCategories.length === EVENT_CATEGORIES.length && selectedSources.length === ALL_EVENT_SOURCES.length;

  const toggleSelectAllFilters = () => {
    if (isAllFiltersSelected) {
      setSelectedCategories([]);
      setSelectedSources([]);
      return;
    }
    setSelectedCategories([...EVENT_CATEGORIES]);
    setSelectedSources([...ALL_EVENT_SOURCES]);
  };

  const toggleCategoryFilter = (category: EventCategory) => {
    setSelectedCategories((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(category)) {
        nextSet.delete(category);
      } else {
        nextSet.add(category);
      }
      return EVENT_CATEGORIES.filter((c) => nextSet.has(c));
    });
  };

  const toggleSourceFilter = (source: CalendarEventSource) => {
    setSelectedSources((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(source)) {
        nextSet.delete(source);
      } else {
        nextSet.add(source);
      }
      return ALL_EVENT_SOURCES.filter((s) => nextSet.has(s));
    });
  };

  const resetFilters = () => {
    setSelectedCategories([...EVENT_CATEGORIES]);
    setSelectedSources([...ALL_EVENT_SOURCES]);
  };

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [eventDescriptions, setEventDescriptions] = useState<Record<string, string>>({});
  const [eventGrounding, setEventGrounding] = useState<Record<string, GroundingChunk[]>>({});
  const [isGeneratingDescription, setIsGeneratingDescription] = useState<boolean>(false);
  const [generationTargetEventId, setGenerationTargetEventId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const reportRequestSeqRef = useRef(0);
  const activeReportRequestIdRef = useRef(0);

  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null);
  const didJustDropRef = useRef(false);

  const now = new Date();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftKind, setDraftKind] = useState<CalendarEventKind>('user');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftCategory, setDraftCategory] = useState<EventCategory | ''>(DEFAULT_EVENT_CATEGORY);
  const [draftYear, setDraftYear] = useState<number>(now.getFullYear());
  const [draftMonth, setDraftMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [draftDay, setDraftDay] = useState<number>(now.getDate());
  const [draftError, setDraftError] = useState<string | null>(null);

  const geminiAi = useMemo(() => {
    if (!apiKey) return null;
    try {
      return new GoogleGenAI({ apiKey });
    } catch (e) {
      console.error("Failed to initialize Gemini AI:", e);
      return null;
    }
  }, [apiKey]);

  const aiProvider: 'gemini' | 'openrouter' | null = useMemo(() => {
    const hasGemini = Boolean(apiKey);
    const hasOpenRouter = Boolean(openRouterApiKey);

    if (aiProviderPreference === 'gemini') return hasGemini ? 'gemini' : hasOpenRouter ? 'openrouter' : null;
    if (aiProviderPreference === 'openrouter') return hasOpenRouter ? 'openrouter' : hasGemini ? 'gemini' : null;
    return hasGemini ? 'gemini' : hasOpenRouter ? 'openrouter' : null;
  }, [aiProviderPreference, apiKey, openRouterApiKey]);

  useEffect(() => {
    const refresh = () => setUserEvents(loadUserEventsFromStorage());
    refresh();
    window.addEventListener(USER_EVENTS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(USER_EVENTS_UPDATED_EVENT, refresh);
  }, []);

  useEffect(() => {
    saveUserEventsToStorage(userEvents);
  }, [userEvents]);

  useEffect(() => {
    const refresh = () => setBuiltinEventOverrides(loadBuiltinEventOverridesFromStorage());
    refresh();
    window.addEventListener(BUILTIN_EVENT_OVERRIDES_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(BUILTIN_EVENT_OVERRIDES_UPDATED_EVENT, refresh);
  }, []);

  useEffect(() => {
    saveBuiltinEventOverridesToStorage(builtinEventOverrides);
  }, [builtinEventOverrides]);

  useEffect(() => {
    const parseScheduleData = (textData: string) => {
      setIsLoadingSchedule(true);
      setScheduleError(null);

      const currentSystemYear = new Date().getFullYear();
      const endYear = BASE_SCHEDULE_END_YEAR; // Display events up to this year
      const newEvents: CalendarEvent[] = [];
      let eventIdCounter = 1;

      if (!textData || textData.trim() === '') {
        setScheduleError("제공된 일정 데이터가 비어있습니다.");
        setBaseEvents([]);
        setIsLoadingSchedule(false);
        return;
      }

      const lines = textData.split('\n').filter(line => line.trim() !== '');

      if (lines.length === 0) {
        setScheduleError("일정 데이터에 파싱할 내용이 없습니다.");
        setBaseEvents([]);
        setIsLoadingSchedule(false);
        return;
      }

      lines.forEach((line, lineIndex) => {
        const parts = line
          .split(';')
          .map((part) => part.replace(/[\s\u00A0\u200B\uFEFF]+/g, ' ').trim().normalize('NFC'))
          .filter((part) => part !== '');

        if (parts.length === 3 || parts.length >= 4) {
          const monthStr = parts[0];
          const dayStr = parts[1];
          const categoryStr =
            parts.length >= 4
              ? parts[2].replace(/[\s\u00A0\u200B\uFEFF]+/g, '').trim().normalize('NFC')
              : null;
          const titlesStr = parts.length >= 4 ? parts.slice(3).join(';').trim() : parts.slice(2).join(';').trim();

          const monthMatch = monthStr.match(/(\d+)월/);
          const dayMatch = dayStr.match(/(\d+)일/);

          const category = isEventCategory(categoryStr) ? categoryStr : DEFAULT_EVENT_CATEGORY;

          if (monthMatch && dayMatch && titlesStr) {
            const monthIdx = parseInt(monthMatch[1], 10) - 1; // 0-indexed month
            const day = parseInt(dayMatch[1], 10);

            if (monthIdx >= 0 && monthIdx < 12 && day > 0 && day <= 31) {
              const eventTitles = titlesStr.split(',').map(title => title.trim()).filter(title => title);

              for (let yearToCreate = currentSystemYear; yearToCreate <= endYear; yearToCreate++) {
                eventTitles.forEach(title => {
                  const eventDate = new Date(yearToCreate, monthIdx, day);
                  if (eventDate.getFullYear() === yearToCreate && eventDate.getMonth() === monthIdx && eventDate.getDate() === day) {
                    newEvents.push({
                      id: `event-${yearToCreate}-${monthIdx + 1}-${day}-${title.substring(0, 10).replace(/[^a-zA-Z0-9ㄱ-ㅎㅏ-ㅣ가-힣-]/g, '')}-${eventIdCounter++}`,
                      date: formatDateKey(eventDate),
                      title: title,
                      kind: 'builtin',
                      category,
                      source: 'manual',
                    });
                  }
                });
              }
            } else {
              console.warn(`Invalid date components (month or day out of range) in schedule data on line ${lineIndex + 1}: ${line}`);
            }
          } else {
            console.warn(`Invalid format (month/day regex mismatch) in schedule data on line ${lineIndex + 1}: ${line}`);
          }
        } else if (line.trim()) {
          console.warn(`Skipping malformed line (expected 3 or 4 parts separated by ';') in schedule data on line ${lineIndex + 1}: ${line}`);
        }
      });

      setBaseEvents(newEvents);

      if (lines.length > 0 && newEvents.length === 0) {
        setScheduleError("제공된 일정 데이터에서 유효한 일정을 찾지 못했습니다. 데이터 형식(예: 1월 ; 1일 ; 내용 또는 1월 ; 1일 ; 카테고리 ; 내용)을 확인해주세요.");
      }
      setIsLoadingSchedule(false);
    };

    parseScheduleData(scheduleText);
  }, [scheduleText]);


  useEffect(() => {
    let timer: number | undefined;
    if (isGeneratingDescription && loadingStep < loadingMessages.length) {
      const randomDuration = 1300 + Math.random() * 1500;
      timer = window.setTimeout(() => {
        setLoadingStep(prevStep => prevStep + 1);
      }, randomDuration);
    }
    return () => clearTimeout(timer);
  }, [isGeneratingDescription, loadingStep]);

  const changeMonth = (offset: number): void => {
    setCurrentDate(prevDate => {
      const newDate = new Date(prevDate);
      newDate.setDate(1);
      newDate.setMonth(newDate.getMonth() + offset);
      return newDate;
    });
    setExpandedDays(new Set());
  };

  const changeWeek = (offset: number): void => {
    setCurrentDate(prevDate => {
      const newDate = new Date(prevDate);
      newDate.setDate(newDate.getDate() + (offset * 7));
      return newDate;
    });
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const today = new Date();

  const fetchEventDescription = useCallback(async (event: CalendarEvent) => {
    if (eventDescriptions[event.id]) {
      return;
    }

    const requestId = reportRequestSeqRef.current + 1;
    reportRequestSeqRef.current = requestId;
    activeReportRequestIdRef.current = requestId;

    setGenerationTargetEventId(event.id);
    setIsGeneratingDescription(true);
    setLoadingStep(0);
    setGenerationError(null);

    // AI Provider Check
    if (!aiProvider) {
      if (activeReportRequestIdRef.current === requestId) {
        setGenerationError("AI 기능을 사용할 수 없습니다. API 키가 설정되지 않았습니다.");
        setIsGeneratingDescription(false);
      }
      return;
    }
    if (aiProvider === 'gemini' && !geminiAi) {
      if (activeReportRequestIdRef.current === requestId) {
        setGenerationError("AI 기능을 사용할 수 없습니다. Gemini 초기화에 실패했습니다.");
        setIsGeneratingDescription(false);
      }
      return;
    }

    try {
      // 1. 공통 기본 정보 (Event Details)
      const basePrompt = `다음 달력 일정에 대해 설명해주세요: '${event.title}'${event.category ? ` (업무 분류: ${event.category})` : ''}.
일정 날짜: ${event.date}

응답은 다음 최대 세 부분으로 명확히 구분하여 작성해주세요 (해당하는 내용이 없을 경우 해당 부분은 생략 가능합니다):
1. **업무/일정 설명**: 이 업무 또는 일정에 대한 자세한 설명을 제공해주세요. (3-4 문장)
2. **업무처리절차**: 이 업무 또는 일정을 처리하기 위한 단계별 절차를 상세히 설명해주세요. **신규 사용자도 쉽게 따라 할 수 있도록 매우 상세한 단계별 가이드**로 작성해주세요.
    (예: "1. [시스템명] 로그인", "2. 메뉴 선택", "3. 입력 및 저장")
    정보 검색 우선순위:
        1. 학교 회계/업무 매뉴얼, 관련 YouTube
        2. 업무 절차 블로그 게시물
        3. 기타 관련 웹 페이지
    K-에듀파인/NEIS 관련 작업이 있다면 상세 메뉴 경로를 포함해주세요.
3. **학교행정업무매뉴얼 참조**: (매뉴얼 내용이 있다면 인용 언급)`;

      // 2. Gemini용 통합 Prompt (User Message에 모든 Context 포함)
      let geminiPrompt = basePrompt;
      if (manualContextText) {
        geminiPrompt += `\n\n--- 학교행정업무매뉴얼 목차 시작 ---\n${manualContextText}\n--- 학교행정업무매뉴얼 목차 끝 ---`;
      }
      geminiPrompt += `\n\n답변은 Google 검색 결과를 참고하여 최신 정보를 반영하고, 명확하고 이해하기 쉽게 한국어로 작성해주세요. Markdown 형식을 사용하여 목록이나 강조 등을 적절히 활용해주세요.`;


      // 3. OpenRouter용 분리 Prompt (System Message에 Context 포함 - 챗봇 스타일)
      const openRouterSystemParts: string[] = [];
      openRouterSystemParts.push('너는 한국 학교행정 업무 설명을 작성하는 도우미다.');
      openRouterSystemParts.push('출처를 꾸며내지 말고, 필요한 경우 확인 질문을 먼저 한다.');
      openRouterSystemParts.push('답변은 한국어로, 너무 길지 않게 핵심 위주로 마크다운으로 작성한다.');
      if (manualContextText) {
        openRouterSystemParts.push('가능하면 아래 매뉴얼 목차에서 관련 편/장/절을 함께 언급한다.');
        openRouterSystemParts.push('--- 학교행정업무매뉴얼 목차 시작 ---');
        openRouterSystemParts.push(manualContextText);
        openRouterSystemParts.push('--- 학교행정업무매뉴얼 목차 끝 ---');
      }
      const openRouterUserMessage = basePrompt + `\n\n위 내용에 맞춰 답변해줘.`;


      let description: string | undefined;
      let groundingChunks: GroundingChunk[] | undefined;

      if (aiProvider === 'gemini') {
        // Use geminiAi instance
        const response: GenerateContentResponse = await geminiAi!.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: geminiPrompt,
          config: {
            thinkingConfig: { thinkingBudget: 3000 },
            tools: [{ googleSearch: {} }],
          },
        });

        description = response.text;
        groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      } else {
        // OpenRouter Fallback (Chatbot Style)
        description = await openRouterChatCompletion({
          apiKey: openRouterApiKey,
          model: openRouterModel.trim() || undefined,
          messages: [
            {
              role: 'system',
              content: openRouterSystemParts.join('\n'),
            },
            { role: 'user', content: openRouterUserMessage },
          ],
          temperature: 0.2,
        });
        groundingChunks = undefined;
      }

      if (activeReportRequestIdRef.current === requestId) {
        if (description) {
          setEventDescriptions(prev => ({ ...prev, [event.id]: description }));
        } else {
          setGenerationError("AI로부터 유효한 설명을 받지 못했습니다.");
        }

        if (groundingChunks && groundingChunks.length > 0) {
          setEventGrounding(prev => ({ ...prev, [event.id]: groundingChunks }));
        } else if (aiProvider === 'openrouter') {
          // Clear grounding for OpenRouter as it doesn't support it standardly here
          setEventGrounding(prev => {
            if (!prev[event.id]) return prev;
            const next = { ...prev };
            delete next[event.id];
            return next;
          });
        }
      }

    } catch (error) {
      console.error("Error generating event description:", error);
      let errorMessage = "설명 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
      if (error instanceof Error) {
        const message = error.message ?? '';
        const lower = message.toLowerCase();

        if (message.includes("API key not valid")) {
          errorMessage = "API 키가 유효하지 않습니다. 확인해주세요.";
        } else if (message.includes("OpenRouter") && (message.includes("401") || lower.includes("unauthorized"))) {
          errorMessage = "OpenRouter API 키가 유효하지 않습니다. 확인해주세요.";
        } else if (lower.includes("quota")) {
          errorMessage = "API 사용량 할당량을 초과했습니다.";
        } else if (lower.includes("failed to fetch") || lower.includes("network")) {
          errorMessage = "네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.";
        } else if (message.includes("OpenRouter") && message.includes("404")) {
          errorMessage = "OpenRouter 모델을 찾지 못했습니다. 모델 입력값을 비우거나 다른 모델로 바꿔주세요.";
        }
      }
      if (activeReportRequestIdRef.current === requestId) {
        setGenerationError(errorMessage);
      }
    } finally {
      if (activeReportRequestIdRef.current === requestId) {
        setIsGeneratingDescription(false);
        setLoadingStep(loadingMessages.length);
      }
    }
  }, [aiProvider, geminiAi, openRouterApiKey, openRouterModel, eventDescriptions, manualContextText]);


  const handleEventClick = (event: CalendarEvent): void => {
    setSelectedEvent(event);
    setGenerationError(null);
    fetchEventDescription(event);
  };

  const clearAiCacheForEvent = useCallback((eventId: string) => {
    setEventDescriptions(prev => {
      if (!prev[eventId]) return prev;
      const next = { ...prev };
      delete next[eventId];
      return next;
    });
    setEventGrounding(prev => {
      if (!prev[eventId]) return prev;
      const next = { ...prev };
      delete next[eventId];
      return next;
    });
  }, []);

  const moveEventToDate = useCallback(
    (eventId: string, nextDateKey: string) => {
      if (!eventId) return;
      if (!isDateKeyLike(nextDateKey)) return;

      const userEvent = userEvents.find(ev => ev.id === eventId);
      if (userEvent) {
        if (userEvent.date === nextDateKey) return;
        setUserEvents(prev => prev.map(ev => (ev.id === eventId ? { ...ev, date: nextDateKey } : ev)));
        clearAiCacheForEvent(eventId);
        setSelectedEvent(prev => (prev && prev.id === eventId ? { ...prev, date: nextDateKey } : prev));
        return;
      }

      const baseEvent = baseEvents.find(ev => ev.id === eventId);
      if (!baseEvent) return;

      if (baseEvent.date === nextDateKey) {
        setBuiltinEventOverrides(prev => {
          const existing = prev[eventId];
          if (!existing) return prev;

          const nextEntry: BuiltinEventOverride = { ...existing };
          delete nextEntry.date;

          const next = { ...prev };
          if (!nextEntry.date && !nextEntry.title && !nextEntry.category) {
            delete next[eventId];
          } else {
            next[eventId] = nextEntry;
          }
          return next;
        });
      } else {
        setBuiltinEventOverrides(prev => {
          const existing = prev[eventId];
          const nextEntry: BuiltinEventOverride = { ...(existing ?? {}) };
          nextEntry.date = nextDateKey;

          const next = { ...prev };
          next[eventId] = nextEntry;
          return next;
        });
      }

      clearAiCacheForEvent(eventId);
      setSelectedEvent(prev => (prev && prev.id === eventId ? { ...prev, date: nextDateKey } : prev));
    },
    [userEvents, baseEvents, clearAiCacheForEvent],
  );

  const openCreateEditor = (dateKey: string) => {
    const { year: y, month: m, day: d } = parseDateKeyParts(dateKey);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return;

    setEditorMode('create');
    setDraftId(null);
    setDraftKind('user');
    setDraftTitle('');
    setDraftCategory(DEFAULT_EVENT_CATEGORY);
    setDraftYear(y);
    setDraftMonth(m);
    setDraftDay(d);
    setDraftError(null);
    setIsEditorOpen(true);
  };

  const openEditEditor = (event: CalendarEvent) => {
    const { year: y, month: m, day: d } = parseDateKeyParts(event.date);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return;

    setEditorMode('edit');
    setDraftId(event.id);
    setDraftKind(event.kind);
    setDraftTitle(event.title);
    setDraftCategory(event.category ?? DEFAULT_EVENT_CATEGORY);
    setDraftYear(y);
    setDraftMonth(m);
    setDraftDay(d);
    setDraftError(null);
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setDraftError(null);
  };

  const draftDaysInMonth = useMemo(() => new Date(draftYear, draftMonth, 0).getDate(), [draftYear, draftMonth]);

  useEffect(() => {
    if (draftDay > draftDaysInMonth) {
      setDraftDay(draftDaysInMonth);
    }
  }, [draftDay, draftDaysInMonth]);

  const yearOptions = useMemo(() => {
    const currentSystemYear = new Date().getFullYear();
    const start = Math.min(currentSystemYear, draftYear);
    const end = Math.max(BASE_SCHEDULE_END_YEAR, currentSystemYear + 2, draftYear);
    return Array.from({ length: end - start + 1 }, (_, idx) => start + idx);
  }, [draftYear]);

  const handleSaveDraft = () => {
    const cleanedTitle = draftTitle.trim();
    if (!cleanedTitle) {
      setDraftError("일정 내용을 입력해주세요.");
      return;
    }

    const dateKey = buildDateKeyFromParts(draftYear, draftMonth, draftDay);
    const dateObj = new Date(draftYear, draftMonth - 1, draftDay);
    if (Number.isNaN(dateObj.getTime()) || formatDateKey(dateObj) !== dateKey) {
      setDraftError("유효한 날짜를 선택해주세요.");
      return;
    }

    if (editorMode === 'create') {
      const category = isEventCategory(draftCategory) ? draftCategory : null;
      if (!category) {
        setDraftError("업무를 선택해주세요.");
        return;
      }

      const newEvent: UserCalendarEvent = {
        id: `user-${nanoid(10)}`,
        date: dateKey,
        title: cleanedTitle,
        category,
        kind: 'user',
        source: 'manual',
      };
      setUserEvents(prev => [newEvent, ...prev]);
      closeEditor();
      return;
    }

    if (!draftId) {
      setDraftError("수정할 일정이 선택되지 않았습니다.");
      return;
    }

    if (draftKind === 'user') {
      const category = isEventCategory(draftCategory) ? draftCategory : null;
      if (!category) {
        setDraftError("업무를 선택해주세요.");
        return;
      }

      setUserEvents(prev =>
        prev.map(ev =>
          ev.id === draftId
            ? ({ ...ev, date: dateKey, title: cleanedTitle, category } as UserCalendarEvent)
            : ev
        )
      );
      clearAiCacheForEvent(draftId);
      closeEditor();
      return;
    }

    setBuiltinEventOverrides(prev => {
      const base = baseEvents.find(ev => ev.id === draftId);
      if (!base) return prev;

      const existing = prev[draftId];
      const nextEntry: BuiltinEventOverride = { ...(existing ?? {}) };

      if (dateKey === base.date) {
        delete nextEntry.date;
      } else {
        nextEntry.date = dateKey;
      }

      if (cleanedTitle === base.title) {
        delete nextEntry.title;
      } else {
        nextEntry.title = cleanedTitle;
      }

      if (isEventCategory(draftCategory)) {
        nextEntry.category = draftCategory;
      } else {
        delete nextEntry.category;
      }

      const next = { ...prev };
      if (!nextEntry.date && !nextEntry.title && !nextEntry.category) {
        delete next[draftId];
      } else {
        next[draftId] = nextEntry;
      }
      return next;
    });
    clearAiCacheForEvent(draftId);
    closeEditor();
  };

  const handleDeleteDraft = () => {
    if (!draftId) return;

    if (draftKind === 'builtin') {
      setBuiltinEventOverrides(prev => {
        const existing = prev[draftId];
        if (!existing) return prev;
        const next = { ...prev };
        delete next[draftId];
        return next;
      });
      clearAiCacheForEvent(draftId);
      closeEditor();
      return;
    }

    setUserEvents(prev => prev.filter(ev => ev.id !== draftId));
    clearAiCacheForEvent(draftId);
    closeEditor();
  };

  const toggleDayExpansion = (dateKey: string) => {
    setExpandedDays(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dateKey)) {
        newSet.delete(dateKey);
      } else {
        newSet.add(dateKey);
      }
      return newSet;
    });
  };

  const renderHeader = (): React.ReactNode => (
    <div className="flex-shrink-0 flex justify-between items-center mb-4 sm:mb-6 px-1 sm:px-2">
      <div className="flex items-center gap-4">
        <h2 className={`text-xl sm:text-2xl font-bold ${colors.textPrimary} tracking-wide`}>
          {viewMode === 'month'
            ? `${year}년 ${KOREAN_MONTH_NAMES[month]}`
            : `${year}년 ${KOREAN_MONTH_NAMES[currentDate.getMonth()]} ${Math.ceil(currentDate.getDate() / 7)}주차 (주간)`
          }
        </h2>
        <div className={`flex ${colors.inputBg} rounded-lg p-1 border ${colors.border}`}>
          <button
            onClick={() => setViewMode('month')}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${viewMode === 'month' ? `${colors.activeTabBg} ${colors.buttonText} shadow-sm` : `${colors.textSecondary} hover:${colors.textPrimary}`}`}
          >
            월간
          </button>
          <button
            onClick={() => setViewMode('week')}
            data-tour="view-week"
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${viewMode === 'week' ? `${colors.activeTabBg} ${colors.buttonText} shadow-sm` : `${colors.textSecondary} hover:${colors.textPrimary}`}`}
          >
            주간
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative" ref={filterDropdownRef}>
          <button
            type="button"
            onClick={() => setIsFilterOpen((prev) => !prev)}
            data-tour="filter-button"
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors border ${colors.border} ${colors.inputBg} ${colors.textPrimary} hover:opacity-90`}
            aria-label="필터"
          >
            필터{isAllFiltersSelected ? '' : ' •'}
          </button>
          {isFilterOpen && (
            <div
              className={`absolute right-0 mt-2 w-72 ${colors.componentBg} border ${colors.border} rounded-xl shadow-xl p-3 z-[110]`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className={`text-sm font-semibold ${colors.textPrimary}`}>필터</span>
                <button
                  type="button"
                  onClick={resetFilters}
                  className={`text-xs ${colors.textSecondary} hover:${colors.textPrimary} underline`}
                >
                  초기화
                </button>
              </div>

              <label className={`flex items-center gap-2 text-sm ${colors.textPrimary}`}>
                <input
                  type="checkbox"
                  className={`mt-0.5 h-4 w-4 rounded border ${colors.border} ${colors.inputBg} text-cyan-500 focus:ring-cyan-400`}
                  checked={isAllFiltersSelected}
                  onChange={toggleSelectAllFilters}
                  onClick={(e) => e.stopPropagation()}
                />
                전체 선택
              </label>

              <div className={`mt-3 pt-2 border-t ${colors.border}`}>
                <div className={`text-xs font-semibold ${colors.textSecondary} mb-1`}>카테고리</div>
                <div className="max-h-40 overflow-y-auto scrollbar-thin pr-1 space-y-1">
                  {EVENT_CATEGORIES.map((category) => (
                    <label key={category} className={`flex items-center gap-2 text-sm ${colors.textPrimary}`}>
                      <input
                        type="checkbox"
                        className={`mt-0.5 h-4 w-4 rounded border ${colors.border} ${colors.inputBg} text-cyan-500 focus:ring-cyan-400`}
                        checked={selectedCategorySet.has(category)}
                        onChange={() => toggleCategoryFilter(category)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="truncate">{category}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className={`mt-3 pt-2 border-t ${colors.border}`}>
                <div className={`text-xs font-semibold ${colors.textSecondary} mb-1`}>생성 출처</div>
                <div className="space-y-1">
                  {ALL_EVENT_SOURCES.map((source) => (
                    <label key={source} className={`flex items-center gap-2 text-sm ${colors.textPrimary}`}>
                      <input
                        type="checkbox"
                        className={`mt-0.5 h-4 w-4 rounded border ${colors.border} ${colors.inputBg} text-cyan-500 focus:ring-cyan-400`}
                        checked={selectedSourceSet.has(source)}
                        onChange={() => toggleSourceFilter(source)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {source === 'manual' ? '사용자 입력' : 'AI 입력'}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => viewMode === 'month' ? changeMonth(-1) : changeWeek(-1)}
          className={`p-2 rounded-full ${colors.hoverEffect} focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-opacity-50 transition-colors group`}
          aria-label="Previous"
        >
          <PrevIcon />
        </button>
        <button
          onClick={() => viewMode === 'month' ? changeMonth(1) : changeWeek(1)}
          className={`p-2 rounded-full ${colors.hoverEffect} focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-opacity-50 transition-colors group`}
          aria-label="Next"
        >
          <NextIcon />
        </button>
      </div>
    </div>
  );

  const renderDaysOfWeek = (): React.ReactNode => (
    <div className="flex-shrink-0 grid grid-cols-7 gap-1 sm:gap-2 mb-2 px-1">
      {KOREAN_DAY_NAMES_SHORT.map(day => (
        <div key={day} className={`text-center font-medium text-xs sm:text-sm text-text-tertiary uppercase`}>
          {day}
        </div>
      ))}
    </div>
  );

  const renderCalendarCells = (): React.ReactNode => {
    const blanks = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
      blanks.push(<div key={`blank-${i}`} className="border border-transparent rounded-lg"></div>);
    }

    const days = [];
    const MAX_EVENTS_VISIBLE = 2; // Limit to 2 events

    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
      const cellDate = new Date(year, month, day);
      const dateKey = formatDateKey(cellDate);
      const dayEvents = filteredEvents.filter(event => event.date === dateKey);
      const isExpanded = expandedDays.has(dateKey);

      const shouldShowButton = !isExpanded && dayEvents.length > MAX_EVENTS_VISIBLE;
      const eventsToShow = isExpanded ? dayEvents : dayEvents.slice(0, MAX_EVENTS_VISIBLE);

      days.push(
        <div key={day} className="relative min-h-[100px] h-full">
          <div
            aria-label={`${KOREAN_MONTH_NAMES[month]} ${day}일, ${year}. ${dayEvents.length}개의 일정. 클릭하여 일정 추가.`}
            onClick={() => {
              if (draggingEventId) return;
              if (didJustDropRef.current) return;
              openCreateEditor(dateKey);
            }}
            onDragOver={(e) => {
              if (!draggingEventId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOverDateKey(dateKey);
            }}
            onDragLeave={() => {
              setDragOverDateKey(prev => (prev === dateKey ? null : prev));
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const droppedId = e.dataTransfer.getData('text/plain');
              if (droppedId) {
                moveEventToDate(droppedId, dateKey);
              }
              didJustDropRef.current = true;
              window.setTimeout(() => {
                didJustDropRef.current = false;
              }, 0);
              setDraggingEventId(null);
              setDragOverDateKey(null);
            }}
            className={`
                p-1 sm:p-2 border border-border-secondary/30 rounded-lg
                flex flex-col items-start justify-start 
                text-left 
                transition-all duration-200 ease-in-out
                w-full
                ${theme === 'dark'
                ? 'hover:brightness-125 hover:shadow-xl hover:border-accent-primary/70'
                : 'hover:bg-black/5 hover:shadow-sm'
              }
                ${!isExpanded ? 'z-0 hover:z-10' : ''}
            ${isExpanded
                ? `absolute top-0 left-0 z-[100] h-auto min-h-full shadow-2xl ring-1 ring-border-primary ${colors.componentBg}`
                : `relative h-full ${colors.componentBg}`
              }
            ${isToday
                ? 'bg-accent-primary/10 border-accent-secondary/50'
                : ''
              }
            ${dragOverDateKey === dateKey ? 'ring-2 ring-accent-primary' : ''}
            `}
          >
            <div className="flex justify-between items-center w-full mb-0.5 flex-shrink-0">
              <span className={`
                text-xs font-semibold ml-1
                ${isToday
                  ? 'bg-accent-primary text-white w-5 h-5 flex items-center justify-center rounded-full -ml-1 text-[10px]'
                  : 'text-text-secondary'
                }
              `}>
                {day}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openCreateEditor(dateKey);
                }}
                className={`
                  p-0.5 rounded-full 
                  text-text-tertiary hover:text-accent-primary hover:bg-main
                  opacity-0 group-hover:opacity-100 transition-opacity
                  ${isExpanded ? 'opacity-100' : ''}
                `}
                aria-label="일정 추가"
              >
                <PlusIconMini className="w-3 h-3" />
              </button>
            </div>

            <div className={`w-full space-y-0.5 flex flex-col ${isExpanded ? '' : 'overflow-hidden'}`}>
              {eventsToShow.map((event) => {
                const isUser = event.kind === 'user';
                return (
                  <button
                    key={event.id}
                    data-tour="calendar-event"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (didJustDropRef.current) return;
                      handleEventClick(event);
                    }}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', event.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggingEventId(event.id);
                    }}
                    onDragEnd={() => {
                      setDraggingEventId(null);
                      setDragOverDateKey(null);
                    }}
                    className={`
                      text-left w-full text-[10px] sm:text-[11px] px-1.5 rounded transition-all shadow-sm
                      truncate leading-tight font-bold
                      border flex-shrink-0 h-5 flex items-center
                      ${isUser
                        ? 'bg-accent-primary text-white border-transparent hover:opacity-90'
                        : 'bg-tertiary text-text-primary border-transparent hover:opacity-90'
                      } 
                      cursor-grab active:cursor-grabbing
                    `}
                    title={event.title}
                  >
                    {event.title}
                  </button>
                );
              })}
              {shouldShowButton && (
                <button
                  type="button"
                  data-tour="calendar-more"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDayExpansion(dateKey);
                  }}
                  className="text-[10px] font-bold text-text-tertiary hover:text-text-primary hover:bg-tertiary/50 mt-0.5 h-4 flex items-center justify-center w-full text-center rounded transition-colors flex-shrink-0"
                >
                  +{dayEvents.length - MAX_EVENTS_VISIBLE}개 더보기
                </button>
              )}
              {isExpanded && dayEvents.length > MAX_EVENTS_VISIBLE && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDayExpansion(dateKey);
                  }}
                  className="text-[10px] sm:text-xs text-text-tertiary hover:text-text-primary mt-1 py-1 w-full text-center hover:bg-tertiary/50 rounded transition-colors flex-shrink-0"
                >
                  접기
                </button>
              )}
            </div>
          </div>
        </div >
      );
    }
    return <>{[...blanks, ...days]}</>;
  };

  const renderEventModal = (): React.ReactNode => {
    if (!selectedEvent) return null;

    const descriptionText = eventDescriptions[selectedEvent.id];
    const groundingChunksForEvent = eventGrounding[selectedEvent.id];
    const isSelectedGenerating = isGeneratingDescription && generationTargetEventId === selectedEvent.id;
    const selectedGenerationError = generationTargetEventId === selectedEvent.id ? generationError : null;

    let section1Title = "업무/일정 설명";
    let section1Content = "";
    let section2Title = "업무처리절차";
    let section2Content = "";
    let section3Title = "학교행정업무매뉴얼 참조";
    let section3Content = "";
    let otherContent = "";

    if (descriptionText) {
      const text = descriptionText;

      const s1HeaderMatch = text.match(/1\.\s*(?:\*\*)?업무\/일정 설명(?:\*\*)?:?/i);
      const s2HeaderMatch = text.match(/2\.\s*(?:\*\*)?업무처리절차(?:\*\*)?:?/i);
      const s3HeaderMatch = text.match(/3\.\s*(?:\*\*)?학교행정업무매뉴얼 참조(?:\*\*)?:?/i);

      let s1StartIdx = s1HeaderMatch ? (s1HeaderMatch.index || 0) + s1HeaderMatch[0].length : -1;
      let s2StartIdx = s2HeaderMatch ? (s2HeaderMatch.index || 0) + s2HeaderMatch[0].length : -1;
      let s3StartIdx = s3HeaderMatch ? (s3HeaderMatch.index || 0) + s3HeaderMatch[0].length : -1;

      // Determine end points for each section
      let s1EndIdx = text.length;
      if (s2HeaderMatch && (s2HeaderMatch.index || 0) > s1StartIdx && s1StartIdx !== -1) s1EndIdx = Math.min(s1EndIdx, s2HeaderMatch.index || 0);
      if (s3HeaderMatch && (s3HeaderMatch.index || 0) > s1StartIdx && s1StartIdx !== -1) s1EndIdx = Math.min(s1EndIdx, s3HeaderMatch.index || 0);

      let s2EndIdx = text.length;
      if (s3HeaderMatch && (s3HeaderMatch.index || 0) > s2StartIdx && s2StartIdx !== -1) s2EndIdx = Math.min(s2EndIdx, s3HeaderMatch.index || 0);

      if (s1StartIdx !== -1) {
        section1Content = text.substring(s1StartIdx, s1EndIdx).trim();
      }
      if (s2StartIdx !== -1 && (!s1HeaderMatch || (s2HeaderMatch?.index || 0) >= s1EndIdx)) {
        section2Content = text.substring(s2StartIdx, s2EndIdx).trim();
      }
      if (s3StartIdx !== -1 && (!s2HeaderMatch || (s3HeaderMatch?.index || 0) >= s2EndIdx)) {
        section3Content = text.substring(s3StartIdx).trim();
      }

      if (!s1HeaderMatch && !s2HeaderMatch && !s3HeaderMatch && text) {
        otherContent = text.trim();
      } else if (s1HeaderMatch && !section1Content && !section2Content && !section3Content) {
        // If only S1 header found, S1 content is the rest of the string from S1 header
        if (s1StartIdx !== -1) section1Content = text.substring(s1StartIdx).trim();
      }
    }

    // Function to render markdown content for modal
    const renderMarkdownModal = (markdownText: string) => {
      if (!markdownText) return null;
      const rawHtml = marked.parse(markdownText, { breaks: true, gfm: true }) as string;
      // Basic styling for lists, can be expanded
      const styledHtml = rawHtml
        .replace(/<ul>/g, '<ul class="list-disc list-outside ml-5 space-y-1">')
        .replace(/<ol>/g, '<ol class="list-decimal list-outside ml-5 space-y-1">')
        .replace(/<li>/g, `<li class="text-sm ${colors.textSecondary} leading-relaxed">`)
        .replace(/<p>/g, `<p class="text-sm ${colors.textSecondary} leading-relaxed mb-2">`)
        .replace(/<strong>/g, `<strong class="font-semibold ${colors.textPrimary}">`)
        .replace(/<h3>/g, `<h3 class="text-base font-semibold ${colors.accentColor} mt-2 mb-1">`)
        .replace(/<h4>/g, `<h4 class="text-sm font-semibold ${colors.accentColor} mt-1 mb-1">`);
      return <div dangerouslySetInnerHTML={{ __html: styledHtml }} />;
    };


    return (
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100]`}
        onClick={() => setSelectedEvent(null)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-modal-title"
      >
        <div
          className={`${colors.componentBg} p-5 sm:p-6 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col ${colors.textPrimary} border ${colors.border}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-start mb-4 flex-shrink-0 gap-3">
            <div className="min-w-0">
              <h3 id="event-modal-title" className={`text-lg font-semibold ${colors.accentColor} truncate`}>{selectedEvent.title}</h3>
              <p className={`text-xs ${colors.textSecondary} mt-0.5`}>
                AI 보고서 · {aiProvider === 'gemini' ? 'Gemini' : aiProvider === 'openrouter' ? 'OpenRouter' : '미설정'}
                {selectedEvent.category ? ` · ${selectedEvent.category}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedEvent(null);
                  openEditEditor(selectedEvent);
                }}
                className={`${colors.buttonBg} ${colors.hoverEffect} ${colors.buttonText} font-semibold py-1.5 px-3 rounded-lg transition-colors text-sm`}
              >
                수정
              </button>
              <button
                onClick={() => setSelectedEvent(null)}
                className={`p-1 ${colors.textSecondary} hover:${colors.textPrimary} transition-colors rounded-full ${colors.hoverEffect}`}
                aria-label="팝업 닫기"
                type="button"
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-grow pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-blue-700 hover:scrollbar-thumb-blue-600 active:scrollbar-thumb-blue-500 scrollbar-thumb-rounded-md">
            {isSelectedGenerating && !descriptionText && !selectedGenerationError && (
              <div className="text-sm text-slate-300 py-4">
                <ul className="space-y-2.5">
                  {loadingMessages.map((message, index) => (
                    <li key={index} className="flex items-center space-x-2.5">
                      {index < loadingStep ? (
                        <CheckIconMini className="text-green-500 flex-shrink-0" />
                      ) : index === loadingStep && isGeneratingDescription ? (
                        <SpinnerIconMini className="flex-shrink-0" />
                      ) : (
                        <PendingIconMini className="text-slate-500 flex-shrink-0" />
                      )}
                      <span className={`${index < loadingStep ? 'text-slate-500 line-through' : (index === loadingStep && isGeneratingDescription) ? 'text-cyan-400 font-medium' : 'text-slate-400'}`}>
                        {message}
                      </span>
                    </li>
                  ))}
                </ul>
                {loadingStep >= loadingMessages.length && isSelectedGenerating && (
                  <div className="flex items-center space-x-2.5 mt-3">
                    <SpinnerIconMini className="flex-shrink-0" />
                    <span className="text-cyan-400 font-medium">마무리 중...</span>
                  </div>
                )}
              </div>
            )}
            {selectedGenerationError && (
              <div className="text-sm text-red-400 bg-red-900/20 border border-red-700 p-3 rounded-md">
                <p className="font-semibold mb-1">오류</p>
                {selectedGenerationError}
              </div>
            )}

            {!descriptionText && !isSelectedGenerating && !selectedGenerationError && (
              <div className={`text-sm ${colors.textSecondary} py-4`}>
                <p className={`font-semibold ${colors.textPrimary} mb-1`}>AI 보고서를 생성할 수 없습니다.</p>
                <p>
                  상단 <span className={`${colors.textPrimary} font-medium`}>API Key 설정</span>에서 Gemini 또는 OpenRouter 키를 등록한 뒤 다시 생성해주세요.
                </p>
                <button
                  type="button"
                  onClick={() => fetchEventDescription(selectedEvent)}
                  className={`${colors.accentBg} hover:opacity-90 ${colors.buttonText} font-semibold py-2 px-3 rounded-lg transition-colors text-xs mt-3`}
                >
                  AI 보고서 생성
                </button>
              </div>
            )}

            {descriptionText && !selectedGenerationError && (
              <>
                {otherContent && (
                  <div className="prose prose-sm prose-invert max-w-none chatbot-message-content">
                    {renderMarkdownModal(otherContent)}
                  </div>
                )}
                {section1Content && (
                  <div className="mb-4">
                    <h4 className="text-md font-semibold text-cyan-400 mb-1.5">{section1Title}</h4>
                    <div className="prose prose-sm prose-invert max-w-none chatbot-message-content">
                      {renderMarkdownModal(section1Content)}
                    </div>
                  </div>
                )}
                {section2Content && (
                  <div className="mb-4">
                    <h4 className="text-md font-semibold text-cyan-400 mb-1.5">{section2Title}</h4>
                    <div className="prose prose-sm prose-invert max-w-none chatbot-message-content">
                      {renderMarkdownModal(section2Content)}
                    </div>
                  </div>
                )}
                {section3Content && (
                  <div className="mb-4">
                    <h4 className="text-md font-semibold text-cyan-400 mb-1.5">{section3Title}</h4>
                    <div className="prose prose-sm prose-invert max-w-none chatbot-message-content">
                      {renderMarkdownModal(section3Content)}
                    </div>
                  </div>
                )}

                {groundingChunksForEvent && groundingChunksForEvent.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-slate-700">
                    <h4 className="text-xs font-semibold text-slate-400 mb-2">참고 자료 (Google 검색):</h4>
                    <ul className="space-y-1.5">
                      {groundingChunksForEvent.map((chunk, index) => {
                        if (chunk.web && chunk.web.uri) {
                          return (
                            <li key={index} className="text-xs">
                              <a
                                href={chunk.web.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-cyan-500 hover:text-cyan-400 hover:underline"
                                title={chunk.web.title || chunk.web.uri}
                              >
                                {chunk.web.title || chunk.web.uri}
                              </a>
                            </li>
                          );
                        }
                        return null;
                      }).filter(Boolean)}
                    </ul>
                  </div>
                )}
              </>
            )}
            {!aiProvider && (!selectedEvent?.id || (!eventDescriptions[selectedEvent!.id] && !isGeneratingDescription && !generationError)) && (
              <div className="text-sm text-yellow-400 bg-yellow-900/20 border border-yellow-700 p-3 rounded-md mt-3">
                AI 기능을 사용하려면 API 키가 필요합니다. 현재 설정되어 있지 않습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderEditorModal = (): React.ReactNode => {
    if (!isEditorOpen) return null;

    const modalTitle =
      editorMode === 'create'
        ? '일정 추가'
        : draftKind === 'builtin'
          ? '기본 일정 수정'
          : '일정 수정';
    const monthOptions = Array.from({ length: 12 }, (_, idx) => idx + 1);
    const dayOptions = Array.from({ length: draftDaysInMonth }, (_, idx) => idx + 1);

    return (
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100]`}
        onClick={closeEditor}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-editor-title"
      >
        <div
          className={`${colors.componentBg} p-5 sm:p-6 rounded-lg shadow-2xl w-full max-w-lg flex flex-col ${colors.textPrimary} border ${colors.border}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <h3 id="event-editor-title" className={`text-lg font-semibold ${colors.accentColor}`}>{modalTitle}</h3>
              <p className={`text-xs ${colors.textSecondary} mt-0.5`}>
                업무 분류를 선택하고 일정을 입력하세요. (드래그&드롭으로도 날짜 이동 가능)
              </p>
              {draftKind === 'builtin' && (
                <p className="text-[11px] text-slate-500 mt-1">
                  기본 일정 수정은 이 브라우저에만 저장됩니다.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={closeEditor}
              className={`p-1 ${colors.textSecondary} hover:${colors.textPrimary} transition-colors rounded-full ${colors.hoverEffect}`}
              aria-label="팝업 닫기"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className={`text-sm ${colors.textPrimary} block mb-1`}>날짜</label>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={draftYear}
                  onChange={(e) => setDraftYear(Number(e.target.value))}
                  className={`w-full p-2 ${colors.inputBg} border ${colors.border} rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none`}
                  aria-label="연도 선택"
                >
                  {yearOptions.map(y => (
                    <option key={y} value={y}>{y}년</option>
                  ))}
                </select>
                <select
                  value={draftMonth}
                  onChange={(e) => setDraftMonth(Number(e.target.value))}
                  className={`w-full p-2 ${colors.inputBg} border ${colors.border} rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none`}
                  aria-label="월 선택"
                >
                  {monthOptions.map(m => (
                    <option key={m} value={m}>{m}월</option>
                  ))}
                </select>
                <select
                  value={draftDay}
                  onChange={(e) => setDraftDay(Number(e.target.value))}
                  className={`w-full p-2 ${colors.inputBg} border ${colors.border} rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none`}
                  aria-label="일 선택"
                >
                  {dayOptions.map(d => (
                    <option key={d} value={d}>{d}일</option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">드롭다운으로 날짜를 바꾸면 일정 날짜를 옮길 수 있습니다.</p>
            </div>

            <div>
              <label className={`text-sm ${colors.textPrimary} block mb-1`} htmlFor="event-category">
                업무
              </label>
              <select
                id="event-category"
                value={draftCategory}
                onChange={(e) => setDraftCategory(e.target.value as EventCategory | '')}
                className={`w-full p-2 ${colors.inputBg} border ${colors.border} rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none`}
              >
                <option value="">업무 선택(선택)</option>
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={`text-sm ${colors.textPrimary} block mb-1`} htmlFor="event-title">
                일정 내용
              </label>
              <input
                id="event-title"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="예: 교육비특별회계 결산 마감"
                className={`w-full p-2.5 ${colors.inputBg} border ${colors.border} rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none placeholder-slate-600`}
                autoFocus
              />
              {draftError && (
                <div className="mt-2 text-xs text-red-300 bg-red-900/20 border border-red-700 p-2 rounded-md">
                  {draftError}
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            {editorMode === 'edit' ? (
              draftKind === 'user' ? (
                <button
                  type="button"
                  onClick={handleDeleteDraft}
                  className="bg-red-600 hover:bg-red-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  삭제
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDeleteDraft}
                  className={`${colors.buttonBg} ${colors.hoverEffect} ${colors.buttonText} font-semibold py-2 px-4 rounded-lg transition-colors`}
                >
                  기본값으로 되돌리기
                </button>
              )
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={closeEditor}
                className={`${colors.buttonBg} ${colors.hoverEffect} ${colors.buttonText} font-semibold py-2 px-4 rounded-lg transition-colors`}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                className={`${colors.accentBg} hover:opacity-90 ${colors.buttonText} font-semibold py-2 px-4 rounded-lg transition-colors`}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };


  return (
    <div className={`${colors.componentBg} px-4 sm:px-6 py-3 sm:py-5 rounded-xl shadow-2xl flex flex-col w-full h-full border ${colors.border}`}>
      {renderHeader()}

      {isLoadingSchedule && (
        <div className="text-center p-2 text-sm text-cyan-400 my-1">일정 데이터를 로딩 중입니다...</div>
      )}
      {scheduleError && !isLoadingSchedule && (
        <div className="text-center p-2 text-sm text-red-400 bg-red-900/30 rounded-md my-1">
          <p className="font-semibold">일정 로드 오류:</p>
          <p>{scheduleError}</p>
          <p className="text-xs mt-1">앱 코드 내 일정 데이터 형식을 확인해주세요.</p>
        </div>
      )}
      {!isLoadingSchedule && !scheduleError && allEvents.length === 0 && (
        <div className="text-center p-2 text-sm text-slate-400 my-1">
          표시할 일정이 없습니다. 앱 코드 내에 일정을 추가해주세요.
        </div>
      )}
      {!isLoadingSchedule && !scheduleError && allEvents.length > 0 && filteredEvents.length === 0 && (
        <div className="text-center p-2 text-sm text-slate-300 bg-slate-900/30 rounded-md my-1">
          <p>필터 결과 표시할 일정이 없습니다.</p>
          <button
            type="button"
            onClick={resetFilters}
            className={`${colors.accentBg} hover:opacity-90 ${colors.buttonText} font-semibold py-1.5 px-3 rounded-lg transition-colors text-xs mt-2`}
          >
            필터 초기화
          </button>
        </div>
      )}

      {viewMode === 'month' ? (
        <div className="flex-grow flex flex-col min-h-0">
          {renderDaysOfWeek()}
          <div className={`flex-grow grid grid-cols-7 grid-rows-6 sm:gap-1 min-h-0 ${colors.mainBg} rounded-xl sm:border ${colors.border}/50 sm:p-2`}>
            {renderCalendarCells()}
          </div>
        </div>
      ) : (
        <div className="flex-grow flex flex-col min-h-0">
          <WeeklyCalendar
            currentDate={currentDate}
            events={filteredEvents}
            onEventClick={handleEventClick}
            onDateClick={(dateKey) => {
              if (draggingEventId) return;
              if (didJustDropRef.current) return;
              openCreateEditor(dateKey);
            }}
            onDragStart={(e, eventId) => {
              setDraggingEventId(eventId);
              e.dataTransfer.setData('text/plain', eventId);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
              setDraggingEventId(null);
              setDragOverDateKey(null);
            }}
            onDrop={(e, dateKey) => {
              e.preventDefault();
              const droppedId = e.dataTransfer.getData('text/plain');
              if (droppedId) {
                moveEventToDate(droppedId, dateKey);
                didJustDropRef.current = true;
                setTimeout(() => { didJustDropRef.current = false; }, 100);
              }
              setDraggingEventId(null);
              setDragOverDateKey(null);
            }}
          />
        </div>
      )}
      {renderEventModal()}
      {renderEditorModal()}
    </div>
  );
};

export default Calendar;
