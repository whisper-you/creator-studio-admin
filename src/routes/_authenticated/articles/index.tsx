import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Articles } from '@/features/articles'
import {
  ARTICLE_CATEGORIES,
  ARTICLE_STATUSES,
} from '@/features/articles/data/schema'

const articlesSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  status: z.array(z.enum(ARTICLE_STATUSES)).optional().catch([]),
  category: z.array(z.enum(ARTICLE_CATEGORIES)).optional().catch([]),
  filter: z.string().optional().catch(''),
})

export const Route = createFileRoute('/_authenticated/articles/')({
  validateSearch: articlesSearchSchema,
  component: Articles,
})
