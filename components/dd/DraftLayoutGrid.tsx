'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ResponsiveGridLayout,
  useContainerWidth,
  type Layout,
  type LayoutItem,
  type ResponsiveLayouts,
  type DefaultBreakpoints,
  DEFAULT_BREAKPOINTS,
} from 'react-grid-layout';
import { Lock, Unlock, RotateCcw, Maximize2 } from 'lucide-react';

// Inject the react-grid-layout CSS — must be loaded for drag/resize to work.
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// ── Layout item keys ──
// These correspond to the panels in the draft room.
export const PANEL_KEYS = {
  DRAFT_BOARD: 'draft-board',
  MY_ROSTER: 'my-roster',
  AVAILABLE_PLAYERS: 'available-players',
  RECENT_PICKS: 'recent-picks',
} as const;

export type PanelKey = typeof PANEL_KEYS[keyof typeof PANEL_KEYS];

// Helper to create a layout item with min sizes
const li = (i: string, x: number, y: number, w: number, h: number, minW = 1, minH = 3): LayoutItem => ({
  i, x, y, w, h, minW, minH,
});

// ── Default layouts ──
// Matches the original 3-column grid: board (2 cols) + roster on the left,
// players + recent picks on the right.
const DEFAULT_LAYOUTS: ResponsiveLayouts<DefaultBreakpoints> = {
  lg: [
    li(PANEL_KEYS.DRAFT_BOARD, 0, 0, 2, 12, 1, 6),
    li(PANEL_KEYS.MY_ROSTER, 0, 12, 2, 8, 1, 4),
    li(PANEL_KEYS.AVAILABLE_PLAYERS, 2, 0, 1, 14, 1, 6),
    li(PANEL_KEYS.RECENT_PICKS, 2, 14, 1, 6, 1, 3),
  ],
  md: [
    li(PANEL_KEYS.DRAFT_BOARD, 0, 0, 2, 12, 1, 6),
    li(PANEL_KEYS.MY_ROSTER, 0, 12, 2, 8, 1, 4),
    li(PANEL_KEYS.AVAILABLE_PLAYERS, 2, 0, 1, 14, 1, 6),
    li(PANEL_KEYS.RECENT_PICKS, 2, 14, 1, 6, 1, 3),
  ],
  sm: [
    li(PANEL_KEYS.DRAFT_BOARD, 0, 0, 1, 10, 1, 6),
    li(PANEL_KEYS.MY_ROSTER, 0, 10, 1, 7, 1, 4),
    li(PANEL_KEYS.AVAILABLE_PLAYERS, 0, 17, 1, 12, 1, 6),
    li(PANEL_KEYS.RECENT_PICKS, 0, 29, 1, 5, 1, 3),
  ],
  xs: [
    li(PANEL_KEYS.DRAFT_BOARD, 0, 0, 1, 10, 1, 6),
    li(PANEL_KEYS.MY_ROSTER, 0, 10, 1, 7, 1, 4),
    li(PANEL_KEYS.AVAILABLE_PLAYERS, 0, 17, 1, 12, 1, 6),
    li(PANEL_KEYS.RECENT_PICKS, 0, 29, 1, 5, 1, 3),
  ],
};

const BREAKPOINT_COLS: Record<DefaultBreakpoints, number> = {
  lg: 3,
  md: 3,
  sm: 1,
  xs: 1,
  xxs: 1,
};

const STORAGE_KEY_PREFIX = 'dd_draft_layout_';

interface DraftLayoutGridProps {
  /** Unique key for this draft (for per-draft layout persistence) */
  draftId: string;
  /** Panel content — key = panel key, value = React node */
  children: Record<PanelKey, React.ReactNode>;
}

export default function DraftLayoutGrid({ draftId, children }: DraftLayoutGridProps) {
  const [layouts, setLayouts] = useState<ResponsiveLayouts<DefaultBreakpoints>>(DEFAULT_LAYOUTS);
  const [isEditing, setIsEditing] = useState(false);
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });

  const storageKey = `${STORAGE_KEY_PREFIX}${draftId}`;

  // Load saved layout from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as ResponsiveLayouts<DefaultBreakpoints>;
        // Merge with defaults to handle new panels added later
        setLayouts({
          lg: mergeLayouts(DEFAULT_LAYOUTS.lg, parsed.lg),
          md: mergeLayouts(DEFAULT_LAYOUTS.md, parsed.md),
          sm: mergeLayouts(DEFAULT_LAYOUTS.sm, parsed.sm),
          xs: mergeLayouts(DEFAULT_LAYOUTS.xs, parsed.xs),
        });
      }
    } catch {
      // Corrupt or unavailable — use defaults
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Save layout to localStorage on change (only when editing)
  const handleLayoutChange = useCallback(
    (_current: Layout, allLayouts: ResponsiveLayouts<DefaultBreakpoints>) => {
      if (!isEditing) return;
      setLayouts(allLayouts);
      try {
        localStorage.setItem(storageKey, JSON.stringify(allLayouts));
      } catch {
        // non-fatal
      }
    },
    [isEditing, storageKey]
  );

  const resetLayout = useCallback(() => {
    setLayouts(DEFAULT_LAYOUTS);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // non-fatal
    }
  }, [storageKey]);

  // The panels to render
  const panelKeys = useMemo(() => Object.keys(PANEL_KEYS) as PanelKey[], []);

  if (!mounted) {
    // Avoid SSR hydration mismatch — render a static fallback
    return (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {panelKeys.map((key) => (
          <div
            key={key}
            className={key === PANEL_KEYS.DRAFT_BOARD || key === PANEL_KEYS.MY_ROSTER ? 'xl:col-span-2' : ''}
          >
            {children[key]}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Layout toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors ${
              isEditing
                ? 'bg-brand-primary text-white'
                : 'bg-brand-elevated text-brand-muted hover:text-brand-text'
            }`}
          >
            {isEditing ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {isEditing ? 'Done Editing' : 'Customize Layout'}
          </button>
          {isEditing && (
            <button
              onClick={resetLayout}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-brand-elevated text-brand-muted hover:text-brand-text transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
        </div>
        {isEditing && (
          <div className="text-xs text-brand-muted flex items-center gap-1.5">
            <Maximize2 className="w-3.5 h-3.5" />
            Drag panels to rearrange · Drag corners to resize
          </div>
        )}
      </div>

      <div
        ref={containerRef as React.RefObject<HTMLDivElement>}
        className={`dd-layout-container ${isEditing ? 'dd-layout-editing' : ''}`}
        style={{ position: 'relative' }}
      >
        <ResponsiveGridLayout
          width={width}
          className="layout"
          layouts={layouts}
          breakpoints={DEFAULT_BREAKPOINTS}
          cols={BREAKPOINT_COLS}
          rowHeight={42}
          margin={[12, 12]}
          containerPadding={[0, 0]}
          dragConfig={{
            enabled: isEditing,
            bounded: false,
            handle: '.dd-drag-handle',
            threshold: 3,
          }}
          resizeConfig={{
            enabled: isEditing,
            handles: ['se'],
          }}
          onLayoutChange={handleLayoutChange}
          compactor={'vertical' as never}
        >
          {panelKeys.map((key) => (
            <div
              key={key}
              className={`dd-layout-item ${isEditing ? 'dd-layout-item-editing' : ''}`}
            >
              {isEditing && (
                <div className="dd-drag-handle absolute top-1 right-1 z-50 cursor-move bg-brand-primary/80 text-white text-[10px] px-1.5 py-0.5 rounded-md flex items-center gap-1">
                  <Maximize2 className="w-3 h-3" />
                  Drag
                </div>
              )}
              <div className="h-full overflow-hidden">
                {children[key]}
              </div>
            </div>
          ))}
        </ResponsiveGridLayout>
      </div>
    </div>
  );
}

/** Merge a saved layout with defaults — ensures all panel keys exist. */
function mergeLayouts(
  defaults: readonly LayoutItem[] | undefined,
  saved: readonly LayoutItem[] | undefined
): LayoutItem[] {
  if (!saved || !Array.isArray(saved)) return defaults ? [...defaults] : [];
  const savedMap = new Map(saved.map((l) => [l.i, l]));
  if (!defaults) return [...saved];
  return defaults.map((d) => {
    const s = savedMap.get(d.i);
    if (s) {
      return { ...d, ...s, i: d.i }; // preserve minW/minH from defaults
    }
    return d;
  });
}
