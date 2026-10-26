import { db } from '../db/index.js'
import { validateWebhookUrl } from './webhook-url.js'

/**
 * 将文章分发至指定或已绑定的发布渠道 (Webhook 推送 / 模拟通道)
 * @param {object} article
 * @param {string[] | null} specificChannels 显式指定渠道;为空时按分发场景自动选择
 * @param {{ autoPushOnly?: boolean }} options autoPushOnly 用于排期自动发布,只命开启自动推送的渠道
 */
export async function dispatchArticle(
  article,
  specificChannels = null,
  { autoPushOnly = false } = {}
) {
  if (!article) return []

  // 查询已绑定的渠道;自动发布场景额外过滤 auto_push 开关
  const channelSql = autoPushOnly
    ? 'SELECT * FROM channels WHERE connected = 1 AND auto_push = 1'
    : 'SELECT * FROM channels WHERE connected = 1'
  const allChannels = db.prepare(channelSql).all()
  const targetChannels =
    specificChannels && specificChannels.length > 0
      ? allChannels.filter((c) => specificChannels.includes(c.name))
      : allChannels

  const results = []
  const insertLog = db.prepare(`
    INSERT INTO distribution_logs
      (article_id, article_title, channel_name, target_url, status, response_code, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const channel of targetChannels) {
    const now = new Date().toISOString()
    const payload = {
      event: 'article.published',
      article: {
        id: article.id,
        title: article.title,
        excerpt: article.excerpt,
        content: article.content,
        tags: Array.isArray(article.tags)
          ? article.tags
          : JSON.parse(article.tags || '[]'),
        platforms: Array.isArray(article.platforms)
          ? article.platforms
          : JSON.parse(article.platforms || '[]'),
        publishedAt: article.publishedAt || now,
      },
      channel: channel.name,
      account: channel.account || null,
      timestamp: now,
    }

    const checkedUrl = validateWebhookUrl(channel.webhook_url)
    if (channel.webhook_url && channel.webhook_url.trim() && !checkedUrl.ok) {
      insertLog.run(
        article.id,
        article.title,
        channel.name,
        channel.webhook_url,
        'failed',
        400,
        checkedUrl.message,
        now
      )
      results.push({
        channel: channel.name,
        status: 'failed',
        responseCode: 400,
        message: checkedUrl.message,
      })
      continue
    }

    if (checkedUrl.url) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 6000)

        const res = await fetch(checkedUrl.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Creator-Studio-Dispatcher/1.0',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
          redirect: 'manual',
        })
        clearTimeout(timeoutId)

        const status = res.ok ? 'success' : 'failed'
        const message = res.ok
          ? `Webhook 推送成功 (HTTP ${res.status})`
          : `Webhook 返回异常 (HTTP ${res.status})`

        insertLog.run(
          article.id,
          article.title,
          channel.name,
          checkedUrl.url,
          status,
          res.status,
          message,
          now
        )
        results.push({
          channel: channel.name,
          status,
          responseCode: res.status,
          message,
        })
      } catch (err) {
        const errorMsg =
          err.name === 'AbortError'
            ? '请求超时 (6s)'
            : err.message || '网络连接失败'
        insertLog.run(
          article.id,
          article.title,
          channel.name,
          checkedUrl.url,
          'failed',
          504,
          errorMsg,
          now
        )
        results.push({
          channel: channel.name,
          status: 'failed',
          responseCode: 504,
          message: errorMsg,
        })
      }
    } else {
      // 模拟分发：开箱即用，无需外部网络配置
      const message = `已完成排版数据推送至「${channel.name}」`
      insertLog.run(
        article.id,
        article.title,
        channel.name,
        'simulated://channel-worker',
        'simulated',
        200,
        message,
        now
      )
      results.push({
        channel: channel.name,
        status: 'simulated',
        responseCode: 200,
        message,
      })
    }
  }

  return results
}

/**
 * 测试特定渠道 Webhook 连通性
 */
export async function testWebhook(channelName, webhookUrl) {
  const now = new Date().toISOString()
  const checked = validateWebhookUrl(webhookUrl)
  if (!checked.ok) {
    return {
      ok: false,
      status: 'failed',
      statusCode: 400,
      message: checked.message,
      timestamp: now,
    }
  }
  if (!checked.url) {
    return {
      ok: true,
      status: 'simulated',
      message: `模拟测试成功：渠道「${channelName}」通道就绪`,
      timestamp: now,
    }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(checked.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Creator-Studio-Dispatcher/1.0',
      },
      body: JSON.stringify({
        event: 'webhook.ping',
        channel: channelName,
        message: 'Creator Studio Admin Webhook 连通性测试',
        timestamp: now,
      }),
      signal: controller.signal,
      redirect: 'manual',
    })
    clearTimeout(timeoutId)

    return {
      ok: res.ok,
      status: res.ok ? 'success' : 'failed',
      statusCode: res.status,
      message: res.ok
        ? `测试成功 (HTTP ${res.status})`
        : `目标返回异常 (HTTP ${res.status})`,
      timestamp: now,
    }
  } catch (err) {
    return {
      ok: false,
      status: 'failed',
      statusCode: 504,
      message:
        err.name === 'AbortError'
          ? '测试超时 (5s)'
          : err.message || '网络请求失败',
      timestamp: now,
    }
  }
}

/**
 * 查询最近分发日志
 */
export function getDistributionLogs(articleId = null, limit = 50) {
  if (articleId) {
    return db
      .prepare(
        'SELECT * FROM distribution_logs WHERE article_id = ? ORDER BY id DESC LIMIT ?'
      )
      .all(articleId, limit)
  }
  return db
    .prepare('SELECT * FROM distribution_logs ORDER BY id DESC LIMIT ?')
    .all(limit)
}
