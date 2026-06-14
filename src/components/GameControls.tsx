/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { motion } from "motion/react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Layers, ArrowDown } from "lucide-react";
import { Tile } from "../types";
import { TileComponent } from "./TileComponent";

// --- DraggableDeck ---
export const DraggableDeck = ({
  count,
  isDisabled,
  onClick,
}: {
  count: number;
  isDisabled: boolean;
  onClick: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: "deck-draggable",
      disabled: isDisabled,
    });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: 999 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative group ${
        !isDisabled ? "cursor-grab active:cursor-grabbing" : "cursor-default"
      }`}
    >
      <button
        disabled={isDisabled}
        onClick={(e) => {
          if (!transform) onClick();
        }}
        className="px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-100 transition-all hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
      >
        <Layers size={16} /> DESTE ÇEK ({count})
      </button>
      {isDragging && (
        <div className="absolute inset-0 bg-blue-400/50 rounded-xl animate-pulse" />
      )}
    </div>
  );
};

// --- DroppableDiscard ---
export const DroppableDiscard = ({
  lastDiscard,
  isDarkMode,
  label,
  id,
  onClick,
  disabled,
}: {
  lastDiscard?: Tile | null;
  isDarkMode: boolean;
  label: string;
  id: string;
  onClick?: () => void;
  disabled?: boolean;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[8px] font-bold text-slate-400 uppercase">
        {label}
      </span>
      <div
        ref={setNodeRef}
        onClick={!disabled ? onClick : undefined}
        className={`w-10 h-14 rounded-md border-2 transition-all flex items-center justify-center ${
          isOver
            ? "border-red-500 bg-red-500/20 scale-110 shadow-lg shadow-red-500/20"
            : isDarkMode
            ? "bg-slate-800 border-slate-700 border-dashed"
            : "bg-slate-100 border-slate-200 border-dashed"
        } ${
          !disabled
            ? "cursor-pointer hover:border-red-400 hover:bg-red-400/10"
            : "cursor-default"
        }`}
      >
        {lastDiscard ? (
          <TileComponent tile={lastDiscard} size="sm" />
        ) : (
          <span
            className={`text-[10px] font-bold ${
              isOver
                ? "text-red-500"
                : "text-slate-300 dark:text-slate-600"
            }`}
          >
            {isOver ? "AT" : "BOŞ"}
          </span>
        )}
      </div>
    </div>
  );
};

// --- DraggableDiscard ---
export const DraggableDiscard = ({
  tile,
  isDarkMode,
  isDisabled,
  onClick,
}: {
  tile?: Tile | null;
  isDarkMode: boolean;
  isDisabled: boolean;
  onClick: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: "discard-draggable",
      disabled: isDisabled || !tile,
    });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: 999 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative ${
        !isDisabled && tile
          ? "cursor-grab active:cursor-grabbing"
          : "cursor-default"
      }`}
      onClick={() => {
        if (!transform && !isDisabled && tile) onClick();
      }}
    >
      <div
        className={`w-10 h-14 rounded-md border-2 border-dashed flex items-center justify-center ${
          isDarkMode
            ? "bg-slate-800 border-slate-700"
            : "bg-slate-100 border-slate-200"
        }`}
      >
        {tile ? (
          <TileComponent tile={tile} size="sm" />
        ) : (
          <span className="text-slate-300 dark:text-slate-600 text-[10px] font-bold uppercase">
            BOŞ
          </span>
        )}
      </div>
      {isDragging && (
        <div className="absolute inset-0 bg-blue-400/50 rounded-md animate-pulse" />
      )}
    </div>
  );
};

// --- DisplayIndicator ---
export const DisplayIndicator = ({
  indicator,
  isDarkMode,
}: {
  indicator: Tile;
  isDarkMode: boolean;
}) => {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-1.5 rounded-2xl border shrink-0 ${
        isDarkMode
          ? "bg-slate-800 border-slate-700"
          : "bg-slate-50 border-slate-100"
      }`}
    >
      <span className="text-[10px] font-black uppercase tracking-tighter text-slate-400">
        GÖSTERGE
      </span>
      <TileComponent tile={indicator} size="xs" />
    </div>
  );
};

// --- ReturnDiscardButton ---
export const ReturnDiscardButton = ({
  onReturn,
  disabled,
}: {
  onReturn: () => void;
  disabled: boolean;
}) => (
  <button
    disabled={disabled}
    onClick={onReturn}
    className="px-3 py-2 bg-orange-500 text-white rounded-lg font-bold text-xs shadow-md disabled:opacity-50 transition-all hover:bg-orange-600 active:scale-95 flex items-center gap-1"
  >
    <ArrowDown size={14} className="rotate-180" /> GERİ BIRAK
  </button>
);
