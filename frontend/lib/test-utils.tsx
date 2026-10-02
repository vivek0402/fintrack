import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** A fresh, isolated query cache per test: no retries (so failure paths are
 *  immediate) and no garbage collection mid-test. */
export function createTestQueryClient() {
    return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

/** RTL render wrapped in a QueryClientProvider (rerender stays wrapped too). */
export function renderWithQuery(
    ui: React.ReactElement,
    { queryClient = createTestQueryClient(), ...options }: Omit<RenderOptions, 'wrapper'> & { queryClient?: QueryClient } = {},
) {
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) };
}
