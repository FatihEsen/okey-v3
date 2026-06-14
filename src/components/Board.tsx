/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { motion } from "motion/react";
import { useDroppable } from "@dnd-kit/core";
import { Color, Tile, TileSet, GameState } from "../types";
import { TileComponent } from "./TileComponent";

// --- DroppableSet ---
export const DroppableSet = ({
  playerId,
  setIdx,
  type,
  tiles,
  onSetClick,
}: {
  key?: string;
  playerId: string;
  setIdx: number;
  type: "set" | "pair";
  tiles: Tile[];
  onSetClick: (playerId: string, setIdx: number, type: "set" | "pair", tileIdx?: number) => void;
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-set-${playerId}-${type}-${setIdx}`,
    data: { playerId, setIdx, type },
  });

  return (
    <motion.div
      ref={setNodeRef}
      whileHover={{ scale: 1.02 }}
      className={`flex gap-0.5 p-1.5 rounded-sm cursor-pointer hover:bg-slate-800/40 transition-all relative group border border-slate-800 bg-[#1e293b]/20 ${
        isOver
          ? "bg-slate-800/80 ring-2 ring-sky-400 scale-105 z-10 border-sky-400/40"
          : ""
      }`}
    >
      {tiles.map((t, i) => (
        <div
          key={t.id}
          onClick={(e) => {
            e.stopPropagation();
            onSetClick(playerId, setIdx, type, i);
          }}
          className="relative"
        >
          <TileComponent tile={t} size="sm" />
          {/* Sol ok göstergesi — en soldaki taş */}
          {i === 0 && type === "set" && (
            <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-sky-400/0 group-hover:bg-sky-400/60 transition-all pointer-events-none" />
          )}
        </div>
      ))}
      <div className="absolute -inset-1 border border-dashed border-sky-400/0 group-hover:border-sky-400/30 rounded-sm pointer-events-none transition-all" />
      {isOver && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-sky-500 text-slate-950 text-[8px] font-mono font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap animate-bounce leading-none">
          BURAYA İŞLE / OKEY AL // CONNECT
        </div>
      )}
    </motion.div>
  );
};

// --- Board ---
export const Board = ({
  gameState,
  onSetClick,
}: {
  gameState: GameState;
  onSetClick: (playerId: string, setIdx: number, type: "set" | "pair", tileIdx?: number) => void;
}) => {
  return (
    <div className="w-full h-full bg-slate-900/40 backdrop-blur-sm rounded-lg border border-slate-800 p-4 min-h-[180px] overflow-y-auto custom-scrollbar relative">
      <div className="text-[10px] font-mono text-sky-400 font-bold uppercase tracking-widest mb-3 flex items-center justify-between border-b border-slate-800 pb-1.5">
        <span>01 // AKTİF SERİLER</span>
        <span className="text-[8px] opacity-50 font-normal">SERIES MODULE</span>
      </div>
      <div className="flex flex-col gap-2 relative z-10">
        {gameState.players
          .filter((p) => p.openedSets.length > 0)
          .map((player) => (
            <div key={player.id} className="flex flex-col gap-1">
              <div className="text-[9px] font-mono text-slate-400 font-bold uppercase tracking-wider">
                {player.name}
              </div>
              <div className="flex flex-wrap gap-1">
                {player.openedSets
                  .map((s, i) => (
                    <DroppableSet
                      key={`set-${player.id}-${i}`}
                      playerId={player.id}
                      setIdx={i}
                      type="set"
                      tiles={s.tiles}
                      onSetClick={onSetClick}
                    />
                  ))}
              </div>
            </div>
          ))}
        {gameState.players.every((p) => p.openedSets.length === 0) && (
          <div className="text-slate-500 font-mono text-xs text-center py-8">
            Henüz seri açılmadı // NO DATA
          </div>
        )}
      </div>
    </div>
  );
};

export const PairsBoard = ({
  gameState,
  onSetClick,
}: {
  gameState: GameState;
  onSetClick: (playerId: string, setIdx: number, type: "set" | "pair", tileIdx?: number) => void;
}) => {
  return (
    <div className="flex-1 bg-slate-900/40 backdrop-blur-sm rounded-lg border border-slate-800 p-4 min-h-[180px] h-full overflow-y-auto custom-scrollbar relative">
      <div className="text-[10px] font-mono text-indigo-400 font-bold uppercase tracking-widest mb-3 flex items-center justify-between border-b border-slate-800 pb-1.5">
        <span>02 // AKTİF ÇİFTLER</span>
        <span className="text-[8px] opacity-50 font-normal">PAIRS MODULE</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2 relative z-10">
        {gameState.players
          .filter((p) => p.openedPairs.length > 0)
          .flatMap((player) =>
            player.openedPairs.map((pair, i) => ({ player, pair, i }))
          )
          .map(({ player, pair, i }) => (
            <div
              key={`pair-${player.id}-${i}`}
              className="flex flex-col items-center gap-1"
            >
              <DroppableSet
                playerId={player.id}
                setIdx={i}
                type="pair"
                tiles={pair}
                onSetClick={onSetClick}
              />
            </div>
          ))}
        {gameState.players.every((p) => p.openedPairs.length === 0) && (
          <div className="col-span-full text-slate-500 font-mono text-xs text-center py-8">
            Henüz çift yok // VACANT
          </div>
        )}
      </div>
    </div>
  );
};
