// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IntroOutroPanel } from "@/components/studio/IntroOutroPanel";
import type { IntroOutroApplied } from "@/lib/studio/video-edit-contract";

vi.mock("@remotion/player", () => ({ Player: () => <div data-player-preview /> }));
afterEach(cleanup);

const applied: IntroOutroApplied = {
  introCompId: "intro-brand-stripe",
  outroCompId: "outro-title-card",
  compositeFilename: "composite.mp4",
  compositeDeliverUrl: "/api/media/composite",
  introDurationSec: 2.4,
  outroDurationSec: 3.2,
  titleText: "복원되는 제목",
  resultFilename: "result.mp4",
  deliverUrl: "/api/media/result",
  sourceFilename: "source.mp4",
};

describe("S6 인트로·아웃트로 갤러리", () => {
  it("S6-INTRO-01 인트로 3개와 아웃트로 3개를 내 브랜드 미리보기로 보여준다", () => {
    render(<IntroOutroPanel sourceFilename="source.mp4" applied={null} />);
    expect(document.querySelectorAll("[data-intro-outro-option]")).toHaveLength(6);
    expect(document.querySelectorAll("[data-player-preview]")).toHaveLength(6);
  });

  it("S6-INTRO-02 저장된 템플릿·길이·글을 재접속 시 복원한다", () => {
    render(<IntroOutroPanel sourceFilename="source.mp4" applied={applied} />);
    expect(screen.getByDisplayValue("복원되는 제목")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2.4")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3.2")).toBeInTheDocument();
    expect(document.querySelector('[data-intro-outro-option="intro-brand-stripe"]')?.className).toContain("border-link");
    expect(document.querySelector('[data-intro-outro-option="outro-title-card"]')?.className).toContain("border-link");
  });
});
