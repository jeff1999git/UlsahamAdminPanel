"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { participantSchema, type ParticipantFormValues } from "@/validators/participant.validator"
import { addParticipantAction, updateParticipantAction } from "@/actions/participant.actions"

interface ParticipantFormProps {
  eventId: string
  participant?: ParticipantFormValues & { id: string }
  onSuccess?: () => void
}

export function ParticipantForm({ eventId, participant, onSuccess }: ParticipantFormProps) {
  const isEditing = !!participant

  const schema = isEditing
    ? participantSchema.pick({ name: true, email: true, age: true, numberOfParticipants: true })
    : participantSchema

  const form = useForm<ParticipantFormValues>({
    resolver: zodResolver(schema as typeof participantSchema),
    defaultValues: {
      name: participant?.name ?? "",
      phone: participant?.phone ?? "",
      email: participant?.email ?? "",
      age: participant?.age ?? undefined,
      numberOfParticipants: participant?.numberOfParticipants ?? 1,
    },
  })

  const isSubmitting = form.formState.isSubmitting

  async function onSubmit(values: ParticipantFormValues) {
    const result = isEditing
      ? await updateParticipantAction(participant.id, eventId, values)
      : await addParticipantAction(eventId, values)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success(isEditing ? "Participant updated" : "Participant added successfully")
    form.reset()
    onSuccess?.()
  }

  return (
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

        {!isEditing && (
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
        )}

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
                <FormLabel>No. of Participants *</FormLabel>
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

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEditing ? "Update Participant" : "Add Participant"}
        </Button>
      </form>
    </Form>
  )
}
