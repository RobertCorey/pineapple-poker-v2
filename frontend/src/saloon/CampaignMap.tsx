/**
 * The Frontier Trail — campaign level select. Wanted-poster cards for each
 * stop on the trail; beat a table to unlock the next one.
 */
import { LEVELS, SKILL_LABELS, type SaloonLevel, type SaloonProgress } from './campaign.ts';

interface CampaignMapProps {
  progress: SaloonProgress;
  onPlay: (level: SaloonLevel) => void;
  onReset: () => void;
  onExit: () => void;
}

export function CampaignMap({ progress, onPlay, onReset, onExit }: CampaignMapProps) {
  const handleReset = () => {
    if (window.confirm('Burn your trail progress and start over with a fresh bankroll?')) {
      onReset();
    }
  };

  return (
    <div className="min-h-[100dvh] bg-stone-950 flex justify-center">
      <div className="w-full max-w-[430px] bg-gradient-to-b from-stone-900 via-amber-950/40 to-stone-900 text-amber-100 flex flex-col">
        {/* Header */}
        <div className="text-center px-4 pt-6 pb-4">
          <div className="text-3xl mb-1">🤠</div>
          <h1 className="font-serif text-2xl font-black tracking-wide text-amber-200">
            THE FRONTIER TRAIL
          </h1>
          <p className="text-amber-400/80 text-xs mt-1">
            Single player · classic table OFC Pineapple · one deck, no mercy
          </p>
          <div className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full border border-amber-700/60 bg-black/40">
            <span className="text-amber-400/80 text-xs">Bankroll</span>
            <span
              className={`font-bold text-sm ${progress.bankroll >= 0 ? 'text-green-400' : 'text-red-400'}`}
              data-testid="saloon-bankroll"
            >
              ${progress.bankroll}
            </span>
          </div>
        </div>

        {/* Trail */}
        <div className="flex-1 px-4 pb-4 space-y-3">
          {LEVELS.map((level) => {
            const unlocked = level.id <= progress.unlocked;
            const wins = progress.wins[level.id] ?? 0;
            return (
              <div
                key={level.id}
                className={`rounded-lg border-2 p-3 ${
                  unlocked
                    ? 'border-amber-700 bg-amber-950/30'
                    : 'border-stone-800 bg-black/30 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-serif font-bold text-amber-200 text-sm">
                      {unlocked ? '' : '🔒 '}
                      Stop {level.id} — {level.location}
                      {wins > 0 && <span className="text-yellow-400 ml-1">{'⭐'.repeat(Math.min(wins, 3))}</span>}
                    </div>
                    <div className="text-[11px] text-amber-400/80 italic mt-0.5">{level.tagline}</div>
                  </div>
                  <div className="text-right flex-shrink-0 text-[10px] text-amber-300/90 leading-4">
                    <div>${level.stake}/pt</div>
                    <div>{level.hands} hands</div>
                    <div>{level.opponents.length + 1} seats</div>
                  </div>
                </div>

                <div className="mt-2 space-y-1">
                  {level.opponents.map((o) => (
                    <div key={o.id} className="flex items-baseline gap-1.5 text-[11px]">
                      <span>{o.avatar}</span>
                      <span className="font-bold text-amber-100">{o.name}</span>
                      <span className="text-amber-500/80">· {SKILL_LABELS[o.skill]}</span>
                    </div>
                  ))}
                  {unlocked && (
                    <div className="text-[10px] text-amber-400/60 italic">
                      {level.opponents.map((o) => o.blurb).join(' ')}
                    </div>
                  )}
                </div>

                {unlocked && (
                  <button
                    onClick={() => onPlay(level)}
                    data-testid={`saloon-play-${level.id}`}
                    className="mt-2.5 w-full py-2 rounded bg-amber-700 hover:bg-amber-600 active:bg-amber-800 text-white text-xs font-bold"
                  >
                    {wins > 0 ? 'Sit back down' : 'Take a seat'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 pb-6 flex items-center justify-between text-[11px]">
          <button onClick={onExit} className="text-amber-500/80 hover:text-amber-300 underline underline-offset-2">
            ← Back to multiplayer
          </button>
          <button onClick={handleReset} className="text-red-400/70 hover:text-red-300 underline underline-offset-2">
            Reset progress
          </button>
        </div>
      </div>
    </div>
  );
}
