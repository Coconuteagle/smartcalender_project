import React from 'react';
import { CalendarEvent } from '../types';
import { KOREAN_DAY_NAMES_SHORT } from '../constants';
import { useTheme } from '../contexts/ThemeContext';

interface WeeklyCalendarProps {
    currentDate: Date;
    events: CalendarEvent[];
    onEventClick: (event: CalendarEvent) => void;
    onDateClick: (dateKey: string) => void;
    onDragStart?: (e: React.DragEvent, eventId: string) => void;
    onDragEnd?: () => void;
    onDrop?: (e: React.DragEvent, dateKey: string) => void;
}

const formatDateKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const WeeklyCalendar: React.FC<WeeklyCalendarProps> = ({
    currentDate,
    events,
    onEventClick,
    onDateClick,
    onDragStart,
    onDragEnd,
    onDrop
}) => {
    const { colors } = useTheme();
    // Calculate start of the week (Sunday)
    const startOfWeek = new Date(currentDate);
    const dayOfWeek = startOfWeek.getDay(); // 0 (Sun) - 6 (Sat)
    startOfWeek.setDate(currentDate.getDate() - dayOfWeek);

    const weekDays = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        return d;
    });

    const todayKey = formatDateKey(new Date());

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header Row */}
            <div className={`grid grid-cols-7 border-b ${colors.border} ${colors.componentBg}/80 flex-shrink-0`}>
                {weekDays.map((day, idx) => {
                    const dateKey = formatDateKey(day);
                    const isToday = dateKey === todayKey;
                    return (
                        <div key={dateKey} className={`p-3 text-center border-r ${colors.border} last:border-r-0 ${isToday ? `${colors.accentBg}/20` : ''}`}>
                            <div className={`text-xs ${colors.textSecondary} font-medium mb-1`}>{KOREAN_DAY_NAMES_SHORT[idx]}</div>
                            <div className={`text-lg font-bold ${isToday ? colors.accentColor : colors.textPrimary}`}>
                                {day.getDate()}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Body Row (Full Height columns) */}
            <div className="flex-grow grid grid-cols-7 min-h-0 overflow-hidden">
                {weekDays.map((day) => {
                    const dateKey = formatDateKey(day);
                    const dayEvents = events.filter(e => e.date === dateKey);
                    const isToday = dateKey === todayKey;

                    return (
                        <div
                            key={dateKey}
                            className={`border-r ${colors.border} last:border-r-0 p-2 overflow-y-auto scrollbar-thin ${colors.hoverEffect} transition-colors h-full ${isToday ? `${colors.accentBg}/10` : ''}`}
                            onClick={() => onDateClick(dateKey)}
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                            }}
                            onDrop={(e) => onDrop && onDrop(e, dateKey)}
                        >
                            <div className="space-y-2">
                                {dayEvents.map(event => (
                                    <div
                                        key={event.id}
                                        data-tour="calendar-event"
                                        draggable={Boolean(onDragStart)}
                                        onDragStart={(e) => onDragStart?.(e, event.id)}
                                        onDragEnd={onDragEnd}
                                        className={`px-2 py-1.5 rounded-md text-sm cursor-grab active:cursor-grabbing shadow-sm border transition-shadow truncate font-medium ${event.kind === 'user'
                                            ? 'bg-accent-primary text-white border-transparent hover:opacity-90'
                                            : 'bg-tertiary text-text-primary border-transparent hover:opacity-90'
                                            }`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onEventClick(event);
                                        }}
                                        title={event.title}
                                    >
                                        <div className="font-medium truncate">{event.title}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default WeeklyCalendar;
