import { redirect } from 'next/navigation';

export default function YearReviewRedirect() {
    redirect('/analytics?tab=year-review');
}
