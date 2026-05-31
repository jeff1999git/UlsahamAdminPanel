import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface StatsCardProps {
  title: string
  value: string | number
  description?: string
  icon: LucideIcon
  trend?: {
    value: number
    label: string
  }
  className?: string
  iconClassName?: string
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  className,
  iconClassName,
}: StatsCardProps) {
  return (
    <Card className={cn("hover:shadow-md transition-shadow", className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-black">{title}</p>
            <p className="text-2xl font-bold text-black mt-1">{value}</p>
            {description && (
              <p className="text-xs text-black mt-1">{description}</p>
            )}
          </div>
          <div
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              iconClassName ?? "bg-[#014421]/10"
            )}
          >
            <Icon className="h-5 w-5 text-[#014421]" aria-hidden="true" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
