import { z } from "zod";

export const FileSchema = z.object({
  id: z.string(),
  provider: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().optional(),
  path: z.string().optional(),
  parentId: z.string().optional(),
  webUrl: z.string().optional(),
  downloadUrl: z.string().optional(),
  isFolder: z.boolean(),
  createdAt: z.string().datetime().optional(),
  modifiedAt: z.string().datetime().optional(),
  createdBy: z
    .object({
      id: z.string(),
      name: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
  raw: z.record(z.unknown()).optional(),
});

export const UploadFileSchema = z.object({
  name: z.string(),
  parentId: z.string().optional(),
  mimeType: z.string(),
  content: z.union([z.string(), z.instanceof(Buffer)]),
});

export type File = z.infer<typeof FileSchema>;
export type UploadFile = z.infer<typeof UploadFileSchema>;
