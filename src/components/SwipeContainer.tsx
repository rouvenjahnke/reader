'use client';

import type { MouseEvent, ReactNode, TouchEvent } from 'react';
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

  const begin = (x: number, y: number, target: EventTarget) => {
    if (isInteractiveTarget(target)) return;
    gesture.current = { startX: x, startY: y, lastX: x, lastY: y, tracking: true };
  };

  const move = (x: number, y: number) => {
    if (!gesture.current.tracking) return;
    gesture.current.lastX = x;
    gesture.current.lastY = y;
  };

  const end = () => {
    const current = gesture.current;
    gesture.current = emptyGesture;
    if (!current.tracking) return;

    const dx = current.lastX - current.startX;
    const dy = current.lastY - current.startY;
    const threshold = Math.min(120, window.innerWidth * 0.28);
    const isHorizontalSwipe = Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.8;

    if (!isHorizontalSwipe) return;
    if (dx < 0) onNext();
    if (dx > 0) onPrev();
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    begin(touch.clientX, touch.clientY, event.target);
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    move(touch.clientX, touch.clientY);
  };

  const onMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    begin(event.clientX, event.clientY, event.target);
  };

  const onMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    move(event.clientX, event.clientY);
  };

  return (
    <div
      className="reader-swipe-shell"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={end}
      onTouchCancel={() => {
        gesture.current = emptyGesture;
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={end}
      onMouseLeave={() => {
        gesture.current = emptyGesture;
      }}
    >
      {children}
    </div>
  );
}

function isInteractiveTarget(target: EventTarget): boolean {
  return target instanceof Element && Boolean(target.closest('a, button, input, textarea, select, [data-no-swipe], .katex'));
}
