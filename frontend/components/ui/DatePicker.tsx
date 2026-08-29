'use client';

import { useState, useEffect, useRef } from 'react';

function buildCalDays(month: number, year: number) {
    const first = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev  = new Date(year, month, 0).getDate();
    const cells: { day: number; month: 'prev' | 'cur' | 'next' }[] = [];
    for (let i = first - 1; i >= 0; i--)  cells.push({ day: daysInPrev - i, month: 'prev' });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, month: 'cur' });
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++)   cells.push({ day: d, month: 'next' });
    return cells;
}

const MONTHS       = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface DatePickerProps {
    value: string;
    onChange: (date: string) => void;
    label?: string;
    required?: boolean;
    openUpward?: boolean;
    style?: React.CSSProperties;
    minDate?: string;
}

export function DatePicker({ value, onChange, label, required, openUpward = false, style, minDate }: DatePickerProps) {
    const initialDate = value ? new Date(value + 'T00:00:00') : new Date();
    const [calOpen, setCalOpen]   = useState(false);
    const [calMonth, setCalMonth] = useState(initialDate.getMonth());
    const [calYear, setCalYear]   = useState(initialDate.getFullYear());
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (value) {
            const d = new Date(value + 'T00:00:00');
            setCalMonth(d.getMonth()); setCalYear(d.getFullYear());
        }
    }, [value]);

    useEffect(() => {
        if (!calOpen) return;
        const handler = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setCalOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [calOpen]);

    const selectedDate = value ? new Date(value + 'T00:00:00') : null;
    const todayStr = new Date().toISOString().split('T')[0];

    const handleDayClick = (day: number, monthType: 'prev' | 'cur' | 'next') => {
        let m = calMonth, y = calYear;
        if (monthType === 'prev') { m--; if (m < 0)  { m = 11; y--; } }
        if (monthType === 'next') { m++; if (m > 11) { m = 0;  y++; } }
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (minDate && dateStr < minDate) return;
        onChange(dateStr); setCalMonth(m); setCalYear(y); setCalOpen(false);
    };

    const prevMonth = () => { let m = calMonth - 1, y = calYear; if (m < 0) { m = 11; y--; } setCalMonth(m); setCalYear(y); };
    const nextMonth = () => { let m = calMonth + 1, y = calYear; if (m > 11) { m = 0; y++; } setCalMonth(m); setCalYear(y); };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', ...style }}>
            {label && (
                <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                    {label}{required && <span style={{ color: 'var(--color-exp)', marginLeft: 2 }}>*</span>}
                </label>
            )}
            <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
                {/* Trigger */}
                <div onClick={() => setCalOpen(o => !o)} style={{ backgroundColor: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', border: `1px solid ${calOpen ? 'var(--accent)' : 'var(--glass-border)'}`, borderRadius: '10px', padding: '10px 14px', color: selectedDate ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: '0.875rem', fontFamily: 'var(--font-body)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box', userSelect: 'none', width: '100%', transition: 'border-color 0.15s' }}>
                    <span>
                        {selectedDate
                            ? `${selectedDate.getDate()} ${SHORT_MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`
                            : 'Select a date'}
                    </span>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                        style={{ stroke: calOpen ? 'var(--accent)' : 'var(--text-secondary)', flexShrink: 0, transition: 'stroke 0.15s' }}
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                        <line x1="8" y1="14" x2="8" y2="14" /><line x1="12" y1="14" x2="12" y2="14" />
                        <line x1="16" y1="14" x2="16" y2="14" /><line x1="8" y1="18" x2="8" y2="18" />
                        <line x1="12" y1="18" x2="12" y2="18" />
                    </svg>
                </div>

                {/* Calendar dropdown */}
                {calOpen && (
                    <div style={{ position: 'absolute', ...(openUpward ? { bottom: 'calc(100% + 8px)' } : { top: 'calc(100% + 8px)' }), left: 0, width: '100%', minWidth: '280px', zIndex: 9999, backgroundColor: 'var(--glass-sheet-surface)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '16px', boxShadow: 'var(--shadow-card)', boxSizing: 'border-box' }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <button type="button" onClick={prevMonth} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px', padding: '0 8px', lineHeight: 1 }}>‹</button>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px', fontFamily: 'var(--font-display)' }}>{MONTHS[calMonth]} {calYear}</span>
                            <button type="button" onClick={nextMonth} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px', padding: '0 8px', lineHeight: 1 }}>›</button>
                        </div>
                        {/* Weekday headers */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: '4px' }}>
                            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                                <div key={d} style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, padding: '4px 0', fontFamily: 'var(--font-body)' }}>{d}</div>
                            ))}
                        </div>
                        {/* Day grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px' }}>
                            {buildCalDays(calMonth, calYear).map((cell, i) => {
                                const cy = cell.month === 'prev' ? (calMonth === 0 ? calYear - 1 : calYear) : cell.month === 'next' ? (calMonth === 11 ? calYear + 1 : calYear) : calYear;
                                const cm = cell.month === 'prev' ? (calMonth === 0 ? 12 : calMonth) : cell.month === 'next' ? (calMonth === 11 ? 1 : calMonth + 2) : calMonth + 1;
                                const dateStr    = `${cy}-${String(cm).padStart(2,'0')}-${String(cell.day).padStart(2,'0')}`;
                                const isSelected = value === dateStr;
                                const isToday    = todayStr === dateStr;
                                const isOtherMonth = cell.month !== 'cur';
                                const isDisabled = !!(minDate && dateStr < minDate);
                                return (
                                    <div key={i} onClick={() => !isDisabled && handleDayClick(cell.day, cell.month)}
                                        style={{ width: '34px', height: '34px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', cursor: isDisabled ? 'not-allowed' : 'pointer', margin: '0 auto', backgroundColor: isSelected ? 'var(--accent)' : 'transparent', color: isSelected ? 'white' : isDisabled ? 'var(--text-muted)' : 'var(--text-secondary)', opacity: (isOtherMonth && !isSelected) || isDisabled ? 0.4 : 1, outline: (!isSelected && isToday) ? '2px solid var(--accent)' : 'none', outlineOffset: '-2px', transition: 'background-color 0.1s', fontFamily: 'var(--font-body)' }}
                                        onMouseEnter={e => { if (!isSelected && !isDisabled) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'color-mix(in srgb, var(--text-primary) 8%, transparent)'; }}
                                        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}>
                                        {cell.day}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
