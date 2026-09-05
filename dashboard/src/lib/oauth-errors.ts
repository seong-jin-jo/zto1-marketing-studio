export function escapeHtml(input: string): string {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseMaybeJsonMessage(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  try {
    const data = JSON.parse(text) as { msg?: string; message?: string; error?: string; error_description?: string };
    return data.msg || data.message || data.error_description || data.error || text;
  } catch {
    return text;
  }
}

function safeOriginalMessage(raw: string): string {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /\b(access_token|refresh_token|client_secret|authorization|id_token)\s*[:=]\s*["']?[^\s,"'}]+/gi,
      "$1=[가림]",
    )
    .replace(/\bbearer\s+[^\s,"'}]+/gi, "Bearer [가림]")
    .slice(0, 180);
}

export function oauthErrorMessage(raw: string, provider?: string): string {
  const msg = parseMaybeJsonMessage(raw);
  const p = provider ? `${provider} ` : "";

  // callback route에서 한 번 정제한 문장을 부모 창이 다시 받는 구조다. 이미 정제된 미분류 오류를
  // 다시 감싸면 "원문"이 중첩되므로 그대로 유지한다.
  if (/^일시적 오류입니다\. 다시 시도해주세요\.(?: 원문:| 문제가 계속되면)/.test(msg)) {
    return msg;
  }

  if (/provider is not enabled|Unsupported provider/i.test(msg)) {
    if (provider && !/google/i.test(provider)) {
      return `${p}OAuth provider가 현재 서버/프로젝트에서 활성화되지 않았습니다. 앱 콘솔과 서버 설정에서 해당 provider를 켜야 합니다.`;
    }
    return "Google 로그인이 아직 설정되지 않았습니다. 관리자에게 Supabase Google provider 활성화를 요청하세요.";
  }
  if (/supabaseUrl is required|supabase.*required|auth.*url.*required/i.test(msg)) {
    return `${p}로그인 설정이 서버/환경변수에 아직 없습니다. Google 로그인이 안 되면 관리자에게 Supabase 설정을 확인해달라고 요청하세요.`;
  }
  if (/has not accepted the invite to test the app|1349245|테스트 사용자 초대.*수락하지|초대를 아직 수락하지/i.test(msg)) {
    return `${p}이 계정은 아직 테스트 사용자 초대를 수락하지 않았습니다. 초대를 수락한 뒤 다시 연결해주세요.`;
  }
  if (/developer role|role.*permission|permission.*role|권한.*부족|개발자 역할/i.test(msg)) {
    return `${p}Meta가 이 계정의 앱 역할 권한을 확인하지 못했습니다. 앱 관리 화면에서 개발자, 테스터, 관리자 등록 여부와 초대 수락 여부를 확인해주세요.`;
  }
  if (/redirect_uri|redirect uri|callback/i.test(msg)) {
    return `${p}OAuth callback URL이 앱 콘솔 등록값과 다릅니다. 배포 공개 URL과 redirect URI를 같은 문자열로 맞춰야 합니다.`;
  }
  if (/permission|scope|not approved|review/i.test(msg)) {
    const original = safeOriginalMessage(msg);
    return `${p}요청 권한이 허용되지 않았습니다. 앱 역할, 초대 수락, 앱 심사 상태를 확인해주세요.${original ? ` 원문: ${original}` : ""}`;
  }
  if (/client.*not configured|미설정|자격증명 필요/i.test(msg)) {
    return `${p}OAuth 앱 자격증명이 서버에 설정되지 않았습니다. Client ID와 Secret 환경변수를 등록해야 합니다.`;
  }
  // 분류되지 않은 메시지는 사용자가 원인을 전달할 수 있게 정제한 원문을 함께 남긴다.
  // 자격증명과 토큰 모양은 가리고 길이를 제한해 provider 원문 전체를 그대로 노출하지 않는다.
  const original = safeOriginalMessage(msg);
  return original
    ? `일시적 오류입니다. 다시 시도해주세요. 원문: ${original}`
    : "일시적 오류입니다. 다시 시도해주세요. 문제가 계속되면 관리자에게 문의하세요.";
}
