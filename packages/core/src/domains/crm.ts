import { z } from "zod";

export const CrmContactSchema = z.object({
  id: z.string(),
  provider: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  source: z.string().optional(),
  stage: z.string().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  raw: z.record(z.unknown()).optional(),
});

export const DealSchema = z.object({
  id: z.string(),
  provider: z.string(),
  name: z.string(),
  value: z.number().optional(),
  currency: z.string().optional(),
  stage: z.string(),
  probability: z.number().optional(),
  contactId: z.string().optional(),
  ownerId: z.string().optional(),
  expectedCloseDate: z.string().datetime().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  raw: z.record(z.unknown()).optional(),
});

export const CreateCrmContactSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  customFields: z.record(z.unknown()).optional(),
});

export type CrmContact = z.infer<typeof CrmContactSchema>;
export type Deal = z.infer<typeof DealSchema>;
export type CreateCrmContact = z.infer<typeof CreateCrmContactSchema>;
