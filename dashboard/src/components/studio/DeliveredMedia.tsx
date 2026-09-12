"use client";

import { useEffect, useRef, useState } from "react";
import { authHeaders } from "@/lib/auth";

/**
 * 만든 그림·영상을 화면에 거는 자리. 배달 주소가 만료돼도 스스로 되살린다.
 *
 * 2026-09-08 코드 감사 F-03.
 * 화면 배달 주소는 서명 토큰이고 12시간이면 만료된다. 그런데 초안과 브라우저 자동 저장은
 * 만들 때 받은 주소를 문자열 그대로 보관한다. 그래서 어제 만든 작업을 오늘 열면 파일은
 * 서버에 멀쩡히 있는데 이미지·영상만 안 보인다. 회장이 말한 "생성물이 안 보임" 의 남은
 * 절반이 이것이다. 게다가 img·video 태그는 실패해도 아무 말 없이 빈 자리로 남기 때문에
 * 고객은 만들기가 실패한 것으로 읽는다. ADR-007(조용한 실패 금지) 위반이기도 하다.
 *
 * 만료 시간을 늘리는 것으로는 못 막는다. 어떤 수명을 골라도 그보다 오래된 작업은 반드시
 * 생긴다. 그래서 실패하면 같은 파일의 새 주소를 받아 한 번 다시 건다. 그래도 안 되면
 * 무슨 일이 났고 무엇을 하면 되는지 글로 적는다. 빈 자리로 두지 않는다.
 */
function payloadFromDeliveryUrl(url: string): { f?: string; e?: number } | null {
  const marker = "/api/media/";
  const at = url.indexOf(marker);
  if (at < 0) return null;
  try {
    const token = decodeURIComponent(url.slice(at + marker.length));
    const body = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(body)) as { f?: string; e?: number };
  } catch {
    return null;
  }
}

function filenameFromDeliveryUrl(url: string): string {
  const parsed = payloadFromDeliveryUrl(url);
  return parsed && typeof parsed.f === "string" ? parsed.f : "";
}

/**
 * 배달 주소가 이미 죽었는지 그리기 전에 판정한다.
 *
 * 2026-09-13 회장 실사용: 발행실 미리보기 일곱 장이 전부 `naturalWidth === 0` 이었다. 토큰
 * payload 의 만료가 이틀 전이었다. 이 토큰은 서명만 됐고 암호화가 아니라서 만료 시각이 평문
 * 으로 들어 있다(media-token.ts 머리 주석). 그러니 서버에 물어보기 전에 화면이 스스로 안다.
 *
 * 실패를 기다렸다 되살리는 것만으로는 부족하다. 죽은 게 확실한 주소를 일부러 한 번 걸어
 * 404 를 받고 나서 고치면 그 사이 깨진 그림 자리가 뜬다. 죽은 줄 알면 걸지 않는다.
 */
export function isDeliveryUrlExpired(url: string, now: number = Date.now()): boolean {
  const parsed = payloadFromDeliveryUrl(url);
  if (!parsed || typeof parsed.e !== "number") return false;
  return parsed.e <= now;
}

/** 만료된 배달 주소를 같은 파일의 새 주소로 바꾼다. 못 바꾸면 빈 문자열. */
export async function resignDeliveryUrl(url: string, tenantId?: string): Promise<string> {
  const filename = filenameFromDeliveryUrl(url);
  if (!filename) return "";
  try {
    const res = await fetch("/api/media/resign", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ filename, tenant_id: tenantId }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; file?: string };
    return res.ok && data.ok && typeof data.file === "string" ? data.file : "";
  } catch {
    return "";
  }
}

interface Props {
  src: string;
  type: "image" | "video";
  alt?: string;
  className?: string;
  testId?: string;
  dataAttr?: Record<string, string>;
  tenantId?: string;
}

export function DeliveredMedia({ src, type, alt, className, testId, dataAttr, tenantId }: Props) {
  const [url, setUrl] = useState(() => (isDeliveryUrlExpired(src) ? "" : src));
  const [phase, setPhase] = useState<"ready" | "renewing" | "failed">(() =>
    isDeliveryUrlExpired(src) ? "renewing" : "ready",
  );
  // 주소 하나당 되살리기는 한 번만. 진짜로 사라진 파일에 무한히 요청하지 않는다.
  // 작업 공간까지 키에 넣는다. 작업 공간은 화면이 뜬 뒤에 따라 들어오므로, 그 전에 보낸
  // 한 번을 "이미 해 봤다" 로 세면 제대로 된 요청을 영영 못 보낸다(2026-09-13).
  const retried = useRef<string>("");
  const attemptKey = `${tenantId || ""}|${src}`;

  // 언마운트·주소 교체 뒤에 도착한 늦은 응답이 화면을 되돌리지 않게 한다.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    alive.current = true;
    if (!isDeliveryUrlExpired(src)) {
      if (retried.current !== attemptKey) retried.current = "";
      setUrl(src);
      setPhase("ready");
      return;
    }
    // 만료가 확실하다. 걸어 보지 않고 바로 새 주소를 받는다.
    // 같은 주소로 이미 요청했으면 다시 보내지 않는다. effect 는 StrictMode 와 재마운트에서
    // 다시 돈다(2026-09-13 Codex 교차리뷰 지적). 사라진 파일에 요청이 겹치면 그만큼 샌다.
    if (retried.current === attemptKey) return;
    retried.current = attemptKey;
    setUrl("");
    setPhase("renewing");
    void resignDeliveryUrl(src, tenantId).then((next) => {
      if (!alive.current) return;
      if (next) { setUrl(next); setPhase("ready"); }
      else setPhase("failed");
    });
  }, [src, tenantId, attemptKey]);

  async function handleError() {
    if (retried.current === attemptKey) { setPhase("failed"); return; }
    retried.current = attemptKey;
    const next = await resignDeliveryUrl(src, tenantId);
    if (!alive.current) return;
    if (next) { setUrl(next); setPhase("ready"); }
    else setPhase("failed");
  }

  if (phase === "renewing") {
    // DESIGN.md 공통 상태 여섯 중 loading. 원인과 다음 행동을 한 자리에서 닫는다(ADR-007).
    return (
      <div
        data-testid={testId ? `${testId}-renewing` : undefined}
        data-media-state="renewing"
        className={`flex items-center justify-center rounded-control border border-dashed border-border bg-surface-2 p-stack ${className || ""}`}
      >
        <p className="break-keep text-center text-caption text-subtle">
          {type === "video" ? "영상" : "이미지"} 주소를 다시 받는 중입니다
        </p>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div
        data-testid={testId ? `${testId}-failed` : undefined}
        data-media-state="error"
        className={`flex items-center justify-center rounded-control border border-dashed border-border bg-surface-2 p-stack ${className || ""}`}
      >
        <p className="break-keep text-center text-caption text-subtle">
          {type === "video" ? "영상을" : "이미지를"} 불러오지 못했습니다. 새로고침해도 그대로면 생성실에서 다시 만들어 주세요.
        </p>
      </div>
    );
  }

  if (type === "video") {
    return (
      <video
        {...dataAttr}
        data-testid={testId}
        src={url}
        className={className}
        controls
        playsInline
        onError={handleError}
      />
    );
  }
  return (
    <img
      {...dataAttr}
      data-testid={testId}
      src={url}
      alt={alt || ""}
      className={className}
      onError={handleError}
    />
  );
}
