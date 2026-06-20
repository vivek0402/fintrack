import { redirect } from 'next/navigation';

export default function PersonalityRedirect() {
    redirect('/analytics?tab=personality');
}
