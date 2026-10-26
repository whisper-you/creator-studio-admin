import { describe, it, expect } from 'vitest'
import {
  cleanMarkdownText,
  generateSmartTitles,
  generateSmartSummary,
  generateSmartTags,
} from './ai-assistant'

describe('ai-assistant 创作辅助引擎', () => {
  const sampleMarkdown = `
---
title: "React 19 核心架构实战"
date: "2026-03-01"
---

# React 19 核心架构实战

React 19 带来了全新的编译器与服务端组件架构优化。
在这篇文章中，我们将通过具体的项目案例，深入分析 React 19 的新特性及其性能优化细节。

\`\`\`typescript
const [state, action] = useActionState(updateName, null);
\`\`\`

> 生产力提升是现代前端工程的核心追求。
掌握这些关键技巧能够帮助你在日常开发中避开常见陷阱。
`

  it('cleanMarkdownText 正确移除 Markdown 语法与代码块', () => {
    const text = cleanMarkdownText(sampleMarkdown)
    expect(text).not.toContain('---')
    expect(text).not.toContain('```')
    expect(text).not.toContain('useActionState')
    expect(text).toContain('React 19 带来了全新的编译器与服务端组件架构优化')
  })

  it('generateSmartTitles 生成 5 种不同风格的标题候选', () => {
    const titles = generateSmartTitles(sampleMarkdown, 'React 19 实战')
    expect(titles).toHaveLength(5)
    expect(titles.map((t) => t.style)).toEqual([
      'guide',
      'conflict',
      'number',
      'story',
      'curiosity',
    ])
    for (const item of titles) {
      expect(item.title.length).toBeGreaterThan(5)
      expect(item.styleLabel).toBeTruthy()
    }
  })

  it('generateSmartSummary 正确截取并生成精炼摘要', () => {
    const summary = generateSmartSummary(sampleMarkdown, 'React 19 实战')
    expect(summary.length).toBeGreaterThan(15)
    expect(summary.length).toBeLessThan(160)
    expect(summary).toContain('React 19 带来了全新的编译器')
  })

  it('generateSmartTags 从文本中自动识别技术标签', () => {
    const tags = generateSmartTags(sampleMarkdown, 'React 19 实战', 'tech')
    expect(tags).toContain('React')
    expect(tags).toContain('TypeScript')
    expect(tags.length).toBeGreaterThanOrEqual(2)
  })
})
