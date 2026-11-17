'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { type } from '@/lib/typography';
import { Button } from './Button';
import { TextAction } from './CardParts';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const STEPS = [
    {
        title: 'Welcome to FinTrack',
        description: "Your AI-powered personal finance companion. Let's take a 2-minute tour so you know exactly where everything lives and what each feature does.",
    },
    {
        title: 'Your financial command centre',
        description: 'The dashboard shows your income, expenses, savings rate, and a 6-month spending trend at a glance. It updates in real-time as you add transactions, so check it daily to stay on track.',
    },
    {
        title: 'Track every rupee',
        description: "Add transactions manually or use Quick Add with natural language: just type '₹500 food at Zomato'. You can also use voice input or scan a receipt. Swipe left on any transaction to delete it, tap to edit.",
    },
    {
        title: 'Understand your spending',
        description: "Analytics breaks down exactly where your money goes, category by category. Set monthly budgets per category and FinTrack will warn you, in yellow when you're close and red when you're over.",
    },
    {
        title: 'Your personal finance AI',
        description: 'Ask your AI advisor anything about your finances. Parse bank SMS messages automatically, generate detailed monthly reports, scan receipts, and predict if you can afford something.',
    },
    {
        title: "You're all set",
        description: 'FinTrack is ready to help you build better money habits. You can revisit this tour anytime from the help button on any screen. Your financial journey starts now.',
    },
];

export function WalkthroughTour({ isOpen, onClose }: Props) {
    const [step, setStep] = useState(0);
    const [animKey, setAnimKey] = useState(0);
    // Tracks the isOpen value we've already reacted to, so the reset below runs
    // exactly once per open — during render, not in an effect (avoids the extra
    // render pass a useEffect-based reset would cause). See:
    // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

    if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
        if (isOpen) {
            setStep(0);
            setAnimKey(k => k + 1);
        }
    }

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
            `}</style>

            <div
                role="dialog"
                aria-modal="true"
                aria-label="FinTrack tour"
                className="glass-surface glass-sheet"
                style={{
                    position: 'relative',
                    maxWidth: 440,
                    width: 'calc(100% - 32px)',
                    borderRadius: 'var(--radius-xl)',
                    padding: 'var(--space-6)',
                    boxShadow: 'var(--shadow-modal)',
                }}
            >
                <button
                    type="button"
                    className="fin-icon-btn"
                    aria-label="Close tour"
                    onClick={onClose}
                    style={{ position: 'absolute', top: 'var(--space-3)', right: 'var(--space-3)' }}
                >
                    <X size={16} />
                </button>

                <div key={animKey} className="tour-slide">
                    <p style={{ ...type.meta, margin: 0 }}>{`Step ${step + 1} of ${STEPS.length}`}</p>
                    <h2 style={{ ...type.heading, margin: 'var(--space-2) 0 var(--space-3)' }}>{current.title}</h2>
                    <p style={{ ...type.body, margin: 0 }}>{current.description}</p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-5)' }}>
                        {STEPS.map((_, i) => (
                            <span
                                key={i}
                                aria-hidden="true"
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: i === step ? 'var(--text-primary)' : 'var(--border-visible)',
                                }}
                            />
                        ))}
                    </div>

                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        marginTop: 'var(--space-5)',
                    }}>
                        {!isLast ? (
                            <TextAction quiet onClick={onClose}>Skip</TextAction>
                        ) : (
                            <div />
                        )}

                        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                            {!isFirst && (
                                <Button variant="secondary" onClick={handleBack}>Back</Button>
                            )}
                            <Button variant="primary" onClick={handleNext}>
                                {isLast ? 'Get started' : 'Next'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
