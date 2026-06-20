import { redirect } from 'next/navigation';

export default function ForecastRedirect() {
    redirect('/savings-plan?tab=forecast');
}
