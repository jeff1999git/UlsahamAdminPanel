import { z } from "zod"
import { MAX_PARTICIPANTS_PER_REGISTRATION } from "@/constants"

export const participantSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be at most 100 characters"),
  phone: z
    .string()
    .regex(/^\d{10}$/, "Phone number must be exactly 10 digits"),
  email: z
    .string()
    .email("Invalid email address")
    .optional()
    .nullable()
    .or(z.literal("")),
  age: z.coerce
    .number()
    .int("Age must be a whole number")
    .min(1, "Age must be at least 1")
    .max(120, "Age must be at most 120"),
  numberOfParticipants: z.coerce
    .number()
    .int("Number of participants must be a whole number")
    .min(1, "At least 1 participant required")
    .max(MAX_PARTICIPANTS_PER_REGISTRATION, `Maximum ${MAX_PARTICIPANTS_PER_REGISTRATION} participants per registration`),
})

export const publicRegistrationSchema = participantSchema.extend({
  eventSlug: z.string().min(1, "Event slug is required"),
})

export type ParticipantFormValues = z.infer<typeof participantSchema>
export type PublicRegistrationValues = z.infer<typeof publicRegistrationSchema>
