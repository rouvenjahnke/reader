'use client';

import type { ReactNode, TouchEvent } from 'react';
import { useRef } from 'react';

interface Props {
  children: ReactNode;
  onNext: () => void;
  onPrev: () => void;
}

interface GestureState {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  tracking: boolean;
}

const emptyGesture: GestureState = {
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  tracking: false
};

export function SwipeContainer({ children, onNext, onPrev }: Props): React.ReactElement {
  const gesture = useRef<GestureState>(emptyGesture);

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) {
      gesture.current = emptyGesture;
      return;
    }
    if (isInteractiveTarget(event.target)) return;
    const touch = event.touches[0];
    gesture.current = { startX: touch.clientX, startY: touch.clientY, lastX: touch.clientX, lastY: touch.clientY, tracking: true };
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (!gesture.current.tracking || event.touches.length !== 1) return;
    const touch = event.touches[0];
    gesture.current.lastX = touch.clientX;
    gesture.current.lastY = touch.clientY;
  };

  const finish = () => {
    const current = gesture.current;
    gesture.current = emptyGesture;
    if (!current.tracking) return;

    const dx = current.lastX - current.startX;
    const dy = current.lastY - current.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const threshold = Math.min(120, window.innerWidth * 0.28);

    if (absX < threshold) return;
    if (absX < absY * 1.6) return;

    if (dx < 0) onNext();
    else onPrev();
  };

  return (
    <div
      className="reader-swipe-shell"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={finish}
      onTouchCancel={() => {
        gesture.current = emptyGesture;
      }}
    >
      {children}
    </div>
  );
}

function isInteractiveTarget(target: EventTarget): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest('a, button, input, textarea, select, pre, code, table, [data-no-swipe], .katex, .katex-display'))
  );
}
