export type PasswordStrength = { level: 0 | 1 | 2 | 3 | 4; label: string };

const LABELS = ['', 'Too short', 'Fair', 'Good', 'Strong'];

/** Strength of a new password as shown on the register form. Thresholds are unchanged from the inline version. */
export function passwordStrength(pw: string): PasswordStrength {
    const level = (pw.length === 0 ? 0 : pw.length < 6 ? 1 : pw.length < 8 ? 2 : (/\d/.test(pw) && /[^a-zA-Z0-9]/.test(pw)) ? 4 : 3) as PasswordStrength['level'];
    return { level, label: LABELS[level] };
}
