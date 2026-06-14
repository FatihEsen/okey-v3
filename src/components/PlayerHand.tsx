/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Cpu, User, LayoutGrid, Copy, RotateCcw, Layers, ArrowDown } from "lucide-react";
import { Color, Tile, TileSet, Player, GamePhase } from "../types";
import {
  isRealOkey,
  isValidRun,
  isValidGroup,
  calculateSetScore,
  calculateHandTotal,
  findBestSets,
} from "../logic/okeyEngine";
import { TileComponent } from "./TileComponent";

const SLOTS = 30;

// ─── Slot tabanlı ıstaka ────────────────────────────────────────────────────

interface RackProps {
  hand: (Tile | null)[];
  okeyTile: { number: number; color: Color } | null;
  selectedIds: string[];
  onSelect: (id: string, additive: boolean) => void;
  onReorder: (newHand: (Tile | null)[]) => void;
  disabled: boolean;
  highlightedIds?: Set<string>;
  dealingKey?: number;
}

const Rack: React.FC<RackProps> = ({
  hand,
  okeyTile,
  selectedIds,
  onSelect,
  onReorder,
  disabled,
  highlightedIds,
  dealingKey,
}) => {
  // Sürükleme state'i
  const [dragState, setDragState] = useState<{
    tileIds: string[];          // Sürüklenen taş ID'leri
    sourceSlots: number[];      // Kaynak slot indeksleri
    hoveredSlot: number | null; // Üzerinde bulunulan hedef slot
    origin: { x: number; y: number }; // Fare başlangıç noktası
    started: boolean;           // Sürükleme gerçekten başladı mı?
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>(Array(SLOTS).fill(null));

  // Bir slotun ekran koordinatlarını bul
  const getSlotIndex = useCallback((clientX: number, clientY: number): number | null => {
    let closest: number | null = null;
    let minDist = Infinity;
    slotRefs.current.forEach((el, idx) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot(clientX - cx, clientY - cy);
      if (dist < minDist && dist < rect.width * 1.2) {
        minDist = dist;
        closest = idx;
      }
    });
    return closest;
  }, []);

  // Pointer down — başla
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, slotIdx: number) => {
      if (disabled) return;
      const tile = hand[slotIdx];
      if (!tile) return;

      e.currentTarget.setPointerCapture(e.pointerId);

      // Seçili mi değil mi?
      const isSelected = selectedIds.includes(tile.id);

      // Çoklu sürükleme: eğer seçili ise seçili olanların hepsini taşı
      const dragIds = isSelected && selectedIds.length > 1
        ? [...selectedIds]
        : [tile.id];

      const dragSlots = dragIds.map((id) =>
        hand.findIndex((t) => t?.id === id)
      ).filter((i) => i !== -1);

      setDragState({
        tileIds: dragIds,
        sourceSlots: dragSlots,
        hoveredSlot: null,
        origin: { x: e.clientX, y: e.clientY },
        started: false,
      });
    },
    [disabled, hand, selectedIds]
  );

  // Pointer move
  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragState) return;

      const dx = e.clientX - dragState.origin.x;
      const dy = e.clientY - dragState.origin.y;
      const dist = Math.hypot(dx, dy);

      if (!dragState.started && dist < 6) return;

      const hovered = getSlotIndex(e.clientX, e.clientY);

      setDragState((prev) =>
        prev ? { ...prev, started: true, hoveredSlot: hovered } : null
      );
    },
    [dragState, getSlotIndex]
  );

  // Pointer up — bırak
  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (!dragState) {
        setDragState(null);
        return;
      }

      if (!dragState.started) {
        // Kısa dokunuş = seçim
        const slotIdx = dragState.sourceSlots[0];
        const tile = hand[slotIdx];
        if (tile) {
          const additive = e.shiftKey || e.ctrlKey || e.metaKey;
          onSelect(tile.id, additive);
        }
        setDragState(null);
        return;
      }

      // Sürükleme bitti — taşları yerleştir
      const targetSlot = dragState.hoveredSlot;
      if (targetSlot !== null) {
        const newHand = [...hand];

        // Sürüklenen taşları kaynak slotlardan çıkar
        const draggedTiles = dragState.sourceSlots.map((s) => hand[s]);
        dragState.sourceSlots.forEach((s) => {
          newHand[s] = null;
        });

        // Hedef slottan itibaren yerleştir (taşlar sıraya göre)
        // Sırayı koru: sourceSlots sırasına göre yerleştir
        const sortedSrc = [...dragState.sourceSlots].sort((a, b) => a - b);
        const sortedTiles = sortedSrc.map((s) => hand[s]);

        // Hedef slottan başlayarak boş slotlara yerleştir
        let placed = 0;
        for (let i = targetSlot; i < SLOTS && placed < sortedTiles.length; i++) {
          if (newHand[i] === null || dragState.sourceSlots.includes(i)) {
            newHand[i] = sortedTiles[placed++];
          }
        }
        // Sığmayan taşlar için geri dön
        if (placed < sortedTiles.length) {
          for (let i = targetSlot - 1; i >= 0 && placed < sortedTiles.length; i--) {
            if (newHand[i] === null) {
              newHand[i] = sortedTiles[placed++];
            }
          }
        }

        onReorder(newHand);
      }

      setDragState(null);
    },
    [dragState, hand, onReorder, onSelect]
  );

  // Global pointer event'leri dinle
  useEffect(() => {
    if (dragState?.started || dragState?.sourceSlots) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      return () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };
    }
  }, [dragState, handlePointerMove, handlePointerUp]);

  // Preview hesapla: sürükleme sırasında hedef slottaki görüntü
  const previewMap = useMemo<Record<number, Tile | null>>(() => {
    if (!dragState?.started || dragState.hoveredSlot === null) return {};
    const map: Record<number, Tile | null> = {};
    const sortedSrc = [...dragState.sourceSlots].sort((a, b) => a - b);
    const sortedTiles = sortedSrc.map((s) => hand[s]);

    // Kaynak slotları boşalt
    dragState.sourceSlots.forEach((s) => { map[s] = null; });

    // Hedef slotlara yerleştir
    let placed = 0;
    for (let i = dragState.hoveredSlot; i < SLOTS && placed < sortedTiles.length; i++) {
      const current = i in map ? map[i] : hand[i];
      if (current === null || dragState.sourceSlots.includes(i)) {
        map[i] = sortedTiles[placed++];
      }
    }
    if (placed < sortedTiles.length) {
      for (let i = dragState.hoveredSlot - 1; i >= 0 && placed < sortedTiles.length; i--) {
        const current = i in map ? map[i] : hand[i];
        if (current === null) {
          map[i] = sortedTiles[placed++];
        }
      }
    }
    return map;
  }, [dragState, hand]);

  const isDraggingSet = new Set(dragState?.tileIds ?? []);

  // Boş slota tıkla-taşı: seçili tek taş varsa o slota taşı
  const handleEmptySlotClick = useCallback(
    (slotIdx: number) => {
      if (disabled || selectedIds.length !== 1) return;
      const srcIdx = hand.findIndex(t => t?.id === selectedIds[0]);
      if (srcIdx === -1 || hand[slotIdx] !== null) return;
      const newHand = [...hand];
      newHand[slotIdx] = newHand[srcIdx];
      newHand[srcIdx] = null;
      onReorder(newHand);
    },
    [disabled, selectedIds, hand, onReorder]
  );

  return (
    <div
      ref={containerRef}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(15, minmax(0, 1fr))",
        gap: "1px",
        userSelect: "none",
        touchAction: "none",
      }}
      className="bg-black/40 p-1.5 pb-4 rounded-lg"
    >
      {Array.from({ length: SLOTS }).map((_, slotIdx) => {
        // Önizleme varsa onu göster, yoksa gerçek taşı
        const displayTile = slotIdx in previewMap ? previewMap[slotIdx] : hand[slotIdx];
        const realTile = hand[slotIdx];
        const isGhost = dragState?.started && realTile && isDraggingSet.has(realTile.id);
        const isPreview = slotIdx in previewMap && !(dragState?.sourceSlots.includes(slotIdx));
        const isSelected = realTile ? selectedIds.includes(realTile.id) : false;
        const isHighlighted = realTile ? (highlightedIds?.has(realTile.id) ?? false) : false;
        const isHoveredTarget =
          dragState?.started &&
          dragState.hoveredSlot !== null &&
          Math.abs(slotIdx - dragState.hoveredSlot) < (dragState.tileIds.length);

        // Boş slot + seçili tek taş var + sürükleme yok → tıklanabilir hedef
        const isClickTarget =
          !realTile && !disabled && selectedIds.length === 1 && !dragState?.started;

        return (
          <div
            key={slotIdx}
            ref={(el) => { slotRefs.current[slotIdx] = el; }}
            onPointerDown={(e) => handlePointerDown(e, slotIdx)}
            style={{
              cursor: disabled
                ? "default"
                : dragState?.started
                ? "grabbing"
                : realTile
                ? "grab"
                : isClickTarget
                ? "pointer"
                : "default",
              position: "relative",
              display: "flex",
              justifyContent: "center",
            }}
          >
            {displayTile ? (
              <div
                key={dealingKey !== undefined ? `${dealingKey}-${slotIdx}` : slotIdx}
                className={dealingKey !== undefined ? "tile-deal-in" : undefined}
                style={{
                  opacity: isGhost ? 0.3 : isPreview ? 0.7 : 1,
                  transform: isSelected && !dragState?.started ? "translateY(-6px)" : "none",
                  transition: "transform 0.1s, opacity 0.1s",
                  animationDelay: dealingKey !== undefined ? `${slotIdx * 18}ms` : undefined,
                  outline: isHoveredTarget && dragState?.started
                    ? "2px solid #3b82f6"
                    : isHighlighted && !isSelected
                    ? "2px solid #4ade80"
                    : "none",
                  outlineOffset: "2px",
                  borderRadius: "6px",
                }}
              >
                <TileComponent
                  tile={displayTile}
                  isSelected={isSelected && !dragState?.started}
                  size="lg"
                />
              </div>
            ) : (
              <div
                onClick={isClickTarget ? () => handleEmptySlotClick(slotIdx) : undefined}
                style={{
                  outline:
                    isHoveredTarget && dragState?.started
                      ? "2px dashed #3b82f6"
                      : "none",
                  outlineOffset: "1px",
                  borderRadius: "6px",
                }}
                className="w-12 h-16 rounded-md bg-slate-950/20 border border-slate-800/60 shadow-inner"
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─── Ana PlayerHand bileşeni ────────────────────────────────────────────────

export const PlayerHand = ({
  player,
  okeyTile,
  selectedTiles,
  onTileClick,
  isCurrentPlayer,
  onHandReorder,
  onSortSets,
  onSortPairs,
  onOpenSets,
  onOpenPairs,
  onUndoOpen,
  openedSets,
  dealingKey,
  phase,
  onDiscardTile,
  doubleOpenedInGame = false,
}: {
  player: Player;
  okeyTile: { number: number; color: Color } | null;
  selectedTiles: string[];
  onTileClick: (tile: Tile) => void;
  isCurrentPlayer: boolean;
  onHandReorder: (newHand: (Tile | null)[]) => void;
  onSortSets: () => void;
  onSortPairs: () => void;
  onOpenSets: () => void;
  onOpenPairs: () => void;
  onUndoOpen: () => void;
  openedSets: TileSet[];
  dealingKey?: number;
  phase?: string;
  onDiscardTile?: (tileId: string) => void;
  doubleOpenedInGame?: boolean;
}) => {
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);

  // Seçim: tıklama veya çift tıklama ile taş atma
  const handleSelect = useCallback(
    (id: string, additive: boolean) => {
      const tile = player.hand.find((t) => t?.id === id);
      if (!tile) return;

      const now = Date.now();
      const last = lastClickRef.current;
      lastClickRef.current = { id, time: now };

      if (last && last.id === id && now - last.time < 350) {
        if (isCurrentPlayer && phase === GamePhase.DISCARDING && onDiscardTile) {
          onDiscardTile(id);
          return;
        }
      }

      onTileClick(tile);
    },
    [player.hand, onTileClick, isCurrentPlayer, phase, onDiscardTile]
  );

  const arrangedTotal = useMemo(() => {
    const groups: Tile[][] = [];
    let currentGroup: Tile[] = [];
    player.hand.forEach((tile) => {
      if (tile) {
        currentGroup.push(tile);
      } else if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
    });
    if (currentGroup.length > 0) groups.push(currentGroup);

    return (
      groups.reduce((total, group) => {
        if (group.length < 3) return total;
        if (isValidRun(group, okeyTile)) {
          const set = { tiles: group, type: "run" as const, score: 0 };
          return total + calculateSetScore(set, okeyTile);
        }
        if (isValidGroup(group, okeyTile)) {
          const set = { tiles: group, type: "group" as const, score: 0 };
          return total + calculateSetScore(set, okeyTile);
        }
        return total;
      }, 0) + player.openedSets.reduce((s, set) => s + set.score, 0)
    );
  }, [player.hand, player.openedSets, okeyTile]);

  const remainingTotal = useMemo(
    () => calculateHandTotal(player.hand, okeyTile),
    [player.hand, okeyTile]
  );

  const hasAnythingToUndo =
    player.openedSets.length > 0 || player.openedPairs.length > 0;

  return (
    <div
      className={`
        flex items-center gap-3 p-3 rounded-lg border transition-all
        ${isCurrentPlayer
          ? "bg-slate-900/80 border-sky-500 shadow-[0_0_20px_rgba(14,165,233,0.15)] ring-1 ring-sky-500/20"
          : "bg-slate-900/30 border-slate-800 opacity-80"
        }
      `}
    >
      {/* Rack */}
      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        {/* Header row */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 font-mono">
            {player.isAI ? (
               <Cpu size={12} className="text-slate-400" />
            ) : (
               <User size={12} className="text-sky-400" />
            )}
            <span
              className={`font-bold text-[10px] uppercase tracking-wider ${
                isCurrentPlayer ? "text-sky-400 font-bold" : "text-slate-400"
              }`}
            >
              {player.name}
              {player.hasOpened && (
                <span className="text-sky-455 text-[9px] font-bold tracking-tight lowercase normal-case ml-1.5 font-mono">
                  ({player.openedWithType === "pairs" ? `${player.lastOpenScore} Çift` : player.lastOpenScore})
                </span>
              )}
            </span>
            {isCurrentPlayer && (
              <span className="text-sky-400 text-[8px] animate-pulse">// ACTIVE</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-slate-950/60 rounded-sm border border-slate-800 font-mono">
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">
              {player.hasOpened ? "KALAN" : "PER"}
            </span>
            <span className={`text-xs font-black ${isCurrentPlayer ? "text-sky-400" : "text-slate-350"}`}>
              {player.hasOpened ? remainingTotal : arrangedTotal}
            </span>
            {player.openedWithPairs && (
              <span className="text-[7px] font-black text-indigo-400 bg-indigo-950/40 px-1 rounded-sm border border-indigo-850/50">
                ×2
              </span>
            )}
          </div>
        </div>

        {/* Slot rack — scrollable on mobile; pt-3/-mt-3 prevents overflow-x-auto from
            clipping tiles that lift upward (translateY) when selected */}
        <div className="overflow-x-auto pt-3 -mt-3">
          <div style={{ minWidth: "540px" }}>
            <Rack
              hand={player.hand}
              okeyTile={okeyTile}
              selectedIds={selectedTiles}
              onSelect={handleSelect}
              onReorder={onHandReorder}
              disabled={player.isAI}
              dealingKey={!player.isAI ? dealingKey : undefined}
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-1.5 shrink-0">
        {/* Row 1: Diz butonları */}
        <div className="flex gap-1.5">
          <button
            onClick={onSortSets}
            title="Seri Diz"
            className="flex flex-col items-center justify-center gap-1 w-11 h-12 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-sm border border-slate-700 transition-all active:scale-95 text-center"
          >
            <div className="flex gap-0.5">
              <div className="w-1.5 h-2 bg-sky-400/80 rounded-sm" />
              <div className="w-1.5 h-2 bg-sky-400/80 rounded-sm" />
              <div className="w-1.5 h-2 bg-sky-400/80 rounded-sm" />
            </div>
            <span className="text-[6px] font-mono font-bold tracking-tight uppercase">SERİ DİZ</span>
          </button>
          <button
            onClick={onSortPairs}
            title="Çift Diz"
            className="flex flex-col items-center justify-center gap-1 w-11 h-12 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-sm border border-slate-700 transition-all active:scale-95 text-center"
          >
            <div className="flex gap-0.5">
              <div className="w-1.5 h-2 bg-indigo-400/80 rounded-sm" />
              <div className="w-1.5 h-2 bg-indigo-400/80 rounded-sm" />
            </div>
            <span className="text-[6px] font-mono font-bold tracking-tight uppercase">ÇİFT DİZ</span>
          </button>
        </div>

        {/* Row 2: Aç butonları */}
        <div className="flex gap-1.5">
          <button
            onClick={onOpenSets}
            disabled={
              !isCurrentPlayer ||
              player.openedWithType === "pairs" ||
              player.openedWithPairs
            }
            title={
              player.openedWithType === "pairs" || player.openedWithPairs
                ? "Çift ile açtıysanız seri açamazsınız"
                : "Seri Aç (Otomatik tüm elinizi açmak için taş seçmeden basabilirsiniz)"
            }
            className="flex flex-col items-center justify-center gap-0.5 w-11 h-12 bg-sky-500 hover:bg-sky-400 disabled:bg-slate-850 disabled:text-slate-600 text-slate-950 font-bold rounded-sm border border-transparent transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed text-center"
          >
            <LayoutGrid size={12} />
            <span className="text-[6px] font-mono font-black tracking-tight uppercase">SERİ AÇ</span>
          </button>
          <button
            onClick={onOpenPairs}
            disabled={
              !isCurrentPlayer ||
              (player.openedWithType === "sets" && !doubleOpenedInGame)
            }
            title={
              (player.openedWithType === "sets" && !doubleOpenedInGame)
                ? "Seri ile açtıysanız ve oyunda hiç çift açılmadıysa çift açamazsınız"
                : "Çift Aç (Otomatik tüm çiftlerinizi açmak için taş seçmeden basabilirsiniz)"
            }
            className="flex flex-col items-center justify-center gap-0.5 w-11 h-12 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-850 disabled:text-slate-600 text-white font-bold rounded-sm border border-transparent transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed text-center"
          >
            <Copy size={12} />
            <span className="text-[6px] font-mono font-black tracking-tight uppercase">ÇİFT AÇ</span>
          </button>
        </div>

        {/* Row 3: Action Group */}
        <div className="flex gap-1.5 w-full">
          <button
            onClick={onUndoOpen}
            disabled={!isCurrentPlayer || !hasAnythingToUndo}
            title="Açtıklarını Geri Al"
            className={`${
              isCurrentPlayer && phase === GamePhase.DISCARDING ? "flex-1" : "w-full"
            } flex flex-col items-center justify-center gap-0.5 h-11 bg-slate-800 hover:bg-slate-700 hover:text-rose-400 text-slate-300 rounded-sm border border-slate-700 transition-all active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed text-center`}
          >
            <RotateCcw size={12} />
            <span className="text-[6px] font-mono font-bold tracking-tight uppercase">GERİ AL</span>
          </button>

          {isCurrentPlayer && phase === GamePhase.DISCARDING && (
            <button
              onClick={() => {
                if (selectedTiles.length === 1 && selectedTiles[0] && onDiscardTile) {
                  onDiscardTile(selectedTiles[0]);
                }
              }}
              disabled={selectedTiles.length !== 1}
              title={selectedTiles.length === 1 ? "Seçili Taşı At" : "Lütfen atmak istediğiniz taşa bir kez tıklayıp ardından bu butona basın"}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 h-11 bg-sky-500 hover:bg-sky-450 disabled:bg-slate-850 disabled:text-slate-600 text-slate-950 font-bold rounded-sm border border-transparent transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed text-center shadow-lg shadow-sky-500/10"
            >
              <ArrowDown size={11} className="rotate-180 text-slate-950" />
              <span className="text-[6px] font-mono font-black tracking-tight uppercase text-slate-950">TAŞ AT</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
