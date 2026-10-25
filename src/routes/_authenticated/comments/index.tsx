import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Comments } from '@/features/comments'

const commentsSearchSchema = z.object({
  status: z
    .enum(['pending', 'approved', 'rejected'])
    .optional()
    .catch(undefined),
})

export const Route = createFileRoute('/_authenticated/comments/')({
  validateSearch: commentsSearchSchema,
  component: Comments,
})
