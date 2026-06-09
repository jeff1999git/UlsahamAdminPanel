"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ImageUpload } from "@/components/shared/image-upload"
import { createEventSchema, type CreateEventFormValues } from "@/validators/event.validator"
import { createEventAction, updateEventAction } from "@/actions/event.actions"
import { generateSlug } from "@/lib/slug"
import type { Event } from "@prisma/client"

interface EventFormProps {
  event?: Event
}

function formatTimeForInput(time: string): string {
  if (!time) return ""
  const match = time.match(/(\d{1,2}):(\d{2})\s?(AM|PM)/i)
  if (!match) return ""
  let [, hours, minutes, meridiem] = match
  let h = parseInt(hours)
  if (meridiem.toUpperCase() === "PM" && h < 12) h += 12
  if (meridiem.toUpperCase() === "AM" && h === 12) h = 0
  return `${String(h).padStart(2, "0")}:${minutes}`
}

function formatTimeFromInput(time: string): string {
  if (!time) return ""
  const [h, m] = time.split(":").map(Number)
  const meridiem = h >= 12 ? "PM" : "AM"
  const hours = h % 12 || 12
  return `${hours}:${String(m).padStart(2, "0")} ${meridiem}`
}

export function EventForm({ event }: EventFormProps) {
  const router = useRouter()
  const isEditing = !!event

  const [newCouponCode, setNewCouponCode] = useState("")
  const [newCouponDiscount, setNewCouponDiscount] = useState("")

  const form = useForm<CreateEventFormValues>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      name: event?.name ?? "",
      slug: event?.slug ?? "",
      description: event?.description ?? "",
      bannerImageUrl: event?.bannerImageUrl ?? "",
      bannerImageId: event?.bannerImageId ?? "",
      venue: event?.venue ?? "",
      venueLink: event?.venueLink ?? "",
      date: event?.date ? new Date(event.date) : new Date(),
      startTime: event?.startTime ?? "10:00 AM",
      endTime: event?.endTime ?? "05:00 PM",
      isFree: event?.isFree ?? true,
      amount: event?.amount ?? undefined,
      earlyBirdAmount: (event as { earlyBirdAmount?: number | null } | undefined)?.earlyBirdAmount ?? undefined,
      isEarlyBird: (event as { isEarlyBird?: boolean } | undefined)?.isEarlyBird ?? false,
      status: event?.status ?? "ANNOUNCED",
      capacity: event?.capacity ?? undefined,
      featured: event?.featured ?? false,
      couponCodes: event?.couponCodes ?? [],
    },
  })

  const isFree = form.watch("isFree")
  const earlyBirdAmount = form.watch("earlyBirdAmount")
  const isSubmitting = form.formState.isSubmitting

  const { fields: couponFields, append: appendCoupon, remove: removeCoupon } = useFieldArray({
    control: form.control,
    name: "couponCodes",
  })

  function handleAddCoupon() {
    const code = newCouponCode.trim().toUpperCase()
    const discount = parseFloat(newCouponDiscount)
    const regularAmount = form.getValues("amount") ?? 0
    const earlyBird = form.getValues("earlyBirdAmount")
    const isEarlyBirdOn = form.getValues("isEarlyBird")
    const effectivePrice = (isEarlyBirdOn && earlyBird) ? earlyBird : regularAmount

    if (!code) {
      toast.error("Enter a coupon code")
      return
    }
    if (!discount || discount <= 0) {
      toast.error("Enter a valid discount amount")
      return
    }
    if (effectivePrice > 0 && discount >= effectivePrice) {
      toast.error(`Discount must be less than the current ticket price (₹${effectivePrice})`)
      return
    }
    if (couponFields.some((f) => f.code === code)) {
      toast.error("This coupon code already exists")
      return
    }

    appendCoupon({ code, discount })
    setNewCouponCode("")
    setNewCouponDiscount("")
  }

  async function onSubmit(values: CreateEventFormValues) {
    const result = isEditing
      ? await updateEventAction({ ...values, id: event.id })
      : await createEventAction(values)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success(isEditing ? "Event updated successfully" : "Event created successfully")
    router.push("/admin/events")
    router.refresh()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main fields */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Event Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Ulsaham Fest 2025"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e)
                            if (!isEditing) {
                              form.setValue("slug", generateSlug(e.target.value))
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Slug *</FormLabel>
                      <FormControl>
                        <Input placeholder="ulsaham-fest-2025" {...field} />
                      </FormControl>
                      <FormDescription>URL-friendly identifier for the event</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe the event..."
                          className="min-h-[120px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="venue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Venue *</FormLabel>
                      <FormControl>
                        <Input placeholder="Town Hall, Thrissur" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="venueLink"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location Link</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://maps.google.com/..."
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormDescription>Optional Google Maps or any location URL</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date *</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            value={
                              field.value
                                ? new Date(field.value).toISOString().split("T")[0]
                                : ""
                            }
                            min={!isEditing ? new Date().toISOString().split("T")[0] : undefined}
                            onChange={(e) => field.onChange(new Date(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time *</FormLabel>
                        <FormControl>
                          <Input
                            type="time"
                            value={formatTimeForInput(field.value)}
                            onChange={(e) =>
                              field.onChange(formatTimeFromInput(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Time *</FormLabel>
                        <FormControl>
                          <Input
                            type="time"
                            value={formatTimeForInput(field.value)}
                            onChange={(e) =>
                              field.onChange(formatTimeFromInput(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Pricing */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pricing & Capacity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="isFree"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <div>
                        <FormLabel>Free Event</FormLabel>
                        <FormDescription>Toggle off to set a ticket price</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {!isFree && (
                  <>
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Regular Price (₹) *</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="0"
                              min="0"
                              step="0.01"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="earlyBirdAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Early Bird Price (₹)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="Leave blank if no early bird price"
                              min="0"
                              step="0.01"
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) => {
                                const val = e.target.value
                                field.onChange(val ? parseFloat(val) : null)
                                if (!val) form.setValue("isEarlyBird", false)
                              }}
                            />
                          </FormControl>
                          <FormDescription>Optional discounted price for early registrations</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {earlyBirdAmount != null && earlyBirdAmount > 0 && (
                      <FormField
                        control={form.control}
                        name="isEarlyBird"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-md border px-3 py-2">
                            <div>
                              <FormLabel>Early bird pricing active</FormLabel>
                              <FormDescription>
                                Charge ₹{earlyBirdAmount} instead of the regular price
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    )}
                  </>
                )}

                <FormField
                  control={form.control}
                  name="capacity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Capacity</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Leave blank for unlimited"
                          min="1"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value ? parseInt(e.target.value) : null)
                          }
                        />
                      </FormControl>
                      <FormDescription>Maximum number of participants</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!isFree && (
                  <div className="space-y-3 pt-2 border-t">
                    <div>
                      <p className="text-sm font-medium">Coupon Codes</p>
                      <p className="text-sm text-muted-foreground">
                        Each code gives a fixed discount off the base ticket price
                      </p>
                    </div>

                    {couponFields.length > 0 && (
                      <div className="space-y-2">
                        {couponFields.map((field, index) => (
                          <div key={field.id} className="flex items-center gap-2">
                            <div className="flex-1 flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/30">
                              <span className="font-mono text-sm font-medium tracking-wide">
                                {field.code}
                              </span>
                              <span className="text-muted-foreground text-sm">—</span>
                              <span className="text-sm">₹{field.discount} off</span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="shrink-0 text-destructive hover:text-destructive"
                              onClick={() => removeCoupon(index)}
                              disabled={isSubmitting}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Input
                        placeholder="CODE"
                        className="flex-1 font-mono uppercase"
                        value={newCouponCode}
                        onChange={(e) => setNewCouponCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            handleAddCoupon()
                          }
                        }}
                        disabled={isSubmitting}
                      />
                      <Input
                        type="number"
                        placeholder="Discount ₹"
                        className="w-32"
                        min="1"
                        step="0.01"
                        value={newCouponDiscount}
                        onChange={(e) => setNewCouponDiscount(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            handleAddCoupon()
                          }
                        }}
                        disabled={isSubmitting}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddCoupon}
                        disabled={isSubmitting}
                        className="shrink-0"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar fields */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Banner Image *</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="bannerImageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <ImageUpload
                          value={field.value}
                          onChange={(url, publicId) => {
                            form.setValue("bannerImageUrl", url)
                            form.setValue("bannerImageId", publicId)
                          }}
                          onClear={() => {
                            form.setValue("bannerImageUrl", "")
                            form.setValue("bannerImageId", "")
                          }}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Publishing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status *</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ANNOUNCED">Announced</SelectItem>
                          <SelectItem value="PUBLISHED">Published</SelectItem>
                          <SelectItem value="CANCELLED">Cancelled</SelectItem>
                          <SelectItem value="COMPLETED">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="featured"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div>
                        <FormLabel className="cursor-pointer">Featured Event</FormLabel>
                        <FormDescription>Show in featured events list</FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => router.back()}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isEditing ? "Update Event" : "Create Event"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Form>
  )
}
