"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import {
  Loader2,
  UserPlus,
  CheckCircle2,
  CreditCard,
  IndianRupee,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { participantSchema, type ParticipantFormValues } from "@/validators/participant.validator"
import { addParticipantAction } from "@/actions/participant.actions"
import { createPaymentOrderAction, verifyAndEnrollAction } from "@/actions/payment.actions"
import { calculateTicketFees, calculateCompetitionFees } from "@/lib/pricing"
import type { Event } from "@prisma/client"

interface EnrollDialogProps {
  event: Event | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEnrolled?: () => void
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && window.Razorpay) {
      resolve(true)
      return
    }
    const script = document.createElement("script")
    script.src = "https://checkout.razorpay.com/v1/checkout.js"
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export function EnrollDialog({
  event,
  open,
  onOpenChange,
  onEnrolled,
}: EnrollDialogProps) {
  const [step, setStep] = useState<"form" | "success">("form")

  const eventId = event?.id ?? ""
  const eventName = event?.name ?? ""
  const isFree = event?.isFree ?? true
  const isCompetition = !!event?.isCompetition
  const participationType = event?.participationType ?? "INDIVIDUAL"
  const individualOnly = isCompetition && participationType === "INDIVIDUAL"
  const groupOnly = isCompetition && participationType === "GROUP"
  const effectiveAmount = event
    ? event.isEarlyBird && event.earlyBirdAmount != null
      ? event.earlyBirdAmount
      : event.amount
    : null
  const extraMemberPrice = event?.groupExtraAmount ?? effectiveAmount

  const form = useForm<ParticipantFormValues>({
    resolver: zodResolver(participantSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      age: undefined,
      numberOfParticipants: 1,
    },
  })

  const numberOfParticipants = individualOnly ? 1 : form.watch("numberOfParticipants") || 1
  const fees =
    !isFree && effectiveAmount && event
      ? isCompetition
        ? calculateCompetitionFees(effectiveAmount, event.groupExtraAmount, numberOfParticipants, 0, event.gstEnabled, event.platformFeeEnabled)
        : calculateTicketFees(effectiveAmount, numberOfParticipants, 0, event.gstEnabled, event.platformFeeEnabled)
      : null

  useEffect(() => {
    if (!open) {
      setStep("form")
      form.reset()
    }
  }, [open, form])

  const isSubmitting = form.formState.isSubmitting

  async function onSubmit(values: ParticipantFormValues) {
    if (!event) return
    if (individualOnly) values = { ...values, numberOfParticipants: 1 }
    if (groupOnly && values.numberOfParticipants < 2) {
      form.setError("numberOfParticipants", { message: "This competition accepts group entries only (minimum 2 members)" })
      return
    }
    if (isFree) {
      const result = await addParticipantAction(eventId, values)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setStep("success")
      onEnrolled?.()
      return
    }

    // Paid flow
    const loaded = await loadRazorpayScript()
    if (!loaded) {
      toast.error("Failed to load payment gateway. Please check your connection and try again.")
      return
    }

    const orderResult = await createPaymentOrderAction(
      eventId,
      values as unknown as Record<string, unknown>
    )
    if (!orderResult.success) {
      toast.error(orderResult.error)
      return
    }

    const { orderId, amount: orderAmount, currency, keyId } = orderResult.data

    await new Promise<void>((resolve) => {
      const rzp = new window.Razorpay({
        key: keyId,
        amount: orderAmount,
        currency,
        name: "Ulsaham Entertainments",
        description: eventName,
        order_id: orderId,
        prefill: {
          name: values.name,
          email: values.email || undefined,
          contact: values.phone,
        },
        theme: { color: "#014421" },
        handler: async (response) => {
          const enrollResult = await verifyAndEnrollAction(
            response,
            eventId,
            values as unknown as Record<string, unknown>
          )
          if (!enrollResult.success) {
            toast.error(enrollResult.error)
          } else {
            setStep("success")
            onEnrolled?.()
          }
          resolve()
        },
        modal: {
          ondismiss: () => {
            toast.info("Payment cancelled")
            resolve()
          },
        },
      })
      rzp.open()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === "success" ? (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-[#014421]/10 p-4">
              <CheckCircle2 className="h-10 w-10 text-[#014421]" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-black">You&apos;re Enrolled!</h2>
              <p className="text-sm text-black/60">
                Your registration for <span className="font-medium text-black">{eventName}</span> is confirmed.
              </p>
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="mt-1">
              Close
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-[#014421]" />
                Register as Guest
              </DialogTitle>
              <DialogDescription className="text-black/60">{eventName}</DialogDescription>
            </DialogHeader>

            {!isFree && effectiveAmount != null && fees && (
              <div className="bg-[#014421]/5 border border-[#014421]/20 rounded-lg px-4 py-3 space-y-2 text-sm">
                <div className="flex items-center justify-between text-black/70">
                  <span className="flex items-center gap-1.5">
                    <IndianRupee className="h-3.5 w-3.5" />
                    {isCompetition && numberOfParticipants > 1
                      ? `₹${effectiveAmount.toLocaleString("en-IN")} + ${numberOfParticipants - 1} × ₹${(extraMemberPrice ?? 0).toLocaleString("en-IN")} (group entry)`
                      : isCompetition
                      ? `₹${effectiveAmount.toLocaleString("en-IN")} (individual entry)`
                      : `₹${effectiveAmount.toLocaleString("en-IN")} × ${numberOfParticipants} person${numberOfParticipants !== 1 ? "s" : ""}`}
                  </span>
                  <span>₹{fees.base.toLocaleString("en-IN")}</span>
                </div>
                {fees.gst > 0 && (
                  <div className="flex items-center justify-between text-black/50 text-xs">
                    <span>GST (18%)</span>
                    <span>₹{fees.gst.toLocaleString("en-IN")}</span>
                  </div>
                )}
                {fees.platformFee > 0 && (
                  <div className="flex items-center justify-between text-black/50 text-xs">
                    <span>Platform fee (2%)</span>
                    <span>₹{fees.platformFee.toLocaleString("en-IN")}</span>
                  </div>
                )}
                <Separator className="bg-[#014421]/20" />
                <div className="flex items-center justify-between font-semibold text-[#014421]">
                  <span>Total</span>
                  <span>₹{fees.total.toLocaleString("en-IN")}</span>
                </div>
              </div>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Rahul Menon" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="9876543210"
                          maxLength={10}
                          inputMode="numeric"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>10-digit Indian mobile number</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="rahul@example.com"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="age"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Age *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="25"
                            min={1}
                            max={120}
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {!individualOnly && (
                    <FormField
                      control={form.control}
                      name="numberOfParticipants"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{groupOnly ? "Group Members *" : isCompetition ? "Members *" : "No. of Persons *"}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder={groupOnly ? "2" : "1"}
                              min={groupOnly ? 2 : 1}
                              max={10}
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          {isCompetition && participationType === "BOTH" && (
                            <FormDescription>1 = individual · 2+ = group</FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full bg-[#014421] hover:bg-[#014421]/90 text-white"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : !isFree ? (
                    <CreditCard className="h-4 w-4 mr-2" />
                  ) : null}
                  {isSubmitting
                    ? isFree
                      ? "Enrolling..."
                      : "Processing..."
                    : isFree
                    ? "Enroll for Free"
                    : `Pay ₹${fees?.total.toLocaleString("en-IN") ?? ""} & Enroll`}
                </Button>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
