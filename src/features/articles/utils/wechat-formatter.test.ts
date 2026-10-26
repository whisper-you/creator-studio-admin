import { describe, expect, it } from 'vitest'
import { markdownToWeChatHtml } from './wechat-formatter'

describe('markdownToWeChatHtml', () => {
  it('正确将 Markdown 标题转换为带有内嵌样式的 HTML', () => {
    const md = '# 主标题\n## 二级标题\n### 三级标题'
    const html = markdownToWeChatHtml(md, 'wechat')
    expect(html).toContain('<h1 style=')
    expect(html).toContain('color: #07c160')
    expect(html).toContain('<h2 style=')
    expect(html).toContain('<h3 style=')
    expect(html).toContain('主标题')
    expect(html).toContain('二级标题')
  })

  it('正确支持知乎蓝色主题', () => {
    const md = '## 知乎专栏测试'
    const html = markdownToWeChatHtml(md, 'zhihu')
    expect(html).toContain('color: #0066ff')
  })

  it('正确解析代码块与行内代码', () => {
    const md =
      '这里有 `const a = 1` 行内代码\n\n```js\nconsole.log("hello world")\n```'
    const html = markdownToWeChatHtml(md)
    expect(html).toContain('<code style="background-color: #f3f4f6')
    expect(html).toContain('console.log(&quot;hello world&quot;)')
    expect(html).toContain('background: #282c34')
  })

  it('正确解析引用块与列表', () => {
    const md = '> 这是一段引用提示\n\n- 列表项 1\n- 列表项 2'
    const html = markdownToWeChatHtml(md)
    expect(html).toContain('<blockquote style=')
    expect(html).toContain('这是一段引用提示')
    expect(html).toContain('<ul style=')
    expect(html).toContain('<li style=')
    expect(html).toContain('列表项 1')
  })
})
