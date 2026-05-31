import { Suspense } from "react"
import Link from "next/link"
import {
  CalendarDays,
  Users,
  TrendingUp,
  DollarSign,
  CalendarCheck,
  Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatsCard } from "@/components/admin/stats-card"
import { ActivityFeed } from "@/components/admin/activity-feed"
import { DashboardSkeleton } from "@/components/shared/skeleton-loaders"
import { getDashboardStats } from "@/services/event.service"
import { getRecentActivityLogs } from "@/repositories/activity-log.repository"
import { formatCurrency } from "@/lib/utils"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Dashboard" }

async function DashboardContent() {
  const [stats, recentLogs] = await Promise.all([
    getDashboardStats(),
    getRecentActivityLogs(10),
  ])

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatsCard
          title="Total Events"
          value={stats.totalEvents}
          icon={CalendarDays}
          description="All time"
        />
        <StatsCard
          title="Published"
          value={stats.publishedEvents}
          icon={CalendarCheck}
          description="Live events"
          iconClassName="bg-[#014421]/10"
        />
        <StatsCard
          title="Upcoming"
          value={stats.upcomingEvents}
          icon={TrendingUp}
          description="Future events"
          iconClassName="bg-[#014421]/10"
        />
        <StatsCard
          title="Participants"
          value={stats.totalParticipants.toLocaleString("en-IN")}
          icon={Users}
          description="Total registered"
          iconClassName="bg-[#014421]/10"
        />
        <StatsCard
          title="Revenue"
          value={formatCurrency(stats.totalRevenue)}
          icon={DollarSign}
          description="From paid events"
          iconClassName="bg-[#014421]/10"
        />
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/admin/events/new">
            <Plus className="h-4 w-4 mr-2" />
            Create Event
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/admin/events">
            <CalendarDays className="h-4 w-4 mr-2" />
            View All Events
          </Link>
        </Button>
      </div>

      {/* Activity Feed */}
      <div className="max-w-2xl">
        <ActivityFeed logs={recentLogs} />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  )
}
