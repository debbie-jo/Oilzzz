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
        "shared_rallies?select=id,name,rally_remaining_seconds,enemy_march_seconds,created_at,updated_at&order=created_at.desc"
      );
      if (data !== undefined) sendJson(res, 200, { rallies: data });
      return;
    }

    if (!requireAdmin(req, res)) return;

    if (req.method === "POST") {
      const body = await readBody(req);
      const rallyRemaining = normalizeSeconds(body.rally_remaining_seconds);
      const enemyMarch = normalizeSeconds(body.enemy_march_seconds);
      if (rallyRemaining === null || enemyMarch === null) {
        sendJson(res, 400, { error: "집결시간과 상대 행군시간을 확인해주세요." });
        return;
      }

      const payload = {
        name: cleanName(body.name, "공통 집결"),
        rally_remaining_seconds: rallyRemaining,
        enemy_march_seconds: enemyMarch,
      };

      const data = await supabaseFetch(res, "shared_rallies", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
      if (data !== undefined) sendJson(res, 201, { rally: data[0] });
      return;
    }

    if (req.method === "PUT") {
      const body = await readBody(req);
      if (!body.id) {
        sendJson(res, 400, { error: "수정할 집결을 찾을 수 없습니다." });
        return;
      }

      const rallyRemaining = normalizeSeconds(body.rally_remaining_seconds);
      const enemyMarch = normalizeSeconds(body.enemy_march_seconds);
      if (rallyRemaining === null || enemyMarch === null) {
        sendJson(res, 400, { error: "집결시간과 상대 행군시간을 확인해주세요." });
        return;
      }

      const payload = {
        name: cleanName(body.name, "공통 집결"),
        rally_remaining_seconds: rallyRemaining,
        enemy_march_seconds: enemyMarch,
        created_at: new Date().toISOString(),
      };

      const data = await supabaseFetch(res, `shared_rallies?id=eq.${encodeURIComponent(body.id)}`, {
        method: "PATCH",
        headers: { prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
      if (data !== undefined) sendJson(res, 200, { rally: data[0] });
      return;
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url, "http://localhost");
      const id = url.searchParams.get("id");
      if (!id) {
        sendJson(res, 400, { error: "삭제할 집결을 찾을 수 없습니다." });
        return;
      }

      const data = await supabaseFetch(res, `shared_rallies?id=eq.${encodeURIComponent(id)}`, {
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
