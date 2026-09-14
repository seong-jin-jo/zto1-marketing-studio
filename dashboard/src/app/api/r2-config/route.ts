import fs from "fs";
import path from "path";
import { DATA_DIR } from "@/lib/file-io";

const envPath = path.resolve(DATA_DIR, "../.env");

function readEnv(): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [k, ...rest] = trimmed.split("=");
      result[k] = rest.join("=");
    }
  } catch { /* file doesn't exist */ }
  return result;
}

// 자격증명 원문은 절대 응답에 담지 않는다. 화면이 필요로 하는 것은 "설정돼 있는가"이지
// 키 값이 아니다. 종전에는 access key 와 secret 을 그대로 내려 브라우저 입력칸에 채웠다.
// 저장 경로(POST)는 빈 값을 보내면 기존 값을 유지하므로, 화면은 다시 입력하지 않아도 된다.
export async function GET() {
  const env = readEnv();
  return Response.json({
    bucket: env.R2_BUCKET || "",
    endpoint: env.R2_ENDPOINT || "",
    accessKeyIdSet: Boolean(env.R2_ACCESS_KEY_ID),
    secretAccessKeySet: Boolean(env.R2_SECRET_ACCESS_KEY),
  });
}

export async function POST(request: Request) {
  const data = await request.json();
  const existing = readEnv();

  const r2Map: Record<string, string> = {
    accessKeyId: "R2_ACCESS_KEY_ID",
    secretAccessKey: "R2_SECRET_ACCESS_KEY",
    bucket: "R2_BUCKET",
    endpoint: "R2_ENDPOINT",
  };

  // R2_PUBLIC_URL은 저장하거나 사용하지 않는다. 버킷은 비공개로 유지하고 외부 배달은
  // 만료를 우리 서버가 통제하는 /api/images/deliver/<HMAC 토큰> 경로만 사용한다.

  for (const [key, envKey] of Object.entries(r2Map)) {
    const val = (data[key] || "").trim();
    if (val) existing[envKey] = val;
  }

  const lines = Object.entries(existing).map(([k, v]) => `${k}=${v}`);
  const dir = path.dirname(envPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(envPath, lines.join("\n") + "\n");
  return Response.json({ ok: true });
}
