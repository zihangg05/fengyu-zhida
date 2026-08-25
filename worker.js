// 风语智答 · Cloudflare Worker（化验单视觉解读 + 豆包大模型智能问答）
// 站点前端托管在 GitHub Pages（纯静态，无服务端运行时），因此把需要密钥的能力
// 单独拆成这个 Worker：
//   POST /api/interpret  —— 前端把压缩后的化验单图片 POST 过来，调用视觉大模型
//                            （OpenAI 兼容接口，可用腾讯混元等）做 OCR + 科普解读，
//                            返回结构化 JSON。
//   POST /api/chat       —— 前端把用户提问 POST 过来，调用豆包大模型（火山引擎 Ark，
//                            OpenAI 兼容）返回科普回答。
// 密钥仅留服务端（env），前端拿不到。
//
// 部署：wrangler deploy（见 wrangler.toml）。密钥用 `wrangler secret put` 注入，勿提交明文。
// 本地调试：wrangler dev（读取 .dev.vars）。

/* ===================== 常量与默认值 ===================== */

const DEFAULT_VISION_BASE = "https://api.openai.com/v1";
const DEFAULT_VISION_MODEL = "gpt-4o-mini";

// 豆包大模型（火山引擎方舟 Ark），OpenAI 兼容接口
const DEFAULT_CHAT_BASE = "https://ark.cn-beijing.volces.com/api/v3";
// CHAT_MODEL 需在环境变量中配置为「推理接入点 ID」（ep-xxxxxxxxxxxx-xxxxx），
// 在 Ark 控制台创建模型接入点后获得，这里不设默认值以避免误用。

const VISION_SYSTEM_PROMPT =
  "你是严谨的医学科普助手。严格按用户要求的 JSON 格式输出，不添加任何额外文字、不解释。";

const VISION_USER_PROMPT = `请阅读这张化验单图片，识别其中的检查项目并给出科普解读。
要求：
1. 仅做科普参考，不做诊断、不开药、不给剂量；明确标注"仅供参考，请结合临床由医师判断"。
2. 对能识别的项目输出：指标名、结果值、单位、参考范围、状态（偏高 high / 偏低 low / 正常 normal / 未知 unknown）、一句通俗解读。
3. 无法识别或存疑的项目，status 标为 unknown，并在 note 中说明原因。
4. 只输出如下 JSON，不要 Markdown、不要额外文字：
{
  "summary": "一句话总体印象",
  "metrics": [
    {"name":"指标名","value":"结果值","unit":"单位","range":"参考范围","status":"high|low|normal|unknown","note":"通俗解读"}
  ],
  "disclaimer": "本解读仅供科普参考，不能替代医师面诊与诊断，请以纸质报告与专科医师意见为准。"
}`;

// 豆包问答系统提示词：约束为风湿免疫病科普，严守医疗安全红线
const CHAT_SYSTEM_PROMPT = `你是"风语智答"科普助手，面向大众提供风湿免疫病相关的健康科普参考。
请严格遵守以下规则：
1. 仅做健康科普知识讲解，不做诊断、不开处方、不给具体用药剂量、不建议停药或替代正规治疗、不对个人病情下结论。
2. 当用户要求诊断、开药、调整剂量、判断自己得了什么病、询问紧急症状怎么办时，礼貌拒绝并建议前往正规医院风湿免疫科就诊，急症提示拨打 120。
3. 回答通俗易懂，避免堆砌专业术语；涉及检验指标时说明其一般临床意义，不针对个人结果做判断。
4. 回答使用纯文本，段落之间用空行分隔，不使用 Markdown 格式。
5. 每次回答末尾自然附上一句免责声明："以上内容仅为科普参考，不能替代医师面诊，具体诊疗请遵医嘱。"`;

/* ===================== 工具函数 ===================== */

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  };
}

/* ===================== 路由 1：化验单视觉解读 ===================== */

async function handleInterpret(request, env, headers) {
  // 解析请求体
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "请求体不是合法 JSON" }), { status: 400, headers });
  }

  const image = body && body.image;
  if (!image || typeof image !== "string" || image.indexOf("data:image") !== 0) {
    return new Response(
      JSON.stringify({ error: "缺少合法的 image 字段（应为 data:image/...;base64,...）" }),
      { status: 400, headers }
    );
  }

  const base = env.VISION_API_BASE || DEFAULT_VISION_BASE;
  const key = env.VISION_API_KEY || "";
  const model = env.VISION_MODEL || DEFAULT_VISION_MODEL;
  if (!key) {
    return new Response(
      JSON.stringify({
        error: "服务端未配置 VISION_API_KEY，请在部署平台设置该密钥（wrangler secret put VISION_API_KEY）",
      }),
      { status: 500, headers }
    );
  }

  // 调用视觉模型
  let upstream;
  try {
    upstream = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: VISION_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: VISION_USER_PROMPT },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
      }),
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "调用视觉模型失败：" + (e && e.message) }),
      { status: 502, headers }
    );
  }

  if (!upstream.ok) {
    const txt = await upstream.text().catch(function () { return ""; });
    return new Response(
      JSON.stringify({ error: "视觉模型返回错误：" + txt.slice(0, 300) }),
      { status: 502, headers }
    );
  }

  let data;
  try {
    data = await upstream.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "视觉模型返回非 JSON" }), { status: 502, headers });
  }

  const content =
    data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) {
    return new Response(JSON.stringify({ error: "视觉模型未返回内容" }), { status: 502, headers });
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "模型返回无法解析为 JSON", raw: content.slice(0, 500) }),
      { status: 502, headers }
    );
  }

  // 兜底字段，保证前端结构稳定
  parsed.metrics = Array.isArray(parsed.metrics) ? parsed.metrics : [];
  parsed.summary = parsed.summary || "";
  parsed.disclaimer =
    parsed.disclaimer || "本解读仅供科普参考，不能替代医师面诊与诊断。";

  return new Response(JSON.stringify(parsed), { status: 200, headers });
}

/* ===================== 路由 2：豆包大模型智能问答 ===================== */

async function handleChat(request, env, headers) {
  // 解析请求体
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "请求体不是合法 JSON" }), { status: 400, headers });
  }

  const message = body && body.message;
  if (!message || typeof message !== "string" || !message.trim()) {
    return new Response(
      JSON.stringify({ error: "缺少 message 字段（非空字符串）" }),
      { status: 400, headers }
    );
  }

  const base = env.CHAT_API_BASE || DEFAULT_CHAT_BASE;
  const key = env.CHAT_API_KEY || "";
  const model = env.CHAT_MODEL || "";
  if (!key || !model) {
    return new Response(
      JSON.stringify({
        error: "服务端未配置问答模型，请设置 CHAT_API_KEY 和 CHAT_MODEL（推理接入点 ID）",
      }),
      { status: 500, headers }
    );
  }

  // 调用豆包大模型（OpenAI 兼容）
  let upstream;
  try {
    upstream = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          { role: "system", content: CHAT_SYSTEM_PROMPT },
          { role: "user", content: message.trim() },
        ],
      }),
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "调用豆包大模型失败：" + (e && e.message) }),
      { status: 502, headers }
    );
  }

  if (!upstream.ok) {
    const txt = await upstream.text().catch(function () { return ""; });
    return new Response(
      JSON.stringify({ error: "豆包大模型返回错误：" + txt.slice(0, 300) }),
      { status: 502, headers }
    );
  }

  let data;
  try {
    data = await upstream.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "豆包大模型返回非 JSON" }), { status: 502, headers });
  }

  const reply =
    data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!reply) {
    return new Response(JSON.stringify({ error: "豆包大模型未返回内容" }), { status: 502, headers });
  }

  return new Response(JSON.stringify({ reply: String(reply) }), { status: 200, headers });
}

/* ===================== 入口：路由分发 ===================== */

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    const headers = corsHeaders(origin);

    // 预检
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "仅支持 POST 方法" }), { status: 405, headers });
    }

    // 按路径路由（兼容 Workers 自定义域名 / workers.dev 子路径）
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    if (path === "/api/interpret" || path.endsWith("/api/interpret")) {
      return handleInterpret(request, env, headers);
    }
    if (path === "/api/chat" || path.endsWith("/api/chat")) {
      return handleChat(request, env, headers);
    }

    return new Response(
      JSON.stringify({ error: "未知接口路径，可用：/api/interpret、/api/chat" }),
      { status: 404, headers }
    );
  },
};
