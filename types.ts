export type EventCategory =
  | '예산'
  | '급여'
  | '지출'
  | '계약'
  | '시설'
  | '민원'
  | '회의'
  | '학운위'
  | '공유재산'
  | '세입'
  | '물품'
  | '인사'
  | '기타';

export const EVENT_CATEGORIES: EventCategory[] = [
  '예산',
  '급여',
  '지출',
  '계약',
  '시설',
  '민원',
  '회의',
  '학운위',
  '공유재산',
  '세입',
  '물품',
  '인사',
  '기타',
];

export const DEFAULT_EVENT_CATEGORY: EventCategory = '기타';

export const USER_EVENTS_STORAGE_KEY = 'smartcalendar:userEvents';
export const BUILTIN_EVENT_OVERRIDES_STORAGE_KEY = 'smartcalendar:builtinEventOverrides';
export const USER_EVENTS_UPDATED_EVENT = 'smartcalendar:userEventsUpdated';
export const BUILTIN_EVENT_OVERRIDES_UPDATED_EVENT = 'smartcalendar:builtinEventOverridesUpdated';
export const BASE_SCHEDULE_END_YEAR = 2029;

// "kind" is internal to the app: builtin (from schedule data) vs user (stored in localStorage).
export type CalendarEventKind = 'builtin' | 'user';

// "source" is the creation origin, used for filtering: manual (user input) vs ai (AI-created).
export type CalendarEventSource = 'manual' | 'ai';

export const CALENDAR_EVENT_SOURCES: CalendarEventSource[] = ['manual', 'ai'];

export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD format
  title: string;
  kind: CalendarEventKind;
  category: EventCategory;
  source: CalendarEventSource;
}

export type UserCalendarEvent = CalendarEvent & {
  kind: 'user';
};

export type BuiltinCalendarEvent = CalendarEvent & {
  kind: 'builtin';
};
