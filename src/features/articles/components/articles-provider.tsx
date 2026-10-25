import React, { useEffect, useState } from 'react'
import useDialogState from '@/hooks/use-dialog-state'
import { useArticlesStore } from '../store'
import { type Article } from '../data/schema'

export type ArticlesDialogType =
  | 'create'
  | 'update'
  | 'delete'
  | 'delete-multi'
  | 'schedule'

type ArticlesContextType = {
  open: ArticlesDialogType | null
  setOpen: (str: ArticlesDialogType | null) => void
  currentRow: Article | null
  setCurrentRow: React.Dispatch<React.SetStateAction<Article | null>>
}

const ArticlesContext = React.createContext<ArticlesContextType | null>(null)

/**
 * 只负责「对话框 UI 状态」;文章数据本体在 zustand store 里,
 * 由文章管理 / 排期日历 / 数据总览共享。
 */
export function ArticlesProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useDialogState<ArticlesDialogType>(null)
  const [currentRow, setCurrentRow] = useState<Article | null>(null)

  // 进入应用时尝试从后端拉取文章;后端未启动则自动保持离线演示模式
  useEffect(() => {
    void useArticlesStore.getState().hydrate()
  }, [])

  return (
    <ArticlesContext value={{ open, setOpen, currentRow, setCurrentRow }}>
      {children}
    </ArticlesContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useArticles = () => {
  const articlesContext = React.useContext(ArticlesContext)

  if (!articlesContext) {
    throw new Error('useArticles has to be used within <ArticlesContext>')
  }

  return articlesContext
}
