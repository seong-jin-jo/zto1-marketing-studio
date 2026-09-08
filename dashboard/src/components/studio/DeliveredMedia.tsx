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
function filenameFromDeliveryUrl(url: string): string {
  const marker = "/api/media/";
  const at = url.indexOf(marker);
  if (at < 0) return "";
  try {
    const token = decodeURIComponent(url.slice(at + marker.length));
    const body = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(atob(body)) as { f?: string };
    return typeof parsed.f === "string" ? parsed.f : "";
  } catch {
    return "";
  }
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
  const [url, setUrl] = useState(src);
  const [failed, setFailed] = useState(false);
  // 주소 하나당 되살리기는 한 번만. 진짜로 사라진 파일에 무한히 요청하지 않는다.
  const retried = useRef<string>("");

  useEffect(() => { setUrl(src); setFailed(false); retried.current = ""; }, [src]);

  async function handleError() {
    if (retried.current === src) { setFailed(true); return; }
    retried.current = src;
    const next = await resignDeliveryUrl(src, tenantId);
    if (next) setUrl(next);
    else setFailed(true);
  }

  if (failed) {
    return (
      <div
        data-testid={testId ? `${testId}-failed` : undefined}
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
