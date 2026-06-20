import { redirect } from 'next/navigation';

export default function SalaryIntelligenceRedirect() {
    redirect('/tax?tab=salary');
}
