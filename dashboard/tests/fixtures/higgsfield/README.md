# Higgsfield CLI 실물 응답 픽스처

실제 `higgsfield` CLI 호출로 캡처한 응답 — 뇌피셜 shape 아님.

- `create-image.json` — `higgsfield generate create text2image_soul_v2 ... --json`(`--wait` 없음). 컨트롤러가 실제 과금 1회로 캡처. **최상위가 객체가 아니라 작업 id 문자열 1개짜리 배열**이다.
- `get-image-pending.json` — 위 작업(`df664d17-...`)이 아직 끝나지 않았을 때 `generate get <id> --json`. `status: "in_progress"`, `result_url: null`, `params.style.url`에 스타일 견본 webp가 들어 있다(완성 이미지 아님).
- `get-image-done.json` — 다른 완료된 이미지 작업(`f49f8b66-...`)을 읽기 전용 `get`으로 캡처(과금 없음). `status: "completed"`, `result_url`에 최종 png, `min_result_url`에 91KB대 썸네일 webp.
- `get-video-done.json` — 완료된 영상 작업(`158336e9-...`, minimax_hailuo)을 읽기 전용 `get`으로 캡처. `params.input_image.url`에 바탕 그림 webp가 들어 있다(완성 영상 아님).
- `get-video-pending.json` — **합성**. 실제 "영상 대기 중" 작업 id가 없어 `get-video-done.json`과 같은 구조에 `status: "in_progress"`, `result_url: null`을 넣어 만들었다. `params.input_image.url`이 존재해 M2(대기 중 바탕그림 URL을 결과로 오판)를 실제 구조로 재현한다.

이 픽스처들을 테스트가 직접 `JSON.parse(fs.readFileSync(...))`로 읽어 쓴다(손으로 쓴 stub JSON 금지).
