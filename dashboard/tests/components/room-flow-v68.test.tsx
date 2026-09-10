// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RoomFlowHeader, RoomHeader, type ProductRoom } from "@/components/shared/RoomHeader";

afterEach(cleanup);

describe("V68 네 방 상단 단계 계약", () => {
  it.each([
    ["create", "01", "생성실", "/studio?room=create"],
    ["edit", "02", "편집실", "/studio?room=edit"],
    ["publish", "03", "발행실", "/studio?room=publish"],
    ["performance", "04", "성과실", "/performance"],
  ] as const)("V68-FLOW-01 정상: %s 방은 자기 단계를 하나만 현재 위치로 표시한다", (room, number, label, href) => {
    render(<RoomFlowHeader currentRoom={room as ProductRoom} />);

    const active = screen.getByRole("link", { name: `${number}${label}` });
    expect(active).toHaveAttribute("href", href);
    expect(active).toHaveAttribute("aria-current", "step");
    expect(document.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  });

  it("V68-FLOW-02 거절: 홈 주소를 성과실 단계 주소로 사용하지 않는다", () => {
    render(<RoomFlowHeader currentRoom="performance" />);

    expect(screen.getByRole("link", { name: "04성과실" })).toHaveAttribute("href", "/performance");
    expect(document.querySelector('[data-room-step="performance"][href="/"]')).toBeNull();
  });
});

describe("V69-COPY-01 작업 공간 이름 개인정보 계약", () => {
  it("V69-COPY-01 정상: 고객이 정한 작업 공간 이름은 상단 제목에 유지한다", () => {
    render(<RoomHeader workspaceName="브랜드 연구소" subtitle="생성할 내용을 정합니다" roomLabel="생성실" />);

    expect(screen.getByText("브랜드 연구소")).toBeInTheDocument();
  });

  it("V69-COPY-01 거절: 이메일 형태의 이름은 상단 제목에 노출하지 않는다", () => {
    render(<RoomHeader workspaceName="owner@example.test" subtitle="생성할 내용을 정합니다" roomLabel="생성실" />);

    expect(screen.getByText("기본 작업 공간")).toBeInTheDocument();
    expect(screen.queryByText("owner@example.test")).not.toBeInTheDocument();
  });

  it("V70-HEADER-01 정상: 검토와 일정은 긴 이동 칩이 아니라 우측 유틸 단추로 둔다", () => {
    render(<RoomHeader workspaceName="브랜드 연구소" subtitle="콘텐츠 작업실" roomLabel="발행실" currentRoom="publish" />);

    expect(screen.getByRole("link", { name: "승인 인박스 열기" })).toHaveTextContent("검토");
    expect(screen.getByRole("link", { name: "발행 일정 열기" })).toHaveTextContent("일정");
    expect(screen.queryByText("검토 대기")).not.toBeInTheDocument();
    expect(screen.queryByText("예약 일정")).not.toBeInTheDocument();
  });

  it("V77-HEADER-01 정상: 학습 정보는 헤더에 바로 보이고 나머지 작업은 메뉴에 보존한다", () => {
    render(
      <RoomHeader
        workspaceName="브랜드 연구소"
        subtitle="콘텐츠 작업실"
        roomLabel="발행실"
        currentRoom="publish"
        leading={<button type="button">학습 정보</button>}
        trailing={<button type="button">작업물 전체</button>}
      />,
    );

    const header = document.querySelector('[data-room-header="발행실"]');
    expect(header).toHaveClass("grid-cols-[minmax(0,1fr)_auto]");
    expect(document.querySelector("[data-room-context-menu]")).toBeInTheDocument();
    expect(document.querySelector("[data-room-leading]")).toHaveTextContent("학습 정보");
    expect(document.querySelector("[data-room-context-menu]")).not.toHaveTextContent("학습 정보");
    expect(screen.getByRole("button", { name: "학습 정보" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "작업물 전체" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "작업 단계" })).toHaveClass("col-span-full");
  });
});
