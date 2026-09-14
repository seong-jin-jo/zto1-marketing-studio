/**
 * OpenClaw 플러그인 호스트 런타임 — 테스트용 구현.
 *
 * 왜 있나. `openclaw/extensions/*` 의 발행 도구는 플러그인이다. 플러그인은 자기
 * 서드파티 의존성(typebox, @aws-sdk/client-s3)만 package.json 에 선언하고,
 * `openclaw/plugin-sdk/*` 는 호스트 애플리케이션이 실행 시점에 꽂아주는 이음매다.
 * 그 이음매는 openclaw 패키지의 빌드 산출물(dist/)로만 해결되는데 dist 는 git 에
 * 없고, 빌드하려면 그 워크스페이스 node_modules 2.2GB 가 필요하다. CI 는 대시보드
 * 의존성만 설치하므로 이 세 줄 때문에 회귀 테스트 셋이 통째로 로드조차 못 했다
 * (2026-09-14 실측: Failed to load url typebox).
 *
 * 그래서 서드파티는 진짜로 설치하고(typebox·@aws-sdk/client-s3, 합쳐 10MB),
 * 호스트 이음매만 여기서 제공한다. 아래 함수들은 벤더 원본을 그대로 옮긴 것이고
 * 임의로 느슨하게 고치지 않았다. 원본과 어긋나면
 * tests/vendor-host/plugin-sdk-host-parity.test.ts 가 빨간불을 낸다.
 *
 * 원본 출처:
 *   openclaw/src/agents/tools/common.ts        (jsonResult, textResult, readStringParam, ToolInputError)
 *   openclaw/src/param-key.ts                  (readSnakeCaseParamRaw, resolveSnakeCaseParamKey, toSnakeCaseKey)
 *   openclaw/packages/normalization-core/src/string-coerce.ts (lowercasePreservingWhitespace)
 */

export type AgentToolResult<TDetails> = {
  content: { type: "text"; text: string }[];
  details: TDetails;
};

export class ToolInputError extends Error {
  readonly status: number = 400;

  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

function lowercasePreservingWhitespace(value: string): string {
  return value.toLowerCase();
}

function toSnakeCaseKey(key: string): string {
  const snakeKey = key
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  return lowercasePreservingWhitespace(snakeKey);
}

export function resolveSnakeCaseParamKey(
  params: Record<string, unknown>,
  key: string,
): string | undefined {
  if (Object.hasOwn(params, key)) {
    return key;
  }
  const snakeKey = toSnakeCaseKey(key);
  if (snakeKey !== key && Object.hasOwn(params, snakeKey)) {
    return snakeKey;
  }
  return undefined;
}

export function readSnakeCaseParamRaw(params: Record<string, unknown>, key: string): unknown {
  const resolvedKey = resolveSnakeCaseParamKey(params, key);
  if (resolvedKey) {
    return params[resolvedKey];
  }
  return undefined;
}

export type StringParamOptions = {
  required?: boolean;
  trim?: boolean;
  label?: string;
  allowEmpty?: boolean;
};

function readParamRaw(params: Record<string, unknown>, key: string): unknown {
  return readSnakeCaseParamRaw(params, key);
}

export function asToolParamsRecord(params: unknown): Record<string, unknown> {
  return params && typeof params === "object" && !Array.isArray(params)
    ? (params as Record<string, unknown>)
    : {};
}

export function readStringParam(
  params: Record<string, unknown>,
  key: string,
  options: StringParamOptions & { required: true },
): string;
export function readStringParam(
  params: Record<string, unknown>,
  key: string,
  options?: StringParamOptions,
): string | undefined;
export function readStringParam(
  params: Record<string, unknown>,
  key: string,
  options: StringParamOptions = {},
) {
  const { required = false, trim = true, label = key, allowEmpty = false } = options;
  const raw = readParamRaw(params, key);
  if (typeof raw !== "string") {
    if (required) {
      throw new ToolInputError(`${label} required`);
    }
    return undefined;
  }
  const value = trim ? raw.trim() : raw;
  if (!value && !allowEmpty) {
    if (required) {
      throw new ToolInputError(`${label} required`);
    }
    return undefined;
  }
  return value;
}

export function textResult<TDetails>(text: string, details: TDetails): AgentToolResult<TDetails> {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
    details,
  };
}

export function jsonResult(payload: unknown): AgentToolResult<unknown> {
  return textResult(JSON.stringify(payload, null, 2), payload);
}
