import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-amber text-ink hover:bg-amber-dark disabled:bg-slate-200 disabled:text-slate-400',
  secondary:
    'bg-transparent text-ink border border-slate-300 hover:border-ink disabled:text-slate-300 disabled:border-slate-200',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-ink disabled:text-slate-300',
  danger: 'bg-brick text-paper hover:bg-brick-dark disabled:bg-slate-200 disabled:text-slate-400',
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-8 px-3 text-body-xs',
  md: 'h-10 px-4 text-body-sm',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded-sm font-medium font-body transition-colors duration-100 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  )
})
