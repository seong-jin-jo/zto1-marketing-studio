/**
 * 상류(생성기·외부 API·CLI)가 실패했을 때 쓰는 응답 규칙.
 *
 * 2026-09-08 회장 실사용: 생성실에서 막힌 주제를 넣었더니 화면에 "502" 라는 숫자만 떴다.
 * 서버는 이유를 본문에 담아 보냈는데 사용자는 그것을 볼 수 없었다.
 *
 * 원인: 우리 앞에 리버스 프록시(Cloudflare 터널)가 있고, 원본이 502 를 내면 프록시가 우리
 * JSON 본문을 자기 HTML 오류 페이지로 갈아치운다. 502 는 "게이트웨이가 상류에서 잘못된
 * 응답을 받았다" 는 뜻이라 프록시가 개입할 자격이 있다고 판단하는 것이다.
 *
 * 우리가 하려는 말은 "요청은 정상 처리했고 상류가 실패했다" 이므로 그 뜻에 맞는 상태로
 * 답한다. 그래야 우리가 쓴 문구가 사용자 화면까지 살아서 간다. /api/publish 는 처음부터
 * 이 방식이었고, 생성 계열만 502 를 쓰고 있었다.
 *
 * ok:false 를 반드시 함께 싣는다. 상태만 바꾸고 플래그를 빠뜨리면 화면이 실패를 성공으로 읽는다.
 */
export const UPSTREAM_FAILED = 200;

/** 상류 실패 응답. message 는 사용자가 읽을 말로 쓴다(내부 용어·영문 스택 금지). */
export function upstreamFailure(message: string, extra?: Record<string, unknown>): Response {
  return Response.json({ ok: false, error: message, ...(extra || {}) }, { status: UPSTREAM_FAILED });
}
