"use client"
import React from "react"
import { CanvasRevealEffect } from "@/components/ui/canvas-reveal-effect"
import {
  Sparkles,
  Users,
  CalendarCheck,
  MapPin,
  MessagesSquare,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Reveal } from "@/components/reveal"

const PLAYER_FEATURES = [
  {
    icon: Sparkles,
    title: "Trợ lý đặt sân AI",
    body: "Chỉ cần nói điều Quý khách muốn — “cầu lông tối nay sau 7 giờ, gần đây, người chơi cùng trình độ.” Trợ lý sẽ lo phần còn lại: sân, giờ và người chơi.",
    featured: true,
    revealColors: [
      [34, 197, 94],
      [163, 230, 53],
    ], // Emerald/Lime
  },
  {
    icon: Users,
    title: "Ghép theo trình độ",
    body: "Được ghép với những người chơi cùng trình độ để mỗi trận đều cân sức — không còn cảnh một chiều.",
    featured: false,
    revealColors: [
      [6, 182, 212],
      [59, 130, 246],
    ], // Cyan/Blue
  },
  {
    icon: CalendarCheck,
    title: "Đặt sân tức thì",
    body: "Tình trạng sân trống theo thời gian thực tại các địa điểm gần Quý khách. Giữ chỗ chỉ trong vài giây, không cần gọi điện.",
    featured: false,
    revealColors: [
      [139, 92, 246],
      [232, 121, 249],
    ], // Purple/Magenta
  },
  {
    icon: MapPin,
    title: "Sân gần Quý khách",
    body: "Các khung giờ trống theo thời gian thực tại những câu lạc bộ quanh Quý khách, xếp theo khoảng cách, giá và mặt sân.",
    featured: false,
    revealColors: [
      [245, 158, 11],
      [239, 68, 68],
    ], // Amber/Red
  },
  {
    icon: MessagesSquare,
    title: "Trò chuyện & phối hợp",
    body: "Tính năng trò chuyện, nhắc lịch và đặt sân chung tích hợp sẵn giúp cả nhóm luôn nắm chung thông tin.",
    featured: false,
    revealColors: [
      [16, 185, 129],
      [20, 184, 166],
    ], // Green/Teal
  },
]

export default function CanvasRevealEffectDemo2() {
  return (
    <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {PLAYER_FEATURES.map((feature, i) => (
        <Reveal
          key={feature.title}
          delayMs={i * 60}
          className={feature.featured ? "sm:col-span-2" : ""}
        >
          <Card
            title={feature.title}
            body={feature.body}
            icon={<feature.icon className="h-6 w-6 text-white" />}
            revealColors={feature.revealColors}
            featured={feature.featured}
          />
        </Reveal>
      ))}
    </div>
  )
}

const Card = ({
  title,
  body,
  icon,
  revealColors,
  featured,
}: {
  title: string
  body: string
  icon: React.ReactNode
  revealColors: number[][]
  featured?: boolean
}) => {
  const [hovered, setHovered] = React.useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative flex flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 p-6 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5",
        featured ? "min-h-[16rem]" : "min-h-[14rem]"
      )}
    >
      <Icon className="absolute -top-3 -left-3 h-6 w-6 text-zinc-800" />
      <Icon className="absolute -bottom-3 -left-3 h-6 w-6 text-zinc-800" />
      <Icon className="absolute -top-3 -right-3 h-6 w-6 text-zinc-800" />
      <Icon className="absolute -right-3 -bottom-3 h-6 w-6 text-zinc-800" />

      {/* Always visible Canvas Reveal Effect */}
      <div
        className="absolute inset-0 z-0 h-full w-full transition-opacity duration-500"
        style={{ opacity: hovered ? 1 : 0.4 }}
      >
        <CanvasRevealEffect
          animationSpeed={hovered ? 3.0 : 1.2}
          containerClassName="bg-zinc-950"
          colors={revealColors}
          dotSize={2}
        />
      </div>

      <div className="relative z-10 flex h-full flex-col justify-between gap-4">
        <div>
          <span className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white">
            {icon}
          </span>
          <h3 className="mt-5 font-heading text-2xl font-bold tracking-wide text-white uppercase">
            {title}
          </h3>
        </div>
        <p className="text-sm leading-relaxed text-zinc-200 sm:text-base">
          {body}
        </p>
      </div>
    </div>
  )
}

export const Icon = ({ className, ...rest }: React.SVGProps<SVGSVGElement>) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      stroke="currentColor"
      className={className}
      {...rest}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
    </svg>
  )
}
