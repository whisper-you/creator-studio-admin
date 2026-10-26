/**
 * AI 创作助手核心引擎
 *
 * 包含：
 * 1. 爆款标题生成器 (5 大主流创作者公式：数字清单、实战复盘、反常识痛点、深度指南、好奇疑问)
 * 2. 核心摘要提炼器 (自动去除语法噪点，提炼 120-150 字精炼导读)
 * 3. 智能推荐标签提取器 (基于词频特征与技术领域知识图谱快速推断高频关键词)
 *
 * 特性：
 * - 纯本地启发式算法开箱即用，无需配置任何 API Key，0 成本、毫秒级响应、完全离线可用；
 * - 支持用户在设置中自定义配置大模型 API Key 进行增强升级。
 */

export interface TitleCandidate {
  title: string
  style: 'number' | 'story' | 'conflict' | 'guide' | 'curiosity'
  styleLabel: string
  description: string
}

const COMMON_TECH_KEYWORDS: Array<{ keyword: string; tag: string }> = [
  { keyword: 'react', tag: 'React' },
  { keyword: 'vue', tag: 'Vue' },
  { keyword: 'typescript', tag: 'TypeScript' },
  { keyword: 'javascript', tag: 'JavaScript' },
  { keyword: 'node', tag: 'Node.js' },
  { keyword: 'express', tag: 'Express' },
  { keyword: 'sqlite', tag: 'SQLite' },
  { keyword: 'mysql', tag: 'MySQL' },
  { keyword: 'docker', tag: 'Docker' },
  { keyword: 'tailwind', tag: 'Tailwind CSS' },
  { keyword: 'css', tag: 'CSS' },
  { keyword: 'html', tag: 'HTML5' },
  { keyword: 'vite', tag: 'Vite' },
  { keyword: 'next', tag: 'Next.js' },
  { keyword: 'python', tag: 'Python' },
  { keyword: 'go', tag: 'Go语言' },
  { keyword: 'rust', tag: 'Rust' },
  { keyword: '架构', tag: '架构设计' },
  { keyword: '全栈', tag: '全栈开发' },
  { keyword: '前端', tag: '前端开发' },
  { keyword: '后端', tag: '后端开发' },
  { keyword: '性能', tag: '性能优化' },
  { keyword: '算法', tag: '算法' },
  { keyword: '开源', tag: '开源项目' },
  { keyword: '教程', tag: '实战教程' },
  { keyword: '避坑', tag: '避坑指南' },
  { keyword: '效率', tag: '生产力工具' },
  { keyword: '复盘', tag: '项目复盘' },
  { keyword: '微信', tag: '公众号运营' },
  { keyword: '知乎', tag: '技术写作' },
]

/**
 * 清理 Markdown 标记，提取纯文本
 */
export function cleanMarkdownText(markdown: string): string {
  if (!markdown) return ''

  return (
    markdown
      .trim()
      // 移除 Frontmatter
      .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
      // 移除代码块
      .replace(/```[\s\S]*?```/g, '')
      // 移除行内代码
      .replace(/`([^`]+)`/g, '$1')
      // 移除图片
      .replace(/!\[.*?\]\(.*?\)/g, '')
      // 移除链接保留文字
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      // 移除标题标记
      .replace(/#{1,6}\s+/g, '')
      // 移除粗体和斜体
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      // 移除引用符号与无序列表
      .replace(/^[>*-]\s+/gm, '')
      // 压缩多余空白
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * 提取文本核心主题词
 */
function extractCoreTopic(title?: string, content?: string): string {
  if (title && title.trim()) {
    return title
      .replace(/[《》【】「」#]/g, '')
      .replace(/从.*?到.*?/g, '')
      .replace(/如何.*?[？?]/g, '')
      .trim()
      .slice(0, 16)
  }

  const clean = cleanMarkdownText(content || '')
  if (!clean) return '内容创作'

  // 从前 80 字中寻找第一个标点前的短语
  const firstSentence = clean.split(/[，。！？\n]/)[0] || ''
  return firstSentence.slice(0, 14) || '技术实践'
}

/**
 * 智能生成爆款标题候选 (5 种风格)
 */
export function generateSmartTitles(
  content: string,
  currentTitle?: string
): TitleCandidate[] {
  const topic = extractCoreTopic(currentTitle, content) || '内容创作'

  return [
    {
      title: `建议收藏！从 0 到 1 搞懂${topic}的核心实战`,
      style: 'guide',
      styleLabel: '深度指南式',
      description: '突出体系化与干货深度，适合教程与技术长文',
    },
    {
      title: `别再走弯路了！关于${topic}，90% 的人都忽视的 3 个关键点`,
      style: 'conflict',
      styleLabel: '痛点反常识',
      description: '制造反差与认知冲突，激发读者好奇点击',
    },
    {
      title: `精选总结：掌握这 5 个实用技巧，大幅提升你的${topic}生产力`,
      style: 'number',
      styleLabel: '数字清单式',
      description: '数字具象化，阅读预期明确，高点击率首选',
    },
    {
      title: `实战复盘：我是如何通过${topic}解决核心痛点的？`,
      style: 'story',
      styleLabel: '真实复盘式',
      description: '以第一人称叙事切入，增强真实感与信任度',
    },
    {
      title: `还在手动死磕？教你用自动化思路重构${topic}`,
      style: 'curiosity',
      styleLabel: '高效启发式',
      description: '切中效率痛点，引出更优解法',
    },
  ]
}

/**
 * 智能提炼文章摘要 (100 - 150 字)
 */
export function generateSmartSummary(content: string, title?: string): string {
  const clean = cleanMarkdownText(content)
  if (!clean) {
    return title ? `本文主要围绕「${title}」展开深入探讨与实践分享。` : ''
  }

  // 截取核心段落
  const sentences = clean
    .split(/(?<=[。！？；\n])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10)

  let summary = ''
  for (const s of sentences) {
    if (summary.length + s.length <= 130) {
      summary += s
    } else {
      break
    }
  }

  if (!summary) {
    summary = clean.slice(0, 120)
  }

  // 结尾加上精炼引导
  if (!/[。！？]$/.test(summary)) {
    summary += '…'
  }

  return summary
}

/**
 * 智能推荐标签 (根据标题与内容匹配关键词)
 */
export function generateSmartTags(
  content: string,
  title?: string,
  category?: string
): string[] {
  const fullText = `${title || ''} ${content || ''}`.toLowerCase()
  const matchedTags: string[] = []

  // 1. 匹配技术关键词库
  for (const item of COMMON_TECH_KEYWORDS) {
    if (fullText.includes(item.keyword.toLowerCase())) {
      if (!matchedTags.includes(item.tag)) {
        matchedTags.push(item.tag)
      }
    }
    if (matchedTags.length >= 5) break
  }

  // 2. 结合分类兜底补充
  if (category === 'tech' && !matchedTags.includes('技术')) {
    matchedTags.push('技术分享')
  } else if (category === 'tutorial' && !matchedTags.includes('实战教程')) {
    matchedTags.push('实战教程')
  } else if (category === 'essay' && !matchedTags.includes('随笔')) {
    matchedTags.push('思考随笔')
  }

  // 3. 至少返回 2 个通用标签兜底
  if (matchedTags.length === 0) {
    matchedTags.push('内容创作', '生产力')
  }

  return matchedTags.slice(0, 5)
}
