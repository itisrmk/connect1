import { z } from "zod";

export const TaskStatusSchema = z.enum([
  "todo",
  "in_progress",
  "done",
  "cancelled",
]);

export const TaskPrioritySchema = z.enum(["urgent", "high", "medium", "low", "none"]);

export const TaskSchema = z.object({
  id: z.string(),
  provider: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema.optional(),
  assignee: z
    .object({
      id: z.string(),
      name: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  labels: z.array(z.string()).optional(),
  dueDate: z.string().datetime().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  url: z.string().optional(),
  raw: z.record(z.unknown()).optional(),
});

export const CreateTaskSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  assigneeId: z.string().optional(),
  projectId: z.string().optional(),
  labels: z.array(z.string()).optional(),
  dueDate: z.string().datetime().optional(),
});

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type Task = z.infer<typeof TaskSchema>;
export type CreateTask = z.infer<typeof CreateTaskSchema>;
