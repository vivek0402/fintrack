import { redirect } from 'next/navigation';

export default function RecurringRedirect() {
    redirect('/budgets?tab=recurring');
}
