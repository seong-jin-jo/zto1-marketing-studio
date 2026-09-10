import fs from "fs";
import { readJson, writeJson, dataPath, configPath } from "@/lib/file-io";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(`<h2>Figma OAuth 오류: ${error}</h2><p><a href='javascript:window.close()'>닫기</a></p>`, {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  // Load stored state
  const oauthState = readJson<Record<string, string>>(dataPath("figma-oauth-state.json"));
  if (!oauthState || oauthState.state !== state) {
    return new Response("<h2>인증 상태가 일치하지 않습니다</h2>", { status: 400, headers: { "Content-Type": "text/html" } });
  }

  try {
    const hostUrl = url.origin;
    const redirectUri = `${hostUrl}/api/figma-mcp/callback`;

    // Exchange code for tokens
    const tokenData = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: oauthState.clientId,
      client_secret: oauthState.clientSecret,
      code: code || "",
      redirect_uri: redirectUri,
      code_verifier: oauthState.codeVerifier,
    });

    const tokenResp = await fetch("https://api.figma.com/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "claude-cli/2.1.2 (external, cli)" },
      body: tokenData.toString(),
    });
    const tokens = await tokenResp.json();

    // Save tokens
    const dt = readJson<Record<string, unknown>>(dataPath("design-tools.json")) || {};
    if (!dt.figma) dt.figma = {};
    const figma = dt.figma as Record<string, unknown>;
    figma.mcpAccessToken = tokens.access_token;
    figma.mcpRefreshToken = tokens.refresh_token || "";
    figma.mcpClientId = oauthState.clientId;
    figma.mcpClientSecret = oauthState.clientSecret;
    figma.mcpEnabled = true;
    writeJson(dataPath("design-tools.json"), dt);

    // Update openclaw.json
    const ocPath = configPath("openclaw.json");
    const config = readJson<Record<string, unknown>>(ocPath) || {};
    if (!config.mcp) config.mcp = {};
    const mcp = config.mcp as Record<string, unknown>;
    if (!mcp.servers) mcp.servers = {};
    const servers = mcp.servers as Record<string, unknown>;
    servers.figma = {
      url: "https://mcp.figma.com/mcp",
      transport: "streamable-http",
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    };
    writeJson(ocPath, config);

    // Cleanup
    try { fs.unlinkSync(dataPath("figma-oauth-state.json")); } catch { /* ok */ }

    const html = `<html><head><style>
      :root{--surface:rgb(10 10 10);--text:rgb(255 255 255);--success:rgb(34 197 94);--muted:rgb(156 163 175);--subtle:rgb(107 114 128)}
      body{background:var(--surface);color:var(--text);font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}
      main{text-align:center}h2{color:var(--success)}p{color:var(--muted)}small{color:var(--subtle)}
    </style></head><body><main>
      <h2>Figma MCP 연결 완료!</h2>
      <p>이 탭을 닫고 대시보드로 돌아가세요.</p>
      <small>Gateway 재시작 후 사용 가능</small>
    </main></body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  } catch (e) {
    return new Response(`<h2>토큰 교환 실패: ${e}</h2>`, {
      status: 500,
      headers: { "Content-Type": "text/html" },
    });
  }
}
