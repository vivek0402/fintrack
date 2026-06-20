import { redirect } from 'next/navigation';

export default function LoansRedirect() {
    redirect('/debt-intelligence?tab=loans');
}
