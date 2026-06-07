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
import { participantSchema, type ParticipantFormValues } from "@/validators/participant.validator"
import { addParticipantAction } from "@/actions/participant.actions"
import { createPaymentOrderAction, verifyAndEnrollAction } from "@/actions/payment.actions"

interface EnrollDialogProps {
  eventId: string
  eventName: string
  isFree: boolean
  amount: number | null
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
  eventId,
  eventName,
  isFree,
  amount,
  open,
  onOpenChange,
  onEnrolled,
}: EnrollDialogProps) {
  const [step, setStep] = useState<"form" | "success">("form")

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

  const numberOfParticipants = form.watch("numberOfParticipants") || 1
  const totalAmount = !isFree && amount ? amount * numberOfParticipants : 0

  useEffect(() => {
    if (!open) {
      setStep("form")
      form.reset()
    }
  }, [open, form])

  const isSubmitting = form.formState.isSubmitting

  async function onSubmit(values: ParticipantFormValues) {
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

            {!isFree && amount && (
              <div className="flex items-center justify-between bg-[#014421]/5 border border-[#014421]/20 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 text-[#014421]">
                  <IndianRupee className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-medium">
                    ₹{amount.toLocaleString("en-IN")} per person
                  </span>
                </div>
                {numberOfParticipants > 1 && (
                  <Badge
                    variant="outline"
                    className="text-[#014421] border-[#014421]/30 font-semibold shrink-0"
                  >
                    Total: ₹{totalAmount.toLocaleString("en-IN")}
                  </Badge>
                )}
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

                  <FormField
                    control={form.control}
                    name="numberOfParticipants"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>No. of Persons *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="1"
                            min={1}
                            max={10}
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                    : `Pay ₹${totalAmount.toLocaleString("en-IN")} & Enroll`}
                </Button>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
