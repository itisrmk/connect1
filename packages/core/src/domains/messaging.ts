import { z } from "zod";

export const ChannelSchema = z.object({
  id: z.string(),
  provider: z.string(),
  name: z.string(),
  description: z.string().optional(),
  isPrivate: z.boolean(),
  memberCount: z.number().optional(),
  createdAt: z.string().datetime().optional(),
  raw: z.record(z.unknown()).optional(),
});

export const MessageSchema = z.object({
  id: z.string(),
  provider: z.string(),
  channelId: z.string(),
  author: z.object({
    id: z.string(),
    name: z.string(),
    avatarUrl: z.string().optional(),
  }),
  content: z.string(),
  timestamp: z.string().datetime(),
  threadId: z.string().optional(),
  attachments: z
    .array(
      z.object({
        id: z.string(),
        filename: z.string(),
        url: z.string(),
        mimeType: z.string().optional(),
      })
    )
    .optional(),
  reactions: z
    .array(
      z.object({
        emoji: z.string(),
        count: z.number(),
      })
    )
    .optional(),
  raw: z.record(z.unknown()).optional(),
});

export const SendMessageSchema = z.object({
  channelId: z.string(),
  content: z.string(),
  threadId: z.string().optional(),
});

export type Channel = z.infer<typeof ChannelSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type SendMessage = z.infer<typeof SendMessageSchema>;
