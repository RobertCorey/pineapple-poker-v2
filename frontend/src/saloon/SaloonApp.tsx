/**
 * Top-level shell for the single-player Saloon mode (The Frontier Trail).
 * Entirely client-side: no Firebase, no auth — progress lives in
 * localStorage. Reached via the `?saloon` URL param (see App.tsx).
 */
import { useState } from 'react';
import {
  loadProgress,
  resetProgress,
  settleMatch,
  type SaloonLevel,
  type SaloonProgress,
} from './campaign.ts';
import { CampaignMap } from './CampaignMap.tsx';
import { SaloonTable } from './SaloonTable.tsx';

interface SaloonAppProps {
  onExit: () => void;
}

export function SaloonApp({ onExit }: SaloonAppProps) {
  const [progress, setProgress] = useState<SaloonProgress>(loadProgress);
  const [activeLevel, setActiveLevel] = useState<SaloonLevel | null>(null);

  if (activeLevel) {
    return (
      <SaloonTable
        key={activeLevel.id}
        level={activeLevel}
        onMatchEnd={(heroPoints, won) => {
          setProgress(settleMatch(progress, activeLevel, heroPoints, won));
          setActiveLevel(null);
        }}
        onQuit={() => setActiveLevel(null)}
      />
    );
  }

  return (
    <CampaignMap
      progress={progress}
      onPlay={setActiveLevel}
      onReset={() => setProgress(resetProgress())}
      onExit={onExit}
    />
  );
}
