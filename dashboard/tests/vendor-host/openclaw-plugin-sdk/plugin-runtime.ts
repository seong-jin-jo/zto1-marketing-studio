/**
 * 확장은 이 모듈에서 타입만 가져간다(`import type`). 트랜스파일 시 사라지므로
 * 런타임 구현이 필요 없고, 타입 검사는 벤더 워크스페이스가 설치된 로컬이 본다.
 * 사유는 ./agent-runtime.ts 머리말 참조.
 */
export type OpenClawPluginApi = {
  pluginConfig?: Record<string, unknown>;
  [key: string]: unknown;
};
