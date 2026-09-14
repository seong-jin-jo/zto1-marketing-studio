"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog, type ConfirmRequest } from "@/components/shared/ConfirmDialog";

/**
 * 앱 전체가 함께 쓰는 확인창 한 대.
 *
 * 왜 앱 뿌리에 한 대만 두나
 * 2026-09-08 실사용 점검에서 브라우저 기본 확인창(window.confirm)이 아직 열 곳 남아 있었다.
 * 그 창은 ①페이지를 통째로 멈춰 세워 무엇이 사라지는지 나란히 못 보게 하고 ②우리 말투를
 * 못 써서 "삭제?" 나 "Delete this video?" 가 그대로 사용자에게 나갔고 ③브라우저에서
 * "이 사이트가 추가 대화상자를 만들지 못하게 하기" 를 한 번 누르면 그 뒤로 모든 삭제·해제가
 * 조용히 아무 일도 안 하게 된다. 셋 다 제품에 그대로 있으면 안 되는 것이다.
 *
 * ConfirmDialog 는 이미 있었지만 생성실 한 곳만 손으로 배선해 쓰고 있었다. 남은 아홉 곳이
 * 각자 상태와 JSX 를 배선하게 하면 그 배선에서 실수가 난다. 그래서 뿌리에 한 대만 두고
 * 호출부는 `await confirmAction({...})` 한 줄로 끝나게 한다. 토스트가 이미 같은 모양이다.
 *
 * 호스트가 아직 안 붙은 화면(테스트·부분 렌더)에서는 종전 동작으로 떨어뜨린다. 확인 없이
 * 지워지는 것보다 낫다.
 */
type Handler = (req: ConfirmRequest) => Promise<boolean>;

let handler: Handler | null = null;

export function confirmAction(req: ConfirmRequest): Promise<boolean> {
  if (handler) return handler(req);
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    return Promise.resolve(window.confirm(`${req.title}\n\n${req.description}`));
  }
  return Promise.resolve(false);
}

export function ConfirmHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    handler = (req) => {
      // 앞서 열린 물음이 아직 있으면 그것은 취소로 닫는다. 답 없는 약속을 남기면
      // 그 자리를 기다리던 코드가 영원히 멈춘다.
      resolveRef.current?.(false);
      setRequest(req);
      return new Promise<boolean>((resolve) => { resolveRef.current = resolve; });
    };
    return () => {
      handler = null;
      resolveRef.current?.(false);
      resolveRef.current = null;
    };
  }, []);

  function settle(ok: boolean) {
    setRequest(null);
    resolveRef.current?.(ok);
    resolveRef.current = null;
  }

  return <ConfirmDialog request={request} onConfirm={() => settle(true)} onCancel={() => settle(false)} />;
}
