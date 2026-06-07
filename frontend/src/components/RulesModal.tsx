interface RulesModalProps {
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-green-400 text-sm font-bold mb-1">{title}</h3>
      <div className="text-gray-300 text-xs leading-relaxed space-y-1">{children}</div>
    </div>
  );
}

/**
 * In-game "How to Play" reference. The first real playtest showed new players
 * needed ~4 minutes of verbal explanation (poker hands → OFC → pineapple) before
 * they could start — this puts that ramp in the app.
 */
export function RulesModal({ onClose }: RulesModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-3 font-mono"
      onClick={onClose}
      data-testid="rules-modal"
    >
      <div
        className="bg-gray-900 border border-gray-600 rounded-lg w-full max-w-md max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-white font-bold">How to Play</h2>
          <button
            onClick={onClose}
            data-testid="rules-close"
            className="text-gray-400 hover:text-white text-lg leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-3 space-y-4">
          <Section title="🎯 Goal">
            <p>Build three poker hands stacked in rows. Each round you compare rows
            against every opponent; win more rows than you lose. Highest total score
            at the end wins.</p>
          </Section>

          <Section title="🃏 Your board (3 rows)">
            <p><b>Bottom</b> (5 cards) · <b>Middle</b> (5 cards) · <b>Top</b> (3 cards).</p>
            <p>Hands must get <b>weaker going up</b>: Bottom ≥ Middle ≥ Top. Break that
            order and you <span className="text-red-400 font-bold">FOUL</span> the whole board.</p>
          </Section>

          <Section title="🔢 Hand strength (weak → strong)">
            <p>High Card · Pair · Two Pair · Three of a Kind · Straight · Flush ·
            Full House · Four of a Kind · Straight Flush.</p>
            <p className="text-gray-500">Four-color deck: ♠ black · ♥ red · ♦ blue · ♣ green.</p>
          </Section>

          <Section title="▶️ How a hand plays">
            <p><b>Deal 1:</b> you get 5 cards — place all 5.</p>
            <p><b>Streets 2–5:</b> you get 3 cards — place 2, discard 1.</p>
            <p>Tap a card to select it, then tap a row to place it. Mis-tapped?
            Tap a card you just placed to take it back (before it submits).</p>
            <p>By the end you've placed 13 cards: 5 bottom, 5 middle, 3 top.</p>
          </Section>

          <Section title="🏆 Scoring (per opponent)">
            <p><b>+1</b> for each row you win, <b>−1</b> for each you lose.</p>
            <p><b>Scoop:</b> win all 3 rows → <b>+3</b> bonus.</p>
            <p><b>Royalties:</b> bonus points for strong rows (e.g. a flush, full house,
            or a pair of Kings up top).</p>
            <p><b>Foul:</b> a mis-ordered board (or running out of time) loses
            <b> −6</b> to each opponent, and your royalties don't count.</p>
          </Section>

          <Section title="🍍 Pineapple Run (roguelike mode)">
            <p>A 5-round run. Between rounds you draft a <b className="text-purple-300">Charm</b>
            {' '}(a permanent score bonus) and a <b className="text-amber-300">Deck Mutation</b>
            {' '}(permanently reshapes your deck). They stack across the run — build something
            broken.</p>
          </Section>
        </div>

        <div className="px-4 py-2 border-t border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-bold rounded"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
