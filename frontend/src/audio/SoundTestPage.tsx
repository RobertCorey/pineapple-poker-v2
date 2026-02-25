import { useState, useEffect } from 'react';
import { SoundEngine } from './SoundEngine';
import { scoreIntensity } from './intensity';

const SCORE_SCENARIOS = [
  { label: 'Big win (scoop 3p)', net: 18, players: 3, desc: 'intensity > 0.8 — arpeggio + coins + crowd' },
  { label: 'Big win (scoop 2p)', net: 9, players: 2, desc: 'intensity = 1.0 — arpeggio + coins + crowd' },
  { label: 'Solid win', net: 5, players: 2, desc: 'intensity ~0.56 — 4-note rising arpeggio + chime' },
  { label: 'Small win', net: 3, players: 2, desc: 'intensity ~0.33 — 2-note rising + chime' },
  { label: 'Tiny win', net: 1, players: 2, desc: 'intensity ~0.11 — 2-note rising' },
  { label: 'Break even', net: 0, players: 2, desc: 'intensity = 0 — single soft tone' },
  { label: 'Tiny loss', net: -1, players: 2, desc: 'intensity ~-0.11 — 2-note descending' },
  { label: 'Small loss', net: -3, players: 2, desc: 'intensity ~-0.33 — 2-note descending + thud' },
  { label: 'Solid loss', net: -5, players: 2, desc: 'intensity ~-0.56 — 4-note descending + thud' },
  { label: 'Big loss (scoop 2p)', net: -9, players: 2, desc: 'intensity = -1.0 — 4-note descending + thud' },
  { label: 'Big loss (scoop 3p)', net: -18, players: 3, desc: 'intensity = -1.0 — 4-note descending + thud' },
];

const TICK_LEVELS = [
  { countdown: 4, label: '4s left', desc: 'urgency 0.2 — low pitch, quiet' },
  { countdown: 3, label: '3s left', desc: 'urgency 0.4' },
  { countdown: 2, label: '2s left', desc: 'urgency 0.6' },
  { countdown: 1, label: '1s left', desc: 'urgency 0.8 — high pitch, loud' },
  { countdown: 0, label: '0s left', desc: 'urgency 1.0 — max' },
];

export function SoundTestPage() {
  const [muted, setMuted] = useState(() => SoundEngine.get().muted);

  useEffect(() => {
    SoundEngine.get().init();
  }, []);

  const engine = SoundEngine.get();

  return (
    <div className="min-h-screen bg-gray-950 text-white font-mono p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Sound Test</h1>
        <button
          onClick={() => { const m = engine.toggleMute(); setMuted(m); }}
          className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-sm"
        >
          {muted ? '\u{1F507} Muted' : '\u{1F50A} Sound on'}
        </button>
      </div>

      {/* Score Reveal */}
      <section className="mb-8">
        <h2 className="text-sm text-gray-400 uppercase tracking-wider mb-3">Score Reveal</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-800">
              <th className="pb-2 pr-3">Scenario</th>
              <th className="pb-2 pr-3 w-20 text-right">Net</th>
              <th className="pb-2 pr-3 w-24 text-right">Intensity</th>
              <th className="pb-2 pr-3">Sounds</th>
              <th className="pb-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {SCORE_SCENARIOS.map((s, i) => {
              const intensity = scoreIntensity(s.net, s.players);
              return (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-900">
                  <td className="py-2 pr-3">{s.label}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    <span className={s.net > 0 ? 'text-green-400' : s.net < 0 ? 'text-red-400' : 'text-gray-400'}>
                      {s.net > 0 ? '+' : ''}{s.net}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-gray-400">
                    {intensity.toFixed(2)}
                  </td>
                  <td className="py-2 pr-3 text-gray-500 text-xs">{s.desc}</td>
                  <td className="py-2">
                    <button
                      onClick={() => engine.playScoreReveal(intensity)}
                      className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
                    >
                      Play
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Custom intensity slider */}
      <section className="mb-8">
        <h2 className="text-sm text-gray-400 uppercase tracking-wider mb-3">Custom Intensity</h2>
        <CustomIntensitySlider />
      </section>

      {/* Timer ticks */}
      <section className="mb-8">
        <h2 className="text-sm text-gray-400 uppercase tracking-wider mb-3">Timer Ticks</h2>
        <div className="flex gap-2 flex-wrap">
          {TICK_LEVELS.map((t, i) => (
            <button
              key={i}
              onClick={() => engine.playTick(1 - t.countdown / 5)}
              className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-sm"
              title={t.desc}
            >
              {t.label}
            </button>
          ))}
          <button
            onClick={() => {
              TICK_LEVELS.forEach((t, i) => {
                setTimeout(() => engine.playTick(1 - t.countdown / 5), i * 600);
              });
            }}
            className="px-3 py-2 rounded bg-yellow-900 hover:bg-yellow-800 text-sm"
          >
            Play sequence
          </button>
        </div>
      </section>

      {/* Other sounds */}
      <section className="mb-8">
        <h2 className="text-sm text-gray-400 uppercase tracking-wider mb-3">Other Sounds</h2>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => engine.playCardPlace()}
            className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-sm"
          >
            Card Place
          </button>
          <button
            onClick={() => engine.playCardDeal()}
            className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-sm"
          >
            Card Deal
          </button>
          <button
            onClick={() => engine.playFoulAlert()}
            className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-sm"
          >
            Foul Alert
          </button>
        </div>
      </section>
    </div>
  );
}

function CustomIntensitySlider() {
  const [value, setValue] = useState(0);
  const engine = SoundEngine.get();

  return (
    <div className="flex items-center gap-4">
      <span className="text-red-400 text-xs w-8 text-right">-1.0</span>
      <input
        type="range"
        min={-100}
        max={100}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="flex-1 accent-gray-500"
      />
      <span className="text-green-400 text-xs w-8">+1.0</span>
      <span className="text-white tabular-nums w-12 text-right text-sm">
        {(value / 100).toFixed(2)}
      </span>
      <button
        onClick={() => engine.playScoreReveal(value / 100)}
        className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-sm"
      >
        Play
      </button>
    </div>
  );
}
