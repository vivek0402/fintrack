'use client';

import { useState, useEffect } from 'react';
import {
    Sparkles, LayoutDashboard, ArrowLeftRight,
    BarChart3, BrainCircuit, CheckCircle2,
} from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
}

const STEPS = [
    {
        iconGradient: 'linear-gradient(135deg, #312e81, #6366f1)',
        Icon: Sparkles,
        title: 'Welcome to FinTrack 🎉',
        description: "Your AI-powered personal finance companion. Let's take a 2-minute tour so you know exactly where everything lives and what each feature does.",
    },
    {
        iconGradient: 'linear-gradient(135deg, #065f46, #00e5a0)',
        Icon: LayoutDashboard,
        title: 'Your Financial Command Centre',
        description: 'The dashboard shows your income, expenses, savings rate, and a 6-month spending trend at a glance. It updates in real-time as you add transactions — check it daily to stay on track.',
    },
    {
        iconGradient: 'linear-gradient(135deg, #7c3aed, #a855f7)',
        Icon: ArrowLeftRight,
        title: 'Track Every Rupee',
        description: "Add transactions manually or use Quick Add with natural language — just type '₹500 food at Zomato'. You can also use voice input or scan a receipt. Swipe left on any transaction to delete it, tap to edit.",
    },
    {
        iconGradient: 'linear-gradient(135deg, #b45309, #f59e0b)',
        Icon: BarChart3,
        title: 'Understand Your Spending',
        description: "Analytics breaks down exactly where your money goes, category by category. Set monthly budgets per category and FinTrack will warn you — in yellow when you're close, red when you're over.",
    },
    {
        iconGradient: 'linear-gradient(135deg, #be185d, #ec4899)',
        Icon: BrainCircuit,
        title: 'Your Personal Finance AI',
        description: 'Ask your AI advisor anything about your finances. Parse bank SMS messages automatically, generate detailed monthly reports, scan receipts, predict if you can afford something, and get your Financial Personality Profile.',
    },
    {
        iconGradient: 'linear-gradient(135deg, #0f766e, #14b8a6)',
        Icon: CheckCircle2,
        title: "You're All Set! 🚀",
        description: 'FinTrack is ready to help you build better money habits. You can revisit this tour anytime by tapping the ❓ button on any screen. Your financial journey starts now.',
    },
];

export function WalkthroughTour({ isOpen, onClose, userId }: Props) {
    const [step, setStep] = useState(0);
    const [animKey, setAnimKey] = useState(0);

    useEffect(() => {
        if (isOpen) {
            setStep(0);
            setAnimKey(k => k + 1);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const current = STEPS[step];
    const isLast = step === STEPS.length - 1;
    const isFirst = step === 0;

    const goTo = (next: number) => {
        setStep(next);
        setAnimKey(k => k + 1);
    };

    const handleNext = () => {
        if (isLast) {
            onClose();
        } else {
            goTo(step + 1);
        }
    };

    const handleBack = () => {
        if (!isFirst) goTo(step - 1);
    };

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 2000,
                background: 'rgba(0,0,0,0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <style>{`
                @keyframes tourFadeIn {
                    from { opacity: 0; transform: translateY(12px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .tour-slide {
                    animation: tourFadeIn 0.3s ease forwards;
                }
                @media (max-width: 479px) {
                    .tour-card { padding: 24px 20px 20px !important; }
                    .tour-title { font-size: 18px !important; }
                    .tour-desc  { font-size: 13px !important; }
                }
            `}</style>

            {/* Card — click stops propagation so overlay tap doesn't close */}
            <div
                className="tour-card"
                onClick={e => e.stopPropagation()}
                style={{
                    position: 'relative',
                    maxWidth: '440px',
                    width: 'calc(100% - 32px)',
                    background: 'var(--bg-surface-1)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '20px',
                    padding: '32px 28px 24px',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
                }}
            >
                {/* × close button */}
                <button
                    type="button"
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        color: 'var(--text-muted)',
                        fontSize: '20px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        lineHeight: 1,
                        padding: 0,
                    }}
                >
                    ×
                </button>

                {/* Animated slide content */}
                <div key={animKey} className="tour-slide">
                    {/* Icon circle */}
                    <div style={{
                        width: '72px',
                        height: '72px',
                        borderRadius: '50%',
                        margin: '0 auto 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: current.iconGradient,
                        flexShrink: 0,
                    }}>
                        <current.Icon size={48} color="white" />
                    </div>

                    {/* Step label */}
                    <div style={{
                        fontSize: '11px',
                        letterSpacing: '2px',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        marginBottom: '8px',
                        textAlign: 'center',
                    }}>
                        STEP {step + 1} OF 6
                    </div>

                    {/* Title */}
                    <div
                        className="tour-title"
                        style={{
                            fontSize: '22px',
                            fontWeight: 700,
                            fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif",
                            color: 'var(--text-primary)',
                            textAlign: 'center',
                            marginBottom: '12px',
                        }}
                    >
                        {current.title}
                    </div>

                    {/* Description */}
                    <div
                        className="tour-desc"
                        style={{
                            fontSize: '14px',
                            lineHeight: 1.7,
                            color: 'var(--text-secondary)',
                            textAlign: 'center',
                            marginBottom: '28px',
                        }}
                    >
                        {current.description}
                    </div>

                    {/* Progress dots */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '6px',
                    }}>
                        {STEPS.map((_, i) => (
                            <div
                                key={i}
                                style={{
                                    width: i === step ? '20px' : '6px',
                                    height: '6px',
                                    borderRadius: i === step ? '3px' : '50%',
                                    background: i === step ? 'var(--accent)' : 'var(--border-subtle)',
                                    transition: 'all 0.3s ease',
                                }}
                            />
                        ))}
                    </div>

                    {/* Button row */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '20px',
                    }}>
                        {/* Left: Skip (steps 1-5) or empty spacer (step 6) */}
                        {!isLast ? (
                            <button
                                type="button"
                                onClick={onClose}
                                style={{
                                    color: 'var(--text-muted)',
                                    fontSize: '14px',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: 0,
                                }}
                            >
                                Skip
                            </button>
                        ) : (
                            <div />
                        )}

                        {/* Right: Back + Next/Get Started */}
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            {!isFirst && (
                                <button
                                    type="button"
                                    onClick={handleBack}
                                    style={{
                                        background: 'var(--bg-surface-3)',
                                        color: 'var(--text-secondary)',
                                        borderRadius: '8px',
                                        padding: '10px 18px',
                                        fontSize: '14px',
                                        border: 'none',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Back
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleNext}
                                style={{
                                    background: 'linear-gradient(135deg,#312e81,#6366f1)',
                                    color: 'white',
                                    borderRadius: '8px',
                                    padding: '10px 20px',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    border: 'none',
                                    cursor: 'pointer',
                                }}
                            >
                                {isLast ? 'Get Started →' : 'Next →'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
