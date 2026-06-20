import { redirect } from 'next/navigation';

export default function MilestonesRedirect() {
    redirect('/savings-plan?tab=milestones');
}
