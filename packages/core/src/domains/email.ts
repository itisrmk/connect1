import { z } from "zod";

export const ContactSchema = z.object({
  name: z.string().optional(),
  email: z.string().email(),
});

export const AttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  url: z.string().optional(),
});

export const EmailSchema = z.object({
  id: z.string(),
  provider: z.string(),
  from: ContactSchema,
  to: z.array(ContactSchema),
  cc: z.array(ContactSchema).optional(),
  bcc: z.array(ContactSchema).optional(),
  subject: z.string(),
  body: z.string(),
  bodyHtml: z.string().optional(),
  attachments: z.array(AttachmentSchema).optional(),
  threadId: z.string().optional(),
  labels: z.array(z.string()).optional(),
  isRead: z.boolean(),
  receivedAt: z.string().datetime(),
  raw: z.record(z.unknown()).optional(),
});

export const SendEmailSchema = z.object({
  to: z.array(ContactSchema),
  cc: z.array(ContactSchema).optional(),
  bcc: z.array(ContactSchema).optional(),
  subject: z.string(),
  body: z.string(),
  bodyHtml: z.string().optional(),
  replyToMessageId: z.string().optional(),
});

export type Contact = z.infer<typeof ContactSchema>;
export type Attachment = z.infer<typeof AttachmentSchema>;
export type Email = z.infer<typeof EmailSchema>;
export type SendEmail = z.infer<typeof SendEmailSchema>;
