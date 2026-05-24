const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

function sendJson(res, status, body) {
  res.statusCode = status;
  Object.entries(jsonHeaders).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(body));
}

function requireConfig(res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    sendJson(res, 500, {
      error: "Supabase 환경 변수가 설정되지 않았습니다.",
      details: "SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 Vercel 환경 변수에 추가하세요.",
    });
    return null;
  }

  return { url: url.replace(/\/$/, ""), key };
}

function requireAdmin(req, res) {
  const expected = process.env.ADMIN_PASSWORD;
  const received = req.headers["x-admin-password"];

  if (!expected) {
    sendJson(res, 500, {
      error: "관리자 비밀번호 환경 변수가 설정되지 않았습니다.",
      details: "ADMIN_PASSWORD를 Vercel 환경 변수에 추가하세요.",
    });
    return false;
  }

  if (received !== expected) {
    sendJson(res, 401, { error: "관리자 비밀번호가 올바르지 않습니다." });
    return false;
  }

  return true;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("요청 내용을 읽을 수 없습니다.");
    error.statusCode = 400;
    throw error;
  }
}

async function supabaseFetch(res, path, options = {}) {
  const config = requireConfig(res);
  if (!config) return undefined;

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
      ...jsonHeaders,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    sendJson(res, response.status, {
      error: "Supabase 요청에 실패했습니다.",
      details: data,
    });
    return undefined;
  }

  return data ?? true;
}

function normalizeSeconds(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function cleanName(value, fallback = "집결") {
  const name = String(value || "").trim();
  return name || fallback;
}

module.exports = {
  cleanName,
  normalizeSeconds,
  readBody,
  requireAdmin,
  sendJson,
  supabaseFetch,
};
