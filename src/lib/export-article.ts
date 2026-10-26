import { type Article } from '@/features/articles/data/schema'
import { markdownToWeChatHtml } from './wechat-formatter'

/**
 * 将 Article 对象转换为带 YAML Frontmatter 的标准 Markdown 文本
 */
export function generateArticleMarkdown(article: Article): string {
  const dateStr = article.createdAt
    ? new Date(article.createdAt).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  const tagsYaml =
    article.tags && article.tags.length > 0
      ? `tags:\n${article.tags.map((t) => `  - ${JSON.stringify(t)}`).join('\n')}`
      : 'tags: []'

  const platformsYaml =
    article.platforms && article.platforms.length > 0
      ? `platforms:\n${article.platforms.map((p) => `  - ${JSON.stringify(p)}`).join('\n')}`
      : 'platforms: []'

  const frontmatter = [
    '---',
    `title: ${JSON.stringify(article.title)}`,
    `category: ${JSON.stringify(article.category)}`,
    `status: ${JSON.stringify(article.status)}`,
    `date: ${JSON.stringify(dateStr)}`,
    tagsYaml,
    platformsYaml,
    '---',
  ].join('\n')

  const body = (article.content || article.excerpt || '').trim()

  return `${frontmatter}\n\n# ${article.title}\n\n${body}\n`
}

/**
 * 在浏览器中触发文件下载
 */
export function downloadFile(
  filename: string,
  content: string,
  mimeType = 'text/markdown;charset=utf-8;'
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

/**
 * 导出单篇文章为 .md 文件
 */
export function exportArticleAsMarkdown(article: Article): void {
  const mdContent = generateArticleMarkdown(article)
  const safeTitle = article.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 50)
  const filename = `${safeTitle || article.id}.md`
  downloadFile(filename, mdContent)
}

/**
 * 批量导出多篇文章为 .md 文件
 * 采用小延迟下载，避免浏览器弹窗拦截
 */
export async function exportArticlesAsMarkdown(
  articles: Article[]
): Promise<void> {
  for (let i = 0; i < articles.length; i++) {
    exportArticleAsMarkdown(articles[i])
    if (i < articles.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
}

/**
 * 打印文章或保存为 PDF (通过隐藏 iframe 打开独立排版的打印窗口)
 */
export function printArticle(article: Article): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const contentHtml = markdownToWeChatHtml(
    article.content || article.excerpt || '',
    'wechat'
  )

  const dateStr = article.createdAt
    ? new Date(article.createdAt).toLocaleDateString('zh-CN')
    : ''

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.top = '-9999px'
  iframe.style.left = '-9999px'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'

  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) {
    document.body.removeChild(iframe)
    return
  }

  doc.open()
  doc.write(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${article.title}</title>
  <style>
    @page {
      margin: 18mm 15mm;
      size: A4 portrait;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      color: #1f2937;
      line-height: 1.7;
      margin: 0;
      padding: 20px;
    }
    .print-header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid #e5e7eb;
    }
    .print-title {
      font-size: 24px;
      font-weight: bold;
      color: #111827;
      margin: 0 0 10px 0;
    }
    .print-meta {
      font-size: 13px;
      color: #6b7280;
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
    }
    .print-meta span {
      display: inline-flex;
      align-items: center;
    }
    .print-tags {
      margin-top: 8px;
      display: flex;
      gap: 6px;
    }
    .tag-badge {
      display: inline-block;
      padding: 2px 8px;
      font-size: 11px;
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      color: #4b5563;
    }
    pre, blockquote {
      page-break-inside: avoid;
    }
    h1, h2, h3 {
      page-break-after: avoid;
    }
  </style>
</head>
<body>
  <div class="print-header">
    <h1 class="print-title">${article.title}</h1>
    <div class="print-meta">
      <span>分类: ${article.category}</span>
      <span>状态: ${article.status}</span>
      ${dateStr ? `<span>创建日期: ${dateStr}</span>` : ''}
      ${article.platforms?.length ? `<span>发布渠道: ${article.platforms.join(', ')}</span>` : ''}
    </div>
    ${
      article.tags && article.tags.length > 0
        ? `<div class="print-tags">${article.tags.map((t) => `<span class="tag-badge">#${t}</span>`).join('')}</div>`
        : ''
    }
  </div>
  <div class="print-content">
    ${contentHtml}
  </div>
</body>
</html>
  `)
  doc.close()

  iframe.contentWindow?.focus()
  setTimeout(() => {
    iframe.contentWindow?.print()
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe)
      }
    }, 1000)
  }, 250)
}
