import { redirect } from 'next/navigation';

export default function TaxEstimateRedirect() {
    redirect('/tax?tab=estimate');
}
