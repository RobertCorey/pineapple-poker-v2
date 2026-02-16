import { useState, useCallback, useRef, useLayoutEffect } from 'react';
import { MobileGamePage } from '../components/mobile/MobileGamePage.tsx';
import { generateMockGameState, generateMockHand, ALL_PHASES } from './mocks.ts';
import type { CardsFill, OverlayMode, MockOptions } from './mocks.ts';

// --- Query param helpers ---

function getParam(key: string, fallback: string): string {
  const params = new URLSearchParams(window.location.search);
  return params.get(key) ?? fallback;
}

function getNumParam(key: string, fallback: number): number {
  const v = parseInt(getParam(key, String(fallback)), 10);
  return isNaN(v) ? fallback : v;
}

function getBoolParam(key: string, fallback: boolean): boolean {
  const v = getParam(key, String(fallback));
  return v === 'true';
}

function updateUrl(params: Record<string, string | number | boolean>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  window.history.replaceState({}, '', url.toString());
}

// --- Initial state from URL ---

function initOptions(): MockOptions {
  return {
    players: getNumParam('players', 2),
    street: getNumParam('street', 1),
    phase: getParam('phase', 'auto'),
    cards: getParam('cards', 'partial') as CardsFill,
    round: getNumParam('round', 1),
    fouled: getBoolParam('fouled', false),
    overlay: getParam('overlay', 'none') as OverlayMode,
  };
}

// --- Controls ---

interface ControlProps {
  opts: MockOptions;
  width: number;
  height: number;
  onChange: (patch: Partial<MockOptions & { w: number; h: number }>) => void;
}

const DEVICE_PRESETS = [
  { label: 'iPhone SE', w: 375, h: 667 },
  { label: 'iPhone 14', w: 390, h: 844 },
  { label: 'iPhone 14 Pro Max', w: 430, h: 932 },
  { label: 'Pixel 7', w: 412, h: 915 },
  { label: 'iPad Mini', w: 768, h: 1024 },
];

function Controls({ opts, width, height, onChange }: ControlProps) {
  return (
    <div className="w-[250px] flex-shrink-0 bg-gray-800 text-gray-200 font-mono text-xs p-3 overflow-y-auto flex flex-col gap-3 border-r border-gray-700">
      <h2 className="text-sm font-bold text-white">Preview Controls</h2>

      {/* Device presets */}
      <label className="text-gray-400">Device</label>
      <div className="flex flex-wrap gap-1">
        {DEVICE_PRESETS.map((d) => (
          <button
            key={d.label}
            onClick={() => onChange({ w: d.w, h: d.h })}
            className={`px-2 py-1 rounded text-[10px] ${
              width === d.w && height === d.h
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Viewport size */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-gray-400">Width</label>
          <input
            type="number"
            value={width}
            onChange={(e) => onChange({ w: parseInt(e.target.value, 10) || 390 })}
            className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white"
          />
        </div>
        <div className="flex-1">
          <label className="text-gray-400">Height</label>
          <input
            type="number"
            value={height}
            onChange={(e) => onChange({ h: parseInt(e.target.value, 10) || 844 })}
            className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white"
          />
        </div>
      </div>

      {/* Players */}
      <div>
        <label className="text-gray-400">Players: {opts.players}</label>
        <input
          type="range"
          min={2}
          max={16}
          value={opts.players}
          onChange={(e) => onChange({ players: parseInt(e.target.value, 10) })}
          className="w-full"
        />
      </div>

      {/* Street */}
      <div>
        <label className="text-gray-400">Street: {opts.street}</label>
        <input
          type="range"
          min={1}
          max={5}
          value={opts.street}
          onChange={(e) => onChange({ street: parseInt(e.target.value, 10) })}
          className="w-full"
        />
      </div>

      {/* Phase */}
      <div>
        <label className="text-gray-400">Phase</label>
        <select
          value={opts.phase}
          onChange={(e) => onChange({ phase: e.target.value })}
          className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white"
        >
          {ALL_PHASES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* Cards fill */}
      <div>
        <label className="text-gray-400">Board fill</label>
        <select
          value={opts.cards}
          onChange={(e) => onChange({ cards: e.target.value as CardsFill })}
          className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white"
        >
          <option value="empty">Empty</option>
          <option value="partial">Partial (prev street)</option>
          <option value="full">Full (current street)</option>
          <option value="random">Random</option>
        </select>
      </div>

      {/* Round */}
      <div>
        <label className="text-gray-400">Round: {opts.round}</label>
        <input
          type="range"
          min={1}
          max={3}
          value={opts.round}
          onChange={(e) => onChange({ round: parseInt(e.target.value, 10) })}
          className="w-full"
        />
      </div>

      {/* Fouled */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={opts.fouled}
          onChange={(e) => onChange({ fouled: e.target.checked })}
          className="rounded"
        />
        <span className="text-gray-400">Current player fouled</span>
      </label>

      {/* Overlay */}
      <div>
        <label className="text-gray-400">Overlay</label>
        <select
          value={opts.overlay}
          onChange={(e) => onChange({ overlay: e.target.value as OverlayMode })}
          className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white"
        >
          <option value="none">None</option>
          <option value="round">Round Complete</option>
          <option value="match">Match Complete</option>
        </select>
      </div>
    </div>
  );
}

// --- Preview Page ---

export function PreviewPage() {
  const [opts, setOpts] = useState<MockOptions>(initOptions);
  const [width, setWidth] = useState(() => getNumParam('w', 390));
  const [height, setHeight] = useState(() => getNumParam('h', 844));

  const handleChange = useCallback((patch: Partial<MockOptions & { w: number; h: number }>) => {
    const { w, h, ...optsPatch } = patch;
    if (w !== undefined) setWidth(w);
    if (h !== undefined) setHeight(h);
    setOpts((prev) => {
      const next = { ...prev, ...optsPatch };
      // Sync to URL
      updateUrl({
        ...next,
        w: w ?? width,
        h: h ?? height,
      });
      return next;
    });
    // Also update URL for w/h even if opts didn't change
    if (w !== undefined || h !== undefined) {
      updateUrl({ ...opts, w: w ?? width, h: h ?? height });
    }
  }, [opts, width, height]);

  // Scale the preview container to fit the available space
  const areaRef = useRef<HTMLDivElement>(null);
  const [areaSize, setAreaSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const update = () => setAreaSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const padding = 32; // 16px each side
  const availW = areaSize.w - padding;
  const availH = areaSize.h - padding;
  const scale = availW > 0 && availH > 0
    ? Math.min(1, availW / width, availH / height)
    : 1;

  const gameState = generateMockGameState(opts);
  const hand = generateMockHand(opts);
  const uid = 'player_0';

  return (
    <div className="h-screen bg-gray-950 flex">
      <Controls opts={opts} width={width} height={height} onChange={handleChange} />

      {/* Preview area */}
      <div ref={areaRef} className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div
          style={{
            width: `${width}px`,
            height: `${height}px`,
            transform: scale < 1 ? `scale(${scale})` : undefined,
            transformOrigin: 'center center',
          }}
          className="border-2 border-gray-600 rounded-lg overflow-hidden flex-shrink-0 relative"
        >
          <MobileGamePage
            gameState={gameState}
            hand={hand}
            uid={uid}
            roomId="PREV1W"
            onLeaveRoom={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
