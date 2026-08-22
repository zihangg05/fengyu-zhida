// 风语智答 · 化验单视觉解读（独立 Cloudflare Worker）
// 站点前端托管在 GitHub Pages（纯静态，无服务端运行时），因此把"看懂化验单"的能力
// 单独拆成这个 Worker：前端把压缩后的化验单图片 POST 到本 Worker，
// 本 Worker 调用视觉大模型（OpenAI 兼容接口，可用腾讯混元等）做 OCR + 科普解读，
// 返回结构化 JSON。密钥仅留服务端（env），前端拿不到。
//
// 部署：wrangler deploy（见 wrangler.toml）。密钥用 `wrangler secret put` 注入，勿提交明文。
// 本地调试：wrangler dev（读取 .dev.vars）。

const DEFAULT_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT =
  "你是严谨的医学科普助手。严格按用户要求的 JSON 格式输出，不添加任何额外文字、不解释。";

const USER_PROMPT = `请阅读这张化验单图片，识别其中的检查项目并给出科普解读。
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

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  };
}

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

    const base = env.VISION_API_BASE || DEFAULT_BASE;
    const key = env.VISION_API_KEY || "";
    const model = env.VISION_MODEL || DEFAULT_MODEL;
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
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: USER_PROMPT },
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
  },
};
