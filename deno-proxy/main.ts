// Deno Deploy CORS 代理 —— 转发到 ciyuanapi 并补全 CORS 头
// 部署: console.deno.com -> New Project -> 粘贴本代码 -> Deploy
// 解决: ciyuanapi 返回 Access-Control-Allow-Headers: * 通配符，
//       Chrome 97+ 不认通配符覆盖 authorization -> 浏览器直连必挂
// 部署后得到 https://xxx.deno.dev，在页面设置里把 API URL 填成它即可
const TARGET = 'https://code.ciyuanapi.xyz';

function corsHeaders(req) {
  const origin = req.headers.get('origin') || '';
  const allowOrigin = origin.startsWith('https://') ? origin : '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-request-id, api-key, openai-organization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // 预检请求直接放行
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  // 构造目标地址：/v1/xxx -> TARGET/v1/xxx
  const targetUrl = TARGET + url.pathname + url.search;

  // 复制请求头（去掉浏览器头）
  const headers = new Headers(req.headers);
  headers.delete('origin');
  headers.delete('host');
  headers.set('Host', new URL(TARGET).host);

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      redirect: 'follow',
    });

    // 复制上游响应并补 CORS 头
    const respHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(corsHeaders(req))) {
      respHeaders.set(k, v);
    }
    respHeaders.delete('content-security-policy');
    respHeaders.delete('x-frame-options');

    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: { message: '代理转发失败: ' + e.message } }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
    );
  }
});
