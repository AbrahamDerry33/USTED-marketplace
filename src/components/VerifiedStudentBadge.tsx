import { BadgeCheck } from 'lucide-react';

interface VerifiedStudentBadgeProps {
  size?: 'xs' | 'sm';
  className?: string;
}

export function VerifiedStudentBadge({
  size = 'sm',
  className = '',
}: VerifiedStudentBadgeProps) {
  const sizeClasses =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[10px] gap-1'
      : 'px-2 py-0.5 text-[11px] gap-1';
  const iconClasses = size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      aria-label="Verified Student account"
      title="Verified Student (.edu / .edu.gh academic email)"
      className={`inline-flex items-center rounded-md bg-emerald-50 border border-emerald-900/20 font-semibold text-emerald-950 whitespace-nowrap shrink-0 ${sizeClasses} ${className}`}
    >
      <BadgeCheck className={`${iconClasses} text-emerald-800 shrink-0`} aria-hidden="true" />
      <span>Verified Student</span>
    </span>
  );
}
