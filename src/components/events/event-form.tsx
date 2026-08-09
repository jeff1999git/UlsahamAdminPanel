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
import { MultiImageUpload } from "@/components/shared/multi-image-upload"
import { createEventSchema, MAX_GALLERY_IMAGES, type CreateEventFormValues } from "@/validators/event.validator"
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
  const [newCompCode, setNewCompCode] = useState("")
  const [newCompMaxUses, setNewCompMaxUses] = useState("")

  const ev = event as (typeof event & { earlyBirdAmount?: number | null; isEarlyBird?: boolean; gstEnabled?: boolean; platformFeeEnabled?: boolean; isCompetition?: boolean; participationType?: "INDIVIDUAL" | "GROUP" | "BOTH"; groupExtraAmount?: number | null; competitionInstructions?: string | null; competitionNotes?: string | null; complimentaryCodes?: { code: string; maxUses: number; usedCount: number }[]; galleryImages?: { url: string; id: string }[] }) | undefined

  const form = useForm<CreateEventFormValues>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      name: ev?.name ?? "",
      slug: ev?.slug ?? "",
      description: ev?.description ?? "",
      bannerImageUrl: ev?.bannerImageUrl ?? "",
      bannerImageId: ev?.bannerImageId ?? "",
      venue: ev?.venue ?? "",
      venueLink: ev?.venueLink ?? "",
      date: ev?.date ? new Date(ev.date) : new Date(),
      startTime: ev?.startTime ?? "10:00 AM",
      endTime: ev?.endTime ?? "05:00 PM",
      isFree: ev?.isFree ?? true,
      amount: ev?.amount ?? undefined,
      earlyBirdAmount: ev?.earlyBirdAmount ?? undefined,
      isEarlyBird: ev?.isEarlyBird ?? false,
      gstEnabled: ev?.gstEnabled ?? false,
      platformFeeEnabled: ev?.platformFeeEnabled ?? true,
      isCompetition: ev?.isCompetition ?? false,
      participationType: ev?.participationType ?? "INDIVIDUAL",
      groupExtraAmount: ev?.groupExtraAmount ?? undefined,
      competitionInstructions: ev?.competitionInstructions ?? "",
      competitionNotes: ev?.competitionNotes ?? "",
      status: ev?.status ?? "ANNOUNCED",
      capacity: ev?.capacity ?? undefined,
      featured: ev?.featured ?? false,
      couponCodes: ev?.couponCodes ?? [],
      complimentaryCodes: ev?.complimentaryCodes ?? [],
      galleryImages: ev?.galleryImages ?? [],
    },
  })

  const isFree = form.watch("isFree")
  const isCompetition = form.watch("isCompetition")
  const participationType = form.watch("participationType")
  const earlyBirdAmount = form.watch("earlyBirdAmount")
  const isSubmitting = form.formState.isSubmitting

  const { fields: couponFields, append: appendCoupon, remove: removeCoupon } = useFieldArray({
    control: form.control,
    name: "couponCodes",
  })

  const { fields: compFields, append: appendComp, remove: removeComp } = useFieldArray({
    control: form.control,
    name: "complimentaryCodes",
  })

  const { fields: galleryFields, append: appendGalleryImages, remove: removeGalleryImage } = useFieldArray({
    control: form.control,
    name: "galleryImages",
  })

  function handleAddComp() {
    const code = newCompCode.trim().toUpperCase()
    const maxUses = parseInt(newCompMaxUses)
    if (!code) { toast.error("Enter a complimentary code"); return }
    if (!maxUses || maxUses <= 0) { toast.error("Enter a valid number of entries"); return }
    if (compFields.some((f) => f.code === code)) { toast.error("This code already exists"); return }
    appendComp({ code, maxUses, usedCount: 0 })
    setNewCompCode("")
    setNewCompMaxUses("")
  }

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

            {/* Competition */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Competition</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="isCompetition"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <div>
                        <FormLabel>Competition Event</FormLabel>
                        <FormDescription>
                          e.g. reel or dance contest — participants get a competition number card instead of a ticket
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {isCompetition && (
                  <FormField
                    control={form.control}
                    name="participationType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Participation Type *</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select participation type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="INDIVIDUAL">Individual only</SelectItem>
                            <SelectItem value="GROUP">Group only</SelectItem>
                            <SelectItem value="BOTH">Individual & Group</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>Who can enter this competition</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {isCompetition && (
                  <>
                    <FormField
                      control={form.control}
                      name="competitionNotes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Shown to participants before they register (e.g. eligibility, judging criteria, timing)..."
                              className="min-h-[80px]"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormDescription>Optional — displayed on the event page before registration</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="competitionInstructions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Instructions</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Detailed rules & instructions for participants..."
                              className="min-h-[120px]"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormDescription>Optional — included in the participation card PDF download</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
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
                          <FormLabel>
                            {isCompetition ? "Registration Price (₹) *" : "Regular Price (₹) *"}
                          </FormLabel>
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
                          {isCompetition && participationType !== "INDIVIDUAL" && (
                            <FormDescription>
                              Price for an individual entry — for group entries this covers the first member
                            </FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {isCompetition && participationType !== "INDIVIDUAL" && (
                      <FormField
                        control={form.control}
                        name="groupExtraAmount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Extra Member Price (₹) *</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="e.g. 50"
                                min="0"
                                step="0.01"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value
                                  field.onChange(val ? parseFloat(val) : null)
                                }}
                              />
                            </FormControl>
                            <FormDescription>
                              Each additional group member adds this amount (e.g. individual ₹100, group of 3 = ₹100 + 2 × ₹50 = ₹200)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

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

                    <FormField
                      control={form.control}
                      name="gstEnabled"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-md border px-3 py-2">
                          <div>
                            <FormLabel>Apply GST (18%)</FormLabel>
                            <FormDescription>
                              Add 18% GST on top of the ticket price
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="platformFeeEnabled"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-md border px-3 py-2">
                          <div>
                            <FormLabel>Apply Platform Fee (2%)</FormLabel>
                            <FormDescription>
                              Add 2% platform fee on top of the ticket price
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
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
                  <>
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

                  <div className="space-y-3 pt-3 border-t">
                    <div>
                      <p className="text-sm font-medium">Complimentary Codes</p>
                      <p className="text-sm text-muted-foreground">
                        Each code grants one free entry — no payment required
                      </p>
                    </div>

                    {compFields.length > 0 && (
                      <div className="space-y-2">
                        {compFields.map((field, index) => (
                          <div key={field.id} className="flex items-center gap-2">
                            <div className="flex-1 flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/30">
                              <span className="font-mono text-sm font-medium tracking-wide">
                                {field.code}
                              </span>
                              <span className="text-muted-foreground text-sm">—</span>
                              <span className="text-sm">{field.maxUses} {field.maxUses === 1 ? "entry" : "entries"} ({field.usedCount} used)</span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="shrink-0 text-destructive hover:text-destructive"
                              onClick={() => removeComp(index)}
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
                        value={newCompCode}
                        onChange={(e) => setNewCompCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddComp() } }}
                        disabled={isSubmitting}
                      />
                      <Input
                        type="number"
                        placeholder="Entries"
                        className="w-28"
                        min="1"
                        value={newCompMaxUses}
                        onChange={(e) => setNewCompMaxUses(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddComp() } }}
                        disabled={isSubmitting}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddComp}
                        disabled={isSubmitting}
                        className="shrink-0"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>
                  </>
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
                <CardTitle className="text-base">Gallery Images</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="galleryImages"
                  render={() => (
                    <FormItem>
                      <FormControl>
                        <MultiImageUpload
                          images={galleryFields}
                          onAdd={(images) => appendGalleryImages(images)}
                          onRemove={removeGalleryImage}
                          disabled={isSubmitting}
                          max={MAX_GALLERY_IMAGES}
                        />
                      </FormControl>
                      <FormDescription>
                        Extra photos shown in a gallery on the public event page, navigable alongside the banner
                      </FormDescription>
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
