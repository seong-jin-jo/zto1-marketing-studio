#!/usr/bin/env node

process.stdin.resume();
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({
    text_candidates: [
      {
        id: "question",
        label: "질문형",
        recommended: true,
        recommendation_reason: "문제를 먼저 묻는 구조에 맞습니다",
        content: {
          threads: "수능 100일, 지금 무엇을 바꿔야 할까요?",
          facebook: "수능 100일, 지금 무엇을 바꿔야 할까요? 공부 순서를 점검합니다.",
          x: "수능 100일, 지금 무엇을 바꿔야 할까요?",
          instagram: { caption: "수능 100일 공부 순서를 점검합니다.", hashtags: ["수능100일"], slides: ["수능 100일의 문제", "바꿀 공부 순서", "오늘 할 행동"] },
          shorts: { hook: "수능 100일, 무엇을 바꿀까요?", body: "공부 순서를 점검합니다.", cta: "오늘 한 가지를 시작하세요." },
          image_prompt: "Editorial study desk with a one hundred day planner",
        },
      },
      {
        id: "number",
        label: "숫자형",
        recommended: false,
        recommendation_reason: "실행 순서를 숫자로 보여 줍니다",
        content: {
          threads: "100일 동안 지킬 세 가지 공부 순서",
          facebook: "100일 동안 지킬 세 가지 공부 순서를 정리합니다.",
          x: "100일 동안 지킬 세 가지 공부 순서",
          instagram: { caption: "100일 동안 지킬 공부 순서를 정리합니다.", hashtags: ["수능100일"], slides: ["100일 공부 순서", "세 가지 기준", "오늘 할 행동"] },
          shorts: { hook: "100일 동안 지킬 세 가지", body: "공부 순서를 정리합니다.", cta: "첫 순서부터 시작하세요." },
          image_prompt: "Minimal numbered study plan with one hundred day calendar",
        },
      },
      {
        id: "pain",
        label: "고통 인식형",
        recommended: false,
        recommendation_reason: "계획이 흔들리는 불편을 먼저 짚습니다",
        content: {
          threads: "계획을 세워도 매일 흔들리는 이유가 있습니다.",
          facebook: "계획을 세워도 매일 흔들리는 이유를 찾아 공부 순서를 다시 잡습니다.",
          x: "계획을 세워도 매일 흔들리는 이유가 있습니다.",
          instagram: { caption: "흔들리는 계획을 공부 순서부터 다시 잡습니다.", hashtags: ["수능100일"], slides: ["계획이 흔들리는 이유", "공부 순서 다시 잡기", "오늘 할 행동"] },
          shorts: { hook: "계획이 자꾸 흔들리나요?", body: "공부 순서를 다시 잡습니다.", cta: "오늘 한 순서만 지키세요." },
          image_prompt: "Student reorganizing a study plan at a calm desk",
        },
      },
    ],
  }));
});
