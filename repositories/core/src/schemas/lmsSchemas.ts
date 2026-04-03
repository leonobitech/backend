import { z } from "zod";

// =============================================================================
// Course Schemas
// =============================================================================

export const createCourseSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase with hyphens only"),
  description: z.string().min(1, "Description is required").max(5000),
  thumbnailUrl: z.string().url().optional().or(z.literal("")),
  price: z.number().min(0, "Price must be positive"),
  currency: z.string().length(3).default("USD"),
});

export const updateCourseSchema = createCourseSchema.partial();

// =============================================================================
// Module Schemas
// =============================================================================

export const createModuleSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  order: z.number().int().min(0),
});

export const updateModuleSchema = createModuleSchema.partial();

// =============================================================================
// Lesson Schemas
// =============================================================================

const lessonTypeEnum = z.enum(["VIDEO", "TEXT", "QUIZ"]);

export const createLessonSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase with hyphens only"),
  description: z.string().max(2000).optional(),
  videoUrl: z.string().url().optional().or(z.literal("")),
  duration: z.number().int().min(0).optional(),
  order: z.number().int().min(0),
  type: lessonTypeEnum.default("VIDEO"),
  content: z.string().max(50000).optional(),
});

export const updateLessonSchema = createLessonSchema.partial();

// =============================================================================
// Reorder Schema
// =============================================================================

export const reorderSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      order: z.number().int().min(0),
    })
  ),
});
