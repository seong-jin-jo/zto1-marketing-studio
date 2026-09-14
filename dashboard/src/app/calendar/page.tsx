"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { useUIStore } from "@/store/ui-store";
import { PublishTrip } from "@/components/shared/PublishTrip";
import { SCHEDULABLE_PLATFORM_LABELS } from "@/lib/constants";
import type { PublishReturnContext } from "@/lib/publish-return-context";

interface ScheduleRow {
  id: string;
  draftId: string | null;
  platforms: string[];
  scheduledAt: string;
  status: string;
}

interface Post {
  id: string;
  text?: string;
  status?: string;
  scheduledAt?: string | null;
  approvedAt?: string | null;
  generatedAt?: string | null;
  publishedAt?: string | null;
  publishContext?: PublishReturnContext | null;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-surface-2",
  approved: "bg-accent",
  scheduled: "bg-accent",
  published: "bg-success",
  failed: "bg-danger",
};

// 로컬 날짜 키 YYYY-MM-DD
function dateKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 게시물의 대표 날짜: 예약>발행>승인>생성 순.
function postDate(p: Post): string | null {
  return dateKey(p.scheduledAt || p.publishedAt || p.approvedAt || p.generatedAt);
}

export default function CalendarPage() {
  const searchParams = useSearchParams();
  // 어디서 열었나에 따라 기본 보기가 다르다(구조질문 문서 질문4 승인안).
  // 성과실에서 열면 "지난 4주, 발행이 몰린 날이 진하다"가 기본이다. 헤더/발행실에서 열면 그대로 이번 달.
  const fromPerformance = searchParams?.get("from") === "performance";
  const fromPublish = searchParams?.get("from") === "publish";
  const focusDate = searchParams?.get("date") || null;
  const { activeWorkspace } = useUIStore();
  const { data } = useSWR<{ posts: Post[] }>("/api/queue?status=all&returnTo=calendar", fetcher);
  // 예약은 queue가 아니라 schedules에 쌓인다. 여기를 안 읽으면 방금 건 예약이 캘린더에
  // 영영 안 보인다(회장 지적 "예약 발행한건 어디서 확인해"의 실제 원인).
  const { data: scheduleData } = useSWR<{ schedules: ScheduleRow[] }>(
    activeWorkspace ? `/api/schedule?tenant_id=${activeWorkspace.id}` : null,
    fetcher,
  );
  const posts = useMemo(() => data?.posts || [], [data]);
  const schedules = useMemo(() => scheduleData?.schedules || [], [scheduleData]);

  // 표시 기준 연/월(0-index month)
  const today = new Date();
  const focused = focusDate ? new Date(`${focusDate}T00:00:00`) : null;
  const validFocus = focused && !isNaN(focused.getTime()) ? focused : null;
  const [ym, setYm] = useState({
    y: (validFocus ?? today).getFullYear(),
    m: (validFocus ?? today).getMonth(),
  });
  const [selected, setSelected] = useState<string | null>(validFocus ? focusDate : null);

  const byDate = useMemo(() => {
    const map = new Map<string, Post[]>();
    const push = (k: string, p: Post) => { (map.get(k) || map.set(k, []).get(k)!).push(p); };
    for (const p of posts) {
      const k = postDate(p);
      if (!k) continue;
      push(k, p);
    }
    // 예약 건은 어느 채널에 언제 올라가는지가 본문이다.
    for (const s of schedules) {
      const k = dateKey(s.scheduledAt);
      if (!k) continue;
      const labels = SCHEDULABLE_PLATFORM_LABELS as Record<string, string>;
      const where = (s.platforms || []).map((p) => labels[p] || p).join(" · ") || "채널 미지정";
      push(k, {
        id: `schedule:${s.id}`,
        text: `예약 발행 · ${where}`,
        status: s.status === "scheduled" ? "scheduled" : s.status,
        scheduledAt: s.scheduledAt,
      });
    }
    return map;
  }, [posts, schedules]);

  const first = new Date(ym.y, ym.m, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const keyOf = (day: number) => `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const move = (delta: number) => {
    const d = new Date(ym.y, ym.m + delta, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(null);
  };

  const selectedPosts = selected ? byDate.get(selected) || [] : [];

  return (
    <div className="px-pad-inset sm:px-region py-stack-section">
      <PublishTrip current="calendar" />
      <div className="flex items-center justify-between mb-pad-inset">
        <div>
          <h2 className="text-subheading font-bold text-text">발행 캘린더</h2>
          <p className="text-caption text-subtle mt-micro">
            {fromPublish
              ? "예약을 걸었습니다. 그 예약이 놓인 날을 아래에서 펴 두었습니다."
              : fromPerformance
                ? "성과실에서 왔어요. 발행이 몰린 날일수록 진하게 보입니다."
                : "언제 무엇이 올라가는지 날짜로 봅니다. 예약해 둔 것과 이미 올라간 것이 함께 보입니다."}
          </p>
          <p className="text-caption text-subtle mt-micro">
            검토를 기다리는 작업물은 <Link href="/inbox" className="font-semibold underline">승인 인박스</Link>에 있습니다. 여기는 날짜가 정해진 것만 봅니다.
          </p>
        </div>
        <div className="flex items-center gap-stack-tight text-body-sm">
          {fromPublish ? (
            <Link
              href="/studio?room=publish"
              data-testid="calendar-back-to-publish"
              className="inline-flex min-h-control-touch items-center rounded-control border border-border bg-surface-2 px-stack text-body-sm font-semibold text-muted hover:bg-surface"
            >
              발행실로 돌아가기
            </Link>
          ) : null}
          <button aria-label="이전 달" onClick={() => move(-1)} className="ds-touch-target inline-flex items-center justify-center px-stack-tight py-micro rounded-chip bg-surface-2 hover:bg-surface-2 text-muted">←</button>
          <span className="text-text font-medium w-28 text-center">{ym.y}년 {ym.m + 1}월</span>
          <button aria-label="다음 달" onClick={() => move(1)} className="ds-touch-target inline-flex items-center justify-center px-stack-tight py-micro rounded-chip bg-surface-2 hover:bg-surface-2 text-muted">→</button>
          <button onClick={() => { setYm({ y: today.getFullYear(), m: today.getMonth() }); setSelected(null); }} className="ds-touch-target inline-flex items-center justify-center ml-micro px-stack-tight py-micro rounded-chip bg-surface-2 hover:bg-surface-2 text-subtle text-caption">오늘</button>
        </div>
      </div>

      {/* 요일 */}
      <div className="grid grid-cols-7 gap-micro mb-micro">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`text-caption text-center py-micro ${i === 0 ? "text-danger" : i === 6 ? "text-accent" : "text-subtle"}`}>{w}</div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-micro">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} className="aspect-square sm:aspect-[4/3]" />;
          const k = keyOf(day);
          const dayPosts = byDate.get(k) || [];
          const isToday = k === todayKey;
          const publishedCount = dayPosts.filter((p) => p.status === "published").length;
          const heavy = fromPerformance && publishedCount >= 3;
          const medium = fromPerformance && publishedCount >= 1 && publishedCount < 3;
          const perfBg = heavy ? "bg-success/25" : medium ? "bg-success/10" : isToday ? "bg-accent-soft" : "bg-surface/40";
          return (
            <button
              key={k}
              onClick={() => setSelected(selected === k ? null : k)}
              className={`aspect-square sm:aspect-[4/3] rounded-chip p-micro text-left flex flex-col border ${selected === k ? "border-accent" : "border-transparent"} ${fromPerformance ? perfBg : isToday ? "bg-accent-soft" : "bg-surface/40"} hover:bg-surface-2/60`}
            >
              <span className={`text-caption ${isToday ? "text-accent font-bold" : "text-subtle"}`}>{day}</span>
              <div className="flex-1 overflow-hidden mt-micro space-y-micro">
                {dayPosts.slice(0, 2).map((p) => (
                  <div key={p.id} className="flex items-center gap-micro">
                    <span className={`w-1.5 h-1.5 rounded-pill shrink-0 ${STATUS_COLOR[p.status || "draft"] || "bg-surface-2"}`} />
                    <span className="text-caption text-subtle truncate">{(p.text || "").slice(0, 18) || "글"}</span>
                  </div>
                ))}
                {dayPosts.length > 2 && <div className="text-caption text-subtle">+{dayPosts.length - 2}</div>}
              </div>
            </button>
          );
        })}
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-stack mt-stack text-caption text-subtle">
        <span><span className="inline-block w-2 h-2 rounded-pill bg-surface-2 mr-micro" />초안</span>
        <span><span className="inline-block w-2 h-2 rounded-pill bg-accent mr-micro" />예약/승인</span>
        <span><span className="inline-block w-2 h-2 rounded-pill bg-success mr-micro" />발행</span>
        <span><span className="inline-block w-2 h-2 rounded-pill bg-danger mr-micro" />실패</span>
      </div>

      {/* 선택 날짜 목록 */}
      {selected && (
        <div className="mt-stack-section">
          <h3 className="text-body-sm text-muted mb-stack-tight">{selected} · {selectedPosts.length}건</h3>
          {selectedPosts.length === 0 ? (
            <p className="text-caption text-subtle">이 날짜에 글이 없습니다.</p>
          ) : (
            <div className="space-y-stack-tight">
              {selectedPosts.map((p) => (
                <div key={p.id} className="card p-stack text-caption flex items-start gap-stack-tight">
                  <span className={`w-2 h-2 rounded-pill mt-micro shrink-0 ${STATUS_COLOR[p.status || "draft"] || "bg-surface-2"}`} />
                  <div className="flex-1">
                    <p className="text-muted line-clamp-2 whitespace-pre-wrap">{p.text || "(내용 없음)"}</p>
                    <p className="text-caption text-subtle mt-micro">{p.status || "draft"}</p>
                  </div>
                  {p.publishContext ? (
                    <Link
                      href={p.publishContext.returnUrl}
                      className="inline-flex min-h-control-touch shrink-0 items-center rounded-control border border-border bg-surface-2 px-stack text-caption font-semibold text-muted hover:bg-surface"
                    >
                      발행실로 돌아가기
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
