"use client"

import { Accordion } from "@base-ui/react/accordion"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

export type FaqItem = {
  question: string
  answer: string
}

export function Faq({
  items,
  className,
}: {
  items: FaqItem[]
  className?: string
}) {
  return (
    <Accordion.Root className={cn("flex flex-col gap-3.5", className)}>
      {items.map((item, i) => (
        <Accordion.Item
          key={i}
          value={i}
          className="group overflow-hidden rounded-2xl border border-border/80 bg-card/80 backdrop-blur-sm transition-all duration-300 hover:border-primary/40 shadow-xs data-[panel-open]:border-primary/50 data-[panel-open]:bg-card data-[panel-open]:shadow-md"
        >
          <Accordion.Header className="m-0">
            <Accordion.Trigger className="flex w-full cursor-pointer items-center justify-between gap-4 px-6 py-5 text-left text-base font-semibold text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none sm:text-lg">
              <div className="flex items-center gap-3.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-xs font-bold text-primary group-data-[panel-open]:bg-lime group-data-[panel-open]:text-lime-foreground transition-colors duration-300">
                  0{i + 1}
                </span>
                <span className="group-data-[panel-open]:text-primary transition-colors duration-300">
                  {item.question}
                </span>
              </div>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/60 transition-colors group-hover:bg-primary/10 group-data-[panel-open]:bg-primary group-data-[panel-open]:text-primary-foreground">
                <ChevronDown
                  className="size-4 text-muted-foreground transition-transform duration-300 group-data-[panel-open]:rotate-180 group-data-[panel-open]:text-primary-foreground"
                  aria-hidden="true"
                />
              </span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel className="h-[var(--accordion-panel-height)] overflow-hidden text-muted-foreground transition-[height] duration-300 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0">
            <div className="border-t border-border/40 px-6 pt-3 pb-5 sm:pl-16">
              <p className="text-[0.95rem] leading-relaxed text-muted-foreground/90">
                {item.answer}
              </p>
            </div>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  )
}
