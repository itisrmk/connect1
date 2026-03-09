import { z } from "zod";

export const AttendeeSchema = z.object({
  email: z.string(),
  name: z.string().optional(),
  status: z.enum(["accepted", "declined", "tentative", "pending"]).optional(),
});

export const CalendarEventSchema = z.object({
  id: z.string(),
  provider: z.string(),
  title: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  isAllDay: z.boolean().optional(),
  attendees: z.array(AttendeeSchema).optional(),
  organizer: AttendeeSchema.optional(),
  meetingUrl: z.string().optional(),
  calendarId: z.string().optional(),
  recurrence: z.string().optional(),
  status: z.enum(["confirmed", "tentative", "cancelled"]).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  raw: z.record(z.unknown()).optional(),
});

export const CreateCalendarEventSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  isAllDay: z.boolean().optional(),
  attendees: z.array(z.object({ email: z.string(), name: z.string().optional() })).optional(),
  calendarId: z.string().optional(),
});

export type Attendee = z.infer<typeof AttendeeSchema>;
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;
export type CreateCalendarEvent = z.infer<typeof CreateCalendarEventSchema>;
