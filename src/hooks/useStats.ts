import { useState, useCallback } from "react";

export interface GameStats {
  totalGames: number;
  wins: number;
  bestScore: number | null;
}

const DEFAULT_STATS: GameStats = {
  totalGames: 0,
  wins: 0,
  bestScore: null,
};

const STORAGE_KEY = "okey101_stats";

export function useStats() {
  const [stats, setStats] = useState<GameStats>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_STATS, ...JSON.parse(saved) } : DEFAULT_STATS;
    } catch {
      return DEFAULT_STATS;
    }
  });

  const recordGame = useCallback(
    (playerWon: boolean, playerCumulativeScore: number) => {
      setStats((prev) => {
        const newStats: GameStats = {
          totalGames: prev.totalGames + 1,
          wins: prev.wins + (playerWon ? 1 : 0),
          bestScore: playerWon
            ? prev.bestScore === null
              ? playerCumulativeScore
              : Math.min(prev.bestScore, playerCumulativeScore)
            : prev.bestScore,
        };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newStats));
        } catch {}
        return newStats;
      });
    },
    []
  );

  const resetStats = useCallback(() => {
    setStats(DEFAULT_STATS);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_STATS));
    } catch {}
  }, []);

  const winRate =
    stats.totalGames > 0
      ? Math.round((stats.wins / stats.totalGames) * 100)
      : 0;

  return { stats, recordGame, resetStats, winRate };
}
