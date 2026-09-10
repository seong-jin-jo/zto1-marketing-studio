// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { DeliveredMedia } from "@/components/studio/DeliveredMedia";

// 2026-09-08 코드 감사 F-03 재발 방지.
// 화면 배달 주소는 서명 토큰이고 12시간이면 만료된다. 그런데 초안과 브라우저 자동 저장은
// 만들 때 받은 주소를 문자열 그대로 보관한다. 그래서 어제 만든 작업을 오늘 열면 파일은
// 서버에 멀쩡히 있는데 이미지·영상만 안 보인다. 회장이 말한 "생성물이 안 보임" 의 남은
// 절반이다. img 태그는 실패해도 조용히 빈 자리로 남아 고객은 만들기가 실패한 줄 안다.
// 계약: 배달이 실패하면 같은 파일의 새 주소를 한 번 받아 다시 걸고, 그래도 안 되면
// 무슨 일이 났고 무엇을 하면 되는지 글로 적는다. 빈 자리로 두지 않는다.

vi.mock("@/lib/auth", () => ({ authHeaders: () => ({}) }));

// payload 는 base64url(JSON) — 실제 토큰과 같은 모양으로 만든다.
function deliveryUrl(filename: string): string {
  const body = Buffer.from(JSON.stringify({ v: 1, t: "tenant-1", f: filename, e: 1 }))
    .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `/api/media/${encodeURIComponent(`${body}.sig`)}`;
}

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("만료된 배달 주소는 스스로 되살아난다", () => {
  it("이미지 로드 실패 → 같은 파일로 재서명 받아 새 주소로 다시 건다", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: { body?: string }) => {
      calls.push(init?.body ?? "");
      return { ok: true, json: async () => ({ ok: true, file: "/api/media/NEW" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DeliveredMedia type="image" src={deliveryUrl("img_1.webp")} testId="m" tenantId="tenant-1" />);
    fireEvent.error(screen.getByTestId("m"));

    await waitFor(() => expect(screen.getByTestId("m")).toHaveAttribute("src", "/api/media/NEW"));
    expect(JSON.parse(calls[0]).filename).toBe("img_1.webp");
  });

  it("재서명도 실패하면 빈 자리가 아니라 사람 말로 적는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ ok: false }) })));

    render(<DeliveredMedia type="video" src={deliveryUrl("v_1.mp4")} testId="m" />);
    fireEvent.error(screen.getByTestId("m"));

    await waitFor(() => expect(screen.getByTestId("m-failed")).toBeTruthy());
    expect(screen.getByTestId("m-failed").textContent).toContain("영상을 불러오지 못했습니다");
  });

  it("한 주소에 되살리기는 한 번뿐 — 사라진 파일에 무한 요청하지 않는다", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, file: "/api/media/NEW" }) }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<DeliveredMedia type="image" src={deliveryUrl("img_2.webp")} testId="m" />);
    fireEvent.error(screen.getByTestId("m"));
    await waitFor(() => expect(screen.getByTestId("m")).toHaveAttribute("src", "/api/media/NEW"));
    fireEvent.error(screen.getByTestId("m"));

    await waitFor(() => expect(screen.getByTestId("m-failed")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
