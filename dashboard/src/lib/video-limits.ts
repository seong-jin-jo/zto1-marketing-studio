// SNS-015: 영상 업로드/발행의 **애플리케이션 상한**(제품 정책값) 단일 출처.
//
// 오해 방지 — 이 상한은 multipart 파서의 메모리 할당을 막지 못한다. Request.formData()는
// 라우트 코드가 실행되기 "전에" 본문을 파싱하며, 그 시점의 버퍼는 런타임(Next/undici)이
// 관리한다. 즉 진짜 1차 방어선은 리버스 프록시/플랫폼의 요청 본문 상한(nginx
// client_max_body_size, 플랫폼 body size limit)이고, 여기 값은 그 뒤에서 도는
// **2차 방어(second-stage guard) 겸 제품 정책 한도**다 — 디스크에 쓰기 전에 되돌리고,
// 사용자에게 실행 가능한 한국어 사유를 주는 역할.
//
// 100 MiB로 정한 이유: 세로 숏폼(Reels/Shorts, 최대 3분급 h.264)이 실무상 이 범위에 들어오고,
// 업로드 상한과 Reels 발행 상한을 **같은 값**으로 묶어야 "업로드는 됐는데 발행에서 되튕기는"
// 불일치가 생기지 않는다.
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MiB
export const MAX_VIDEO_MIB = MAX_VIDEO_BYTES / (1024 * 1024);
export const MAX_VIDEO_DURATION_SECONDS = 180;
