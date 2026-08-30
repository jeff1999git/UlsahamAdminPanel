import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
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

export default async function DashboardPage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (role === "USER") redirect("/admin/events")

  const isSuperAdmin = role === "SUPER_ADMIN"

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent isSuperAdmin={isSuperAdmin} />
    </Suspense>
  )
}

async function DashboardContent({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [stats, recentLogs] = await Promise.all([
    getDashboardStats(),
    getRecentActivityLogs(20, 15),
  ])

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className={`grid grid-cols-2 sm:grid-cols-3 gap-4 ${isSuperAdmin ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
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
        {isSuperAdmin && (
          <StatsCard
            title="Revenue"
            value={formatCurrency(stats.totalRevenue)}
            icon={DollarSign}
            description="From paid events"
            iconClassName="bg-[#014421]/10"
          />
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        {isSuperAdmin && (
          <Button asChild>
            <Link href="/admin/events/new">
              <Plus className="h-4 w-4 mr-2" />
              Create Event
            </Link>
          </Button>
        )}
        <Button variant="outline" asChild>
          <Link href="/admin/events">
            <CalendarDays className="h-4 w-4 mr-2" />
            View All Events
          </Link>
        </Button>
      </div>

      {/* Activity Feed */}
      <div className="max-w-2xl space-y-3">
        <h2 className="text-lg font-semibold text-black">Recent Activity</h2>
        <ActivityFeed logs={recentLogs} />
      </div>
    </div>
  )
}
