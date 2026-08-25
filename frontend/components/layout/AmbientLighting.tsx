'use client';

// Ambient backdrop — two soft light pools in the income/expense colour pairs,
// blown up behind the whole app. This is what the glass surfaces frost;
// without it the blur has nothing to sample and the panels read as flat
// tinted rectangles. Mounted once in AppLayoutGate (not AppLayout) so the
// no-chrome routes (onboarding, login, register, forgot-password) get it
// too -- they were rendering glass over nothing before this moved up.
export function AmbientLighting() {
    return (
        <div className="ambient-lighting" aria-hidden="true">
            <svg viewBox="0 0 1200 1000" preserveAspectRatio="none">
                <defs>
                    <filter id="ambGlow" x="-100%" y="-100%" width="300%" height="300%">
                        <feGaussianBlur stdDeviation="90" />
                    </filter>
                    <radialGradient id="ambInc" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="var(--color-inc)" stopOpacity="0.32" />
                        <stop offset="55%" stopColor="var(--accent)" stopOpacity="0.16" />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                    </radialGradient>
                    <radialGradient id="ambExp" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="var(--color-exp)" stopOpacity="0.28" />
                        <stop offset="55%" stopColor="var(--color-warn)" stopOpacity="0.14" />
                        <stop offset="100%" stopColor="var(--color-warn)" stopOpacity="0" />
                    </radialGradient>
                </defs>
                <ellipse cx="950" cy="180" rx="520" ry="440" fill="url(#ambInc)" filter="url(#ambGlow)" />
                <ellipse cx="180" cy="880" rx="500" ry="420" fill="url(#ambExp)" filter="url(#ambGlow)" />
            </svg>
        </div>
    );
}
