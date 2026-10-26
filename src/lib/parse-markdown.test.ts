import { describe, expect, it } from 'vitest'
import { parseMarkdownFile, parseYamlFrontmatter } from './parse-markdown'

describe('parseYamlFrontmatter', () => {
  it('正确解析标量、带引号字符串与内联数组', () => {
    const yaml = `
title: "深入浅出 React 19"
author: '创作者'
category: tech
tags: [React, 前端, 架构]
views: 120
`
    const parsed = parseYamlFrontmatter(yaml)
    expect(parsed.title).toBe('深入浅出 React 19')
    expect(parsed.author).toBe('创作者')
    expect(parsed.category).toBe('tech')
    expect(parsed.tags).toEqual(['React', '前端', '架构'])
  })

  it('正确解析多行连字符列表', () => {
    const yaml = `
title: 选题清单
tags:
  - 独立开发
  - 出海
  - AI
platforms:
  - wechat
  - zhihu
`
    const parsed = parseYamlFrontmatter(yaml)
    expect(parsed.title).toBe('选题清单')
    expect(parsed.tags).toEqual(['独立开发', '出海', 'AI'])
    expect(parsed.platforms).toEqual(['wechat', 'zhihu'])
  })
})

describe('parseMarkdownFile', () => {
  it('完整解析包含 Frontmatter 的 Markdown 文章', () => {
    const raw = `---
title: "我的 2026 年度技术复盘"
category: 观点随笔
status: 已发布
date: 2026-10-26T12:00:00.000Z
tags: [复盘, 思考]
platforms: [微信公众号, 知乎]
excerpt: "今年是一次全新的探索，总结 12 个关键认知。"
---
# 我的 2026 年度技术复盘

正文第一段，记录这一年的关键变化。
`
    const result = parseMarkdownFile('annual-review.md', raw, 1024)
    expect(result.fileName).toBe('annual-review.md')
    expect(result.title).toBe('我的 2026 年度技术复盘')
    expect(result.category).toBe('essay')
    expect(result.status).toBe('published')
    expect(result.publishedAt).toBeInstanceOf(Date)
    expect(result.tags).toEqual(['复盘', '思考'])
    expect(result.platforms).toEqual(['wechat', 'zhihu'])
    expect(result.excerpt).toBe('今年是一次全新的探索，总结 12 个关键认知。')
    expect(result.hasFrontmatter).toBe(true)
    expect(result.content).toContain('正文第一段')
  })

  it('没有 Frontmatter 时，自动从正文首个 # 提取标题与摘要', () => {
    const raw = `# 无头信息的技术长文

这是正文的第一段，介绍了事件循环机制。

这是第二段。`
    const result = parseMarkdownFile('event-loop.md', raw)
    expect(result.title).toBe('无头信息的技术长文')
    expect(result.excerpt).toContain('这是正文的第一段')
    expect(result.category).toBe('tech')
    expect(result.status).toBe('draft')
    expect(result.platforms).toEqual(['website'])
    expect(result.hasFrontmatter).toBe(false)
  })

  it('连首级标题都没有时，降级使用文件名作为标题', () => {
    const raw = `直接写正文内容，没有 markdown 标题。`
    const result = parseMarkdownFile('quick-notes.md', raw)
    expect(result.title).toBe('quick-notes')
    expect(result.category).toBe('tech')
    expect(result.status).toBe('draft')
  })
})
