// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditRoom } from "@/components/studio/StudioRooms";

afterEach(() => cleanup());

describe("편집실의 글 순서와 배경 음악 제거 회귀", () => {
  it("EDITROOM-NO-DEAD-CONTROLS-01 거절: 글은 순서·추가·삭제 조작을 노출하지 않는다", () => {
    render(<EditRoom lines={["첫 문단", "둘째 문단"]} onLinesChange={vi.fn()} kind="text" />);

    const outline = document.querySelector("[data-edit-outline]")!;
    expect(outline.querySelectorAll("[data-outline-item]")).toHaveLength(2);
    expect(outline.querySelectorAll('[draggable="true"]')).toHaveLength(0);
    expect(outline.querySelector("[data-outline-add]")).toBeNull();
    expect(outline.querySelector("[data-outline-remove]")).toBeNull();
    expect(document.querySelector("[data-line-up]")).toBeNull();
    expect(document.querySelector("[data-line-down]")).toBeNull();
  });

  it.each(["card", "video"] as const)("EDITROOM-NO-DEAD-CONTROLS-02 정상: %s의 장 순서 이동은 유지한다", (kind) => {
    const onLinesChange = vi.fn();
    render(<EditRoom lines={["첫 장", "둘째 장"]} onLinesChange={onLinesChange} kind={kind} />);

    fireEvent.click(screen.getByRole("button", { name: "2번째를 위로" }));
    expect(onLinesChange).toHaveBeenLastCalledWith(["둘째 장", "첫 장"]);
  });

  it("EDITROOM-NO-DEAD-CONTROLS-03 거절: 형식·나레이션 도구에 배경 음악 조작과 미지원 경고가 없다", () => {
    render(<EditRoom lines={["나레이션"]} onLinesChange={vi.fn()} kind="audio" />);

    const formats = screen.getByRole("group", { name: "만들 콘텐츠 형식" });
    expect(formats.querySelector('button[aria-label="음악"]')).toBeNull();
    expect(screen.getByRole("button", { name: "목소리 도구" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /음악 도구/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /음량 도구/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/음악 파일 생성은 아직 제공하지 않습니다/)).not.toBeInTheDocument();
  });

  it("EDITROOM-NO-DEAD-CONTROLS-04 정상: 목소리를 바꿔도 기존 audio 저장 payload의 음악 필드를 보존한다", async () => {
    const onFormatChange = vi.fn();
    render(
      <EditRoom
        lines={["나레이션"]}
        onLinesChange={vi.fn()}
        kind="audio"
        initialFormat={{ kind: "audio", voice: "차분한 남성", musicTrack: "잔잔한 로파이", musicVolume: 35 }}
        onFormatChange={onFormatChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "또렷한 여성" }));
    await waitFor(() => expect(onFormatChange).toHaveBeenLastCalledWith({
      kind: "audio",
      voice: "또렷한 여성",
      musicTrack: "잔잔한 로파이",
      musicVolume: 35,
    }));

    const pageSource = readFileSync("src/app/studio/page.tsx", "utf8");
    expect(pageSource).toContain("edit_format: editFormat");
  });
});
