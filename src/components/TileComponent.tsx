/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { motion } from "motion/react";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { Color, Tile } from "../types";

export const colorTextMap: Record<Color, string> = {
  [Color.RED]: "text-red-600",
  [Color.YELLOW]: "text-yellow-500",
  [Color.BLACK]: "text-slate-900 dark:text-slate-100",
  [Color.BLUE]: "text-blue-600",
  [Color.JOKER]: "text-purple-600",
};

export const sizeClasses = {
  xs: "w-6 h-8 text-[10px]",
  sm: "w-8 h-10 text-sm",
  md: "w-10 h-14 text-lg",
  lg: "w-12 h-16 text-xl",
};

export const TileComponent = ({
  tile,
  isOkey,
  onClick,
  isSelected,
  size = "md",
}: {
  tile: Tile;
  isOkey?: boolean;
  onClick?: () => void;
  isSelected?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  key?: any;
}) => {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`
        ${sizeClasses[size]}
        relative flex items-center justify-center rounded-md border-2 
        bg-white dark:bg-slate-800 shadow-sm cursor-pointer transition-all
        ${isSelected ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900 -translate-y-2" : "border-slate-200 dark:border-slate-700"}
        ${tile.color === Color.JOKER ? "bg-purple-50 dark:bg-purple-900/30" : ""}
      `}
    >
      <span className={`font-bold ${colorTextMap[tile.color]}`}>
        {tile.color === Color.JOKER ? "★" : tile.number}
      </span>
      {isOkey && (
        <div className="absolute top-1 right-1 w-2 h-2 bg-yellow-400 rounded-full shadow-sm ring-1 ring-yellow-600" title="Okey Taşı" />
      )}
    </motion.div>
  );
};

export const SortableTile = ({
  id,
  tile,
  isOkey,
  onClick,
  isSelected,
  size,
}: {
  id: string;
  tile: Tile | null;
  isOkey?: boolean;
  onClick?: () => void;
  isSelected?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  key?: any;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0 : 1,
  };

  if (!tile) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`
          ${size === "xs" ? "w-6 h-8" : size === "sm" ? "w-8 h-10" : size === "lg" ? "w-12 h-16" : "w-10 h-14"}
          rounded-md border-2 border-dashed border-slate-200 bg-slate-100/30
        `}
      />
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TileComponent
        tile={tile}
        isOkey={isOkey}
        onClick={onClick}
        isSelected={isSelected}
        size={size}
      />
    </div>
  );
};
