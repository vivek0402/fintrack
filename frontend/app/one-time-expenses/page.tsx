import { redirect } from 'next/navigation';

export default function OneTimeExpensesRedirect() {
    redirect('/budgets?tab=one-time');
}
