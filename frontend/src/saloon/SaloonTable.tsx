/**
 * The saloon card table — plays one campaign match of traditional turn-based
 * OFC Pineapple against the level's characters. Placement UX is vendored from
 * the multiplayer MobileGamePage: tap a card, tap a row; the last card on
 * streets 2-5 is discarded automatically; pending cards can be tapped to take
 * back before the final card auto-submits the street.
 */
import { useEffect, useState } from 'react';
import type { SaloonLevel } from './campaign.ts';
import { SKILL_LABELS } from './campaign.ts';
import {
  applyPlacement,
  createTable,
  currentSeat,
  heroWonMatch,
  nextHand,
  placementsRequired,
  type TableState,
} from './engine.ts';
import { decideBotMove } from './bots.ts';
import type { Board, Card, Row } from './vendor/types.ts';
import { isFoul } from './vendor/scoring.ts';
import { SaloonBoard } from './SaloonBoard.tsx';
import { SaloonCard } from './SaloonCard.tsx';

interface PendingPlacement {
  card: Card;
  row: Row;
  handIndex: number;
}

interface SaloonTableProps {
  level: SaloonLevel;
  /** Called when the player leaves the table after the final hand. */
  onMatchEnd: (heroPoints: number, won: boolean) => void;
  /** Walk out mid-match (no settlement). */
  onQuit: () => void;
}

const ROW_MAX: Record<Row, number> = { top: 3, middle: 5, bottom: 5 };

export function SaloonTable({ level, onMatchEnd, onQuit }: SaloonTableProps) {
  const [table, setTable] = useState<TableState>(() =>
    createTable(
      'You',
      level.opponents.map((o) => ({ id: o.id, name: o.name, skill: o.skill })),
      level.hands,
    ),
  );
  const [pending, setPending] = useState<PendingPlacement[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const acting = table.phase === 'acting' ? currentSeat(table) : null;
  const heroSeat = table.seats.find((s) => s.isHero)!;
  const heroTurn = !!acting?.isHero;
  const required = placementsRequired(table.street);

  // Bots act on a short "thinking" delay so the table feels alive.
  useEffect(() => {
    if (table.phase !== 'acting') return;
    const seat = table.seats[table.turnIdx];
    if (seat.isHero) return;
    const delay = 700 + Math.random() * 900;
    const timer = setTimeout(() => {
      setTable((cur) => {
        if (cur.phase !== 'acting' || cur.seats[cur.turnIdx].isHero) return cur;
        const move = decideBotMove(cur);
        return applyPlacement(cur, move.placements, move.discard);
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [table]);

  // Hero's dealt cards not yet placed this street.
  const pendingIndices = new Set(pending.map((p) => p.handIndex));
  const availableHand = heroTurn
    ? heroSeat.hand
        .map((card, handIndex) => ({ card, handIndex }))
        .filter(({ handIndex }) => !pendingIndices.has(handIndex))
    : [];

  // Hero board with pending placements merged for display.
  const heroBoard: Board = {
    top: [...heroSeat.board.top],
    middle: [...heroSeat.board.middle],
    bottom: [...heroSeat.board.bottom],
  };
  for (const p of pending) heroBoard[p.row].push(p.card);

  const pendingByRow = {
    top: pending.filter((p) => p.row === 'top').length,
    middle: pending.filter((p) => p.row === 'middle').length,
    bottom: pending.filter((p) => p.row === 'bottom').length,
  };

  const submitStreet = (placements: PendingPlacement[]) => {
    const placedIdx = new Set(placements.map((p) => p.handIndex));
    const discardEntry =
      table.street > 1
        ? heroSeat.hand.map((card, idx) => ({ card, idx })).find(({ idx }) => !placedIdx.has(idx))
        : null;
    setTable(
      applyPlacement(
        table,
        placements.map(({ card, row }) => ({ card, row })),
        discardEntry?.card ?? null,
      ),
    );
    setPending([]);
    setSelectedIndex(null);
  };

  const handleRowClick = (row: Row) => {
    if (!heroTurn || selectedIndex === null) return;
    const selected = availableHand[selectedIndex];
    if (!selected) return;
    if (heroBoard[row].length >= ROW_MAX[row]) return;

    const next = [...pending, { card: selected.card, row, handIndex: selected.handIndex }];
    setSelectedIndex(null);
    if (next.length === required) {
      submitStreet(next);
    } else {
      setPending(next);
    }
  };

  const handleUndoCard = (row: Row, pendingIndex: number) => {
    const inRow = pending.filter((p) => p.row === row);
    const target = inRow[pendingIndex];
    if (!target) return;
    setPending(pending.filter((p) => p !== target));
    setSelectedIndex(null);
  };

  const handleQuit = () => {
    if (window.confirm('Walk away from the table? This match will not count.')) {
      onQuit();
    }
  };

  const opponents = table.seats.filter((s) => !s.isHero);
  const oppCardW = opponents.length > 1 ? 26 : 32;
  const lastHandNet = (id: string) =>
    table.lastResult?.players.find((p) => p.uid === id)?.netScore ?? 0;

  const isLastHand = table.handNumber >= table.handsPerMatch;
  const heroWon = heroWonMatch(table);
  const money = (pts: number) => {
    const dollars = pts * level.stake;
    return `${dollars >= 0 ? '+' : '-'}$${Math.abs(dollars)}`;
  };

  return (
    <div className="min-h-[100dvh] bg-stone-950 flex justify-center">
      <div className="w-full max-w-[430px] min-h-[100dvh] bg-gradient-to-b from-stone-900 via-amber-950/40 to-stone-900 text-amber-100 flex flex-col">
        {/* Header */}
        <div className="border-b-2 border-amber-800/60 bg-black/30 px-3 py-2 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <div className="font-serif font-bold text-amber-200 text-sm truncate">🤠 {level.location}</div>
            <div className="text-[10px] text-amber-400/80">
              Hand {table.handNumber}/{table.handsPerMatch} · Street {table.street}/5 · ${level.stake} a point
            </div>
          </div>
          <button
            onClick={handleQuit}
            className="px-2 py-1 rounded border border-red-900 bg-red-950/60 text-red-300 text-[10px] flex-shrink-0"
          >
            Walk away
          </button>
        </div>

        {/* Turn banner */}
        <div
          className={`text-center text-xs py-1 flex-shrink-0 ${
            heroTurn ? 'bg-yellow-700/40 text-yellow-200 font-bold' : 'bg-black/20 text-amber-300/80'
          }`}
          data-testid="saloon-turn-banner"
        >
          {table.phase !== 'acting'
            ? 'Showdown'
            : heroTurn
              ? table.street === 1
                ? 'Your deal — set all 5 cards'
                : 'Your turn — set 2, the last card hits the muck'
              : `${acting!.name} is studying their cards…`}
        </div>

        {/* Opponents */}
        <div className="flex-shrink-0 flex justify-center gap-2 px-2 py-2">
          {opponents.map((seat) => {
            const character = level.opponents.find((o) => o.id === seat.id);
            return (
              <SaloonBoard
                key={seat.id}
                board={seat.board}
                name={seat.name}
                avatar={character?.avatar}
                sub={`(${seat.matchPoints >= 0 ? '+' : ''}${seat.matchPoints})`}
                fouled={table.phase !== 'acting' && seat.fouled}
                active={acting?.id === seat.id}
                ponderingCards={acting?.id === seat.id ? seat.hand.length : 0}
                cardWidthPx={oppCardW}
              />
            );
          })}
        </div>

        {/* Hero board */}
        <div className="flex-1 flex flex-col items-center justify-center px-2 min-h-0" data-testid="saloon-my-board">
          <SaloonBoard
            board={heroBoard}
            name="You"
            avatar="🤠"
            sub={`(${heroSeat.matchPoints >= 0 ? '+' : ''}${heroSeat.matchPoints})`}
            fouled={table.phase !== 'acting' ? heroSeat.fouled : isFoul(heroBoard)}
            active={heroTurn}
            cardWidthPx={42}
            onRowClick={heroTurn ? handleRowClick : undefined}
            hasCardSelected={selectedIndex !== null}
            pendingByRow={pendingByRow}
            onUndoCard={pending.length > 0 ? handleUndoCard : undefined}
          />
        </div>

        {/* Hand area */}
        <div className="flex-shrink-0 border-t-2 border-amber-800/60 bg-black/30 px-2 pt-2 pb-3 min-h-[110px]">
          {heroTurn ? (
            <>
              <div className="text-center text-[10px] text-amber-400/80 mb-1.5">
                {table.street === 1
                  ? `Place ${required - pending.length} more`
                  : pending.length < required
                    ? `Place ${required - pending.length} of 3 — the leftover is your discard`
                    : ''}
              </div>
              <div className="flex justify-center gap-2" data-testid="saloon-hand">
                {availableHand.map(({ card }, i) => (
                  <div key={`${card.rank}${card.suit}-${i}`} data-testid={`saloon-hand-card-${i}`}>
                    <SaloonCard
                      card={card}
                      widthPx={52}
                      selected={selectedIndex === i}
                      onClick={() => setSelectedIndex(selectedIndex === i ? null : i)}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-amber-500/60 text-xs italic pt-6">
              {table.phase === 'acting' ? 'Waiting on the table…' : 'Tallying the damage…'}
            </div>
          )}
        </div>

        {/* Hand result overlay */}
        {table.phase === 'hand_scored' && (
          <div className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-lg border-2 border-amber-700 bg-stone-900 p-4 shadow-2xl">
              <h2 className="font-serif text-lg font-bold text-amber-200 text-center mb-3">
                ♠ Hand {table.handNumber} Showdown ♠
              </h2>
              <div className="space-y-1.5 mb-4">
                {[...table.seats]
                  .sort((a, b) => b.matchPoints - a.matchPoints)
                  .map((seat) => {
                    const net = lastHandNet(seat.id);
                    return (
                      <div
                        key={seat.id}
                        className={`flex items-center justify-between rounded px-2 py-1.5 text-sm ${
                          seat.isHero ? 'bg-yellow-900/30 border border-yellow-700/50' : 'bg-black/30'
                        }`}
                      >
                        <span className="text-amber-100 truncate">
                          {seat.isHero ? '🤠 You' : seat.name}
                          {seat.fouled && <span className="text-red-400 text-xs ml-1">FOUL</span>}
                        </span>
                        <span className="flex items-baseline gap-2 flex-shrink-0">
                          <span className={net >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {net >= 0 ? `+${net}` : net}
                          </span>
                          <span className="text-amber-400/70 text-xs">
                            total {seat.matchPoints >= 0 ? `+${seat.matchPoints}` : seat.matchPoints}
                          </span>
                        </span>
                      </div>
                    );
                  })}
              </div>
              <button
                onClick={() => setTable(nextHand(table))}
                data-testid="saloon-next-hand"
                className="w-full py-2.5 rounded bg-amber-700 hover:bg-amber-600 text-white font-bold text-sm"
              >
                {isLastHand ? 'Cash out' : 'Deal the next hand'}
              </button>
            </div>
          </div>
        )}

        {/* Match over overlay */}
        {table.phase === 'match_over' && (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-lg border-2 border-amber-700 bg-stone-900 p-5 text-center shadow-2xl">
              <div className="text-4xl mb-2">{heroWon ? '🏆' : '💀'}</div>
              <h2 className="font-serif text-xl font-bold text-amber-200 mb-1">
                {heroWon ? 'You cleaned out the table!' : `${level.location} got the best of you`}
              </h2>
              <p className="text-amber-400/80 text-sm mb-3">
                {heroWon
                  ? 'Word of your play is spreading down the trail.'
                  : 'Dust yourself off and try again, stranger.'}
              </p>
              <div className="rounded bg-black/40 px-3 py-2 mb-4 text-sm">
                <div className="flex justify-between text-amber-100">
                  <span>Your points</span>
                  <span className={heroSeat.matchPoints >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {heroSeat.matchPoints >= 0 ? `+${heroSeat.matchPoints}` : heroSeat.matchPoints}
                  </span>
                </div>
                <div className="flex justify-between text-amber-100">
                  <span>At ${level.stake} a point</span>
                  <span className={heroSeat.matchPoints >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {money(heroSeat.matchPoints)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => onMatchEnd(heroSeat.matchPoints, heroWon)}
                data-testid="saloon-match-end"
                className="w-full py-2.5 rounded bg-amber-700 hover:bg-amber-600 text-white font-bold text-sm"
              >
                {heroWon ? 'Take your winnings' : 'Back to the trail'}
              </button>
            </div>
          </div>
        )}

        {/* Roster footer */}
        <div className="flex-shrink-0 border-t border-amber-900/40 bg-black/40 px-3 py-1 text-[9px] text-amber-500/60 text-center">
          {level.opponents.map((o) => `${o.avatar} ${o.name} · ${SKILL_LABELS[o.skill]}`).join('   ')}
        </div>
      </div>
    </div>
  );
}
