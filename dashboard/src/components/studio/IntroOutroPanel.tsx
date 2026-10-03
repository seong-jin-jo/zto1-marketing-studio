"use client";

/**
 * 편집실 영상 — 인트로/아웃트로(Remotion) 고르기·미리보기·삽입·교체·제거.
 *
 * PRD §8.3 역할 분담: 이 패널은 Remotion 컴포지션(인트로·아웃트로·움직이는 타이틀)만
 * 다룬다. 자막 굽기·컷·합치기는 `/api/video/subtitle`과 `/api/video/intro-outro`
 * (서버의 ffmpeg 단계)가 맡는다. 렌더는 비동기(202+jobId)이므로 탭을 바꿔도 폴링이
 * 이어지도록 로컬스토리지에 진행 중 jobId를 적어둔다(세션맥락: export progress가
 * survives tab switches).
 */
import { useEffect, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { Button } from "@/components/shared/Button";
import { authHeaders } from "@/lib/auth";
import {
  INTRO_OUTRO_COMPS,
  DEFAULT_BRAND_PROPS,
  COMP_WIDTH,
  COMP_HEIGHT,
  COMP_FPS,
  type IntroOutroCompId,
  type BrandProps,
} from "../../../remotion/IntroOutroComps";
import { isIntroOutroStale, type IntroOutroApplied } from "@/lib/studio/video-edit-contract";

export interface IntroOutroPanelProps {
  /** 편집실에 로드된, 아직 인트로/아웃트로를 입히지 않은 원본 영상 파일명. 없으면 패널 비활성. */
  sourceFilename: string | null;
  tenantId?: string;
  brandName?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  /**
   * 적용된 결과(videoEdit.introOutro). 다른 영상 편집과 같은 자동저장 경로로 저장되므로
   * 새로고침해도 유지된다(2026-10-02 회장 반려 R-27-5 대응). null이면 미적용.
   */
  applied?: IntroOutroApplied;
  onApplied?: (applied: IntroOutroApplied) => void;
}

const JOB_STORAGE_KEY = "osmu-intro-outro-job";

function loadStoredJobId(sourceFilename: string | null): string | null {
  if (!sourceFilename || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(JOB_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sourceFilename?: string; jobId?: string };
    return parsed.sourceFilename === sourceFilename ? parsed.jobId ?? null : null;
  } catch {
    return null;
  }
}

function storeJobId(sourceFilename: string, jobId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (!jobId) window.localStorage.removeItem(JOB_STORAGE_KEY);
    else window.localStorage.setItem(JOB_STORAGE_KEY, JSON.stringify({ sourceFilename, jobId }));
  } catch {
    // 로컬스토리지 불가(사생활 모드 등) — 탭 전환 복원만 못 하고 기능은 그대로 동작.
  }
}

export function IntroOutroPanel({ sourceFilename, tenantId, brandName, logoUrl, primaryColor, secondaryColor, applied = null, onApplied }: IntroOutroPanelProps) {
  const [introId, setIntroId] = useState<IntroOutroCompId | null>(null);
  const [outroId, setOutroId] = useState<IntroOutroCompId | null>(null);
  const [titleText, setTitleText] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "queued" | "processing" | "completed" | "failed">("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const brand = {
    ...DEFAULT_BRAND_PROPS,
    brandName: brandName || DEFAULT_BRAND_PROPS.brandName,
    logoUrl: logoUrl ?? DEFAULT_BRAND_PROPS.logoUrl,
    primaryColor: primaryColor || DEFAULT_BRAND_PROPS.primaryColor,
    secondaryColor: secondaryColor || DEFAULT_BRAND_PROPS.secondaryColor,
    titleText,
  };

  // 탭 전환 복원: 이 소스 파일에 대해 진행 중이던 jobId가 있으면 폴링을 재개한다.
  useEffect(() => {
    const stored = loadStoredJobId(sourceFilename);
    if (stored) {
      setJobId(stored);
      setStatus("processing");
    }
  }, [sourceFilename]);

  useEffect(() => {
    if (!jobId || status === "completed" || status === "failed") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const qs = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
        const res = await fetch(`/api/video/intro-outro/job/${jobId}${qs}`, { headers: authHeaders() });
        const body = await res.json();
        if (!res.ok) {
          setStatus("failed");
          setError(body?.error || "작업 상태를 확인할 수 없습니다.");
          if (sourceFilename) storeJobId(sourceFilename, null);
          return;
        }
        if (body.status === "completed") {
          setStatus("completed");
          setResultUrl(body.file);
          if (sourceFilename) {
            storeJobId(sourceFilename, null);
            // 결과를 videoEdit에 실어 다른 영상 편집과 같은 자동저장 경로로 보존한다
            // (2026-10-02 회장 반려: 발행/미리보기가 원본을 계속 쓰던 결함). deliverUrl은
            // job GET이 이미 서명해 돌려주는 /api/media/<token>(M-3, Bearer 불필요 —
            // video 태그 src가 못 보내는 헤더에 의존하지 않는다). sourceFilename은 이 합성이
            // 유효한 원본을 기록해 나중에 원본이 바뀌면(M-4) 낡음을 판정할 수 있게 한다.
            onApplied?.({
              introCompId: introId,
              outroCompId: outroId,
              resultFilename: body.filename,
              deliverUrl: body.file,
              sourceFilename,
            });
          }
        } else if (body.status === "failed") {
          setStatus("failed");
          setError(body.error || "렌더에 실패했습니다.");
          if (sourceFilename) storeJobId(sourceFilename, null);
        } else {
          setStatus(body.status);
        }
      } catch {
        // 네트워크 일시 오류는 다음 폴링에서 재시도 — 여기서 상태를 failed로 떨어뜨리지 않는다.
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, status]);

  async function submit() {
    if (!sourceFilename || (!introId && !outroId)) return;
    setError(null);
    setResultUrl(null);
    try {
      const res = await fetch("/api/video/intro-outro", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          sourceFilename,
          tenant_id: tenantId,
          introCompId: introId,
          outroCompId: outroId,
          brandName: brand.brandName,
          logoUrl: brand.logoUrl,
          primaryColor: brand.primaryColor,
          secondaryColor: brand.secondaryColor,
          introTitleText: introId ? titleText : undefined,
          outroTitleText: outroId ? titleText : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error || "인트로/아웃트로 삽입 요청에 실패했습니다.");
        return;
      }
      setJobId(body.jobId);
      setStatus("queued");
      storeJobId(sourceFilename, body.jobId);
    } catch {
      setError("인트로/아웃트로 삽입 요청에 실패했습니다.");
    }
  }

  function removeSelection(slot: "intro" | "outro") {
    if (slot === "intro") setIntroId(null);
    else setOutroId(null);
  }

  if (!sourceFilename) {
    return <p className="text-caption text-subtle" data-intro-outro-empty>영상을 먼저 불러오면 인트로/아웃트로를 고를 수 있습니다.</p>;
  }

  return (
    <div className="space-y-stack rounded-control border border-border p-pad-inset" data-intro-outro-panel>
      <p className="text-caption-strong">인트로 · 아웃트로</p>
      {error ? <p role="alert" className="text-caption text-danger" data-intro-outro-error>{error}</p> : null}
      {applied && isIntroOutroStale(applied, sourceFilename) ? (
        <p role="alert" className="text-caption text-danger" data-intro-outro-stale>
          원본 영상이 바뀌어 적용했던 인트로/아웃트로({applied.resultFilename})가 더 이상 맞지 않습니다.
          발행·미리보기 모두 원본으로 되돌렸습니다. 다시 적용해 주세요.{" "}
          <Button type="button" variant="secondary" size="sm" className="text-danger" onClick={() => onApplied?.(null)} data-intro-outro-remove-applied>
            낡은 적용 지우기
          </Button>
        </p>
      ) : applied ? (
        <p className="text-caption text-subtle" data-intro-outro-applied>
          적용됨: {applied.resultFilename}{" "}
          <Button type="button" variant="secondary" size="sm" className="text-danger" onClick={() => onApplied?.(null)} data-intro-outro-remove-applied>
            제거(원본으로 되돌리기)
          </Button>
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-pad-inset">
        <PickerSlot label="인트로" selectedId={introId} onSelect={setIntroId} onRemove={() => removeSelection("intro")} prefix="intro-" brand={brand} />
        <PickerSlot label="아웃트로" selectedId={outroId} onSelect={setOutroId} onRemove={() => removeSelection("outro")} prefix="outro-" brand={brand} />
      </div>

      <label className="block space-y-stack-tight" data-intro-outro-title-input>
        <span className="text-caption text-subtle">타이틀 문구(타이틀 카드 템플릿에 쓰입니다)</span>
        <input
          type="text"
          value={titleText}
          onChange={(e) => setTitleText(e.target.value)}
          placeholder={brand.brandName}
          className="w-full rounded-control border border-border bg-surface p-stack-tight text-body"
        />
      </label>

      <div className="flex items-center gap-stack-tight">
        <Button onClick={submit} disabled={(!introId && !outroId) || status === "queued" || status === "processing"} data-intro-outro-submit>
          {introId || outroId ? "삽입/교체" : "선택 없음"}
        </Button>
        {status === "queued" || status === "processing" ? (
          <span className="text-caption text-subtle" data-intro-outro-progress>렌더 중입니다. 탭을 옮겨도 이어집니다…</span>
        ) : null}
        {status === "completed" && resultUrl ? (
          <a href={resultUrl} target="_blank" rel="noreferrer" className="text-caption text-link" data-intro-outro-result>
            완성 파일 보기
          </a>
        ) : null}
      </div>
    </div>
  );
}

function PickerSlot({
  label, selectedId, onSelect, onRemove, prefix, brand,
}: {
  label: string;
  selectedId: IntroOutroCompId | null;
  onSelect: (id: IntroOutroCompId) => void;
  onRemove: () => void;
  prefix: "intro-" | "outro-";
  brand: BrandProps;
}) {
  const ids = (Object.keys(INTRO_OUTRO_COMPS) as IntroOutroCompId[]).filter((id) => id.startsWith(prefix));
  return (
    <div className="space-y-stack-tight" data-intro-outro-slot={label}>
      <p className="text-caption text-subtle">{label}</p>
      <div className="flex flex-col gap-stack-tight">
        {ids.map((id) => {
          const comp = INTRO_OUTRO_COMPS[id];
          const active = selectedId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`flex items-center gap-stack-tight rounded-control border p-stack-tight text-left ${active ? "border-link bg-player-surface" : "border-border"}`}
              data-intro-outro-option={id}
            >
              <div className="h-16 w-9 overflow-hidden rounded-control bg-player-surface">
                <Player
                  component={comp.component}
                  inputProps={brand}
                  durationInFrames={comp.durationInFrames}
                  fps={COMP_FPS}
                  compositionWidth={COMP_WIDTH}
                  compositionHeight={COMP_HEIGHT}
                  style={{ width: "100%", height: "100%" }}
                  autoPlay
                  loop
                  controls={false}
                />
              </div>
              <span className="text-caption">{comp.label}</span>
            </button>
          );
        })}
      </div>
      {selectedId ? (
        <Button type="button" variant="secondary" size="sm" onClick={onRemove} className="text-danger" data-intro-outro-remove={label}>
          제거
        </Button>
      ) : null}
    </div>
  );
}
