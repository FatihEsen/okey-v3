/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Color, Tile, Player, Combination, GameMode, GameState, GamePhase } from "../types";

export const COLORS = [Color.RED, Color.YELLOW, Color.BLACK, Color.BLUE];

/**
 * Generates a standard 106 tile deck
 */
export const createDeck = (): Tile[] => {
  const deck: Tile[] = [];
  let id = 0;
  for (const color of COLORS) {
    for (let num = 1; num <= 13; num++) {
      deck.push({ id: `tile-${id++}`, number: num, color, isOkey: false, isIndicator: false });
      deck.push({ id: `tile-${id++}`, number: num, color, isOkey: false, isIndicator: false });
    }
  }
  deck.push({ id: `tile-${id++}`, number: 0, color: Color.JOKER, isOkey: false, isIndicator: false });
  deck.push({ id: `tile-${id++}`, number: 0, color: Color.JOKER, isOkey: false, isIndicator: false });
  return deck;
};

export const shuffle = <T>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export const determineOkey = (indicator: Tile) => {
  let okeyNum = indicator.number + 1;
  if (okeyNum > 13) okeyNum = 1;
  return { number: okeyNum, color: indicator.color };
};

export const isRealOkey = (tile: Tile, okeyTile: { number: number; color: Color } | null): boolean => {
  return !!(okeyTile && tile.number === okeyTile.number && tile.color === okeyTile.color);
};

export const isFakeOkey = (tile: Tile): boolean => {
  return tile.color === Color.JOKER;
};

export const isWildcard = (tile: Tile, okeyTile: { number: number; color: Color } | null): boolean => {
  // Sadece gerçek okey wildcard'dır
  // Joker (fake okey) sadece okey'nin yerini tutabilir, normal wildcard değildir
  return isRealOkey(tile, okeyTile);
};


export const getEffectiveTile = (tile: Tile, okeyTile: { number: number; color: Color } | null): { number: number, color: Color } => {
  // Joker, okey'nin yerini tutar - okey'nin sayı/rengi olarak davranır
  if (isFakeOkey(tile) && okeyTile) {
    return { number: okeyTile.number, color: okeyTile.color };
  }
  return { number: tile.number, color: tile.color };
};

export const getTileScore = (tile: Tile, okeyTile: { number: number; color: Color } | null): number => {
  if (isRealOkey(tile, okeyTile)) return 101;
  // Sahte Okey (Joker), okeyin değerine sahiptir.
  if (isFakeOkey(tile) && okeyTile) return okeyTile.number;
  return tile.number;
};


export const calculateDiscardPenalty = (tile: Tile, gameState: GameState, player: Player): { penalty: number; reason: string | null } => {
  let penalty = 0;
  let reason: string | null = null;

  if (isRealOkey(tile, gameState.okeyTile)) {
    penalty = 101;
    reason = `${player.name} OKEY attığı için 101 ceza aldı!`;
  } else if (isPlayableAnywhere(tile, gameState.players, gameState.okeyTile)) {
    penalty = 101;
    reason = `${player.name} işler taş attığı için 101 ceza aldı!`;
  }

  return { penalty, reason };
};

export const calculateSetScore = (set: Combination, okeyTile: { number: number; color: Color } | null): number => {
    if (set.type === "group") {
        const normalTile = set.tiles.find(t => !isWildcard(t, okeyTile));
        if (!normalTile) return 0;
        const effective = getEffectiveTile(normalTile, okeyTile);
        let val = effective.number;
        return val * set.tiles.length;
    } else {
        const normalTiles = set.tiles.filter(t => !isWildcard(t, okeyTile));
        if (normalTiles.length === 0) return 0;
        const effTiles = normalTiles.map(t => getEffectiveTile(t, okeyTile));
        const nums = effTiles.map(t => t.number);
        
        const minNum = Math.min(...nums);
        const firstNormalIdx = set.tiles.findIndex(t => !isWildcard(t, okeyTile) && getEffectiveTile(t, okeyTile).number === minNum);
        const startNum = minNum - firstNormalIdx;
        
        let sum = 0;
        for (let i = 0; i < set.tiles.length; i++) {
            sum += (startNum + i);
        }
        return sum;
    }
};

export const isValidGroup = (tiles: Tile[], okeyTile: { number: number; color: Color } | null): boolean => {
  if (tiles.length < 3 || tiles.length > 4) return false;
  const normalTiles = tiles.filter(t => !isWildcard(t, okeyTile)).map(t => getEffectiveTile(t, okeyTile));
  if (normalTiles.length === 0) return true;
  const number = normalTiles[0].number;
  if (normalTiles.some(t => t.number !== number)) return false;
  const colors = normalTiles.map(t => t.color);
  if (new Set(colors).size !== colors.length) return false;
  return true;
};

export const isValidRun = (tiles: Tile[], okeyTile: { number: number; color: Color } | null): boolean => {
  if (tiles.length < 3) return false;
  const normalTiles = tiles.filter(t => !isWildcard(t, okeyTile));
  if (normalTiles.length === 0) return true;
  const effNormal = normalTiles.map(t => getEffectiveTile(t, okeyTile));
  const color = effNormal[0].color;
  if (effNormal.some(t => t.color !== color)) return false;
  const nums = effNormal.map(t => t.number);
  if (new Set(nums).size !== nums.length) return false;

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return (max - min + 1) <= tiles.length;
};

export const findBestSets = (hand: (Tile | null)[], okeyTile: { number: number; color: Color } | null): Combination[] => {
  const tiles = hand.filter((t): t is Tile => t !== null);
  const allCandidates: Combination[] = [];
  const wildcards = tiles.filter(t => isWildcard(t, okeyTile));
  const totalTilesInHand = tiles.length;

  // --- Grup (group) adayları ---
  for (let num = 1; num <= 13; num++) {
    const groupCandidates = tiles.filter(t => !isWildcard(t, okeyTile) && getEffectiveTile(t, okeyTile).number === num);
    const uniqueColors: Tile[] = [];
    const colorsSeen = new Set<Color>();
    groupCandidates.forEach(t => {
      const color = getEffectiveTile(t, okeyTile).color;
      if (!colorsSeen.has(color)) { uniqueColors.push(t); colorsSeen.add(color); }
    });

    for (let len = 3; len <= 4; len++) {
      const usedNormal = uniqueColors.slice(0, Math.min(uniqueColors.length, len));
      const neededWildcards = len - usedNormal.length;
      // Her perde en fazla 1 okey kullanabilir
      if (neededWildcards > 1) continue;
      if (neededWildcards === 0 && usedNormal.length === len) {
        const score = calculateSetScore({ tiles: usedNormal, type: "group", score: 0 }, okeyTile);
        allCandidates.push({ tiles: usedNormal, type: "group", score });
      } else if (neededWildcards === 1 && wildcards.length >= 1) {
        for (const wc of wildcards) {
          const setTiles = [...usedNormal, wc];
          const score = calculateSetScore({ tiles: setTiles, type: "group", score: 0 }, okeyTile);
          allCandidates.push({ tiles: setTiles, type: "group", score });
        }
      }
    }
  }

  // --- Seri (run) adayları ---
  for (const color of COLORS) {
    const colorTiles = tiles.filter(t => !isWildcard(t, okeyTile) && getEffectiveTile(t, okeyTile).color === color)
      .sort((a, b) => getEffectiveTile(a, okeyTile).number - getEffectiveTile(b, okeyTile).number);

    for (let len = 3; len <= 13; len++) {
      for (let startNum = 1; startNum <= 13 - len + 1; startNum++) {
        const runNumbers = Array.from({ length: len }, (_, i) => startNum + i);

        const skeleton: (Tile | null)[] = [];
        let wildSlotsNeeded = 0;

        for (const targetNum of runNumbers) {
          const available = colorTiles.find(t =>
            getEffectiveTile(t, okeyTile).number === targetNum &&
            !skeleton.some(rt => rt !== null && rt.id === t.id)
          );
          if (available) {
            skeleton.push(available);
          } else {
            skeleton.push(null);
            wildSlotsNeeded++;
          }
        }

        // Her perde en fazla 1 okey
        if (wildSlotsNeeded > 1) continue;

        if (wildSlotsNeeded === 0) {
          const runTiles = skeleton as Tile[];
          const score = calculateSetScore({ tiles: runTiles, type: "run", score: 0 }, okeyTile);
          allCandidates.push({ tiles: runTiles, type: "run", score });
        } else if (wildcards.length >= 1) {
          for (const wc of wildcards) {
            const currentRun = skeleton.map(t => t ?? wc) as Tile[];
            const score = calculateSetScore({ tiles: currentRun, type: "run", score: 0 }, okeyTile);
            allCandidates.push({ tiles: currentRun, type: "run", score });
          }
        }
      }
    }
  }

  // Aynı (sayı, renk) çiftine sahip birden fazla taş varsa, her kopyayı kullanan
  // aday varyantları üret. Aksi hâlde örn. iki kırmızı-5 olduğunda 3-4-5 adayı
  // ile 5-6-7 adayı aynı tile.id'yi paylaşır → backtrack birini seçince diğeri
  // engellenir.
  const baseCount = allCandidates.length;
  for (let ci = 0; ci < baseCount; ci++) {
    const candidate = allCandidates[ci];
    for (let pos = 0; pos < candidate.tiles.length; pos++) {
      const tile = candidate.tiles[pos];
      if (isWildcard(tile, okeyTile)) continue;
      const effTile = getEffectiveTile(tile, okeyTile);
      // Aynı sayı+renk farklı ID'li başka bir taş var mı?
      const dup = tiles.find(t =>
        t.id !== tile.id &&
        !isWildcard(t, okeyTile) &&
        getEffectiveTile(t, okeyTile).number === effTile.number &&
        getEffectiveTile(t, okeyTile).color === effTile.color &&
        !candidate.tiles.some(ct => ct.id === t.id)
      );
      if (dup) {
        const newTiles = [...candidate.tiles];
        newTiles[pos] = dup;
        // Aday daha önce eklenmemişse ekle
        const alreadyExists = allCandidates.some(c =>
          c.type === candidate.type &&
          c.tiles.length === newTiles.length &&
          newTiles.every((t, i) => c.tiles[i]?.id === t.id)
        );
        if (!alreadyExists) {
          allCandidates.push({ tiles: newTiles, type: candidate.type, score: candidate.score });
        }
      }
    }
  }

  // Sıralama: okeysiz setler önce (doğal setler daha hızlı denenir → daha iyi budama),
  // eşit okey sayısında serileri gruplara tercih et, sonra skora göre azalan.
  allCandidates.sort((a, b) => {
    const aOkeys = a.tiles.filter(t => isWildcard(t, okeyTile)).length;
    const bOkeys = b.tiles.filter(t => isWildcard(t, okeyTile)).length;
    if (aOkeys !== bOkeys) return aOkeys - bOkeys;            // okey az → önce
    if (a.type !== b.type) return a.type === 'run' ? -1 : 1; // seri → önce
    return b.score - a.score;                                  // yüksek skor → önce
  });

  // Suffix max skor (budama için üst sınır) — score×10 ile tutarlı olmalı
  const suffixMaxScore = new Array(allCandidates.length + 1).fill(0);
  for (let i = allCandidates.length - 1; i >= 0; i--) {
    suffixMaxScore[i] = suffixMaxScore[i + 1] + allCandidates[i].score * 10;
  }

  let bestResult: Combination[] = [];
  let bestComposite = -1;
  const usedIds = new Set<string>();

  /**
   * Çok boyutlu hedef fonksiyonu (öncelik sırasına göre):
   *   1. Kaç taş set içinde → × 10000 (mümkün olan en fazla taşı set yap)
   *   2. Toplam set skoru    → +score
   *   3. Kullanılan okey sayısı → -300 × okeyCount (doğal setleri tercih et; iki okey iki ayrı perde)
   *   4. Seri (ardışık) sayısı → +150 × runs (serileri gruplara güçlü biçimde tercih et)
   *
   * Öncelik hiyerarşisi:
   *  - Daha fazla taşı set içine almak her zaman birinci öncelik (10000 ağırlıklı)
   *  - Eşit taş kapsamında: seri > grup (+150 per seri güçlü tiebreaker)
   *  - Okey penaltısı (-300): doğal set, okeyden 300 puan ileride → okey ikinci sete saklanır
   *  - İki okey: her biri ayrı perde yapar → daha fazla taş kaplar → zaten favori
   */
  const RUN_BONUS = 150;

  function backtrack(
    idx: number,
    current: Combination[],
    coveredTiles: number,
    totalScore: number,
    okeysUsed: number,
    runs: number,
  ) {
    // score×10: skor farkı (özellikle okey kullanımında) run bonusunu (150) geçebilmeli.
    // Örnek: 13-13-okey grubu (skor=39 → 390) ile 1-2-3 serisi (skor=6 → 60+150=210):
    // grup=30090 > seri=29910 → yüksek sayılı per kazanır.
    // Eşit skorda (9-9-9 vs 8-9-10, her ikisi=270): run=270+150=420 > grup=270 → seri kazanır.
    const composite = coveredTiles * 10000 + totalScore * 10 - okeysUsed * 300 + runs * RUN_BONUS;
    if (composite > bestComposite) { bestComposite = composite; bestResult = [...current]; }
    if (idx >= allCandidates.length) return;

    // Üst sınır budaması — score×10 ve RUN_BONUS ile tutarlı
    const maxAdditionalTiles = totalTilesInHand - coveredTiles;
    const upperBound = maxAdditionalTiles * 10000 + suffixMaxScore[idx] + (allCandidates.length - idx) * RUN_BONUS;
    if (composite + upperBound <= bestComposite) return;

    for (let i = idx; i < allCandidates.length; i++) {
      const candidate = allCandidates[i];
      if (candidate.tiles.some(t => usedIds.has(t.id))) continue;
      const candOkeys = candidate.tiles.filter(t => isWildcard(t, okeyTile)).length;
      candidate.tiles.forEach(t => usedIds.add(t.id));
      current.push(candidate);
      backtrack(
        i + 1,
        current,
        coveredTiles + candidate.tiles.length,
        totalScore + candidate.score,
        okeysUsed + candOkeys,
        runs + (candidate.type === 'run' ? 1 : 0),
      );
      current.pop();
      candidate.tiles.forEach(t => usedIds.delete(t.id));
    }
  }

  backtrack(0, [], 0, 0, 0, 0);
  return bestResult;
};

export const findPairs = (hand: (Tile | null)[], okeyTile: { number: number; color: Color } | null): Tile[][] => {
  const tiles = hand.filter((t): t is Tile => t !== null);
  const pairs: Tile[][] = [];
  const usedIds = new Set<string>();
  const normalTiles = tiles.filter(t => !isWildcard(t, okeyTile) && !isFakeOkey(t));
  const realOkeys = tiles.filter(t => isRealOkey(t, okeyTile));
  const fakeOkeys = tiles.filter(t => isFakeOkey(t));

  // 1) Önce normal-normal eşleşmeleri bul
  for (let i = 0; i < normalTiles.length; i++) {
    if (usedIds.has(normalTiles[i].id)) continue;
    for (let j = i + 1; j < normalTiles.length; j++) {
      if (usedIds.has(normalTiles[j].id)) continue;
      const t1 = getEffectiveTile(normalTiles[i], okeyTile);
      const t2 = getEffectiveTile(normalTiles[j], okeyTile);
      if (t1.number === t2.number && t1.color === t2.color) {
        pairs.push([normalTiles[i], normalTiles[j]]);
        usedIds.add(normalTiles[i].id);
        usedIds.add(normalTiles[j].id);
        break;
      }
    }
  }

  // 2) Gerçek okey eşleme: her okey'i, eşi olmayan farklı bir normal taşla potansiyel çift olarak işaretle
  const lonelyNormals = normalTiles.filter(t => !usedIds.has(t.id));
  for (const okey of realOkeys) {
    const partner = lonelyNormals.find(t => !usedIds.has(t.id));
    if (!partner) break;
    pairs.push([partner, okey]);
    usedIds.add(partner.id);
    usedIds.add(okey.id);
  }

  // 3) Joker eşleme: joker SADECE okey'nin eşi olan taş ile çift oluşturabilir
  // Okey = beyaz 5 ise, joker + beyaz 5 = çift
  if (okeyTile && fakeOkeys.length > 0) {
    const okeyPartner = normalTiles.find(t => {
      const eff = getEffectiveTile(t, okeyTile);
      return eff.number === okeyTile.number && eff.color === okeyTile.color && !usedIds.has(t.id);
    });

    for (const joker of fakeOkeys) {
      if (usedIds.has(joker.id)) continue;
      if (okeyPartner && !usedIds.has(okeyPartner.id)) {
        pairs.push([okeyPartner, joker]);
        usedIds.add(okeyPartner.id);
        usedIds.add(joker.id);
      }
    }
  }

  // 4) İki sahte okey (joker) kendi aralarında çift oluşturabilir
  // Her ikisi de okeyi temsil eder → iki özdeş taş = geçerli çift
  const unusedFakeOkeys = fakeOkeys.filter(t => !usedIds.has(t.id));
  if (unusedFakeOkeys.length >= 2) {
    pairs.push([unusedFakeOkeys[0], unusedFakeOkeys[1]]);
    usedIds.add(unusedFakeOkeys[0].id);
    usedIds.add(unusedFakeOkeys[1].id);
  }

  return pairs;
};

export const calculateHandTotal = (hand: (Tile | null)[], okeyTile: { number: number; color: Color } | null): number => {
  return hand.reduce((sum, tile) => sum + (tile ? getTileScore(tile, okeyTile) : 0), 0);
};


export const getContiguousPairs = (hand: (Tile | null)[], okeyTile: { number: number; color: Color } | null): Tile[][] => {
  const contiguousPairs: Tile[][] = [];
  const usedInContiguous = new Set<string>();

  for (let i = 0; i < hand.length - 1; i++) {
    if (hand[i] && hand[i + 1] && !usedInContiguous.has(hand[i]!.id) && !usedInContiguous.has(hand[i + 1]!.id)) {
      const t1 = hand[i]!;
      const t2 = hand[i + 1]!;
      const isOkey1 = isWildcard(t1, okeyTile);
      const isOkey2 = isWildcard(t2, okeyTile);
      const eff1 = getEffectiveTile(t1, okeyTile);
      const eff2 = getEffectiveTile(t2, okeyTile);

      if (isOkey1 || isOkey2 || (eff1.number === eff2.number && eff1.color === eff2.color)) {
        contiguousPairs.push([t1, t2]);
        usedInContiguous.add(t1.id);
        usedInContiguous.add(t2.id);
      }
    }
  }
  return contiguousPairs;
};

export const getContiguousSets = (hand: (Tile | null)[], okeyTile: { number: number; color: Color } | null): Combination[] => {
  const contiguousSets: Combination[] = [];
  const usedInContiguous = new Set<string>();

  let i = 0;
  while (i < hand.length) {
    if (!hand[i]) {
      i++;
      continue;
    }

    const group: Tile[] = [];
    while (i < hand.length && hand[i] && !usedInContiguous.has(hand[i]!.id)) {
      group.push(hand[i]!);
      i++;
    }

    if (group.length >= 3) {
      if (isValidRun(group, okeyTile)) {
        const set: Combination = {
          tiles: group,
          type: 'run',
          score: calculateSetScore({ tiles: group, type: 'run', score: 0 }, okeyTile)
        };
        contiguousSets.push(set);
        group.forEach(t => usedInContiguous.add(t.id));
      } else if (isValidGroup(group, okeyTile)) {
        const set: Combination = {
          tiles: group,
          type: 'group',
          score: calculateSetScore({ tiles: group, type: 'group', score: 0 }, okeyTile)
        };
        contiguousSets.push(set);
        group.forEach(t => usedInContiguous.add(t.id));
      }
    }
  }
  return contiguousSets;
};

export const sortByPairs = (hand: (Tile | null)[], okeyTile: { number: number; color: Color } | null, lastDrawnTileId?: string | null): (Tile | null)[] => {
  const tiles = hand.filter((t): t is Tile => t !== null);

  const contiguousPairs = getContiguousPairs(hand, okeyTile);
  const usedInContiguous = new Set<string>(contiguousPairs.flat().map(t => t.id));

  // 2. Algoritmik çift bulma (contiguous pairs'den kalanlar)
  const remainingAfterContiguous = tiles.filter(t => !usedInContiguous.has(t.id));
  const pairs = findPairs(remainingAfterContiguous, okeyTile);
  const pairedIds = new Set([
    ...usedInContiguous,
    ...pairs.flat().map(t => t.id)
  ]);

  // 3. Eğer okey varsa ve eşi yoksa en büyük taşla eşleştir
  let adjustedPairs = [...contiguousPairs, ...pairs];
  const unpaired = tiles.filter(t => !pairedIds.has(t.id));
  const okey = unpaired.find(t => isWildcard(t, okeyTile));

  if (okey && unpaired.length > 1) {
    // Okey'yi ve en büyük taşı çift yap
    const maxTile = unpaired
      .filter(t => t.id !== okey.id)
      .reduce((max, t) => t.number > max.number ? t : max);
    adjustedPairs = adjustedPairs.filter(p => !p.some(t => t.id === okey.id || t.id === maxTile.id));
    adjustedPairs.push([maxTile, okey]);
    pairedIds.add(okey.id);
    pairedIds.add(maxTile.id);
  }

  const unfilteredRemaining = tiles.filter(t => !pairedIds.has(t.id));
  const lastDrawnTile = lastDrawnTileId ? unfilteredRemaining.find(t => t.id === lastDrawnTileId) : null;
  const filteredRemaining = lastDrawnTile 
    ? unfilteredRemaining.filter(t => t.id !== lastDrawnTileId)
    : unfilteredRemaining;

  const sortedRemaining = [...filteredRemaining].sort((a,b) => a.number - b.number);
  const remainingTiles = lastDrawnTile ? [...sortedRemaining, lastDrawnTile] : sortedRemaining;

  const result: (Tile | null)[] = new Array(30).fill(null);
  let pos = 0;
  adjustedPairs.forEach(pair => {
    if (pos + 1 < 30) {
      result[pos++] = pair[0];
      result[pos++] = pair[1];
      pos++;
    }
  });

  remainingTiles.forEach(t => {
    if (pos < 30) result[pos++] = t;
  });
  return result;
};

export const sortBySets = (hand: (Tile | null)[], okeyTile: { number: number; color: Color } | null, lastDrawnTileId?: string | null): (Tile | null)[] => {
  const tiles = hand.filter((t): t is Tile => t !== null);

  const contiguousSets = getContiguousSets(hand, okeyTile);
  const usedInContiguous = new Set<string>(contiguousSets.flatMap(s => s.tiles.map(t => t.id)));

  // 2. Algoritmik set bulma (contiguous sets'den kalanlar)
  const remainingAfterContiguous = tiles.filter(t => !usedInContiguous.has(t.id));
  const sets = findBestSets(remainingAfterContiguous, okeyTile);
  const usedIds = new Set([
    ...usedInContiguous,
    ...sets.flatMap(s => s.tiles).map(t => t.id)
  ]);

  let allSets = [...contiguousSets, ...sets];
  let remainingTiles = tiles.filter(t => !usedIds.has(t.id));

  // 3. Eğer okey varsa ve set içinde değilse en büyük taşla çift oluştur
  const okey = remainingTiles.find(t => isWildcard(t, okeyTile));
  if (okey && remainingTiles.length > 1) {
    const maxTile = remainingTiles
      .filter(t => t.id !== okey.id)
      .reduce((max, t) => t.number > max.number ? t : max);

    // Okey + en büyük taşı çift olarak ekle
    const pairSet: Combination = {
      tiles: [maxTile, okey],
      type: 'group',
      score: calculateSetScore({ tiles: [maxTile, okey], type: 'group', score: 0 }, okeyTile)
    };
    allSets.push(pairSet);
    usedIds.add(okey.id);
    usedIds.add(maxTile.id);
    remainingTiles = remainingTiles.filter(t => !usedIds.has(t.id));
  }

  const result: (Tile | null)[] = new Array(30).fill(null);

  // 4. Irkartaları sırala ve EN SAĞDAN yerleştir — setlerle asla karışmasın
  const lastDrawnTile = lastDrawnTileId ? remainingTiles.find(t => t.id === lastDrawnTileId) : null;
  const filteredRemaining = lastDrawnTile 
    ? remainingTiles.filter(t => t.id !== lastDrawnTileId)
    : remainingTiles;

  const sortedLeftovers = [...filteredRemaining].sort((a, b) => {
    const effA = getEffectiveTile(a, okeyTile);
    const effB = getEffectiveTile(b, okeyTile);
    if (effA.color !== effB.color) return COLORS.indexOf(effA.color) - COLORS.indexOf(effB.color);
    return effA.number - effB.number;
  });

  const leftovers = lastDrawnTile ? [...sortedLeftovers, lastDrawnTile] : sortedLeftovers;

  let rightPos = 29;
  for (let i = leftovers.length - 1; i >= 0; i--) {
    result[rightPos--] = leftovers[i];
  }
  // rightPos artık setlerin kullanabileceği son slot (dahil)
  const setsBoundary = rightPos;

  // 5. Setleri soldan yerleştir, 6+ taşlıysa 3'erli parçalara böl
  let pos = 0;
  for (const set of allSets) {
    const chunks: Tile[][] = set.tiles.length >= 6
      ? Array.from({ length: Math.ceil(set.tiles.length / 3) }, (_, i) =>
          set.tiles.slice(i * 3, (i + 1) * 3))
      : [set.tiles];

    for (const chunk of chunks) {
      if (pos + chunk.length - 1 > setsBoundary) break; // sınırı aşma
      chunk.forEach(t => { result[pos++] = t; });
      if (pos <= setsBoundary) pos++; // gruplar arası boşluk
    }
  }

  return result;
};

export const calculatePenalty = (player: Player, isHandFinished: boolean, gameState: GameState): number => {
  if (!player.hasOpened) return 202;
  const sum = player.hand.reduce((s, t) => s + (t ? getTileScore(t, gameState.okeyTile) : 0), 0);
  return player.openedWithType === 'pairs' ? sum * 2 : sum;
};

export const canProcessTile = (tile: Tile, set: Combination, okeyTile: { number: number; color: Color } | null): boolean => {
  if (set.type === "group") {
    return isValidGroup([...set.tiles, tile], okeyTile);
  }

  // Run: Uçlara ekleme kontrolü
  const normalIdx = set.tiles.findIndex(t => !isWildcard(t, okeyTile));
  if (normalIdx === -1) return false;

  const anchorNum = getEffectiveTile(set.tiles[normalIdx], okeyTile).number;
  const runColor = getEffectiveTile(set.tiles[normalIdx], okeyTile).color;

  const startNum = anchorNum - normalIdx;
  const endNum = startNum + set.tiles.length - 1;

  if (isWildcard(tile, okeyTile)) {
    // Eklenecek taş Okey ise 1 ve 13 sınırlarına dikkat et
    return startNum > 1 || endNum < 13;
  }

  const effectiveTile = getEffectiveTile(tile, okeyTile);
  if (effectiveTile.color !== runColor) return false;
  
  // Sadece tam uca eklenmesine izin ver
  return effectiveTile.number === startNum - 1 || effectiveTile.number === endNum + 1;
};

export const canSwapOkey = (tile: Tile, set: Combination, okeyTile: { number: number; color: Color } | null): boolean => {
  if (isWildcard(tile, okeyTile)) return false;
  if (!set.tiles.some(t => isWildcard(t, okeyTile))) return false;

  if (set.type === "pair") {
    const normalTiles = set.tiles.filter(t => !isWildcard(t, okeyTile));
    if (normalTiles.length === 0) return false;
    const effExisting = getEffectiveTile(normalTiles[0], okeyTile);
    const effInput = getEffectiveTile(tile, okeyTile);
    return effExisting.number === effInput.number && effExisting.color === effInput.color;
  }

  if (set.type === "group") {
    const normalTiles = set.tiles.filter(t => !isWildcard(t, okeyTile));
    if (normalTiles.length === 0) return false;
    const groupNumber = getEffectiveTile(normalTiles[0], okeyTile).number;
    const eff = getEffectiveTile(tile, okeyTile);
    if (eff.number !== groupNumber) return false;
    const existingColors = normalTiles.map(t => getEffectiveTile(t, okeyTile).color);
    if (existingColors.includes(eff.color)) return false;
    // Swap ancak tüm 4 renk tamamlandığında geçerli:
    // yani grupta zaten 3 gerçek taş olmalı ve verilen taş 4. rengi tamamlamalı.
    const allColors = [Color.RED, Color.YELLOW, Color.BLACK, Color.BLUE];
    const colorsAfterSwap = [...existingColors, eff.color];
    return allColors.every(c => colorsAfterSwap.includes(c));
  }

  // Run: okeyin tam olarak temsil ettiği sayı+renk ile eşleşmeli.
  const normalIdx = set.tiles.findIndex(t => !isWildcard(t, okeyTile));
  if (normalIdx === -1) return false;

  const anchorNumber = getEffectiveTile(set.tiles[normalIdx], okeyTile).number;
  const runColor = getEffectiveTile(set.tiles[normalIdx], okeyTile).color;

  // Koyulan taşın rengi run'ın rengiyle aynı mı?
  if (tile.color !== runColor) return false;

  // Setteki okeylerin temsil ettiği beklenen sayıları bul
  const okeyExpectedNumbers = set.tiles
    .map((t, idx) => ({ isWild: isWildcard(t, okeyTile), expectedNum: anchorNumber + (idx - normalIdx) }))
    .filter(x => x.isWild)
    .map(x => x.expectedNum);

  return okeyExpectedNumbers.includes(tile.number);

};


export const canProcessPair = (pair: Tile[], okeyTile: { number: number; color: Color } | null): boolean => {
  if (pair.length !== 2) return false;
  const eff1 = getEffectiveTile(pair[0], okeyTile);
  const eff2 = getEffectiveTile(pair[1], okeyTile);
  return eff1.number === eff2.number && eff1.color === eff2.color;
};

export const isPlayableAnywhere = (tile: Tile, players: Player[], okeyTile: { number: number; color: Color } | null): boolean => {
  for (const player of players) {
    for (const set of player.openedSets) {
      if (canProcessTile(tile, set, okeyTile)) return true;
      // Açık setteki okeyi taşla değiştirilebilir mi? (işler taş kontrolü)
      if (canSwapOkey(tile, set, okeyTile)) return true;
    }
    for (const pair of player.openedPairs) if (canSwapOkey(tile, { tiles: pair, type: "pair", score: 0 }, okeyTile)) return true;
  }
  return false;
};

export const checkWin = (player: Player): boolean => player.hand.every(t => t === null);

export const aiTakeTurn = (gameState: GameState): Partial<GameState> | null => {
  const player = gameState.players[gameState.currentPlayerIndex];
  if (!player.isAI) return null;

  const logs = [...gameState.logs];
  const deck = [...gameState.deck];
  const discardPile = [...gameState.discardPile];
  const players = [...gameState.players];
  const currentPlayer = { ...players[gameState.currentPlayerIndex] };

  const topDiscard = discardPile[discardPile.length - 1];
  let drewFromDiscard = false;

  if (topDiscard && !currentPlayer.hasOpened) {
     const currentTiles = currentPlayer.hand.filter((t): t is Tile => t !== null);
     const tempHand = [...currentTiles, topDiscard];
     const sets = findBestSets(tempHand, gameState.okeyTile);
     const totalScore = sets.reduce((s, set) => s + set.score, 0);
     const minScore = gameState.mode === GameMode.FOLDING ? gameState.currentOpenScore + 1 : 101;
     
     if (totalScore >= minScore) {
        drewFromDiscard = true;
        discardPile.pop();
        const emptyIdx = currentPlayer.hand.indexOf(null);
        if (emptyIdx !== -1) currentPlayer.hand[emptyIdx] = topDiscard;
        else currentPlayer.hand.push(topDiscard);
        logs.push(`${currentPlayer.name} yerden ${topDiscard.number} ${topDiscard.color} aldı.`);
     }
  }

  if (!drewFromDiscard) {
    const drawn = deck.pop();
    if (drawn) {
      const emptyIdx = currentPlayer.hand.indexOf(null);
      if (emptyIdx !== -1) currentPlayer.hand[emptyIdx] = drawn;
      else currentPlayer.hand.push(drawn);
      logs.push(`${currentPlayer.name} desteden taş çekti.`);
    } else {
      const hasAnyOpened = players.some(p => p.hasOpened);
      return {
        phase: GamePhase.FINISHED,
        noOneOpened: !hasAnyOpened,
        logs: [...logs, hasAnyOpened ? `Deste bitti. Oyun sona erdi.` : `Deste bitti. Kimse açmadı — herkes 202 ceza alır!`]
      };
    }
  }

  const currentTiles = currentPlayer.hand.filter((t): t is Tile => t !== null);
  const sets = findBestSets(currentTiles, gameState.okeyTile);
  const totalScore = sets.reduce((s, set) => s + set.score, 0);
  const pairs = findPairs(currentTiles, gameState.okeyTile);

  const minScore = currentPlayer.hasOpened ? 0 : (gameState.mode === GameMode.FOLDING ? gameState.currentOpenScore + 1 : 101);
  const minPairs = currentPlayer.hasOpened 
    ? (gameState.currentOpenPairs > 0 ? 1 : 5)
    : (gameState.mode === GameMode.FOLDING ? gameState.currentOpenPairs + 1 : 5);

  if (totalScore >= minScore && sets.length > 0 && currentPlayer.openedWithType !== 'pairs') {
    if (!currentPlayer.hasOpened) {
      currentPlayer.hasOpened = true;
      currentPlayer.openedWithType = 'sets';
      currentPlayer.openedSets = sets;
      currentPlayer.lastOpenScore = totalScore;
      currentPlayer.openedThisTurn = true; // elden bitirme tespiti için
    } else {
      currentPlayer.openedSets = [...currentPlayer.openedSets, ...sets];
    }

    sets.forEach(set => {
      set.tiles.forEach(t => {
        const idx = currentPlayer.hand.findIndex(ht => ht?.id === t.id);
        if (idx !== -1) currentPlayer.hand[idx] = null;
      });
    });
    const remainingScore = calculateHandTotal(currentPlayer.hand, gameState.okeyTile);
    logs.push(`${currentPlayer.name} elini açtı. Kalan puan: ${remainingScore}`);
  } else if (pairs.length >= minPairs) {
    if (!currentPlayer.hasOpened) {
      currentPlayer.hasOpened = true;
      currentPlayer.openedWithType = 'pairs';
      currentPlayer.openedPairs = pairs;
      currentPlayer.lastOpenScore = pairs.length;
    } else {
      currentPlayer.openedPairs = [...currentPlayer.openedPairs, ...pairs];
    }
    pairs.forEach(pair => {
      pair.forEach(t => {
        const idx = currentPlayer.hand.findIndex(ht => ht?.id === t.id);
        if (idx !== -1) currentPlayer.hand[idx] = null;
      });
    });
    logs.push(`${currentPlayer.name} ${pairs.length} çift ile el açtı.`);
  }

  const doubleOpenedInGame = players.some(p => p.hasOpened && p.openedWithType === 'pairs') || gameState.currentOpenPairs > 0;
  if (currentPlayer.openedWithType === 'sets' && doubleOpenedInGame) {
    const remainingTilesForPairs = currentPlayer.hand.filter((t): t is Tile => t !== null);
    const existingPairs = findPairs(remainingTilesForPairs, gameState.okeyTile);
    if (existingPairs.length > 0) {
      currentPlayer.openedPairs = [...currentPlayer.openedPairs, ...existingPairs];
      existingPairs.forEach(pair => {
         pair.forEach(t => {
           const idx = currentPlayer.hand.findIndex(ht => ht?.id === t.id);
           if (idx !== -1) currentPlayer.hand[idx] = null;
         });
      });
      logs.push(`${currentPlayer.name} çift açıldığı için elindeki ${existingPairs.length} çifti de masaya açtı.`);
    }
  }

  if (currentPlayer.hasOpened) {
    players.forEach((targetPlayer) => {
      if (currentPlayer.openedWithType !== 'pairs') {
        targetPlayer.openedSets.forEach((set) => {
          currentPlayer.hand.forEach((tile, hIdx) => {
            if (tile && canProcessTile(tile, set, gameState.okeyTile)) {
              if (set.type === "run") {
                const normalIdx = set.tiles.findIndex(t => !isWildcard(t, gameState.okeyTile));
                if (normalIdx !== -1) {
                  const anchorNum = getEffectiveTile(set.tiles[normalIdx], gameState.okeyTile).number;
                  const startNum = anchorNum - normalIdx;

                  if (isWildcard(tile, gameState.okeyTile)) {
                    if (startNum > 1) {
                      set.tiles.unshift(tile);
                    } else {
                      set.tiles.push(tile);
                    }
                  } else {
                    const effectiveTile = getEffectiveTile(tile, gameState.okeyTile);
                    if (effectiveTile.number === startNum - 1) {
                      set.tiles.unshift(tile);
                    } else {
                      set.tiles.push(tile);
                    }
                  }
                } else {
                  set.tiles.push(tile);
                }
              } else if (set.type === "group") {
                set.tiles.push(tile);
                const colorOrder = [Color.RED, Color.YELLOW, Color.BLACK, Color.BLUE, Color.JOKER];
                set.tiles.sort((a, b) => {
                  if (isWildcard(a, gameState.okeyTile)) return 1;
                  if (isWildcard(b, gameState.okeyTile)) return -1;
                  return colorOrder.indexOf(a.color) - colorOrder.indexOf(b.color);
                });
              }
              currentPlayer.hand[hIdx] = null;
              logs.push(`${currentPlayer.name}, ${targetPlayer.name}'in perine taş işledi.`);
            }
          });
        });
      }

      targetPlayer.openedPairs.forEach((pair) => {
        currentPlayer.hand.forEach((tile, hIdx) => {
          if (tile) {
            const isOkeyInPair = pair.some(t => isWildcard(t, gameState.okeyTile));
            if (isOkeyInPair) {
              const normalTile = pair.find(t => !isWildcard(t, gameState.okeyTile));
              if (normalTile && tile.number === normalTile.number && tile.color === normalTile.color) {
                const okeyIdx = pair.findIndex(t => isWildcard(t, gameState.okeyTile));
                const okeyTileInPair = pair[okeyIdx];
                pair[okeyIdx] = tile;
                currentPlayer.hand[hIdx] = okeyTileInPair;
                logs.push(`${currentPlayer.name}, ${targetPlayer.name}'in çiftinden okeyi aldı.`);
              }
            }
          }
        });
      });
    });
  }

  // AI tüm taşlarını setlere işlediyse → discard olmadan kazandı
  if (currentPlayer.hasOpened && currentPlayer.hand.every(t => t === null)) {
    const isHandFinish = currentPlayer.openedThisTurn === true;
    const winMsg = isHandFinish
      ? `${currentPlayer.name} ELDEN bitirdi! (-202, ×2 ceza)`
      : `${currentPlayer.name} oyunu bitirdi! (-101)`;
    players[gameState.currentPlayerIndex] = currentPlayer;
    return {
      players,
      deck,
      discardPile,
      logs: [...logs, winMsg],
      phase: GamePhase.FINISHED,
      winnerId: currentPlayer.id,
      hasHandFinish: isHandFinish,
    };
  }

  // Elde bir taşın seri/grup potansiyeli var mı?
  const hasComboPotential = (tile: Tile, hand: (Tile | null)[]): boolean => {
    if (isWildcard(tile, gameState.okeyTile)) return true;
    const others = hand.filter((t): t is Tile => t !== null && t.id !== tile.id && !isWildcard(t, gameState.okeyTile));
    // Grup potansiyeli: aynı sayı farklı renk (1 taş bile yeterli)
    if (others.some(t => t.number === tile.number && t.color !== tile.color)) return true;
    // Seri potansiyeli: aynı renk, ±2 mesafede en az 1 taş
    if (others.some(t => t.color === tile.color && Math.abs(t.number - tile.number) <= 2)) return true;
    return false;
  };

  let discardIdx = -1;
  const handTiles = currentPlayer.hand.filter((t): t is Tile => t !== null);
  const safeTiles = handTiles.filter(t => !isWildcard(t, gameState.okeyTile) && !isPlayableAnywhere(t, players, gameState.okeyTile));

  if (safeTiles.length > 0) {
    // Potansiyelsiz (yalnız) taşlar → en küçüğünü at
    const isolated = safeTiles.filter(t => !hasComboPotential(t, currentPlayer.hand));
    const pool = isolated.length > 0 ? isolated : safeTiles;
    const tileToDiscard = pool.reduce((min, t) => t.number < min.number ? t : min);
    discardIdx = currentPlayer.hand.findIndex(t => t?.id === tileToDiscard.id);
  } else {
    // Tüm taşlar potansiyelli veya wildcard — en küçük normal taşı at
    discardIdx = currentPlayer.hand.findIndex(t => t !== null && !isWildcard(t, gameState.okeyTile));
    if (discardIdx === -1) discardIdx = currentPlayer.hand.findIndex(t => t !== null);
  }

  // Atılacak taş bulunamadıysa (olağandışı durum) el boş sayılır
  if (discardIdx === -1) {
    players[gameState.currentPlayerIndex] = currentPlayer;
    return {
      players,
      deck,
      discardPile,
      logs: [...logs, `${currentPlayer.name} elinde atılacak taş kalmadı.`],
      phase: GamePhase.FINISHED,
      winnerId: currentPlayer.id,
    };
  }

  const discarded = currentPlayer.hand[discardIdx]!;
  currentPlayer.hand[discardIdx] = null;
  currentPlayer.lastDiscardedTile = discarded;
  discardPile.push(discarded);
  logs.push(`${currentPlayer.name} ${discarded.number} ${discarded.color} attı.`);

  const hasWon = currentPlayer.hand.every(t => t === null);

  if (!hasWon) {
    const penalty = calculateDiscardPenalty(discarded, { ...gameState, players }, currentPlayer);
    if (penalty.penalty > 0) {
      currentPlayer.score += penalty.penalty;
      if (penalty.reason) logs.push(penalty.reason);
    }
  }

  players[gameState.currentPlayerIndex] = currentPlayer;

  if (hasWon) {
    const isOkeyFinish = isWildcard(discarded, gameState.okeyTile);
    // Elden bitirme: AI bu turda ilk kez açıp aynı turda bitirdiyse
    const isHandFinish = currentPlayer.openedThisTurn === true;
    let winMsg = `${currentPlayer.name} oyunu bitirdi! (-101)`;
    if (isHandFinish && isOkeyFinish) winMsg = `${currentPlayer.name} ELDEN + OKEY ile bitirdi! (-404, ×4 ceza)`;
    else if (isHandFinish) winMsg = `${currentPlayer.name} ELDEN bitirdi! (-202, ×2 ceza)`;
    else if (isOkeyFinish) winMsg = `${currentPlayer.name} OKEY ile bitirdi! (-202, ×2 ceza)`;

    return {
      players,
      discardPile,
      logs: [...logs, winMsg],
      phase: GamePhase.FINISHED,
      winnerId: currentPlayer.id,
      hasHandFinish: isHandFinish,
    };
  }

  if (deck.length === 0) {
    const hasAnyOpened = players.some(p => p.hasOpened);
    return {
      players,
      deck,
      discardPile,
      logs: [...logs, hasAnyOpened ? "Deste tükendi! El tamamlandı." : "Deste tükendi! El kimse açamadan bitti."],
      phase: GamePhase.FINISHED,
      noOneOpened: !hasAnyOpened,
    };
  }

  return {
    players,
    deck,
    discardPile,
    logs,
    currentPlayerIndex: (gameState.currentPlayerIndex + 1) % 4,
    phase: GamePhase.PLAYING,
    currentOpenScore: Math.max(gameState.currentOpenScore, currentPlayer.hasOpened && currentPlayer.openedWithType === 'sets' ? currentPlayer.lastOpenScore : 0),
    currentOpenPairs: Math.max(gameState.currentOpenPairs, currentPlayer.hasOpened && currentPlayer.openedWithType === 'pairs' ? currentPlayer.lastOpenScore : 0),
    hasDoubleOpen: gameState.hasDoubleOpen || players.some(p => p.openedWithType === 'pairs' && p.hasOpened),
    hasOkeyDiscard: gameState.hasOkeyDiscard || isRealOkey(discarded, gameState.okeyTile),
  };
};

export interface FinalScores { [playerId: string]: number; }
export type FinishType = "normal" | "okey" | "elden" | "okeyElden";

/**
 * Bitiş türünü belirler:
 * - "normal"    : Klasik perlerle bitiş → kazanan -101, ceza ×1
 * - "okey"      : Son taşı Okey atarak bitiş → kazanan -202, ceza ×2
 * - "elden"     : Hiç yer açmadan tek seferde bitiş → kazanan -202, ceza ×2
 * - "okeyElden" : Hem elden hem okey atarak bitiş → kazanan -404, ceza ×4
 */
export const getFinishType = (
  gameState: GameState,
  finisherId: string | null,
  discardedTile: Tile | null
): FinishType => {
  if (!finisherId) return "normal";
  // hasHandFinish: oyuncu aynı turda hem el açıp hem bitirdiyse (elden bitirme)
  const isHandFinish = gameState.hasHandFinish;
  const isOkeyDiscard = discardedTile ? isWildcard(discardedTile, gameState.okeyTile) : false;
  if (isHandFinish && isOkeyDiscard) return "okeyElden";
  if (isHandFinish) return "elden";
  if (isOkeyDiscard) return "okey";
  return "normal";
};

export const calculateFinalScores = (gameState: GameState, finisherId: string | null, discardedTile: Tile | null): FinalScores => {
  const scores: FinalScores = {};
  const okeyTile = gameState.okeyTile;

  // Kimse açmadan el bitti → herkes 202 ceza alır, kazanan yok
  if (!finisherId && gameState.noOneOpened) {
    gameState.players.forEach(player => {
      scores[player.id] = 202 + (player.score > 0 ? player.score : 0);
    });
    return scores;
  }

  const finishType = getFinishType(gameState, finisherId, discardedTile);
  const winner = finisherId ? gameState.players.find(p => p.id === finisherId) : null;
  const winnerOpenedPairs = winner?.openedWithType === "pairs";

  // Kazananın aldığı puan
  let winnerScore = (() => {
    switch (finishType) {
      case "okeyElden": return -404;
      case "okey":
      case "elden":     return -202;
      default:          return -101;
    }
  })();
  if (winnerOpenedPairs) winnerScore *= 2;

  // Diğer oyuncular için genel ceza çarpanı (baskın bitiş türüne ve çift açmaya göre)
  let penaltyMultiplier = (() => {
    switch (finishType) {
      case "okeyElden": return 4;
      case "okey":
      case "elden":     return 2;
      default:          return 1;
    }
  })();
  if (winnerOpenedPairs) penaltyMultiplier *= 2;

  gameState.players.forEach(player => {
    if (player.id === finisherId) {
      scores[player.id] = winnerScore;
    } else {
      if (!player.hasOpened) {
        scores[player.id] = 202 * penaltyMultiplier;
      } else {
        let handTotal = calculateHandTotal(player.hand, okeyTile);
        const hasOkeyInHand = player.hand.some(t => t && isWildcard(t, okeyTile));
        if (hasOkeyInHand) handTotal += 101;
        // Çifte açıp bitamayan oyuncunun kendi cezası da 2'ye katlanır.
        const individualPairMultiplier = player.openedWithType === "pairs" ? 2 : 1;
        scores[player.id] = handTotal * penaltyMultiplier * individualPairMultiplier;
      }
      if (player.score > 0) scores[player.id] += player.score;
    }
  });
  return scores;
};

export const getScoreExplanation = (score: number, isWinner: boolean, hasOpened: boolean, finishType?: string): string => {
  if (isWinner) {
    switch (finishType) {
      case "okeyElden": return "Elden + Okey ile bitirdi! (×4 ceza)";
      case "okey":      return "Okey atarak bitirdi! (×2 ceza)";
      case "elden":     return "Elden bitirdi! (×2 ceza)";
      default:          return "Normal bitiş!";
    }
  }
  return hasOpened ? "Elindeki taşlar (ceza)" : "Açamadı (ceza)";
};
