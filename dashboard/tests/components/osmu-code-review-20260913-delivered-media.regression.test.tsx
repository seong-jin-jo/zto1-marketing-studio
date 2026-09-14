// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ authHeaders: () => ({}) }));
import { DeliveredMedia } from "@/components/studio/DeliveredMedia";

function deliveryUrl(kind: "media" | "image", filename: string, tenant: string): string {
  const body = Buffer.from(JSON.stringify({ v: 1, t: tenant, f: filename, e: 1 }), "utf8")
    .toString("base64url");
  const marker = kind === "image" ? "/api/images/deliver/" : "/api/media/";
  return `${marker}${body}.c2ln`;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("배달 주소 복구 검수 회귀", () => {
  it("항목 19 정상: image-purpose 주소를 원래 목적과 작업 공간으로 재발급 요청한다", async () => {
    const expired = deliveryUrl("image", "card.png", "tenant-a");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, file: "https://cdn.example/new-card.png" }), { status: 200 }));

    render(<DeliveredMedia type="image" src={expired} tenantId="tenant-a" testId="image-purpose" />);
    await waitFor(() => expect(screen.getByTestId("image-purpose")).toHaveAttribute("src", "https://cdn.example/new-card.png"));

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({ delivery_url: expired, purpose: "image", tenant_id: "tenant-a" });
  });

  it("항목 10 경합: A의 늦은 재발급 응답이 B 작업 공간 화면을 덮지 않는다", async () => {
    const a = deliveryUrl("media", "a.png", "tenant-a");
    const b = deliveryUrl("media", "b.png", "tenant-b");
    let resolveA!: (value: Response) => void;
    let resolveB!: (value: Response) => void;
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveA = resolve; }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveB = resolve; }));

    const view = render(<DeliveredMedia type="image" src={a} tenantId="tenant-a" testId="race-image" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    view.rerender(<DeliveredMedia type="image" src={b} tenantId="tenant-b" testId="race-image" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    resolveB(new Response(JSON.stringify({ ok: true, file: "https://cdn.example/b-new.png" }), { status: 200 }));
    await waitFor(() => expect(screen.getByTestId("race-image")).toHaveAttribute("src", "https://cdn.example/b-new.png"));
    resolveA(new Response(JSON.stringify({ ok: true, file: "https://cdn.example/a-old.png" }), { status: 200 }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByTestId("race-image")).toHaveAttribute("src", "https://cdn.example/b-new.png");
  });
});
