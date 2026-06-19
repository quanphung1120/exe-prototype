import { cn } from "@/lib/utils"

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("text-primary", className)}
      fill="none"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <g
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.85"
      >
        <path d="M9 11.5h14M9 16h14M9 20.5h11" />
        <path d="M12.5 8v16M16.5 8v16M20.5 8v14" />
      </g>
      <circle
        cx="22.5"
        cy="22.5"
        r="4.6"
        className="fill-lime"
        stroke="white"
        strokeWidth="1.6"
      />
    </svg>
  )
}

export function Logo({
  className,
  markClassName,
}: {
  className?: string
  markClassName?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={cn("size-8", markClassName)} />
      <span className="font-heading text-xl font-bold tracking-tight">
        SportMatch<span className="text-primary"> AI</span>
      </span>
    </span>
  )
}
