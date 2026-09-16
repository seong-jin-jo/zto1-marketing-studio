"use client";

import { useState } from "react";

interface SetupGuideProps {
  quick: string[];
  detail: string;
  warning?: string;
  images?: { src: string; alt: string }[];
}

export function SetupGuide({ quick, detail, warning, images }: SetupGuideProps) {
  const [showDetail, setShowDetail] = useState(false);
  // 에셋이 아직 없을 수 있으므로 깨진 이미지는 조용히 숨김(앱 경험 비훼손).
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  return (
    <div>
      <h3 className="text-body-sm font-medium text-muted mb-stack">연결 가이드</h3>
      <ol className="text-caption text-subtle space-y-stack-tight list-decimal list-inside">
        {quick.map((step, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: step }} />
        ))}
      </ol>
      {images && images.length > 0 && (
        <div className="mt-stack space-y-stack-tight">
          {images.filter((img) => !hidden[img.src]).map((img) => (
            // raw-media-ok: 채널 연결 설명서에 붙는 안내 그림이다(types/channel.ts 의
            // SetupGuide images). 고객 산출물이 아니라 서명 배달을 타지 않는다.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={img.src}
              src={img.src}
              alt={img.alt}
              loading="lazy"
              onError={() => setHidden((h) => ({ ...h, [img.src]: true }))}
              className="w-full rounded-chip border border-border"
            />
          ))}
        </div>
      )}
      {warning && (
        <p className="text-caption text-warning/70 mt-stack-tight">{warning}</p>
      )}
      {detail && !warning && (
        <>
          <button
            onClick={() => setShowDetail(!showDetail)}
            className="inline-flex items-center min-h-control-touch text-caption text-accent hover:text-accent mt-stack"
          >
            {showDetail ? "접기" : "더 알아보기"}
          </button>
          {showDetail && (
            <div className="mt-stack-tight p-stack rounded-chip bg-surface/50">
              <p className="text-caption text-subtle leading-relaxed whitespace-pre-wrap">{detail}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
