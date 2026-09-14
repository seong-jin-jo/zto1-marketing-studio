export type HiggsfieldTransaction = {
  display_name?: string;
  credits?: number;
  action?: string;
  created_at?: string;
};

export type HiggsfieldTransactionParseResult =
  | { ok: true; items: HiggsfieldTransaction[] }
  | { ok: false; items: [] };

/** Higgsfield CLI의 배열·페이지 객체 응답과 진행 출력 접두사를 모두 처리한다. */
export function parseTransactionPage(stdout: string): HiggsfieldTransactionParseResult {
  const trimmed = stdout.trim();
  if (!trimmed) return { ok: false, items: [] };
  const candidates = [trimmed.slice(trimmed.indexOf("{")), trimmed.slice(trimmed.indexOf("["))]
    .filter((candidate) => candidate && !candidate.startsWith("undefined"));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (Array.isArray(parsed)) return { ok: true, items: parsed as HiggsfieldTransaction[] };
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown }).items)) {
        return { ok: true, items: (parsed as { items: HiggsfieldTransaction[] }).items };
      }
    } catch {
      // CLI may prefix progress output. Try the next JSON boundary.
    }
  }
  return { ok: false, items: [] };
}

export function parseTransactionItems(stdout: string): HiggsfieldTransaction[] {
  return parseTransactionPage(stdout).items;
}
