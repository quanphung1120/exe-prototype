import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/** The app's single loading indicator — a spinning ring in the brand blue. */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2
      data-slot="spinner"
      aria-hidden
      className={cn("size-6 animate-spin text-brand", className)}
      {...props}
    />
  )
}

export { Spinner }
