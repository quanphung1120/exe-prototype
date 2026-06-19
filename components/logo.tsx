import { cn } from "@/lib/utils"

// Artwork inlined from public/logo.svg so it can be recoloured via `currentColor`
// (the dashboard renders it light-on-emerald; the landing renders it brand emerald).
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1350 1080"
      className={cn("text-primary", className)}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M235.98,612.06c0,0,113.76-329.77,451.55-513.42c0,0,146.52-78.26,256.7-40.94s186.85,175.65,67.63,461.79c0,0,88.86-247.08-16.42-334.03s-346.99,307.2-346.99,307.2l296.81,34.79L235.98,612.06z" />
      <path d="M214.92,673.89c0,0-76.4,235.31,50.66,333.95s414.21,13.49,667.92-345.94l370.16-136.08l-710.9,98.76c0,0-200.37,312.16-309.62,286.9C173.89,886.22,214.92,673.89,214.92,673.89z" />
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
