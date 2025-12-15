import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';

export type GuidedTourStep = {
  target: string;
  title: string;
  description: string;
  arrowOffset?: { x?: number; y?: number };
};

type GuidedTourProps = {
  isOpen: boolean;
  steps: GuidedTourStep[];
  onClose: (options: { dismissed: boolean }) => void;
};

type HighlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

const PADDING = 8;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const rectFromElement = (el: Element): HighlightRect => {
  const r = el.getBoundingClientRect();
  const top = clamp(r.top - PADDING, 0, window.innerHeight);
  const left = clamp(r.left - PADDING, 0, window.innerWidth);
  const right = clamp(r.right + PADDING, 0, window.innerWidth);
  const bottom = clamp(r.bottom + PADDING, 0, window.innerHeight);
  return {
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
    right,
    bottom,
  };
};

const findTargetElement = (target: string): Element | null => {
  if (!target) return null;
  return document.querySelector(`[data-tour="${CSS.escape(target)}"]`);
};

const GuidedTour: React.FC<GuidedTourProps> = ({ isOpen, steps, onClose }) => {
  const { colors } = useTheme();
  const [stepIndex, setStepIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [highlight, setHighlight] = useState<HighlightRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);

  const step = steps[stepIndex];

  useEffect(() => {
    if (!isOpen) return;
    setStepIndex(0);
    setDismissed(false);
    setHighlight(null);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    if (!step) return;

    const update = () => {
      const el = findTargetElement(step.target);
      if (!el) {
        setHighlight(null);
        return;
      }
      setHighlight(rectFromElement(el));
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [isOpen, step?.target]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    if (!tooltipRef.current) return;
    setTooltipRect(tooltipRef.current.getBoundingClientRect());
  }, [isOpen, stepIndex]);

  const highlightCenter = useMemo(() => {
    const base = highlight
      ? { x: highlight.left + highlight.width / 2, y: highlight.top + highlight.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    const offsetX = step?.arrowOffset?.x ?? 0;
    const offsetY = step?.arrowOffset?.y ?? 0;

    return {
      x: clamp(base.x + offsetX, 0, window.innerWidth),
      y: clamp(base.y + offsetY, 0, window.innerHeight),
    };
  }, [highlight, step?.arrowOffset?.x, step?.arrowOffset?.y]);

  const tooltipAnchor = useMemo(() => {
    if (!tooltipRect) return { x: 32, y: window.innerHeight - 32 };
    return { x: tooltipRect.left + tooltipRect.width / 2, y: tooltipRect.top };
  }, [tooltipRect]);

  const advance = () => {
    if (stepIndex >= steps.length - 1) {
      onClose({ dismissed });
      return;
    }
    setStepIndex((prev) => prev + 1);
  };

  const closeNow = () => onClose({ dismissed });

  if (!isOpen || !step) return null;

  return (
    <div
      className="fixed inset-0 z-[200]"
      role="dialog"
      aria-modal="true"
      aria-label="가이드 투어"
      onClick={advance}
    >
      {highlight ? (
        <>
          <div className="fixed bg-black/60" style={{ top: 0, left: 0, width: '100%', height: `${highlight.top}px` }} />
          <div
            className="fixed bg-black/60"
            style={{ top: `${highlight.bottom}px`, left: 0, width: '100%', height: `${window.innerHeight - highlight.bottom}px` }}
          />
          <div
            className="fixed bg-black/60"
            style={{ top: `${highlight.top}px`, left: 0, width: `${highlight.left}px`, height: `${highlight.height}px` }}
          />
          <div
            className="fixed bg-black/60"
            style={{
              top: `${highlight.top}px`,
              left: `${highlight.right}px`,
              width: `${window.innerWidth - highlight.right}px`,
              height: `${highlight.height}px`,
            }}
          />
          <div
            className="fixed pointer-events-none border-2 border-cyan-400 rounded-xl shadow-[0_0_0_2px_rgba(34,211,238,0.2)]"
            style={{ top: `${highlight.top}px`, left: `${highlight.left}px`, width: `${highlight.width}px`, height: `${highlight.height}px` }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-black/60" />
      )}

      {highlight && (
        <svg className="fixed inset-0 pointer-events-none" width="100%" height="100%" aria-hidden="true">
          <defs>
            <marker id="tour-arrowhead" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto">
              <path d="M0,0 L10,4 L0,8 Z" fill="rgba(34,211,238,0.95)" />
            </marker>
          </defs>
          <line
            x1={tooltipAnchor.x}
            y1={tooltipAnchor.y}
            x2={highlightCenter.x}
            y2={highlightCenter.y}
            stroke="rgba(34,211,238,0.9)"
            strokeWidth="2"
            markerEnd="url(#tour-arrowhead)"
          />
        </svg>
      )}

      <div
        ref={tooltipRef}
        className={`fixed left-4 bottom-4 w-[min(380px,calc(100vw-32px))] ${colors.componentBg} border ${colors.border} rounded-xl shadow-2xl p-4`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={`text-[11px] ${colors.textSecondary}`}>
              {stepIndex + 1} / {steps.length}
            </div>
            <div className={`text-base font-semibold ${colors.accentColor} mt-0.5`}>{step.title}</div>
          </div>
          <button
            type="button"
            onClick={closeNow}
            className={`text-xs ${colors.textSecondary} hover:${colors.textPrimary} underline`}
          >
            닫기
          </button>
        </div>

        <p className={`mt-2 text-sm ${colors.textPrimary} leading-relaxed`}>{step.description}</p>

        <div className="mt-3 flex items-center justify-between gap-3">
          <label className={`flex items-center gap-2 text-xs ${colors.textSecondary}`}>
            <input
              type="checkbox"
              checked={dismissed}
              onChange={(e) => setDismissed(e.target.checked)}
              className={`mt-0.5 h-4 w-4 rounded border ${colors.border} ${colors.inputBg} text-cyan-500 focus:ring-cyan-400`}
            />
            다시 보지 않기
          </label>
          <div className={`text-xs ${colors.textSecondary}`}>화면 클릭 → 다음</div>
        </div>
      </div>
    </div>
  );
};

export default GuidedTour;
