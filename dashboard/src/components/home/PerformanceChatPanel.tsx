"use client";

// 성과실 담당. 회장 "성과실에서는 챗봇 있어야할까?" / "L5 는 성과실에 존재는 하는거냐?"의 답.
// 구조질문 문서 질문3 추천안(다3): 성과실 챗봇은 "해석과 조치"만 한다.
//   - "이번 주 왜 이랬어" → 표본과 기간을 밝히고 판정(표본 부족이면 판정 보류라고 말한다)
//   - "안 터진 글 정리해줘" → 기준을 먼저 제시하고 대상 후보를 보여준다(자동 삭제는 없다, 승낙 뒤에만)
//   - "이거 왜 잘 됐어" → 잘된 글의 공통점을 규칙 후보로 뽑아 학습 승낙을 요청한다(L5, POST /api/performance/learned-rules)
// 계산은 이미 부모(page.tsx→PerformanceRoom)가 내려주는 posts로 클라이언트에서 한다(별도 DB 조회 없음).

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { apiPost, fetcher } from "@/lib/api";
import type { PerformancePost } from "./PerformanceRoom";
import { Button } from "@/components/shared/Button";
import { Stack } from "@/components/shared/Stack";

interface LearnedRule {
  id: string;
  text: string;
  sourcePostIds: string[];
  sourceLabel: string;
  createdAt: string;
}

interface ChatTurn {
  id: string;
  from: "me" | "담당";
  text: string;
  ruleCandidate?: { text: string; sourcePostIds: string[] };
}

const SAMPLE_THRESHOLD = 5;

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

function platformOf(p: PerformancePost): string {
  return p.platform;
}

function within(post: PerformancePost, fromMs: number, toMs: number): boolean {
  const t = new Date(post.published_at).getTime();
  return Number.isFinite(t) && t >= fromMs && t < toMs;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

export function PerformanceChatPanel({
  workspaceId,
  posts,
  focus,
  expandedByDefault = false,
}: {
  workspaceId?: string;
  posts: PerformancePost[];
  focus: string;
  expandedByDefault?: boolean;
}) {
  const { data: rulesData, mutate: mutateRules } = useSWR<{ rules: LearnedRule[] }>(
    workspaceId ? `/api/performance/learned-rules?tenant_id=${encodeURIComponent(workspaceId)}` : null,
    fetcher,
  );
  const learnedRules = rulesData?.rules ?? [];

  const [turns, setTurns] = useState<ChatTurn[]>([
    { id: "intro", from: "담당", text: "성과 해석과 조치를 도와드립니다. 아래 버튼으로 물어보거나 직접 써 주세요." },
  ]);
  const [draft, setDraft] = useState("");
  const [savingRuleFor, setSavingRuleFor] = useState<string | null>(null);
  const [open, setOpen] = useState(expandedByDefault);

  const published = useMemo(
    () => posts.filter((p) => p.status === "published" && (focus === "all" || platformOf(p) === focus)),
    [posts, focus],
  );

  const say = (text: string, ruleCandidate?: ChatTurn["ruleCandidate"]) => {
    setTurns((cur) => [...cur, { id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, from: "담당", text, ruleCandidate }]);
  };
  const sayMine = (text: string) => {
    setTurns((cur) => [...cur, { id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, from: "me", text }]);
  };

  const answerWeeklyChange = () => {
    sayMine("이번 주 왜 이랬어");
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const thisWeek = published.filter((p) => within(p, now - weekMs, now));
    const lastWeek = published.filter((p) => within(p, now - weekMs * 2, now - weekMs));
    const measuredThis = thisWeek.filter((p) => p.views != null);
    const measuredLast = lastWeek.filter((p) => p.views != null);
    if (measuredThis.length < SAMPLE_THRESHOLD) {
      say(`이번 주 표본이 ${measuredThis.length}건이라 아직 판정 못 합니다. ${SAMPLE_THRESHOLD}건부터 볼 수 있어요.`);
      return;
    }
    const avgThis = average(measuredThis.map((p) => Number(p.views || 0)));
    const avgLast = average(measuredLast.map((p) => Number(p.views || 0)));
    if (measuredLast.length < SAMPLE_THRESHOLD) {
      say(`이번 주 평균 조회 ${avgThis.toLocaleString()}입니다. 지난주 표본이 부족해(${measuredLast.length}건) 비교는 아직 어렵습니다.`);
      return;
    }
    const diff = avgLast > 0 ? Math.round(((avgThis - avgLast) / avgLast) * 100) : null;
    const dir = diff === null ? "" : diff >= 0 ? "올랐습니다" : "떨어졌습니다";
    say(`이번 주 평균 조회 ${avgThis.toLocaleString()}, 지난주 ${avgLast.toLocaleString()}. ${diff === null ? "비교할 지난주 기준이 없습니다." : `${Math.abs(diff)}% ${dir}. 표본 이번 주 ${measuredThis.length}건, 지난주 ${measuredLast.length}건 기준입니다.`}`);
  };

  const answerCleanupCandidates = () => {
    sayMine("안 터진 글 정리해줘");
    const measured = published.filter((p) => p.views != null);
    if (measured.length < SAMPLE_THRESHOLD) {
      say(`판정할 표본이 ${measured.length}건뿐이라 아직 기준을 못 세웁니다. ${SAMPLE_THRESHOLD}건부터 정리 후보를 보여드릴게요.`);
      return;
    }
    const avg = average(measured.map((p) => Number(p.views || 0)));
    const threshold = Math.round(avg * 0.3);
    const candidates = measured
      .filter((p) => Number(p.views || 0) <= threshold)
      .sort((a, b) => Number(a.views || 0) - Number(b.views || 0))
      .slice(0, 5);
    if (candidates.length === 0) {
      say(`평균 조회 ${avg.toLocaleString()} 대비 뚜렷하게 저조한 글이 없습니다. 기준: 평균의 30%(${threshold.toLocaleString()}) 이하.`);
      return;
    }
    const list = candidates.map((p) => `· ${(p.text || "제목 미수집").slice(0, 30)} (조회 ${Number(p.views || 0).toLocaleString()})`).join("\n");
    say(`기준은 평균 조회(${avg.toLocaleString()})의 30%(${threshold.toLocaleString()}) 이하입니다. 후보 ${candidates.length}건:\n${list}\n\n자동 삭제는 아직 없습니다. 지우려면 각 게시물 링크에서 직접 지워 주세요. 아래 목록의 "게시물에서 확인하기"를 눌러 확인할 수 있어요.`);
  };

  const answerWhyGood = () => {
    sayMine("이거 왜 잘 됐어");
    const measured = published.filter((p) => p.views != null).sort((a, b) => Number(b.views || 0) - Number(a.views || 0));
    if (measured.length < SAMPLE_THRESHOLD) {
      say(`아직 표본이 ${measured.length}건이라 규칙을 뽑기엔 이릅니다. ${SAMPLE_THRESHOLD}건부터 뽑아 드릴게요.`);
      return;
    }
    const top = measured.slice(0, 3);
    const rest = measured.slice(3);
    const topQ = top.filter((p) => (p.text || "").includes("?")).length;
    const restQ = rest.length ? rest.filter((p) => (p.text || "").includes("?")).length / rest.length : 0;
    const topLen = average(top.map((p) => (p.text || "").length));
    const restLen = average(rest.map((p) => (p.text || "").length)) || topLen;
    const platformCounts = new Map<string, number>();
    for (const p of top) platformCounts.set(p.platform, (platformCounts.get(p.platform) || 0) + 1);
    const dominantPlatform = [...platformCounts.entries()].sort((a, b) => b[1] - a[1])[0];

    let candidateText: string | null = null;
    if (topQ / top.length >= 2 / 3 && restQ < 0.3) {
      candidateText = "물음표로 끝나는 훅이 있는 글이 평균보다 잘 갑니다.";
    } else if (dominantPlatform && dominantPlatform[1] >= 2) {
      candidateText = `${dominantPlatform[0]} 채널 글이 상위권을 차지합니다. 그 채널 비중을 늘려볼 만합니다.`;
    } else if (Math.abs(topLen - restLen) > 40) {
      candidateText = topLen < restLen ? "짧은 글이 긴 글보다 잘 갑니다." : "긴 글이 짧은 글보다 잘 갑니다.";
    }

    if (!candidateText) {
      say(`조회 상위 ${top.length}편을 봤지만 뚜렷한 공통점을 못 찾았습니다. 표본이 더 쌓이면 다시 봐 드릴게요.`);
      return;
    }
    say(`조회 상위 ${top.length}편(${top.map((p) => `${Number(p.views || 0).toLocaleString()}회`).join(", ")})을 보니: ${candidateText} 이 규칙을 배울까요?`, {
      text: candidateText,
      sourcePostIds: top.map((p) => p.id),
    });
  };

  const learnRule = async (turnId: string, ruleCandidate: NonNullable<ChatTurn["ruleCandidate"]>) => {
    if (!workspaceId) return;
    setSavingRuleFor(turnId);
    try {
      await apiPost("/api/performance/learned-rules", {
        tenant_id: workspaceId,
        text: ruleCandidate.text,
        sourcePostIds: ruleCandidate.sourcePostIds,
        sourceLabel: `조회 상위 ${ruleCandidate.sourcePostIds.length}편에서 뽑음 · ${fmtDate(new Date().toISOString())}`,
      });
      await mutateRules();
      setTurns((cur) => cur.map((t) => (t.id === turnId ? { ...t, ruleCandidate: undefined } : t)));
      say("배웠습니다. 다음 생성부터 이 규칙을 참고합니다.");
    } finally {
      setSavingRuleFor(null);
    }
  };

  const submitFree = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    if (/왜.*(좋|떨어|안|나빠)|이번\s*주/.test(text)) return answerWeeklyChange();
    if (/안\s*터진|정리/.test(text)) return answerCleanupCandidates();
    if (/왜.*잘|잘\s*됐/.test(text)) return answerWhyGood();
    sayMine(text);
    say("아직 그 말은 못 알아듣습니다. 아래 버튼 중 하나로 물어봐 주세요.");
  };

  useEffect(() => {
    if (open) return;
  }, [open]);

  return (
    <aside className="card p-region" aria-label="성과실 담당 대화창" data-perf-chat data-chat-dock="performance">
      <Stack gap={12}>
        <div className="flex items-center justify-between gap-stack">
          <div>
            <b className="block text-body text-text">성과실 담당</b>
            <span className="text-caption text-success">지금 대기 중</span>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "접기" : "대화 열기"}
          </Button>
        </div>

        {open && (
          <>
            <div className="flex flex-wrap gap-stack-tight">
              <Button size="sm" onClick={answerWeeklyChange}>이번 주 왜 이랬어</Button>
              <Button size="sm" onClick={answerCleanupCandidates}>안 터진 글 정리해줘</Button>
              <Button size="sm" onClick={answerWhyGood}>이거 왜 잘 됐어</Button>
            </div>

            <div className="max-h-[40vh] overflow-y-auto rounded-surface border border-border bg-surface-2 p-stack" role="log" aria-live="polite">
              <Stack gap={12}>
                {turns.map((turn) => (
                  <div key={turn.id} className={turn.from === "me" ? "text-right" : ""}>
                    <span className={`inline-block max-w-full whitespace-pre-wrap break-keep rounded-control px-stack py-stack-tight text-body-sm ${turn.from === "me" ? "bg-accent text-accent-fg" : "bg-surface text-text"}`}>
                      {turn.text}
                    </span>
                    {turn.ruleCandidate && (
                      <div className="mt-stack-tight flex justify-end gap-stack-tight">
                        <Button size="sm" variant="primary" disabled={savingRuleFor === turn.id} onClick={() => void learnRule(turn.id, turn.ruleCandidate!)}>
                          {savingRuleFor === turn.id ? "배우는 중" : "배우기"}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setTurns((cur) => cur.map((t) => (t.id === turn.id ? { ...t, ruleCandidate: undefined } : t)))}>
                          넘어가기
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </Stack>
            </div>

            <form
              className="flex gap-stack-tight"
              onSubmit={(event) => {
                event.preventDefault();
                submitFree();
              }}
            >
              <input
                aria-label="성과실 담당에게 묻기"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="직접 물어보셔도 됩니다"
                className="min-h-control-touch min-w-0 flex-1 rounded-control border border-border bg-surface px-stack text-body-sm text-text"
              />
              <Button size="sm" type="submit">보내기</Button>
            </form>
          </>
        )}

        <div className="border-t border-border pt-stack">
          <p className="text-caption font-semibold text-subtle">성과에서 배운 규칙</p>
          {learnedRules.length === 0 ? (
            <p className="mt-micro text-caption text-subtle">아직 없음</p>
          ) : (
            <ul className="mt-stack-tight space-y-stack-tight">
              {learnedRules.map((rule) => (
                <li key={rule.id} className="rounded-control border border-border bg-surface-2 p-stack-tight text-caption text-muted break-keep">
                  <span className="block text-body-sm text-text">{rule.text}</span>
                  <span className="text-subtle">{rule.sourceLabel} · {fmtDate(rule.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Stack>
    </aside>
  );
}
