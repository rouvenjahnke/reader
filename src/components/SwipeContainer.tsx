'use client';

import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import type { PointerEvent, ReactNode } from 'react';
import { useRef } from 'react';

interface Props {
  children: ReactNode;
  onNext: () => void;
  onPrev: () => void;
}

export function SwipeContainer({ children, onNext, onPrev }: Props): React.ReactElement {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-260, 0, 260], [0.68, 1, 0.68]);
  const gesture = useRef<{ startX: number; startY: number; swiping: boolean; pointerId: number | null }>({
    startX: 0,
    startY: 0,
    swiping: false,
    pointerId: null
  });

  const reset = () => {
    gesture.current = { startX: 0, startY: 0, swiping: false, pointerId: null };
    document.body.style.userSelect = '';
    void animate(x, 0, { type: 'spring', stiffness: 420, damping: 38 });
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || isInteractiveTarget(event.target)) return;
    gesture.current = { startX: event.clientX, startY: event.clientY, swiping: false, pointerId: event.pointerId };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    const selectedText = window.getSelection()?.toString().trim() ?? '';

    if (selectedText) {
      reset();
      return;
    }

    if (!current.swiping) {
      if (Math.abs(dx) < 32) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.8) {
        gesture.current = { startX: 0, startY: 0, swiping: false, pointerId: null };
        return;
      }
      current.swiping = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.style.userSelect = 'none';
    }

    x.set(Math.max(-window.innerWidth * 0.22, Math.min(window.innerWidth * 0.22, dx * 0.45)));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const threshold = Math.min(110, window.innerWidth * 0.26);
    const didSwipe = current.swiping && Math.abs(dx) > threshold;
    document.body.style.userSelect = '';

    if (didSwipe && dx < 0) {
      x.set(0);
      onNext();
    } else if (didSwipe && dx > 0) {
      x.set(0);
      onPrev();
    } else {
      reset();
    }
  };

  return (
    <motion.div
      className="reader-swipe-shell"
      style={{ x, opacity }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
    >
      {children}
    </motion.div>
  );
}

function isInteractiveTarget(target: EventTarget): boolean {
  return target instanceof Element && Boolean(target.closest('a, button, input, textarea, select, [data-no-swipe]'));
}
