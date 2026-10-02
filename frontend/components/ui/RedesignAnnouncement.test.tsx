import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { RedesignAnnouncement } from './RedesignAnnouncement';
import { useThemeStore } from '@/store/themeStore';

beforeEach(() => {
    localStorage.clear();
    // Fresh-launch store state: theme defaults to 'dark' until loadTheme() runs.
    useThemeStore.setState({ theme: 'dark' });
});

describe('RedesignAnnouncement', () => {
    it('does not overwrite a saved light theme when mounted hidden', () => {
        localStorage.setItem('fintrack-theme', 'light');
        document.documentElement.setAttribute('data-theme', 'light');

        render(<RedesignAnnouncement />);

        expect(localStorage.getItem('fintrack-theme')).toBe('light');
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });
});
