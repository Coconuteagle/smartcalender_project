
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Chat, GenerateContentResponse, GroundingChunk } from "@google/genai";
import { marked } from 'marked';
import { nanoid } from 'nanoid';
import { useApiKey } from '../contexts/ApiKeyContext';
import { useTheme } from '../contexts/ThemeContext';
import { openRouterChatCompletion, OpenRouterMessage } from '../utils/openRouter';
import {
  CalendarEventSource,
  DEFAULT_EVENT_CATEGORY,
  EVENT_CATEGORIES,
  EventCategory,
  USER_EVENTS_STORAGE_KEY,
  USER_EVENTS_UPDATED_EVENT,
} from '../types';

type StoredUserEvent = {
  id: string;
  date: string;
  title: string;
  category: EventCategory;
  source: CalendarEventSource;
};

type ScheduleProposalItem = {
  date: string;
  title: string;
  category: EventCategory;
};

type ScheduleProposal = {
  project: string;
  deadline: string | null;
  items: ScheduleProposalItem[];
  selected: boolean[];
  applied?: boolean;
  appliedCount?: number;
  skippedCount?: number;
};

const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isDateKeyLike = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

const isValidDateKey = (dateKey: string): boolean => {
  if (!isDateKeyLike(dateKey)) return false;
  const [y, m, d] = dateKey.split('-').map(Number);
  const obj = new Date(y, m - 1, d);
  return obj.getFullYear() === y && obj.getMonth() === m - 1 && obj.getDate() === d;
};

const asEventCategory = (value: unknown): EventCategory | null => {
  if (typeof value !== 'string') return null;
  return EVENT_CATEGORIES.includes(value as EventCategory) ? (value as EventCategory) : null;
};

const asCalendarEventSource = (value: unknown): CalendarEventSource | null => {
  if (value === 'manual' || value === 'ai') return value;
  return null;
};

type ExecutionWindow = { start: string; end: string };

const compareDateKey = (a: string, b: string) => a.localeCompare(b);

const shiftDateKeyByDays = (dateKey: string, deltaDays: number): string => {
  if (!isValidDateKey(dateKey)) return dateKey;
  const [y, m, d] = dateKey.split('-').map(Number);
  const next = new Date(y, m - 1, d);
  next.setDate(next.getDate() + deltaDays);
  return formatDateKey(next);
};

const clampMinDateKey = (dateKey: string, minDateKey: string): string =>
  compareDateKey(dateKey, minDateKey) < 0 ? minDateKey : dateKey;

const clampMaxDateKey = (dateKey: string, maxDateKey: string): string =>
  compareDateKey(dateKey, maxDateKey) > 0 ? maxDateKey : dateKey;

const inferExecutionWindowFromText = (text: string, baseDate = new Date()): ExecutionWindow | null => {
  const patterns: Array<RegExp> = [
    /(\d{1,2})\s*\uC6D4\s*(\d{1,2})\s*\uC77C?\s*[~-]\s*(\d{1,2})\s*\uC77C?/,
    /(\d{1,2})\s*\uC6D4\s*(\d{1,2})\s*\uC77C?\s*[~-]\s*(\d{1,2})\s*\uC6D4\s*(\d{1,2})\s*\uC77C?/,
    /(\d{1,2})\s*[\/\.]\s*(\d{1,2})\s*[~-]\s*(\d{1,2})\s*[\/\.]\s*(\d{1,2})/,
    /(\d{1,2})\s*월\s*(\d{1,2})\s*일?\s*[~\\-]\s*(\d{1,2})\s*일?/,
    /(\d{1,2})\s*월\s*(\d{1,2})\s*일?\s*[~\\-]\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/,
    /(\d{1,2})\s*[\\/\\.]\\s*(\d{1,2})\s*[~\\-]\s*(\d{1,2})\s*[\\/\\.]\\s*(\d{1,2})/,
  ];

  let startMonth: number | null = null;
  let startDay: number | null = null;
  let endMonth: number | null = null;
  let endDay: number | null = null;

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    if (pattern === patterns[0]) {
      startMonth = Number(match[1]);
      startDay = Number(match[2]);
      endMonth = startMonth;
      endDay = Number(match[3]);
      break;
    }

    if (pattern === patterns[1]) {
      startMonth = Number(match[1]);
      startDay = Number(match[2]);
      endMonth = Number(match[3]);
      endDay = Number(match[4]);
      break;
    }

    if (pattern === patterns[2]) {
      startMonth = Number(match[1]);
      startDay = Number(match[2]);
      endMonth = Number(match[3]);
      endDay = Number(match[4]);
      break;
    }
  }

  if (!startMonth || !startDay || !endMonth || !endDay) return null;
  if (!Number.isFinite(startMonth) || !Number.isFinite(startDay) || !Number.isFinite(endMonth) || !Number.isFinite(endDay)) return null;
  if (startMonth < 1 || startMonth > 12 || endMonth < 1 || endMonth > 12) return null;
  if (startDay < 1 || startDay > 31 || endDay < 1 || endDay > 31) return null;

  const todayStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  let startYear = baseDate.getFullYear();

  const candidateStart = new Date(startYear, startMonth - 1, startDay);
  if (candidateStart < todayStart) startYear += 1;

  const crossesYear = endMonth < startMonth || (endMonth === startMonth && endDay < startDay);
  const endYear = crossesYear ? startYear + 1 : startYear;

  const startDate = new Date(startYear, startMonth - 1, startDay);
  const endDate = new Date(endYear, endMonth - 1, endDay);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  if (formatDateKey(startDate) !== `${String(startYear).padStart(4, '0')}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`) return null;
  if (formatDateKey(endDate) !== `${String(endYear).padStart(4, '0')}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`) return null;

  return { start: formatDateKey(startDate), end: formatDateKey(endDate) };
};

const isPreWorkTitle = (title: string) => {
  const keywords = ['품의', '원인행위', '계약', '업체', '발주', '입찰', '견적', '선정', '결재', '상신'];
  return keywords.some(k => title.includes(k));
};

const isPostWorkTitle = (title: string) => {
  const keywords = ['검수', '준공', '정산', '지출', '대금', '세금계산서', '대금지급', '지출결의'];
  return keywords.some(k => title.includes(k));
};

const loadUserEventsFromStorage = (): StoredUserEvent[] => {
  try {
    const raw = localStorage.getItem(USER_EVENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item): StoredUserEvent | null => {
        if (!item || typeof item !== 'object') return null;
        const candidate = item as Record<string, unknown>;
        const id = candidate.id;
        const date = candidate.date;
        const title = candidate.title;
        const category = candidate.category;
        const source = candidate.source;

        if (typeof id !== 'string') return null;
        if (typeof title !== 'string' || !title.trim()) return null;
        if (typeof date !== 'string' || !isValidDateKey(date)) return null;
        const parsedCategory = asEventCategory(category) ?? DEFAULT_EVENT_CATEGORY;
        const parsedSource = asCalendarEventSource(source) ?? 'manual';

        return { id, date, title: title.trim(), category: parsedCategory, source: parsedSource };
      })
      .filter((v): v is StoredUserEvent => Boolean(v));
  } catch {
    return [];
  }
};

const saveUserEventsToStorage = (events: StoredUserEvent[]) => {
  try {
    const payload = events.map(({ id, date, title, category, source }) => ({ id, date, title, category, source }));
    localStorage.setItem(USER_EVENTS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
};

const extractFirstJsonObject = (text: string): string | null => {
  const start = text.indexOf('{');
  if (start < 0) return null;
  const end = text.lastIndexOf('}');
  if (end <= start) return null;
  return text.slice(start, end + 1);
};

const ScheduleAddIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v2m8-2v2M4 7h16" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v6m-3-3h6" />
  </svg>
);

const ScheduleModeIndicatorIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const SendIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
  </svg>
);

const BotIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M4.5 3.75a3 3 0 00-3 3v10.5a3 3 0 003 3h15a3 3 0 003-3V6.75a3 3 0 00-3-3h-15zm4.125 3a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0zM15.375 3a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0zM19.5 6.75a1.125 1.125 0 11-2.25 0 1.125 1.125 0 012.25 0zM10.875 12a3.375 3.375 0 00-3.375 3.375h6.75A3.375 3.375 0 0010.875 12zM4.125 13.875a1.125 1.125 0 100-2.25 1.125 1.125 0 000 2.25z" clipRule="evenodd" />
  </svg>
);

const UserIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
  </svg>
);

const TypingIndicator: React.FC = () => (
  <div className="flex items-center gap-1.5 px-1 py-1">
    <span
      className="h-2 w-2 rounded-full bg-slate-300/80"
      style={{ animation: 'typingDot 1.2s infinite ease-in-out', animationDelay: '0ms' }}
    />
    <span
      className="h-2 w-2 rounded-full bg-slate-300/80"
      style={{ animation: 'typingDot 1.2s infinite ease-in-out', animationDelay: '150ms' }}
    />
    <span
      className="h-2 w-2 rounded-full bg-slate-300/80"
      style={{ animation: 'typingDot 1.2s infinite ease-in-out', animationDelay: '300ms' }}
    />
  </div>
);


interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  sources?: GroundingChunk[];
  scheduleProposal?: ScheduleProposal;
}

interface ChatbotProps {
  manualContextText?: string;
}

const Chatbot: React.FC<ChatbotProps> = ({ manualContextText }) => {
  const { apiKey, openRouterApiKey, aiProviderPreference, openRouterModel } = useApiKey();
  const { colors, theme } = useTheme();
  const [ai, setAi] = useState<GoogleGenAI | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyAvailable, setApiKeyAvailable] = useState(false);
  const [isScheduleAddMode, setIsScheduleAddMode] = useState(false);
  const [activeProposalDateEditor, setActiveProposalDateEditor] = useState<null | { messageId: string; index: number }>(null);
  const [scrollTarget, setScrollTarget] = useState<null | { id: string; align?: ScrollLogicalPosition }>(null);

  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const inputRef = useRef<null | HTMLInputElement>(null);
  const suppressAutoScrollRef = useRef(false);
  const messageContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (apiKey) {
      try {
        const genAI = new GoogleGenAI({ apiKey });
        setAi(genAI);
        setError(null);
        setApiKeyAvailable(true);
      } catch (e) {
        console.error("Failed to initialize GoogleGenAI:", e);
        setError("AI 서비스 초기화에 실패했습니다. API 키 형식을 확인해주세요.");
        setApiKeyAvailable(false);
      }
    } else if (openRouterApiKey) {
      setAi(null);
      setChat(null);
      setError(null);
      setApiKeyAvailable(true);
      setMessages([
        { id: 'initial-ai-message', text: '안녕하세요! 학교 행정 업무에 대해 무엇이든 물어보세요.', isUser: false },
      ]);
    } else {
      console.warn("API_KEY for chatbot is not set. Chatbot AI features will be disabled.");
      setAi(null);
      setChat(null);
      setMessages([
        {
          id: 'initial-no-key',
          text: 'API 키를 설정하면 챗봇을 사용할 수 있습니다. 상단의 **API Key 설정**에서 키를 입력해주세요.',
          isUser: false,
        },
      ]);
      setError("AI 챗봇 기능을 사용하려면 API 키가 필요합니다.");
      setApiKeyAvailable(false);
    }
  }, [apiKey, openRouterApiKey]);

  useEffect(() => {
    if (ai && apiKeyAvailable) {
      let systemInstructionContent = 'You are a helpful assistant for Korean school administration tasks. Provide concise and accurate information based on your knowledge and Google Search results. Cite your sources when available using the grounding information. Respond in Korean. Format your responses using markdown where appropriate (e.g., lists, bolding).무조건! 웹검색을 충분히 하여 정확한 답변을 출력해야한다';

      if (manualContextText) {
        systemInstructionContent += `\n\nAdditionally, you have access to the following table of contents from a school administration manual. When a user's query relates to topics covered in this manual, please reference the relevant sections or page numbers in your response if applicable. If you use information from this manual, please try to cite it (e.g., "학교행정업무매뉴얼 제10편, 168p 참조").\n\n--- SCHOOL ADMINISTRATION MANUAL (TABLE OF CONTENTS) START ---\n${manualContextText}\n--- SCHOOL ADMINISTRATION MANUAL (TABLE OF CONTENTS) END ---`;
      }

      try {
        const newChat = ai.chats.create({
          model: 'gemini-2.5-flash',
          config: {
            systemInstruction: systemInstructionContent,
            tools: [{ googleSearch: {} }],
          },
        });
        setChat(newChat);
        setMessages([
          { id: 'initial-ai-message', text: '안녕하세요! 학교 행정 업무에 대해 무엇이든 물어보세요.', isUser: false }
        ]);
        inputRef.current?.focus();
      } catch (e) {
        console.error("Failed to create chat session:", e);
        setError("챗봇 세션 시작에 실패했습니다. 네트워크 연결 또는 API 설정을 확인해주세요.");
      }
    }
  }, [ai, apiKeyAvailable, manualContextText]);

  const scrollToTarget = useCallback((target: { id: string; align?: ScrollLogicalPosition } | null) => {
    if (!target) return;
    const el = messageContainerRefs.current[target.id];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: target.align ?? 'start' });
  }, []);

  useEffect(() => {
    if (suppressAutoScrollRef.current) {
      suppressAutoScrollRef.current = false;
      return;
    }
    if (scrollTarget) {
      scrollToTarget(scrollTarget);
      setScrollTarget(null);
    }
  }, [messages, scrollTarget, scrollToTarget]);

  const toggleScheduleProposalItem = useCallback((messageId: string, index: number) => {
    suppressAutoScrollRef.current = true;
    setMessages(prev =>
      prev.map(msg => {
        if (msg.id !== messageId) return msg;
        if (!msg.scheduleProposal) return msg;
        if (msg.scheduleProposal.applied) return msg;
        if (index < 0 || index >= msg.scheduleProposal.selected.length) return msg;

        const nextSelected = msg.scheduleProposal.selected.slice();
        nextSelected[index] = !nextSelected[index];
        return { ...msg, scheduleProposal: { ...msg.scheduleProposal, selected: nextSelected } };
      })
    );
  }, []);

  const toggleScheduleProposalAll = useCallback((messageId: string) => {
    suppressAutoScrollRef.current = true;
    setMessages(prev =>
      prev.map(msg => {
        if (msg.id !== messageId) return msg;
        if (!msg.scheduleProposal) return msg;
        if (msg.scheduleProposal.applied) return msg;

        const allSelected = msg.scheduleProposal.selected.every(Boolean);
        const nextSelected = msg.scheduleProposal.selected.map(() => !allSelected);
        return { ...msg, scheduleProposal: { ...msg.scheduleProposal, selected: nextSelected } };
      })
    );
  }, []);

  const openScheduleProposalDateEditor = useCallback((messageId: string, index: number) => {
    suppressAutoScrollRef.current = true;
    setActiveProposalDateEditor(prev => {
      if (prev && prev.messageId === messageId && prev.index === index) return null;
      return { messageId, index };
    });
  }, []);

  const updateScheduleProposalDate = useCallback((messageId: string, index: number, nextDateKey: string) => {
    if (!isValidDateKey(nextDateKey)) return;
    suppressAutoScrollRef.current = true;
    setMessages(prev =>
      prev.map(msg => {
        if (msg.id !== messageId) return msg;
        if (!msg.scheduleProposal) return msg;
        if (msg.scheduleProposal.applied) return msg;
        if (index < 0 || index >= msg.scheduleProposal.items.length) return msg;

        const nextItems = msg.scheduleProposal.items.slice();
        nextItems[index] = { ...nextItems[index], date: nextDateKey };
        return { ...msg, scheduleProposal: { ...msg.scheduleProposal, items: nextItems } };
      })
    );
    setActiveProposalDateEditor(null);
  }, []);

  const applyScheduleProposal = useCallback((messageId: string) => {
    suppressAutoScrollRef.current = true;
    setMessages(prev => {
      const target = prev.find(msg => msg.id === messageId);
      if (!target?.scheduleProposal) return prev;
      if (target.scheduleProposal.applied) return prev;

      const proposal = target.scheduleProposal;
      const selectedItems = proposal.items.filter((_, idx) => proposal.selected[idx]);
      if (selectedItems.length === 0) return prev;

      const existing = loadUserEventsFromStorage();
      const existingKeySet = new Set(existing.map(ev => `${ev.date}::${ev.title}`));

      const added: StoredUserEvent[] = [];
      for (const item of selectedItems) {
        const key = `${item.date}::${item.title}`;
        if (existingKeySet.has(key)) continue;
        existingKeySet.add(key);
        added.push({
          id: `user-${nanoid(10)}`,
          date: item.date,
          title: item.title,
          category: item.category,
          source: 'ai',
        });
      }

      const nextEvents = [...added, ...existing];
      saveUserEventsToStorage(nextEvents);
      window.dispatchEvent(new CustomEvent(USER_EVENTS_UPDATED_EVENT));

      const summaryLines: string[] = [];
      summaryLines.push(`적용 완료: **${added.length}개** 일정이 캘린더에 추가됐어요.`);
      if (proposal.project) summaryLines.push(`- 프로젝트: **${proposal.project}**`);
      if (proposal.deadline) summaryLines.push(`- 마감: **${proposal.deadline}**`);
      if (added.length > 0) {
        summaryLines.push('');
        summaryLines.push(...added.map(ev => `- ${ev.date} ${ev.title}`));
      } else {
        summaryLines.push('');
        summaryLines.push('선택한 일정이 이미 등록되어 있어 새로 추가된 일정이 없어요.');
      }

      return prev.map(msg => {
        if (msg.id !== messageId) return msg;
        return {
          ...msg,
          text: `${msg.text}\n\n${summaryLines.join('\n')}`.trim(),
          scheduleProposal: {
            ...proposal,
            applied: true,
            appliedCount: added.length,
            skippedCount: Math.max(0, selectedItems.length - added.length),
          },
        };
      });
    });
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (!userInput.trim() || isLoading || !apiKeyAvailable) return;

    const userMessageText = userInput.trim();
    const userMessage: ChatMessage = { id: `user-${Date.now()}`, text: userMessageText, isUser: true };
    setMessages(prev => [...prev, userMessage]);
    setUserInput('');
    setIsLoading(true);
    setError(null);

    const aiMessageId = `ai-${Date.now()}`;
    setMessages(prev => [...prev, { id: aiMessageId, text: '', isUser: false, sources: [] }]);
    setScrollTarget({ id: aiMessageId, align: 'start' });

    try {
      const provider: 'gemini' | 'openrouter' | null = (() => {
        const hasGemini = Boolean(apiKey);
        const hasOpenRouter = Boolean(openRouterApiKey);
        if (aiProviderPreference === 'gemini') return hasGemini ? 'gemini' : hasOpenRouter ? 'openrouter' : null;
        if (aiProviderPreference === 'openrouter') return hasOpenRouter ? 'openrouter' : hasGemini ? 'gemini' : null;
        return hasGemini ? 'gemini' : hasOpenRouter ? 'openrouter' : null;
      })();
      if (!provider) {
        throw new Error("API_KEY_MISSING");
      }

      if (isScheduleAddMode) {
        const now = new Date();
        const todayKey = formatDateKey(now);
        const executionWindow = inferExecutionWindowFromText(userMessageText, now);
        const executionStartKey = executionWindow?.start ?? null;
        const executionEndKey = executionWindow?.end ?? null;
        const searchInstruction =
          provider === 'gemini'
            ? '- 가능하면 반드시 Google Search(도구)를 사용해 K-에듀파인 관련 업무 단계/체크리스트를 참고해 현실적인 할 일을 만든다.'
            : "- 웹검색 도구는 없으니, 일반적인 K-에듀파인 처리 흐름에 따라 현실적인 할 일을 만든다. (출처를 꾸며내지 마라)";
        const prompt = `너는 사용자의 자연어 요청을 'K-에듀파인(학교 회계/계약/지출) 처리 관점'의 '캘린더 일정(할 일)'로 바꿔주는 도우미다.
- 사용자의 요청이 학교 운영에서 돈이 쓰이거나(물품/용역/시설/인쇄/제작/수리/임차/위탁 등) 계약/발주/지출이 필요한 일이라면 K-에듀파인 업무로 간주하고, "품의 → 원인행위(계약/발주) → 납품·검수 → 지출(정산)" 흐름으로만 할 일을 만든다.
  예: "12월 24일 현수막 달기"는 '현수막 제작·설치(물품/용역)'로 보고, "품의 상신", "업체선정·발주/원인행위", "납품·검수 처리", "설치 완료 확인" 같은 3~4개 일정을 만든다.
- 개인 일정(생일/여행/개인 병원 등)처럼 학교 회계와 무관한 경우에만 events를 빈 배열([])로 반환한다.
${searchInstruction}
- 출력은 JSON만(마크다운/코드블록 금지). 다른 문장은 절대 출력하지 마라.

스키마(키 이름/타입을 정확히 지켜라):
{
  "project": string,
  "deadline": "YYYY-MM-DD" | null,
  "events": [
    { "date": "YYYY-MM-DD", "task": string, "title": string, "category": string | null }
  ]
}

규칙:
- title은 반드시 "\${project}: \${task}" 형태.
- date는 모두 ISO(YYYY-MM-DD).
- 사용자가 연도를 말하지 않으면 오늘(${todayKey}, KST) 기준으로 가장 가까운 '미래' 날짜로 결정.
- events는 **중요한 것만 3~4개**. (가능하면 3개, 꼭 필요할 때만 4개) 중복 task 금지.
- events는 date 오름차순으로 정렬.
- 마감(deadline)이 있으면 events를 마감일까지 분산 배치(마감이 임박하면 같은 날짜에 여러 개 배치 가능).
- category는 아래 중 하나만 허용(모르면 null):
  ${EVENT_CATEGORIES.join(', ')}

작업 기간이 주어진 경우(예: "12월 20~24일 공사"):
- executionStart: ${executionStartKey ?? 'null'}
- executionEnd: ${executionEndKey ?? 'null'}
- **품의/원인행위/업체선정/계약/발주/입찰/견적 등 사전 절차는 executionStart 이전 날짜에만 배치**한다.
- **공사/설치/시공 등 실행 작업은 executionStart~executionEnd 기간 안**에 배치한다.
- **검수/준공/정산/지출 등 사후 절차는 executionEnd 당일 또는 이후**에 배치한다.
- 일정 순서를 스스로 검증해, "공사 시작(실행) 전에 계약/발주가 끝나도록" 날짜를 역산해 배치한다.

사용자 입력: """${userMessageText}"""`;

        let rawText = '';
        let groundingChunks: GroundingChunk[] = [];
        let hasGoogleGrounding = false;

        if (provider === 'gemini') {
          if (!ai) {
            throw new Error("AI_NOT_READY");
          }

          const generateOnce = async (contents: string) => {
            const response: GenerateContentResponse = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents,
              config: {
                thinkingConfig: { thinkingBudget: 3000 },
                tools: [{ googleSearch: {} }],
              },
            });

            const responseGroundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
            const webChunks = responseGroundingChunks.filter(chunk => chunk.web?.uri);
            return { response, groundingChunks: responseGroundingChunks, webChunks };
          };

          let { response, groundingChunks: responseGroundingChunks, webChunks } = await generateOnce(prompt);
          hasGoogleGrounding = webChunks.length > 0;
          if (!hasGoogleGrounding) {
            const stricterPrompt = `${prompt}\n\n중요: 반드시 googleSearch 도구를 실행해 최소 1개의 web.uri 근거를 남겨라. 근거가 없으면 events는 빈 배열([])로 반환하라.`;
            ({ response, groundingChunks: responseGroundingChunks, webChunks } = await generateOnce(stricterPrompt));
            hasGoogleGrounding = webChunks.length > 0;
          }

          rawText = response.text ?? '';
          groundingChunks = responseGroundingChunks;
        } else {
          rawText = await openRouterChatCompletion({
            apiKey: openRouterApiKey,
            model: openRouterModel.trim() || undefined,
            messages: [
              {
                role: 'system',
                content:
                  "너는 한국 학교행정(K-에듀파인) 일정 생성기다. 반드시 JSON만 출력하며, 출처를 꾸며내거나 웹검색을 했다고 단정하지 않는다.",
              },
              { role: 'user', content: prompt },
            ],
            temperature: 0.2,
          });
          groundingChunks = [];
          hasGoogleGrounding = false;
        }
        const rawJson = extractFirstJsonObject(rawText) ?? rawText;
        let parsed: any;
        try {
          parsed = JSON.parse(rawJson);
        } catch {
          throw new Error("MODEL_RETURNED_INVALID_JSON");
        }

        const project: string =
          typeof parsed?.project === 'string' && parsed.project.trim()
            ? parsed.project.trim()
            : userMessageText.slice(0, 30).trim();

        const deadline: string | null =
          typeof parsed?.deadline === 'string' && isValidDateKey(parsed.deadline) ? parsed.deadline : null;

        const candidateEvents: Array<{ date: string; title: string; category: EventCategory }> = Array.isArray(parsed?.events)
          ? parsed.events
            .map((ev: any) => {
              const date = ev?.date;
              const taskCandidate =
                typeof ev?.task === 'string'
                  ? ev.task.trim()
                  : (typeof ev?.title === 'string' ? ev.title.trim() : '');

              if (!taskCandidate) return null;

              const projectPrefix = `${project}:`;
              const normalizedTask = taskCandidate.startsWith(projectPrefix)
                ? taskCandidate.slice(projectPrefix.length).trim()
                : taskCandidate;
              const title = project ? `${project}: ${normalizedTask}` : normalizedTask;
              const category = asEventCategory(ev?.category) ?? DEFAULT_EVENT_CATEGORY;

              if (!isValidDateKey(date)) return null;
              if (!title) return null;
              return { date, title, category };
            })
            .filter(Boolean)
          : [];

        const deduped: Array<{ date: string; title: string; category: EventCategory }> = [];
        const seen = new Set<string>();
        for (const item of candidateEvents) {
          const key = `${item.date}::${item.title}`;
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(item);
        }

        let proposedItems: ScheduleProposalItem[] = deduped
          .slice(0, 4)
          .map(({ date, title, category }) => ({ date: clampMinDateKey(date, todayKey), title, category }));

        if (executionStartKey && executionEndKey) {
          const preWorkLatestKey = clampMinDateKey(shiftDateKeyByDays(executionStartKey, -1), todayKey);
          const postWorkEarliestKey = clampMinDateKey(executionEndKey, todayKey);
          proposedItems = proposedItems.map(item => {
            let date = item.date;

            const preWork = isPreWorkTitle(item.title);
            const postWork = isPostWorkTitle(item.title);

            if (preWork) {
              date = clampMaxDateKey(date, preWorkLatestKey);
            } else if (postWork) {
              date = clampMinDateKey(date, postWorkEarliestKey);
            } else {
              if (compareDateKey(date, executionStartKey) < 0) date = executionStartKey;
              if (compareDateKey(date, executionEndKey) > 0) date = executionEndKey;
            }

            date = clampMinDateKey(date, todayKey);
            return { ...item, date };
          });

          const preWorkRank = (title: string) => {
            if (title.includes('품의') || title.includes('상신') || title.includes('결재')) return 0;
            if (title.includes('견적') || title.includes('업체') || title.includes('선정') || title.includes('입찰')) return 1;
            if (title.includes('계약') || title.includes('원인행위') || title.includes('발주')) return 2;
            return 3;
          };

          const postWorkRank = (title: string) => {
            if (title.includes('검수') || title.includes('준공')) return 0;
            if (title.includes('정산') || title.includes('지출')) return 1;
            if (title.includes('세금계산서') || title.includes('대금')) return 2;
            return 3;
          };

          const preWorkIndices = proposedItems
            .map((item, idx) => ({ idx, title: item.title }))
            .filter(({ title }) => isPreWorkTitle(title))
            .map(({ idx }) => idx)
            .sort((a, b) => preWorkRank(proposedItems[a].title) - preWorkRank(proposedItems[b].title));

          const postWorkIndices = proposedItems
            .map((item, idx) => ({ idx, title: item.title }))
            .filter(({ title }) => isPostWorkTitle(title))
            .map(({ idx }) => idx)
            .sort((a, b) => postWorkRank(proposedItems[a].title) - postWorkRank(proposedItems[b].title));

          const preWorkDates = new Set(preWorkIndices.map(idx => proposedItems[idx].date));
          if (preWorkIndices.length > 1 && preWorkDates.size < preWorkIndices.length) {
            preWorkIndices.forEach((idx, order) => {
              const offset = preWorkIndices.length - 1 - order;
              const desired = clampMinDateKey(shiftDateKeyByDays(preWorkLatestKey, -offset), todayKey);
              proposedItems[idx] = { ...proposedItems[idx], date: desired };
            });
          }

          const postWorkDates = new Set(postWorkIndices.map(idx => proposedItems[idx].date));
          if (postWorkIndices.length > 1 && postWorkDates.size < postWorkIndices.length) {
            postWorkIndices.forEach((idx, order) => {
              const desired = clampMinDateKey(shiftDateKeyByDays(postWorkEarliestKey, order), todayKey);
              proposedItems[idx] = { ...proposedItems[idx], date: desired };
            });
          }
        }

        proposedItems.sort((a, b) => compareDateKey(a.date, b.date));

        const summaryLines: string[] = [];
        if (project) summaryLines.push(`- 프로젝트: **${project}**`);
        if (deadline) summaryLines.push(`- 마감: **${deadline}**`);

        if (executionStartKey && executionEndKey) {
          summaryLines.push(`- 실행: **${executionStartKey} ~ ${executionEndKey}**`);
        }

        if (provider === 'gemini' && !hasGoogleGrounding) {
          summaryLines.push(`- 참고: 웹검색 근거를 가져오지 못해 일반 지식으로 일정안을 만들었어요.`);
        }
        if (provider === 'openrouter') {
          summaryLines.push(`- 참고: OpenRouter 경로는 Google 검색 근거 링크를 제공하지 않을 수 있어요.`);
        }

        if (proposedItems.length > 0) {
          summaryLines.unshift('아래 일정 후보를 체크한 뒤 **적용**을 누르면 캘린더에 추가돼요.');
          setMessages(prev =>
            prev.map(msg =>
              msg.id === aiMessageId
                ? {
                  ...msg,
                  text: summaryLines.join('\n'),
                  sources: groundingChunks,
                  scheduleProposal: {
                    project,
                    deadline,
                    items: proposedItems,
                    selected: proposedItems.map(() => true),
                    applied: false,
                  },
                }
                : msg
            )
          );
        } else {
          summaryLines.unshift('추가할 일정이 없어요.');
          summaryLines.push('K-에듀파인 관련 업무로 구체화해서 다시 입력해 주세요. 예) "12월 24일 현수막 달기(제작·설치), 할 일 일정으로 만들어줘"');
          setMessages(prev =>
            prev.map(msg =>
              msg.id === aiMessageId
                ? { ...msg, text: summaryLines.join('\n'), sources: groundingChunks, scheduleProposal: undefined }
                : msg
            )
          );
        }
      } else {
        if (provider === 'gemini') {
          if (!chat) {
            throw new Error("CHAT_NOT_READY");
          }

          const stream = await chat.sendMessageStream({ message: userMessageText });
          let accumulatedText = '';
          let accumulatedSources: GroundingChunk[] = [];

          for await (const chunk of stream) {
            const chunkText = chunk.text;
            if (chunkText) {
              accumulatedText += chunkText;
            }
            const chunkGrounding = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
            if (chunkGrounding) {
              const newSources = chunkGrounding.filter(
                src => src.web && src.web.uri && !accumulatedSources.some(as => as.web?.uri === src.web?.uri)
              );
              accumulatedSources = [...accumulatedSources, ...newSources];
            }

            setMessages(prev => prev.map(msg =>
              msg.id === aiMessageId
                ? { ...msg, text: accumulatedText, sources: accumulatedSources }
                : msg
            ));
          }
        } else {
          const systemParts: string[] = [];
          systemParts.push('너는 한국 학교행정 업무(특히 K-에듀파인/NEIS) 도우미다.');
          systemParts.push('확신이 없으면 가정/전제 조건을 먼저 확인 질문으로 물어본다.');
          systemParts.push('답변은 한국어로, 너무 길지 않게 핵심 위주로 마크다운으로 작성한다.');

          if (manualContextText) {
            systemParts.push('가능하면 아래 매뉴얼 목차에서 관련 편/장/절을 함께 언급한다.');
            systemParts.push('--- 학교행정업무매뉴얼 목차 시작 ---');
            systemParts.push(manualContextText);
            systemParts.push('--- 학교행정업무매뉴얼 목차 끝 ---');
          }

          const history: OpenRouterMessage[] = messages
            .filter((m) => m.text && m.text.trim().length > 0)
            .slice(-12)
            .map((m) => ({ role: m.isUser ? 'user' : 'assistant', content: m.text }));

           const content = await openRouterChatCompletion({
             apiKey: openRouterApiKey,
             model: openRouterModel.trim() || undefined,
             messages: [
               { role: 'system', content: systemParts.join('\n') },
               ...history,
               { role: 'user', content: userMessageText },
            ],
            temperature: 0.2,
          });

          setMessages(prev =>
            prev.map(msg =>
              msg.id === aiMessageId
                ? { ...msg, text: content, sources: [] }
                : msg
            )
          );
        }
      }
    } catch (e) {
      console.error("Error sending message to AI API:", e);
      let errorMsg = "메시지 전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
      if (e instanceof Error && e.message === "MODEL_RETURNED_INVALID_JSON") {
        errorMsg = "AI가 일정 JSON을 올바르게 만들지 못했어요. 입력을 조금 더 구체적으로 다시 시도해 주세요. (예: '11월 13일까지 ○○계약, 해야 할 일로 일정 만들어줘')";
      } else if (e instanceof Error && e.message === "CHAT_NOT_READY") {
        errorMsg = "채팅 세션이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.";
      } else if (e instanceof Error && e.message === "AI_NOT_READY") {
        errorMsg = "AI가 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.";
      } else if (e instanceof Error && e.message === "API_KEY_MISSING") {
        errorMsg = "AI 기능을 사용하려면 API 키가 필요합니다. 상단의 **API Key 설정**에서 키를 입력해주세요.";
      }
      if (e instanceof Error) {
        if (e.message.includes("API key not valid")) {
          errorMsg = "API 키가 유효하지 않습니다. 관리자에게 문의하세요.";
        } else if (e.message.includes("OpenRouter") && (e.message.includes("401") || e.message.toLowerCase().includes("unauthorized"))) {
          errorMsg = "OpenRouter API 키가 유효하지 않습니다.";
        } else if (e.message.includes("quota")) {
          errorMsg = "API 사용량 할당량을 초과했습니다.";
        } else if (e.message.toLowerCase().includes("network error") || e.message.toLowerCase().includes("failed to fetch")) {
          errorMsg = "네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.";
        }
      }
      setError(errorMsg);
      setMessages(prev => prev.map(msg =>
        msg.id === aiMessageId
          ? { ...msg, text: `오류: ${errorMsg}`, sources: [] }
          : msg
      ));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [userInput, chat, ai, isLoading, apiKeyAvailable, isScheduleAddMode, apiKey, openRouterApiKey, aiProviderPreference, openRouterModel, manualContextText, messages]);


  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isLoading) {
      handleSendMessage();
    }
  };

  const renderMessageText = (text: string) => {
    const html = marked.parse(text, { breaks: true, gfm: true });
    const styledHtml = (html as string)
      .replace(/<ul>/g, '<ul class="list-disc ml-5 mb-2">')
      .replace(/<ol>/g, '<ol class="list-decimal ml-5 mb-2">')
      .replace(/<p>/g, '<p class="mb-2">');
    return <div dangerouslySetInnerHTML={{ __html: styledHtml }} />;
  };


  return (
    <div className={`${colors.componentBg} p-3 sm:p-4 rounded-xl shadow-xl flex flex-col h-full border ${colors.border} ${colors.textPrimary}`}>
      <h2 className={`text-lg font-semibold ${colors.accentColor} mb-3 text-center border-b ${colors.border} pb-2 flex-shrink-0`}>
        AI 학교행정 도우미
      </h2>

      {!apiKeyAvailable && error && (
        <div
          className={`p-3 my-2 text-sm rounded-md text-center flex-shrink-0 border ${
            theme === 'dark'
              ? 'text-yellow-200 bg-yellow-900/30 border-yellow-700'
              : 'text-amber-950 bg-amber-200/80 border-amber-300'
          }`}
        >
          {error}
        </div>
      )}
      {apiKeyAvailable && error && !messages.find(m => m.text.includes(error || '')) && (
        <div className="p-3 my-2 text-sm text-red-400 bg-red-800/30 border border-red-700 rounded-md text-center flex-shrink-0">
          {error}
        </div>
      )}


      <div className={`flex-grow overflow-y-auto min-h-0 space-y-4 pr-1 mb-3 scrollbar-thin scrollbar-track-transparent ${colors.scrollbarThumb} scrollbar-thumb-rounded-md`}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            ref={(el) => {
              messageContainerRefs.current[msg.id] = el;
            }}
            className={`flex flex-col ${msg.isUser ? 'items-end' : 'items-start'}`}
          >
            <div className={`flex items-start max-w-[85%] ${msg.isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              {!msg.isUser && <BotIcon className={`w-5 h-5 ${colors.accentColor} mr-2 mt-1 flex-shrink-0`} />}
              {msg.isUser && <UserIcon className={`w-5 h-5 ${colors.accentColor} ml-2 mt-1 flex-shrink-0`} />}
              <div
                className={`px-3 py-2 rounded-lg ${msg.isUser
                  ? `${colors.accentBg} ${colors.buttonText} rounded-br-none`
                  : `${colors.inputBg} ${colors.textPrimary} border ${colors.border} rounded-bl-none`
                  }`}
              >
                <div className="prose prose-sm prose-invert max-w-none chatbot-message-content" style={{ color: 'inherit' }}>
                  {!msg.isUser && isLoading && msg.text.trim() === '' ? (
                    <TypingIndicator />
                  ) : (
                    renderMessageText(msg.text)
                  )}
                </div>
                {!msg.isUser && msg.scheduleProposal && (
                  <div className={`mt-3 pt-2 border-t ${colors.border}`}>
                    <div className="space-y-2">
                      {msg.scheduleProposal.items.map((item, idx) => {
                        const checked = Boolean(msg.scheduleProposal?.selected?.[idx]);
                        const disabled = Boolean(msg.scheduleProposal?.applied);
                        const checkboxId = `${msg.id}-proposal-check-${idx}`;
                        const isDateEditorOpen =
                          activeProposalDateEditor?.messageId === msg.id && activeProposalDateEditor?.index === idx;
                        return (
                          <div
                            key={`${msg.id}-proposal-${idx}`}
                            className={`flex items-start gap-2 text-sm leading-snug ${disabled ? 'opacity-60' : ''}`}
                          >
                            <input
                              type="checkbox"
                              id={checkboxId}
                              className={`mt-0.5 h-4 w-4 rounded ${colors.border} ${colors.inputBg} text-cyan-500 focus:ring-cyan-400`}
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleScheduleProposalItem(msg.id, idx)}
                            />
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-start gap-2 min-w-0">
                                <div className="relative flex-shrink-0">
                                  <button
                                    type="button"
                                    className={`font-mono text-xs ${colors.textSecondary} hover:opacity-80 underline underline-offset-2 disabled:no-underline disabled:cursor-default`}
                                    disabled={disabled}
                                    onClick={() => openScheduleProposalDateEditor(msg.id, idx)}
                                  >
                                    {item.date}
                                  </button>
                                  {isDateEditorOpen && !disabled && (
                                    <div className={`absolute z-50 top-full left-0 mt-1 w-44 rounded-lg border ${colors.border} ${colors.componentBg} p-2 shadow-xl`}>
                                      <div className={`text-[11px] ${colors.textSecondary} mb-1`}>날짜 수정</div>
                                      <input
                                        type="date"
                                        className={`w-full rounded-md ${colors.inputBg} border ${colors.border} px-2 py-1 text-xs ${colors.textPrimary} focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none`}
                                        value={item.date}
                                        onChange={(e) => updateScheduleProposalDate(msg.id, idx, e.target.value)}
                                      />
                                      <div className="mt-2 flex justify-end">
                                        <button
                                          type="button"
                                          className={`px-2 py-1 rounded-md ${colors.inputBg} hover:opacity-80 ${colors.textPrimary} text-[11px] border ${colors.border}`}
                                          onClick={() => setActiveProposalDateEditor(null)}
                                        >
                                          닫기
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <label htmlFor={checkboxId} className={`${colors.textPrimary} cursor-pointer break-words min-w-0`}>
                                  {item.title}
                                </label>
                              </div>
                              <div className={`text-xs ${colors.textSecondary}`}>분류: {item.category}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        className={`px-2.5 py-1.5 rounded-md ${colors.inputBg} hover:opacity-80 ${colors.textPrimary} text-xs border ${colors.border} disabled:opacity-50 disabled:cursor-not-allowed`}
                        onClick={() => toggleScheduleProposalAll(msg.id)}
                        disabled={Boolean(msg.scheduleProposal.applied)}
                      >
                        {msg.scheduleProposal.selected.every(Boolean) ? '전체해제' : '전체선택'}
                      </button>
                      <button
                        type="button"
                        className={`px-2.5 py-1.5 rounded-md ${colors.accentBg} hover:opacity-90 ${colors.buttonText} text-xs border border-cyan-500/40 disabled:opacity-50 disabled:cursor-not-allowed`}
                        onClick={() => applyScheduleProposal(msg.id)}
                        disabled={
                          Boolean(msg.scheduleProposal.applied) ||
                          msg.scheduleProposal.selected.filter(Boolean).length === 0
                        }
                      >
                        적용
                      </button>
                      {msg.scheduleProposal.applied && (
                        <span className={`text-xs ${colors.textSecondary}`}>
                          적용됨 ({msg.scheduleProposal.appliedCount ?? 0}개 추가)
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {msg.sources && msg.sources.length > 0 && !msg.isUser && (
              <div className={`mt-1.5 ml-7 text-xs ${colors.textSecondary} max-w-[85%]`}>
                <p className="font-semibold mb-0.5">참고 자료:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {msg.sources.map((source, index) => (
                    source.web && source.web.uri && (
                      <li key={`${msg.id}-src-${index}`}>
                        <a
                          href={source.web.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`hover:${colors.accentColor} underline`}
                          title={source.web.title || source.web.uri}
                        >
                          {source.web.title || source.web.uri}
                        </a>
                      </li>
                    )
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className={`flex-shrink-0 mt-auto pt-3 border-t ${colors.border}`}>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setIsScheduleAddMode(prev => !prev)}
            data-tour="ai-schedule-toggle"
            className={`p-2.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400 border ${isScheduleAddMode
              ? `${colors.accentBg} text-white border-transparent`
              : `${colors.inputBg} ${colors.textPrimary} ${colors.border} hover:opacity-80`
              }`}
            aria-label="일정추가 모드 토글"
            title={isScheduleAddMode ? "일정추가 모드: ON" : "일정추가 모드: OFF"}
            disabled={isLoading}
          >
            <ScheduleAddIcon className="w-5 h-5" />
          </button>
          <input
            ref={inputRef}
            data-tour="chat-input"
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={
              apiKeyAvailable
                ? (isScheduleAddMode ? "일정추가: 예) 11월13일까지 ○○계약 진행" : "메시지를 입력하세요...")
                : "API 키 설정 필요"
            }
            className={`flex-grow p-2.5 ${colors.inputBg} border ${colors.border} rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none text-sm ${colors.textPrimary} ${colors.placeholderColor} disabled:opacity-50`}
            disabled={!apiKeyAvailable || isLoading}
            aria-label="채팅 메시지 입력"
          />
          <button
            onClick={handleSendMessage}
            disabled={!apiKeyAvailable || isLoading || !userInput.trim()}
            className={`p-2.5 ${colors.accentBg} hover:opacity-90 ${colors.buttonText} rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400`}
            aria-label="메시지 보내기"
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <SendIcon />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chatbot;
