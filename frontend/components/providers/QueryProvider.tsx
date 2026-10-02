'use client';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, queryPersister, shouldPersistQuery, PERSIST_MAX_AGE, QUERY_CACHE_BUSTER } from '@/lib/queryClient';

export function QueryProvider({ children }: { children: React.ReactNode }) {
    if (!queryPersister) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }
    return (
        <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
                persister: queryPersister,
                maxAge: PERSIST_MAX_AGE,
                buster: QUERY_CACHE_BUSTER,
                dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
            }}
        >
            {children}
        </PersistQueryClientProvider>
    );
}
