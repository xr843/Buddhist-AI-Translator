/**
 * 慧译通 - Cloudflare Worker API 代理
 *
 * 功能：
 * 1. 将 DeepSeek API 密钥安全存储在服务端（Cloudflare Secrets）
 * 2. 前端不再需要暴露 API 密钥
 * 3. 支持 CORS，允许 GitHub Pages 跨域调用
 * 4. 内置速率限制，防止滥用
 *
 * 部署步骤：
 * 1. npm install -g wrangler
 * 2. wrangler login
 * 3. cd worker && wrangler deploy
 * 4. wrangler secret put DEEPSEEK_API_KEY  （输入你的 DeepSeek API 密钥）
 * 5. 将 Worker URL 填入前端 src/config.js 的 proxyURL
 */

// 允许的来源域名（防止非授权网站调用）
const ALLOWED_ORIGINS = [
    'https://xr843.github.io',
    'http://localhost',
    'http://127.0.0.1'
];

// 速率限制配置（基于 IP，每分钟最大请求数）
const RATE_LIMIT_PER_MINUTE = 30;

export default {
    async fetch(request, env) {
        // 处理 CORS 预检请求
        if (request.method === 'OPTIONS') {
            return handleCORS(request);
        }

        // 验证来源
        const origin = request.headers.get('Origin') || '';
        if (!isAllowedOrigin(origin)) {
            return new Response(JSON.stringify({ error: '未授权的来源' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const url = new URL(request.url);

        // 健康检查
        if (url.pathname === '/' || url.pathname === '/health') {
            return jsonResponse({ status: 'ok', service: '慧译通 API 代理' }, origin);
        }

        // 翻译接口
        if (url.pathname === '/translate' && request.method === 'POST') {
            return handleTranslate(request, env, origin);
        }

        return jsonResponse({ error: '未知路径' }, origin, 404);
    }
};

async function handleTranslate(request, env, origin) {
    // 检查 API 密钥是否已配置
    if (!env.DEEPSEEK_API_KEY) {
        return jsonResponse({ error: '服务端 API 密钥未配置' }, origin, 500);
    }

    // 速率限制（使用 Cloudflare KV 或简单的内存限制）
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateLimitResult = await checkRateLimit(env, clientIP);
    if (!rateLimitResult.allowed) {
        return jsonResponse(
            { error: `请求过于频繁，请 ${rateLimitResult.retryAfter} 秒后重试` },
            origin,
            429
        );
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: '请求体格式错误' }, origin, 400);
    }

    const { text, prompt } = body;

    if (!text || !prompt) {
        return jsonResponse({ error: '缺少必要参数: text, prompt' }, origin, 400);
    }

    // 输入长度限制
    if (text.length > 5000) {
        return jsonResponse({ error: '文本长度超过限制 (5000字符)' }, origin, 400);
    }

    try {
        const deepseekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: '你是佛教文献翻译专家，提供准确、简洁的翻译。' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 800,
                top_p: 0.9,
                stream: false
            })
        });

        if (!deepseekResponse.ok) {
            const errorData = await deepseekResponse.json().catch(() => ({}));
            return jsonResponse(
                { error: `DeepSeek API 错误: ${deepseekResponse.status} ${errorData.error?.message || ''}` },
                origin,
                deepseekResponse.status
            );
        }

        const data = await deepseekResponse.json();

        if (!data.choices?.[0]?.message?.content) {
            return jsonResponse({ error: 'API 返回数据格式异常' }, origin, 502);
        }

        const translation = data.choices[0].message.content.trim();

        return jsonResponse({
            translation,
            usage: data.usage || null
        }, origin);

    } catch (error) {
        return jsonResponse({ error: '代理请求失败: ' + error.message }, origin, 502);
    }
}

// --- 工具函数 ---

function isAllowedOrigin(origin) {
    return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));
}

function handleCORS(request) {
    const origin = request.headers.get('Origin') || '';
    const headers = {
        'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : '',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
    };
    return new Response(null, { status: 204, headers });
}

function jsonResponse(data, origin, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : '',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'X-Content-Type-Options': 'nosniff'
        }
    });
}

// 简易速率限制（基于 KV，如未绑定 KV 则跳过）
async function checkRateLimit(env, clientIP) {
    if (!env.RATE_LIMIT_KV) {
        return { allowed: true };
    }

    const key = `rate:${clientIP}`;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - 60;

    try {
        const existing = await env.RATE_LIMIT_KV.get(key, { type: 'json' });
        const requests = existing ? existing.filter(ts => ts > windowStart) : [];

        if (requests.length >= RATE_LIMIT_PER_MINUTE) {
            const oldestInWindow = Math.min(...requests);
            const retryAfter = 60 - (now - oldestInWindow);
            return { allowed: false, retryAfter: Math.max(1, retryAfter) };
        }

        requests.push(now);
        await env.RATE_LIMIT_KV.put(key, JSON.stringify(requests), { expirationTtl: 120 });
        return { allowed: true };
    } catch {
        // KV 操作失败时放行
        return { allowed: true };
    }
}
