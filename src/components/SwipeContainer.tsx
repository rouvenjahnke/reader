'use client';

import { motion, useMotionValue, useTransform } from 'framer-motion';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onNext: () => void;
  onPrev: () => void;
}

export function SwipeContainer({ children, onNext, onPrev }: Props): React.ReactElement {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-260, 0, 260], [0.68, 1, 0.68]);

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.18}
      style={{ x, opacity }}
      onDragEnd={(_, info) => {
        const threshold = Math.min(120, window.innerWidth * 0.3);
        if (info.offset.x < -threshold) onNext();
        if (info.offset.x > threshold) onPrev();
      }}
    >
      {children}
    </motion.div>
  );
}
