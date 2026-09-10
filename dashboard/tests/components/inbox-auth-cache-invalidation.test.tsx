// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useSWR, { SWRConfig, useSWRConfig } from "swr";
import InboxPage from "@/app/inbox/page";
import { Providers } from "@/components/layout/Providers";
import { fetcher } from "@/lib/api";

const QUEUE_KEY = "/api/queue?status=draft&returnTo=inbox";

function RevalidateQueue() {
  const { mutate } = useSWRConfig();
  return (
    <button type="button" onClick={() => void mutate(QUEUE_KEY)}>
      목록 재조회
    </button>
  );
}

function OtherProtectedScreen() {
  const { data } = useSWR<{ label: string }>("/api/settings", fetcher);
  return data ? <p>{data.label}</p> : null;
}

describe("V72-AUTH-CACHE 인증 단절 후 SWR 캐시 계약", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/inbox");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("V72-AUTH-CACHE-01 거절: 성공 목록이 캐시된 뒤 재조회 401이면 옛 초안을 숨기고 안내와 비활성 행동만 남긴다", async () => {
    let queueRequestCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === QUEUE_KEY) {
        queueRequestCount += 1;
        if (queueRequestCount === 1) {
          return Response.json({
            posts: [{ id: "cached-draft", title: "이전 성공 조회 제목", text: "이전 성공 조회 본문" }],
          });
        }
        return new Response(null, { status: 401 });
      }
      if (url === "/api/product-source") return Response.json({ source: null });
      if (url === "/api/voice-tone") {
        return Response.json({ tone: { formal: 50, humor: 50, energy: 50, length: 50 } });
      }
      if (url === "/api/settings") return Response.json({ label: "다른 보호 화면 캐시" });
      throw new Error(`예상하지 않은 요청: ${url}`);
    }));

    const cache = new Map();
    render(
      <SWRConfig value={{ provider: () => cache, dedupingInterval: 0, errorRetryCount: 0, revalidateOnFocus: false }}>
        <Providers>
          <RevalidateQueue />
          <OtherProtectedScreen />
          <InboxPage />
        </Providers>
      </SWRConfig>,
    );

    expect(await screen.findByRole("heading", { name: "이전 성공 조회 제목" })).toBeInTheDocument();
    expect(await screen.findByText("다른 보호 화면 캐시")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "승인" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "목록 재조회" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("로그인 상태가 만료되었습니다");
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "이전 성공 조회 제목" })).not.toBeInTheDocument();
      expect(screen.queryByText("이전 성공 조회 본문")).not.toBeInTheDocument();
      expect(screen.queryByText("다른 보호 화면 캐시")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "승인" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "거절" })).toBeDisabled();
  });
});
