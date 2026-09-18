import { verifyXCredentials } from "@/lib/publish";

interface VerifyResult {
  verified: boolean;
  // verified=false지만 네트워크 등으로 "확인 불가"(키는 저장됨)일 때 true. UI에서 앰버로 구분.
  unverified?: boolean;
  reason?: string;
  account?: string;
  error?: string;
}

// raw JSON/영문 API 오류를 화면에 그대로 노출하지 않고(SNS-005/finding 7) 조치 가능한
// 한국어 문구로만 정규화한다. provider raw response body(원문 메시지/스택트레이스/토큰 조각)는
// 절대 포함하지 않는다 — 상태 코드로만 분류(status code는 secret이 아니므로 안전).
// 인증 실패(401/400) vs 일시 오류(429/5xx)를 구분해 다른 안내를 준다.
function koreanApiError(provider: string, status: number, _data: unknown): string {
  if (status === 401 || status === 400) {
    return `${provider} 계정 정보가 올바르지 않습니다. 아이디(handle)와 App Password를 다시 확인해 입력해주세요.`;
  }
  if (status === 429) {
    return `${provider} API 요청이 일시적으로 제한되었습니다. 잠시 후 다시 시도해주세요.`;
  }
  if (status >= 500) {
    return `${provider} 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해주세요.`;
  }
  return `${provider} 연결에 실패했습니다 (오류 코드 ${status}).`;
}

export async function verifyChannel(channel: string, cfg: Record<string, string>): Promise<VerifyResult> {
  try {
    if (channel === "threads") {
      const token = cfg.accessToken || "";
      if (!token) return { verified: false, error: "Access Token is empty" };
      // id+username 둘 다 조회 — id는 저장된 userId(meta.userId)가 실제 토큰 신원과 같은지
      // 비교하기 위함(SNS-009: username 성공만 보고 stale userId를 valid로 오판하던 결함).
      const res = await fetch(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      if (!res.ok) return { verified: false, error: koreanApiError("Threads", res.status, data) };
      const storedUserId = cfg.userId || "";
      const liveId = typeof data.id === "string" ? data.id : "";
      if (!liveId) {
        return { verified: false, unverified: true, reason: "Threads 계정 ID를 확인하지 못했습니다. 잠시 후 다시 시도해주세요." };
      }
      if (storedUserId && storedUserId !== liveId) {
        return { verified: false, error: "저장된 Threads 계정 정보가 현재 토큰의 실제 계정과 일치하지 않습니다. User ID를 다시 확인하거나 재연결해주세요." };
      }
      return { verified: true, account: `@${data.username || ""}` };
    }

    if (channel === "bluesky") {
      const handle = cfg.handle || "";
      const pw = cfg.appPassword || "";
      if (!handle || !pw) return { verified: false, error: "Bluesky 핸들과 App Password를 모두 입력해주세요." };
      const res = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: handle, password: pw }),
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      if (!res.ok) return { verified: false, error: koreanApiError("Bluesky", res.status, data) };
      return { verified: true, account: `@${data.handle || ""}` };
    }

    if (channel === "telegram") {
      const token = cfg.botToken || "";
      if (!token || !cfg.chatId?.trim()) return { verified: false, error: "발행하려면 Bot Token과 대상 Chat ID를 모두 입력해 주세요." };
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      if (!res.ok || !data.ok) return { verified: false, error: "Bot Token을 확인해 주세요." };
      const chat = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(cfg.chatId)}`, {
        signal: AbortSignal.timeout(5000),
      });
      const chatData = await chat.json();
      if (!chat.ok || !chatData.ok) return { verified: false, error: "Chat ID를 확인하고 봇을 대상 채팅에 추가해 주세요." };
      return { verified: true, account: `@${data.result?.username || ""}` };
    }

    if (channel === "x") {
      const required = ["apiKey", "apiKeySecret", "accessToken", "accessTokenSecret"];
      const missing = required.filter((k) => !cfg[k]);
      if (missing.length) return { verified: false, error: `Missing: ${missing.join(", ")}` };
      // 실검증: OAuth1 서명 GET verify_credentials(read-only). 키 존재만 보던 기존 동작 대체.
      const r = await verifyXCredentials({
        apiKey: cfg.apiKey, apiSecret: cfg.apiKeySecret,
        accessToken: cfg.accessToken, accessSecret: cfg.accessTokenSecret,
      });
      if (r.ok) return { verified: true, account: r.account };
      if (r.networkError) return { verified: false, unverified: true, reason: "네트워크 확인 실패 — 키는 저장됨" };
      if (r.status === 403) return { verified: false, unverified: true, reason: "X API 접근 제한(앱 권한 확인) — 키는 저장됨" };
      return { verified: false, error: `X 인증 실패(${r.status ?? "?"})` };
    }

    if (channel === "instagram") {
      const token = cfg.accessToken || "";
      const userId = cfg.userId || "";
      if (!token) return { verified: false, error: "Access Token is empty" };
      if (!userId) return { verified: false, error: "User ID is empty" };
      const res = await fetch(`https://graph.instagram.com/v21.0/${userId}?fields=username&access_token=${token}`, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      if (!res.ok) return { verified: false, error: koreanApiError("Instagram", res.status, data) };
      return { verified: true, account: `@${data.username || ""}` };
    }

    if (channel === "facebook") {
      const token = cfg.accessToken || "";
      const pageId = cfg.pageId || "";
      if (!token || !pageId) return { verified: false, error: "Access Token and Page ID required" };
      const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}?fields=name&access_token=${token}`, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      if (!res.ok) return { verified: false, error: koreanApiError("Facebook", res.status, data) };
      return { verified: true, account: data.name || pageId };
    }

    if (channel === "discord") {
      const webhookUrl = cfg.webhookUrl || "";
      if (!webhookUrl || !webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
        return { verified: false, error: "Invalid Discord Webhook URL" };
      }
      // 실제 webhook 검증 — GET으로 webhook 정보 확인
      try {
        const res = await fetch(webhookUrl, { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        if (res.ok && data.name) return { verified: true, account: data.name };
        return { verified: false, error: `Webhook invalid (${res.status})` };
      } catch {
        return { verified: false, unverified: true, reason: "네트워크 확인 실패 — Webhook URL은 저장됨" };
      }
    }

    if (channel === "slack") {
      const webhookUrl = cfg.webhookUrl || "";
      if (!webhookUrl || !webhookUrl.startsWith("https://hooks.slack.com/")) {
        return { verified: false, error: "Invalid Slack Webhook URL" };
      }
      // 실제 webhook 검증 — 빈 POST로 응답 확인
      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "" }),
          signal: AbortSignal.timeout(5000),
        });
        // Slack은 빈 text면 400 반환하지만 webhook은 유효
        if (res.status === 400 || res.ok) return { verified: true, account: "(Webhook verified)" };
        return { verified: false, error: `Webhook invalid (${res.status})` };
      } catch {
        return { verified: false, unverified: true, reason: "네트워크 확인 실패 — Webhook URL은 저장됨" };
      }
    }

    if (channel === "line") {
      const token = cfg.channelAccessToken || "";
      if (!token) return { verified: false, error: "Channel Access Token is empty" };
      // 실제 API 검증
      try {
        const res = await fetch("https://api.line.me/v2/bot/info", {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000),
        });
        const data = await res.json();
        if (res.ok) return { verified: true, account: data.displayName || data.basicId || "(Connected)" };
        return { verified: false, error: `LINE API error (${res.status})` };
      } catch {
        return { verified: false, unverified: true, reason: "네트워크 확인 실패 — 토큰은 저장됨" };
      }
    }

    // Generic: check if any key has value
    const hasAny = Object.values(cfg).some((v) => typeof v === "string" && v.trim());
    return { verified: hasAny, account: hasAny ? "(credentials saved)" : "" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // DNS/network errors — 확인 "불가"(키는 저장되되 verified=false, 비활성 유지가 안전). UI는 앰버 표시.
    // (finding 7) 원문 에러 메시지는 URL/토큰 조각을 포함할 수 있어 사용자 노출 필드에는 넣지 않는다.
    if (msg.includes("fetch failed") || msg.includes("ENOTFOUND") || msg.includes("name resolution")) {
      return { verified: false, unverified: true, reason: "네트워크 확인 실패 — 저장됨(검증 미완)" };
    }
    return { verified: false, error: "연결 확인 중 오류가 발생했습니다. 입력값을 다시 확인해주세요." };
  }
}
