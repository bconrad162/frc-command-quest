import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import type { Difficulty } from '../game/types.ts'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-signal text-field-deep hover:bg-[#62d6f5] font-semibold',
  secondary: 'bg-pit-raised text-ink border border-steel-bright hover:border-signal/70 hover:text-white',
  ghost: 'text-ink-muted hover:text-ink hover:bg-pit-raised',
  danger: 'bg-fault/15 text-fault border border-fault/40 hover:bg-fault/25',
  gold: 'bg-trophy text-field-deep hover:bg-[#f6cf6f] font-semibold',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-[15px] gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
}

export function buttonClass(variant: Variant = 'secondary', size: Size = 'md', extra?: string) {
  return clsx(
    'inline-flex items-center justify-center rounded-[var(--radius-control)] transition-colors select-none whitespace-nowrap',
    'disabled:opacity-45 disabled:pointer-events-none',
    variants[variant],
    sizes[size],
    extra,
  )
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...rest} />
}

export function LinkButton({ variant = 'secondary', size = 'md', className, ...rest }: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />
}

export const TIER: Record<Difficulty, { name: string; label: string; color: string; text: string; border: string; bg: string }> = {
  easy: { name: 'Java Rookie', label: 'Easy', color: 'var(--color-tier-easy)', text: 'text-tier-easy', border: 'border-tier-easy', bg: 'bg-tier-easy' },
  medium: {
    name: 'Scheduler Engineer',
    label: 'Medium',
    color: 'var(--color-tier-medium)',
    text: 'text-tier-medium',
    border: 'border-tier-medium',
    bg: 'bg-tier-medium',
  },
  hard: {
    name: 'Autonomous Architect',
    label: 'Hard',
    color: 'var(--color-tier-hard)',
    text: 'text-tier-hard',
    border: 'border-tier-hard',
    bg: 'bg-tier-hard',
  },
}

export function TierBadge({ difficulty, long = false }: { difficulty: Difficulty; long?: boolean }) {
  const t = TIER[difficulty]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium', t.text)}>
      <span aria-hidden className={clsx('size-2 rotate-45', t.bg)} />
      {t.label}
      {long && <span className="text-ink-muted font-normal">{t.name}</span>}
    </span>
  )
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'go' | 'warn' | 'fault' | 'signal' | 'trophy'; className?: string }) {
  const tones = {
    neutral: 'bg-pit-raised text-ink-muted border-steel',
    go: 'bg-go/10 text-go border-go/30',
    warn: 'bg-warn/10 text-warn border-warn/30',
    fault: 'bg-fault/10 text-fault border-fault/30',
    signal: 'bg-signal/10 text-signal border-signal/30',
    trophy: 'bg-trophy/10 text-trophy border-trophy/30',
  }
  return <span className={clsx('inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs border', tones[tone], className)}>{children}</span>
}

export function Panel({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={clsx('panel', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-steel px-4 py-2.5">
          {title && <h2 className="font-sans text-[15px] font-semibold tracking-normal text-ink">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-ink-muted text-sm">
      <span aria-hidden className="size-4 rounded-full border-2 border-steel-bright border-t-signal animate-spin" />
      {label}
    </span>
  )
}

/** Renders a tiny subset of markdown used in challenge copy: `code` and **bold**. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="inline-code">{p.slice(1, -1)}</code>
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} className="text-ink font-semibold">{p.slice(2, -2)}</strong>
        return <span key={i}>{p}</span>
      })}
    </span>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed border-steel-bright p-6">
      <h3 className="text-lg text-ink">{title}</h3>
      {children && <div className="text-ink-muted max-w-prose">{children}</div>}
      {action}
    </div>
  )
}
