import { redirect } from 'next/navigation';

export default function HealthScoreRedirect() {
    redirect('/analytics?tab=health');
}
