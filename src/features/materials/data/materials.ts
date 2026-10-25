type Material = {
  name: string
  type: '标题公式' | '封面模板' | '话题灵感' | '数据报告'
  scene: string
  usage: number
  status: 'active' | 'updating' | 'deprecated'
}

export const materials: Material[] = [
  {
    name: '数字冲突式标题公式',
    type: '标题公式',
    scene: '技术干货类文章起标题',
    usage: 42,
    status: 'active',
  },
  {
    name: '「我如何用 X 做 Y」叙事标题',
    type: '标题公式',
    scene: '教程与复盘类内容',
    usage: 31,
    status: 'active',
  },
  {
    name: '疑问句钩子标题公式',
    type: '标题公式',
    scene: '观点与随笔类内容',
    usage: 18,
    status: 'active',
  },
  {
    name: '极简白底封面模板',
    type: '封面模板',
    scene: '知乎 / 掘金技术文章',
    usage: 27,
    status: 'active',
  },
  {
    name: '大字报风格封面(3:4)',
    type: '封面模板',
    scene: '小红书图文笔记',
    usage: 22,
    status: 'active',
  },
  {
    name: '公众号首图模板(2.35:1)',
    type: '封面模板',
    scene: '微信公众号推文',
    usage: 35,
    status: 'updating',
  },
  {
    name: '2026 Q4 创作者选题日历',
    type: '话题灵感',
    scene: '月度选题会',
    usage: 9,
    status: 'active',
  },
  {
    name: 'AI 工具评测选题清单',
    type: '话题灵感',
    scene: '科技类内容批量产出',
    usage: 14,
    status: 'active',
  },
  {
    name: '独立开发者访谈问题库',
    type: '话题灵感',
    scene: '访谈栏目',
    usage: 6,
    status: 'active',
  },
  {
    name: '10 月各平台流量报告',
    type: '数据报告',
    scene: '复盘与策略调整',
    usage: 11,
    status: 'active',
  },
  {
    name: '2025 全年创作数据年报',
    type: '数据报告',
    scene: '年度总结',
    usage: 4,
    status: 'deprecated',
  },
  {
    name: '爆款拆解:30 篇 10w+ 分析',
    type: '数据报告',
    scene: '新人培训',
    usage: 16,
    status: 'updating',
  },
]
