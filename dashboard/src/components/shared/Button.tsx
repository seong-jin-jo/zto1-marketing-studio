"use client";

import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "border border-border bg-surface-2 text-text hover:border-subtle hover:bg-surface",
  danger: "bg-danger text-status-fg hover:opacity-90",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-stack-tight text-caption",
  md: "px-stack text-body-sm",
  lg: "px-pad-inset text-body",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  // 기본값은 `.ds-touch-target`(globals.css)이다. 라벨이 줄바꿈되지 않게 max-content를 지키면서
  // 동시에 44px 가로 하한을 건다(`min-width: max(44px, max-content)`).
  //
  // 2026-09-14 실측: 종전 기본값 `min-w-max`는 세로만 44px이고 가로는 라벨 폭 그대로였다.
  // 그래서 편집실 1440에서 `▲`(27px) `글`(28px) `1:1`(33px) 같은 단추 20개가 손가락으로
  // 정확히 누를 수 없는 크기로 있었다. 글자를 밀어내지 않고 히트 영역만 넓히는 쪽을 골랐다.
  //
  // 좁은 칸(목차, 카드) 안에서는 이 값이 칸을 밀어내 글자를 가리므로, 호출부가 min-w-를
  // 직접 주면 그 값을 존중한다.
  const minWidthClass = /(^|\s)min-w-/.test(className) ? "" : "ds-touch-target";

  return (
    <button
      type={type}
      className={`ds-label inline-flex min-h-control-touch ${minWidthClass} items-center justify-center gap-micro rounded-control font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  );
}
