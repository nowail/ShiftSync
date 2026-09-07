interface TabsProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  className?: string
}

export function Tabs<T extends string>({ value, onChange, options, className = '' }: TabsProps<T>) {
  return (
    <div role="tablist" className={`flex gap-1 overflow-x-auto ${className}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={opt.value === value}
          onClick={() => onChange(opt.value)}
          className={`shrink-0 rounded-sm px-3 py-1.5 text-body-sm font-medium transition-colors duration-100 ${
            opt.value === value ? 'bg-ink text-paper' : 'bg-transparent text-slate-600 hover:bg-slate-100'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
