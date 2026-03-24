'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ArrowLeftRight, PieChart, Target, CalendarDays } from 'lucide-react';

const navItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Home' },
    { href: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
    { href: '/calendar', icon: CalendarDays, label: 'Calendar' },
    { href: '/analytics', icon: PieChart, label: 'Analytics' },
    { href: '/budgets', icon: Target, label: 'Budgets' },
];

export function BottomNav() {
    const pathname = usePathname();
    return (
        <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg-secondary)', borderTop: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '8px 0 12px', zIndex: 100, boxShadow: '0 -4px 20px rgba(0,0,0,0.3)' }}>
            {navItems.map(({ href, icon: Icon, label }) => {
                const isActive = pathname === href;
                return (
                    <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '12px', color: isActive ? '#10b981' : 'var(--text-muted)', transition: 'all 0.2s' }}>
                            <Icon size={20} />
                            <span style={{ fontSize: '0.62rem', fontWeight: isActive ? 600 : 400 }}>{label}</span>
                        </div>
                    </Link>
                );
            })}
        </nav>
    );
}