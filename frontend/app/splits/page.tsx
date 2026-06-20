import { redirect } from 'next/navigation';

export default function SplitsRedirect() {
    redirect('/budgets?tab=splits');
}
