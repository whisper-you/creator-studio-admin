export type FormatterTheme = 'wechat' | 'zhihu' | 'orange'

interface ThemeConfig {
  primary: string
  quoteBg: string
  quoteBorder: string
  codeBg: string
  codeColor: string
}

const THEMES: Record<FormatterTheme, ThemeConfig> = {
  wechat: {
    primary: '#07c160',
    quoteBg: '#f7faf8',
    quoteBorder: '#07c160',
    codeBg: '#282c34',
    codeColor: '#abb2bf',
  },
  zhihu: {
    primary: '#0066ff',
    quoteBg: '#f4f8ff',
    quoteBorder: '#0066ff',
    codeBg: '#282c34',
    codeColor: '#abb2bf',
  },
  orange: {
    primary: '#ff6a00',
    quoteBg: '#fffaf5',
    quoteBorder: '#ff6a00',
    codeBg: '#282c34',
    codeColor: '#abb2bf',
  },
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * 将 Markdown 转换为带内嵌 CSS 样式的 HTML。
 * 兼容微信公众平台富文本编辑器与知乎专栏，保证 Ctrl+V 粘贴时不丢失排版与代码高亮。
 */
export function markdownToWeChatHtml(
  markdown: string,
  themeName: FormatterTheme = 'wechat'
): string {
  const theme = THEMES[themeName] ?? THEMES.wechat

  // 1. 去除 Frontmatter
  const cleanMarkdown = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')

  // 2. 预提取并保护代码块
  const codeBlocks: string[] = []
  const textWithoutCode = cleanMarkdown.replace(
    /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g,
    (_, _lang, code) => {
      const idx = codeBlocks.length
      const escapedCode = escapeHtml(code.trimEnd())
      const preHtml = `
<pre style="margin: 16px 0; padding: 14px 16px; background: ${theme.codeBg}; color: ${theme.codeColor}; border-radius: 8px; font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace; font-size: 13px; line-height: 1.6; overflow-x: auto; box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);"><code style="font-family: inherit; color: inherit;">${escapedCode}</code></pre>`.trim()
      codeBlocks.push(preHtml)
      return `__CODE_BLOCK_${idx}__`
    }
  )

  const lines = textWithoutCode.split(/\r?\n/)
  const htmlParts: string[] = []
  let inList = false
  let listType: 'ul' | 'ol' = 'ul'
  let inBlockquote = false
  let quoteBuffer: string[] = []

  const flushBlockquote = () => {
    if (inBlockquote && quoteBuffer.length > 0) {
      const inner = quoteBuffer.join('<br>')
      htmlParts.push(
        `<blockquote style="margin: 16px 0; padding: 12px 16px; background-color: ${theme.quoteBg}; border-left: 4px solid ${theme.quoteBorder}; color: #555555; font-size: 14px; line-height: 1.8; border-radius: 0 6px 6px 0;">${inner}</blockquote>`
      )
      quoteBuffer = []
      inBlockquote = false
    }
  }

  const flushList = () => {
    if (inList) {
      htmlParts.push(`</${listType}>`)
      inList = false
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()

    // 空行处理
    if (!trimmed) {
      flushBlockquote()
      flushList()
      continue
    }

    // 代码块占位符
    if (trimmed.startsWith('__CODE_BLOCK_') && trimmed.endsWith('__')) {
      flushBlockquote()
      flushList()
      const idx = Number.parseInt(
        trimmed.replace(/__CODE_BLOCK_(\d+)__/, '$1'),
        10
      )
      if (!Number.isNaN(idx) && codeBlocks[idx]) {
        htmlParts.push(codeBlocks[idx])
      }
      continue
    }

    // 引用块 >
    if (trimmed.startsWith('>')) {
      flushList()
      inBlockquote = true
      const quoteText = trimmed.replace(/^>\s*/, '')
      quoteBuffer.push(formatInline(quoteText, theme))
      continue
    }
    flushBlockquote()

    // 标题 h1
    if (trimmed.startsWith('# ')) {
      flushList()
      const text = formatInline(trimmed.slice(2), theme)
      htmlParts.push(
        `<h1 style="margin: 28px 0 16px; padding-bottom: 6px; font-size: 21px; font-weight: 700; color: ${theme.primary}; border-bottom: 2px solid ${theme.primary}; display: inline-block; letter-spacing: 0.5px;">${text}</h1>`
      )
      continue
    }

    // 标题 h2
    if (trimmed.startsWith('## ')) {
      flushList()
      const text = formatInline(trimmed.slice(3), theme)
      htmlParts.push(
        `<h2 style="margin: 22px 0 12px; padding-left: 10px; font-size: 18px; font-weight: 700; color: ${theme.primary}; border-left: 4px solid ${theme.primary}; letter-spacing: 0.5px;">${text}</h2>`
      )
      continue
    }

    // 标题 h3
    if (trimmed.startsWith('### ')) {
      flushList()
      const text = formatInline(trimmed.slice(4), theme)
      htmlParts.push(
        `<h3 style="margin: 18px 0 10px; font-size: 16px; font-weight: 600; color: #222222; letter-spacing: 0.5px;">${text}</h3>`
      )
      continue
    }

    // 分割线 ---
    if (/^[-*_]{3,}$/.test(trimmed)) {
      flushList()
      htmlParts.push(
        `<hr style="border: none; border-top: 1px dashed #d1d5db; margin: 24px 0;" />`
      )
      continue
    }

    // 无序列表
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList || listType !== 'ul') {
        flushList()
        inList = true
        listType = 'ul'
        htmlParts.push(
          `<ul style="margin: 12px 0 12px 22px; padding: 0; line-height: 1.8; color: #333333; font-size: 15px;">`
        )
      }
      const itemText = formatInline(trimmed.slice(2), theme)
      htmlParts.push(`<li style="margin-bottom: 4px;">${itemText}</li>`)
      continue
    }

    // 有序列表
    const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        flushList()
        inList = true
        listType = 'ol'
        htmlParts.push(
          `<ol style="margin: 12px 0 12px 22px; padding: 0; line-height: 1.8; color: #333333; font-size: 15px;">`
        )
      }
      const itemText = formatInline(olMatch[2], theme)
      htmlParts.push(`<li style="margin-bottom: 4px;">${itemText}</li>`)
      continue
    }

    flushList()

    // 普通段落
    const paragraphText = formatInline(trimmed, theme)
    htmlParts.push(
      `<p style="margin: 14px 0; line-height: 1.8; color: #333333; font-size: 15px; letter-spacing: 0.5px; text-align: justify;">${paragraphText}</p>`
    )
  }

  flushBlockquote()
  flushList()

  return `
<section style="max-width: 677px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; font-size: 15px; color: #333333; line-height: 1.75; letter-spacing: 0.5px;">
  ${htmlParts.join('\n')}
</section>`.trim()
}

/** 处理行内元素:加粗、斜体、行内代码、链接 */
function formatInline(text: string, theme: ThemeConfig): string {
  let res = escapeHtml(text)

  // 行内代码 `code`
  res = res.replace(
    /`([^`]+)`/g,
    `<code style="background-color: #f3f4f6; color: #d63384; font-family: Consolas, Monaco, monospace; padding: 2px 6px; border-radius: 4px; font-size: 13.5px; margin: 0 2px;">$1</code>`
  )

  // 加粗 **bold** 或 __bold__
  res = res.replace(
    /(\*\*|__)(.*?)\1/g,
    `<strong style="font-weight: 700; color: #111111;">$2</strong>`
  )

  // 斜体 *italic*
  res = res.replace(/(\*|_)(.*?)\1/g, `<em>$2</em>`)

  // 链接 [text](url)
  res = res.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    `<a href="$2" target="_blank" style="color: ${theme.primary}; text-decoration: none; border-bottom: 1px dashed ${theme.primary};">$1</a>`
  )

  return res
}

/**
 * 写入系统剪贴板(富文本 + 纯文本双通道)
 */
export async function copyFormattedMarkdown(
  markdown: string,
  theme: FormatterTheme = 'wechat'
): Promise<boolean> {
  const html = markdownToWeChatHtml(markdown, theme)

  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const htmlBlob = new Blob([html], { type: 'text/html' })
      const textBlob = new Blob([markdown], { type: 'text/plain' })
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob,
        }),
      ])
      return true
    }

    // 浏览器备用方案
    const listener = (e: ClipboardEvent) => {
      e.preventDefault()
      e.clipboardData?.setData('text/html', html)
      e.clipboardData?.setData('text/plain', markdown)
    }
    document.addEventListener('copy', listener)
    document.execCommand('copy')
    document.removeEventListener('copy', listener)
    return true
  } catch (_err) {
    return false
  }
}
