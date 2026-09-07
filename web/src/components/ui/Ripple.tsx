import React, { useState, useLayoutEffect, useCallback } from 'react';

export interface RippleProps {
  color?: string;
}

interface RippleItem {
  id: number;
  x: number;
  y: number;
  size: number;
}

export const Ripple: React.FC<RippleProps> = ({ color }) => {
  const [ripples, setRipples] = useState<RippleItem[]>([]);

  const addRipple = useCallback((e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => {
    // Respect prefers-reduced-motion
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const container = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
    const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;

    const x = clientX - container.left;
    const y = clientY - container.top;
    const size = Math.max(container.width, container.height) * 2;

    const newRipple: RippleItem = {
      id: Date.now() + Math.random(),
      x: x - size / 2,
      y: y - size / 2,
      size,
    };

    setRipples((prev) => [...prev, newRipple]);
  }, []);

  const removeRipple = useCallback((id: number) => {
    setRipples((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return (
    <span
      className="absolute inset-0 overflow-hidden pointer-events-none rounded-[inherit] z-0"
      aria-hidden="true"
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          onAnimationEnd={() => removeRipple(r.id)}
          style={{
            position: 'absolute',
            left: `${r.x}px`,
            top: `${r.y}px`,
            width: `${r.size}px`,
            height: `${r.size}px`,
            borderRadius: '50%',
            backgroundColor: color || 'currentColor',
            animation: 'md-ripple-expand 500ms var(--md-sys-motion-easing-emphasized-decelerate) forwards',
          }}
        />
      ))}
    </span>
  );
};

export function useRipple<T extends HTMLElement = HTMLElement>(color?: string) {
  const [ripples, setRipples] = useState<RippleItem[]>([]);

  const onPointerDown = useCallback((e: React.PointerEvent<T>) => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const size = Math.hypot(rect.width, rect.height) * 2;

    const newRipple: RippleItem = {
      id: Date.now() + Math.random(),
      x: x - size / 2,
      y: y - size / 2,
      size,
    };
    setRipples((prev) => [...prev, newRipple]);
  }, []);

  const removeRipple = useCallback((id: number) => {
    setRipples((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const rippleElement = (
    <span className="absolute inset-0 overflow-hidden pointer-events-none rounded-[inherit] z-0" aria-hidden="true">
      {ripples.map((r) => (
        <span
          key={r.id}
          onAnimationEnd={() => removeRipple(r.id)}
          style={{
            position: 'absolute',
            left: `${r.x}px`,
            top: `${r.y}px`,
            width: `${r.size}px`,
            height: `${r.size}px`,
            borderRadius: '50%',
            backgroundColor: color || 'currentColor',
            animation: 'md-ripple-expand 500ms var(--md-sys-motion-easing-emphasized-decelerate) forwards',
          }}
        />
      ))}
    </span>
  );

  return { onPointerDown, rippleElement };
}
