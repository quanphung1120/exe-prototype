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
    <Accordion.Root className={cn("flex flex-col gap-3", className)}>
      {items.map((item, i) => (
        <Accordion.Item
          key={i}
          value={i}
          className="overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/40 data-[panel-open]:border-primary/40"
        >
          <Accordion.Header className="m-0">
            <Accordion.Trigger className="group flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left text-base font-semibold text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none sm:text-lg">
              {item.question}
              <ChevronDown
                className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-data-[panel-open]:rotate-180 group-data-[panel-open]:text-primary"
                aria-hidden="true"
              />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel className="h-[var(--accordion-panel-height)] overflow-hidden text-muted-foreground transition-[height] duration-300 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0">
            <p className="px-5 pb-5 text-[0.95rem] leading-relaxed">
              {item.answer}
            </p>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  )
}
