// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CredentialForm } from "@/components/shared/CredentialForm";

const props = { channelKey: "slack", fields: ["webhookUrl"], labels: ["Incoming Webhook URL"], onSave: vi.fn(async () => {}) };
afterEach(cleanup);

describe("메시징 자격증명 폼의 비동기 설정 수신", () => {
  it("CHANNEL-17 연결 정보가 늦게 도착하면 마스킹 값을 보여주고 연결 단추를 숨긴다", () => {
    const view = render(<CredentialForm {...props} currentKeys={{}} connected={false} />);
    view.rerender(<CredentialForm {...props} currentKeys={{ webhookUrl: "********" }} connected />);
    expect(view.container.querySelector("#ch-slack-webhookUrl")).toHaveValue("********");
    expect(view.container.querySelector("#ch-slack-webhookUrl")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: /^연결$/ })).not.toBeInTheDocument();
  });

  it("CHANNEL-18 사용자가 입력 중이면 늦은 서버 응답으로 값을 덮지 않는다", () => {
    const view = render(<CredentialForm {...props} currentKeys={{}} connected={false} />);
    fireEvent.change(view.container.querySelector("#ch-slack-webhookUrl")!, { target: { value: "https://hooks.slack.com/services/FIXTURE" } });
    view.rerender(<CredentialForm {...props} currentKeys={{ webhookUrl: "********" }} connected />);
    expect(view.container.querySelector("#ch-slack-webhookUrl")).toHaveValue("https://hooks.slack.com/services/FIXTURE");
    expect(screen.getByRole("button", { name: "수정 내용 저장" })).toBeInTheDocument();
  });

  it("CHANNEL-38 연결 저장이 실패하면 입력과 편집 상태를 보존해 재시도할 수 있다", async () => {
    const onSave = vi.fn(async () => { throw new Error("fixture failure"); });
    const view = render(<CredentialForm {...props} onSave={onSave} currentKeys={{}} connected={false} />);
    const input = view.container.querySelector("#ch-slack-webhookUrl")!;
    fireEvent.change(input, { target: { value: "https://hooks.slack.com/services/FIXTURE" } });
    fireEvent.click(screen.getByRole("button", { name: /^연결$/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("저장하지 못했습니다"));
    expect(input).toHaveValue("https://hooks.slack.com/services/FIXTURE");
    expect(screen.getByRole("button", { name: /^연결$/ })).toBeInTheDocument();
  });

  it("CHANNEL-46 Slack 테스트 전송 버튼은 빠른 중복 클릭에도 한 번만 호출한다", async () => {
    let finish!: () => void;
    const onSave = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<CredentialForm {...props} onSave={onSave} submitLabel="테스트 메시지 보내고 연결" currentKeys={{}} connected={false} />);
    const button = screen.getByRole("button", { name: "테스트 메시지 보내고 연결" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onSave).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.queryByRole("button", { name: "테스트 메시지 보내고 연결" })).not.toBeInTheDocument());
  });

  it("CHANNEL-48 저장된 마스크만으로 Slack 재시험을 누르면 원문 재입력을 요구하고 전송하지 않는다", async () => {
    const onSave = vi.fn(async () => {});
    render(<CredentialForm {...props} onSave={onSave} submitLabel="테스트 메시지 보내고 연결"
      requireFreshField="webhookUrl" currentKeys={{ webhookUrl: "********" }} connected />);
    fireEvent.click(screen.getByRole("button", { name: "연결 정보 수정" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 메시지 보내고 연결" }));
    expect(screen.getByRole("alert")).toHaveTextContent("원문을 다시 입력해 주세요");
    expect(onSave).not.toHaveBeenCalled();
  });
});
