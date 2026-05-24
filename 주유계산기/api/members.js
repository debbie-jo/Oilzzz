const {
  cleanName,
  normalizeSeconds,
  readBody,
  requireAdmin,
  sendJson,
  supabaseFetch,
} = require("./_lib/supabase");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const data = await supabaseFetch(
        res,
        "members?select=id,name,march_seconds,sort_order,updated_at&order=sort_order.asc,name.asc"
      );
      if (data !== undefined) sendJson(res, 200, { members: data });
      return;
    }

    if (!requireAdmin(req, res)) return;

    if (req.method === "POST") {
      const body = await readBody(req);
      const marchSeconds = normalizeSeconds(body.march_seconds);
      if (marchSeconds === null) {
        sendJson(res, 400, { error: "행군시간을 확인해주세요." });
        return;
      }

      const payload = {
        name: cleanName(body.name, "멤버"),
        march_seconds: marchSeconds,
        sort_order: normalizeSeconds(body.sort_order) || 0,
      };

      const data = await supabaseFetch(res, "members", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
      if (data !== undefined) sendJson(res, 201, { member: data[0] });
      return;
    }

    if (req.method === "PUT") {
      const body = await readBody(req);
      if (!body.id) {
        sendJson(res, 400, { error: "수정할 멤버를 찾을 수 없습니다." });
        return;
      }

      const marchSeconds = normalizeSeconds(body.march_seconds);
      if (marchSeconds === null) {
        sendJson(res, 400, { error: "행군시간을 확인해주세요." });
        return;
      }

      const payload = {
        name: cleanName(body.name, "멤버"),
        march_seconds: marchSeconds,
        sort_order: normalizeSeconds(body.sort_order) || 0,
      };

      const data = await supabaseFetch(res, `members?id=eq.${encodeURIComponent(body.id)}`, {
        method: "PATCH",
        headers: { prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
      if (data !== undefined) sendJson(res, 200, { member: data[0] });
      return;
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url, "http://localhost");
      const id = url.searchParams.get("id");
      if (!id) {
        sendJson(res, 400, { error: "삭제할 멤버를 찾을 수 없습니다." });
        return;
      }

      const data = await supabaseFetch(res, `members?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (data !== undefined) sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, { error: "지원하지 않는 요청입니다." });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "요청 처리 중 문제가 생겼습니다." });
  }
};
