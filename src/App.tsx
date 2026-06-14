/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { 
  Trophy, 
  Volume2, 
  VolumeX, 
  HelpCircle, 
  Smartphone, 
  Gamepad2, 
  Users, 
  UserPlus, 
  X, 
  Sparkles, 
  Play, 
  RotateCcw,
  ArrowRight,
  TrendingUp,
  Award
} from "lucide-react";
import { io, Socket } from "socket.io-client";

import { Color, Tile, Player, Combination, GameMode, GamePhase, GameState } from "./types";
import { useSound } from "./hooks/useSound";
import { useStats } from "./hooks/useStats";
import { Board, PairsBoard } from "./components/Board";
import { 
  DraggableDeck, 
  DroppableDiscard, 
  DraggableDiscard, 
  DisplayIndicator, 
  ReturnDiscardButton 
} from "./components/GameControls";
import { PlayerHand } from "./components/PlayerHand";
import { TileComponent } from "./components/TileComponent";

import {
  createDeck,
  shuffle,
  determineOkey,
  isRealOkey,
  isWildcard,
  getEffectiveTile,
  getTileScore,
  calculateDiscardPenalty,
  calculateSetScore,
  isValidGroup,
  isValidRun,
  findBestSets,
  findPairs,
  calculateHandTotal,
  sortByPairs,
  sortBySets,
  getContiguousPairs,
  getContiguousSets,
  calculatePenalty,
  canProcessTile,
  canSwapOkey,
  isPlayableAnywhere,
  checkWin,
  aiTakeTurn,
  calculateFinalScores,
  getScoreExplanation,
  FinishType,
  getFinishType
} from "./logic/okeyEngine";

export default function App() {
  const { sounds, enabled: soundEnabled, toggleSound } = useSound();
  const { stats, recordGame, resetStats, winRate } = useStats();

  const [darkMode, setDarkMode] = useState(true);
  const [selectedTiles, setSelectedTiles] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"game" | "rules" | "stats">("game");
  
  // Connection states
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [playerName, setPlayerName] = useState(() => {
    try { return localStorage.getItem("okey101_player_name") || "Oyuncu"; } catch { return "Oyuncu"; }
  });
  const [roomId, setRoomId] = useState("");
  const [connected, setConnected] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<{ socketId: string; name: string; isReady: boolean }[]>([]);
  const [mySeatIndex, setMySeatIndex] = useState(0); // 0 in offline, server decided in online

  // Socket instance
  const socketRef = useRef<Socket | null>(null);

  // Game state (will be shared in online, local in offline)
  const [gameState, setLocalGameState] = useState<GameState | null>(null);
  
  // Animation/dealing triggering key
  const [dealingKey, setDealingKey] = useState(0);

  // Bot play delay timer ref
  const botPlayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // DND Kit Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Save name helper
  const handleNameChange = (val: string) => {
    setPlayerName(val);
    try { localStorage.setItem("okey101_player_name", val); } catch {}
  };

  // Connect to websocket room lazily
  const connectSocket = () => {
    if (socketRef.current) return;
    const socketUrl = window.location.origin; // Same origin (Express server runs concurrently on port 3000)
    const socket = io(socketUrl, {
      reconnectionAttempts: 3,
      timeout: 5000,
    });
    
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
    });

    socket.on("roomCreated", (id: string) => {
      setRoomId(id);
    });

    socket.on("joinedRoom", (id: string) => {
      setRoomId(id);
    });

    socket.on("roomUpdated", (roomData: { id: string; players: { socketId: string; name: string; isReady: boolean }[] }) => {
      setLobbyPlayers(roomData.players);
    });

    socket.on("gameStarted", ({ state, mySeatIndex: seat }: { state: GameState; mySeatIndex: number }) => {
      setLocalGameState(state);
      setMySeatIndex(seat);
      setSelectedTiles([]);
      setDealingKey(prev => prev + 1);
      sounds.deal();
    });

    socket.on("gameStateUpdated", (state: GameState) => {
      setLocalGameState(state);
    });

    socket.on("connect_error", () => {
      setConnected(false);
      alert("Çevrimiçi sunucuya bağlanılamadı. Lütfen sunucunun aktif olduğundan emin olun veya Yerel Modu seçin.");
    });
  };

  const disconnectSocket = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setConnected(false);
    setRoomId("");
    setLobbyPlayers([]);
    setLocalGameState(null);
  };

  // Create room
  const handleCreateRoom = () => {
    connectSocket();
    if (socketRef.current) {
      socketRef.current.emit("createRoom", { playerName });
    }
  };

  // Join room
  const handleJoinRoom = () => {
    if (!roomId.trim()) return;
    connectSocket();
    if (socketRef.current) {
      socketRef.current.emit("joinRoom", { roomId: roomId.toUpperCase(), playerName });
    }
  };

  // Trigger game start on server
  const handleStartOnlineGame = () => {
    if (socketRef.current && roomId) {
      socketRef.current.emit("startGame", roomId);
    }
  };

  // Unified game state update dispatching (for both local bot play and human syncs)
  const updateGameState = useCallback((nextState: GameState) => {
    setLocalGameState(nextState);
    if (isMultiplayer && socketRef.current && roomId) {
      socketRef.current.emit("gameAction", {
        roomId,
        action: { type: "SYNC_STATE", newState: nextState }
      });
    }
  }, [isMultiplayer, roomId]);

  // INITIALIZE LOCAL/SINGLE Game offline
  const handleStartOfflineGame = (mode: GameMode = GameMode.STANDARD) => {
    disconnectSocket();
    setIsMultiplayer(false);
    
    const deck = shuffle(createDeck());
    let indicator = deck.pop()!;
    while (indicator.color === Color.JOKER) {
      deck.unshift(indicator);
      indicator = deck.pop()!;
    }
    const okeyTile = determineOkey(indicator);

    // Create Players
    const players: Player[] = [];
    const botPool = [
      "Ahmet (Bot)", "Ayşe (Bot)", "Mehmet (Bot)", "Can (Bot)", "Selin (Bot)", 
      "Burak (Bot)", "Ece (Bot)", "Zeynep (Bot)", "Murat (Bot)", "Deniz (Bot)", 
      "Boran (Bot)", "Derya (Bot)", "Kaan (Bot)", "Seda (Bot)", "Aslı (Bot)", 
      "Hakan (Bot)", "Elif (Bot)", "Cem (Bot)", "Yasemin (Bot)", "Onur (Bot)"
    ];
    const shuffledPool = shuffle(botPool);
    const botNames = [shuffledPool[0], shuffledPool[1], shuffledPool[2]];
    
    for (let i = 0; i < 4; i++) {
      const isAI = i !== 0;
      const name = isAI ? botNames[i - 1] : playerName;
      const tileCount = i === 0 ? 22 : 21;
      const hand = Array.from({ length: 30 }, (_, idx) => idx < tileCount ? deck.pop()! : null);

      players.push({
        id: isAI ? `bot-${i}` : "localhost",
        name,
        hand,
        openedSets: [],
        openedPairs: [],
        score: 0,
        isAI,
        hasOpened: false,
        openedWithType: null,
        openedWithPairs: false,
        lastOpenScore: 0,
        canUndoOpen: false,
        hasUndoneThisRound: false,
        currentTurnOpenedTileIds: [],
        openedThisTurn: false
      });
    }

    // Auto sort initial hand
    players.forEach(p => {
      p.hand = sortBySets(p.hand, okeyTile);
    });

    const initialGameState: GameState = {
      mode,
      players,
      currentPlayerIndex: 0,
      deck,
      discardPile: [],
      indicator,
      okeyTile,
      phase: GamePhase.DISCARDING, // Player 0 starts with 22 tiles, must discard
      lastOpeningScore: 0,
      lastOpeningPairs: 0,
      currentOpenScore: 0,
      currentOpenPairs: 0,
      winnerId: null,
      logs: ["Çevrimdışı oyun başladı! Gösterge: " + indicator.number + " " + indicator.color + ", Okey: " + okeyTile.number + " " + okeyTile.color],
      hasDoubleOpen: false,
      hasOkeyDiscard: false,
      hasContinuationDiscard: false,
      hasHandFinish: false,
      noOneOpened: false,
      roundNumber: 1,
      cumulativeScores: {}
    };

    setLocalGameState(initialGameState);
    setMySeatIndex(0);
    setSelectedTiles([]);
    setDealingKey(prev => prev + 1);
    sounds.deal();
  };

  // START NEXT ROUND (preserving cumulative scores/players but resetting round state)
  const handleStartNextRound = () => {
    if (!gameState) return;
    const nextRoundNumber = (gameState.roundNumber || 1) + 1;
    
    const deck = shuffle(createDeck());
    let indicator = deck.pop()!;
    while (indicator.color === Color.JOKER) {
      deck.unshift(indicator);
      indicator = deck.pop()!;
    }
    const okeyTile = determineOkey(indicator);

    // Keep same players but deal new hands & preserve cumulative scores (which is stored in p.score)
    const players = gameState.players.map((p, i) => {
      const tileCount = i === 0 ? 22 : 21;
      const hand = Array.from({ length: 30 }, (_, idx) => idx < tileCount ? deck.pop()! : null);
      const sortedHand = sortBySets(hand, okeyTile);
      return {
        ...p,
        hand: sortedHand,
        openedSets: [],
        openedPairs: [],
        hasOpened: false,
        openedWithType: null,
        openedWithPairs: false,
        lastOpenScore: 0,
        lastDiscardedTile: null,
        drawnFromDiscardTile: null,
        canUndoOpen: false,
        hasUndoneThisRound: false,
        currentTurnOpenedTileIds: [],
        openedThisTurn: false
      };
    });

    const initialGameState: GameState = {
      ...gameState,
      players,
      currentPlayerIndex: 0,
      deck,
      discardPile: [],
      indicator,
      okeyTile,
      phase: GamePhase.DISCARDING, // Player 0 starts with 22 tiles and must discard
      lastOpeningScore: 0,
      lastOpeningPairs: 0,
      currentOpenScore: 0,
      currentOpenPairs: 0,
      winnerId: null,
      logs: [
        ...gameState.logs, 
        `--- YENİ EL BAŞLADI (EL: ${nextRoundNumber}) ---`, 
        `Gösterge: ${indicator.number} ${indicator.color}, Okey: ${okeyTile.number} ${okeyTile.color}`
      ],
      hasDoubleOpen: false,
      hasOkeyDiscard: false,
      hasContinuationDiscard: false,
      hasHandFinish: false,
      noOneOpened: false,
      roundNumber: nextRoundNumber,
    };

    setLocalGameState(initialGameState);
    setMySeatIndex(0);
    setSelectedTiles([]);
    setDealingKey(prev => prev + 1);
    sounds.deal();
  };

  // LOCAL / OFFLINE Bot Turns Simulation loop
  useEffect(() => {
    if (!gameState || gameState.phase === GamePhase.FINISHED || isMultiplayer) return;

    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    if (activePlayer && activePlayer.isAI) {
      if (botPlayTimerRef.current) clearTimeout(botPlayTimerRef.current);
      botPlayTimerRef.current = setTimeout(() => {
        const nextStateDelta = aiTakeTurn(gameState);
        if (nextStateDelta) {
          const merged = { ...gameState, ...nextStateDelta } as GameState;
          
          // Sound triggered at delta changes
          if (nextStateDelta.phase === GamePhase.FINISHED) {
            const finisherId = merged.winnerId || null;
            const discardedTile = finisherId 
              ? (merged.players.find(p => p.id === finisherId)?.lastDiscardedTile || null) 
              : null;

            const finalScoresResult = calculateFinalScores(merged, finisherId, discardedTile);
            merged.players.forEach(p => {
               p.score = finalScoresResult[p.id];
            });

            sounds.win();
            // Record stats locally
            const userPlayer = merged.players.find(p => p.id === "localhost");
            const playerWon = merged.winnerId === "localhost";
            const userScore = userPlayer ? userPlayer.score : 202;
            recordGame(playerWon, userScore);
          } else if (nextStateDelta.discardPile && nextStateDelta.discardPile.length > gameState.discardPile.length) {
            sounds.discard();
          }

          updateGameState(merged);
        }
      }, 1500); // 1.5 seconds delay gives player a premium view to trace AI actions easily
    }

    return () => {
      if (botPlayTimerRef.current) clearTimeout(botPlayTimerRef.current);
    };
  }, [gameState, isMultiplayer, updateGameState, recordGame, sounds]);

  // Active user helper properties
  const isMyTurn = useMemo(() => {
    if (!gameState) return false;
    return gameState.currentPlayerIndex === mySeatIndex && gameState.phase !== GamePhase.FINISHED;
  }, [gameState, mySeatIndex]);

  const activePlayer = useMemo(() => {
    if (!gameState) return null;
    return gameState.players[mySeatIndex];
  }, [gameState, mySeatIndex]);

  const playableIds = useMemo(() => {
    const ids = new Set<string>();
    if (!gameState || !isMyTurn || gameState.phase !== GamePhase.DISCARDING) return ids;
    if (!activePlayer || !activePlayer.hasOpened) return ids;

    activePlayer.hand.forEach(t => {
      if (t && isPlayableAnywhere(t, gameState.players, gameState.okeyTile)) {
        ids.add(t.id);
      }
    });
    return ids;
  }, [gameState, isMyTurn, activePlayer]);

  // Turn snapshots to rollback opened tiles or processed tiles
  const saveTurnSnapshot = (state: GameState) => {
    if (state.turnSnapshot) return state; // Only save first snapshot of turn
    return {
      ...state,
      turnSnapshot: JSON.stringify({
        players: state.players,
        currentOpenScore: state.currentOpenScore,
        currentOpenPairs: state.currentOpenPairs
      })
    };
  };

  // HAND ACTIONS
  const handleTileSelectToggle = (tile: Tile) => {
    if (!isMyTurn) return;
    sounds.select();
    setSelectedTiles(prev => {
      const exists = prev.includes(tile.id);
      if (exists) return prev.filter(id => id !== tile.id);
      return [...prev, tile.id];
    });
  };

  // Reorder hands locally inside the slot rack
  const handleHandReorder = (newHand: (Tile | null)[]) => {
    if (!gameState || !activePlayer) return;
    const nextState = { ...gameState };
    nextState.players[mySeatIndex].hand = newHand;
    updateGameState(nextState);
  };

  // Sort Hand actions
  const handleSortSets = () => {
    if (!gameState || !activePlayer) return;
    sounds.sort();
    const sorted = sortBySets(activePlayer.hand, gameState.okeyTile, activePlayer.lastDrawnTileId);
    handleHandReorder(sorted);
  };

  const handleSortPairs = () => {
    if (!gameState || !activePlayer) return;
    sounds.sort();
    const sorted = sortByPairs(activePlayer.hand, gameState.okeyTile, activePlayer.lastDrawnTileId);
    handleHandReorder(sorted);
  };

  // Draw card from deck
  const handleDrawTile = () => {
    if (!isMyTurn || gameState?.phase !== GamePhase.PLAYING) return;
    const nextState = { ...gameState };
    const drawn = nextState.deck.pop();
    if (!drawn) {
      // Deck empty finished game
      nextState.phase = GamePhase.FINISHED;
      const hasAnyOpened = nextState.players.some(p => p.hasOpened);
      nextState.noOneOpened = !hasAnyOpened;
      nextState.logs.push(hasAnyOpened ? "Deste tükendi! El tamamlandı." : "Deste tükendi! El kimse açamadan bitti.");
      
      const finalScoresResult = calculateFinalScores(nextState, null, null);
      nextState.players.forEach(p => {
         p.score = finalScoresResult[p.id];
      });

      sounds.penalty();
      updateGameState(nextState);
      return;
    }
    
    // Put drawn card in hand's rightmost empty slot (end of non-set tiles at bottom-right)
    const hand = [...activePlayer!.hand];
    let emptyIndex = -1;
    for (let i = 29; i >= 0; i--) {
      if (hand[i] === null) {
        emptyIndex = i;
        break;
      }
    }
    if (emptyIndex !== -1) hand[emptyIndex] = drawn;
    else hand.push(drawn);

    nextState.players[mySeatIndex].hand = hand;
    nextState.players[mySeatIndex].lastDrawnTileId = drawn.id;
    nextState.phase = GamePhase.DISCARDING;
    nextState.logs.push(`${playerName} desteden kart çekti.`);
    sounds.draw();
    
    updateGameState(nextState);
  };

  // Take discard tile from table
  const handleTakeDiscard = () => {
     if (!isMyTurn || gameState?.phase !== GamePhase.PLAYING || gameState.discardPile.length === 0) return;
     const discardTile = gameState.discardPile[gameState.discardPile.length - 1];
     
     // 101 Rule constraints: taking discard card is ONLY allowed if player can open immediately this turn,
     // using this tile as part of their opening sets! Or if player already opened, they can take it if they immediately process it.
     const nextState = { ...gameState };
     nextState.discardPile.pop();

     const hand = [...activePlayer!.hand];
     let emptyIndex = -1;
     for (let i = 29; i >= 0; i--) {
       if (hand[i] === null) {
         emptyIndex = i;
         break;
       }
     }
     if (emptyIndex !== -1) hand[emptyIndex] = discardTile;
     else hand.push(discardTile);

     nextState.players[mySeatIndex].hand = hand;
     nextState.players[mySeatIndex].lastDrawnTileId = discardTile.id;
     nextState.phase = GamePhase.DISCARDING;
     nextState.players[mySeatIndex].drawnFromDiscardTile = discardTile;
     nextState.logs.push(`${playerName} yerdeki taşı aldı: ${discardTile.number} ${discardTile.color}`);
     sounds.drawDiscard();

     updateGameState(nextState);
  };

  // Discard tile to the table discard zone
  const handleDiscardTile = (tileId: string) => {
    if (!isMyTurn || gameState?.phase !== GamePhase.DISCARDING) return;
    const tileIndex = activePlayer!.hand.findIndex(t => t?.id === tileId);
    if (tileIndex === -1) return;

    const tile = activePlayer!.hand[tileIndex]!;
    
    // Check if player took discard this turn but wants to throw it directly — forbidden!
    if (activePlayer?.drawnFromDiscardTile?.id === tile.id) {
       alert("Yerden aldığınız taşı aynı turda doğrudan geri atamazsınız!");
       return;
    }

    // "oyuncu yerden taş alırsa elini açmak zorunda açmazsa geri bırakmalı." kuralı elini açmış olan oyuncu için uygulanmamalı.
    if (activePlayer?.drawnFromDiscardTile && !activePlayer?.openedThisTurn && !activePlayer?.hasOpened) {
       alert("Yerden taş aldığınız için elinizi açmak zorundasınız. Açamıyorsanız yerdeki taşı geri bırakıp desteden çekmelisiniz!");
       return;
    }

    // Check victory BEFORE applying discard penalty
    const tempHand = [...activePlayer!.hand];
    tempHand[tileIndex] = null;
    const hasWon = tempHand.every(t => t === null);

    const nextState = { ...gameState };
    const logs = [...nextState.logs];
    let updatedPlayerScore = activePlayer!.score;

    if (!hasWon) {
      const penaltyDetail = calculateDiscardPenalty(tile, nextState, activePlayer!);
      if (penaltyDetail.penalty > 0) {
        updatedPlayerScore += penaltyDetail.penalty;
        logs.push(penaltyDetail.reason!);
        sounds.penalty();
      } else {
        sounds.discard();
      }
    } else {
      sounds.discard();
    }

    // Perform discard
    nextState.players[mySeatIndex].hand[tileIndex] = null;
    nextState.players[mySeatIndex].score = updatedPlayerScore;
    nextState.players[mySeatIndex].lastDiscardedTile = tile;
    // Set hasHandFinish if they opened on the very same turn they won
    if (hasWon) {
        nextState.hasHandFinish = activePlayer!.openedThisTurn || false;
    }

    // Clear temporary markers
    nextState.players[mySeatIndex].drawnFromDiscardTile = null;
    nextState.players[mySeatIndex].lastDrawnTileId = null;
    nextState.players[mySeatIndex].currentTurnOpenedTileIds = [];
    nextState.players[mySeatIndex].openedThisTurn = false;
    nextState.players[mySeatIndex].canUndoOpen = false;

    nextState.discardPile.push(tile);
    nextState.logs = [...logs, `${playerName} masa ortasına taş attı: ${tile.number} ${tile.color}`];

    if (hasWon) {
       nextState.phase = GamePhase.FINISHED;
       nextState.winnerId = activePlayer!.id;
       const finalScoresResult = calculateFinalScores(nextState, activePlayer!.id, tile);
       
       nextState.players.forEach(p => {
          p.score = finalScoresResult[p.id];
       });

       const finishLabel = getFinishType(nextState, activePlayer!.id, tile);
       nextState.logs.push(`Tebrikler! ${playerName} eli kazandı! Bitiş Tipi: ${finishLabel.toUpperCase()}`);
       sounds.win();
       updateGameState(nextState);

       // record Stats locally
       recordGame(true, nextState.players[mySeatIndex].score);
       return;
    }

    // Move to next player turn or end game if deck is empty
    if (nextState.deck.length === 0) {
      nextState.phase = GamePhase.FINISHED;
      const hasAnyOpened = nextState.players.some(p => p.hasOpened);
      nextState.noOneOpened = !hasAnyOpened;
      nextState.logs.push(hasAnyOpened ? "Deste tükendi! El tamamlandı." : "Deste tükendi! El kimse açamadan bitti.");
      
      const finalScoresResult = calculateFinalScores(nextState, null, null);
      nextState.players.forEach(p => {
         p.score = finalScoresResult[p.id];
      });

      sounds.penalty();
    } else {
      nextState.currentPlayerIndex = (mySeatIndex + 1) % 4;
      nextState.phase = GamePhase.PLAYING;
    }
    nextState.turnSnapshot = null;

    updateGameState(nextState);
    setSelectedTiles([]);
  };

  // Open Hand Sets (Seri Açma)
  const handleOpenSets = () => {
    if (!isMyTurn || !activePlayer) return;
    
    let tilesToOpen: Tile[] = [];
    let isAutoAll = false;
    let sets: Combination[] = [];

    const minThreshold = activePlayer.hasOpened 
      ? 0 
      : (gameState!.mode === GameMode.FOLDING ? gameState!.currentOpenScore + 1 : 101);

    if (selectedTiles.length >= 3) {
      tilesToOpen = selectedTiles.map(id => activePlayer.hand.find(t => t?.id === id)!).filter(Boolean);
      sets = findBestSets(tilesToOpen, gameState!.okeyTile);
    } else {
      // Auto-open: check both contiguous sets and all best sets in hand
      const contiguous = getContiguousSets(activePlayer.hand, gameState!.okeyTile);
      const allTiles = activePlayer.hand.filter((t): t is Tile => t !== null);
      const algorithmicSets = findBestSets(allTiles, gameState!.okeyTile);
      
      const contiguousValue = contiguous.reduce((sum, s) => sum + s.score, 0);
      const algorithmicValue = algorithmicSets.reduce((sum, s) => sum + s.score, 0);
      
      // If the user has arranged some contiguous sets and they meet the threshold, respect their arrangement over algorithmic fallback.
      // This prevents separated tiles from being pulled back into sets against the user's will, but still allows auto-open if needed.
      if (contiguousValue >= minThreshold) {
        sets = contiguous;
      } else if (algorithmicValue >= minThreshold) {
        sets = algorithmicSets;
        isAutoAll = true;
      } else {
        sets = contiguous;
      }
    }

    const openValue = sets.reduce((sum, s) => sum + s.score, 0);

    if (sets.length === 0) {
      if (isAutoAll) {
        alert("Elinizde elinizi açacak geçerli seri veya grup (ör. Kırmızı 5-6-7 veya Üç adet 5’li) bulunmuyor.");
      } else {
        alert("Seçtiğiniz taşlar geçerli hiçbir Seri veya Grup (kırmızı 5, siyah 5, sarı 5 gibi) oluşturmuyor. Kuralları kontrol edin.");
      }
      sounds.penalty();
      return;
    }

    if (openValue < minThreshold) {
      if (isAutoAll) {
        alert(`Elinizdeki tüm geçerli perlerin toplamı (${openValue} sayı), açma barajını (${minThreshold}) geçmiyor!`);
      } else {
        alert(`Seçtiğiniz serilerin toplam puanı barajı geçmiyor! Gerekli Puan: ${minThreshold}, Sizin Seriniz: ${openValue}. (Not: Taş seçmeden doğrudan 'SERİ AÇ' butonuna tıklayarak elinizdeki tüm geçerli perleri otomatik açtırabilirsiniz!)`);
      }
      sounds.penalty();
      return;
    }

    let nextState = { ...gameState! };
    const usedTileIds = sets.flatMap(s => s.tiles.map(t => t.id));

    nextState = saveTurnSnapshot(nextState);

    const loggedPlayer = { ...nextState.players[mySeatIndex] };
    
    // Clear tiles from hand slots
    loggedPlayer.hand = loggedPlayer.hand.map(t => t && usedTileIds.includes(t.id) ? null : t);
    
    if (!loggedPlayer.hasOpened) {
       loggedPlayer.hasOpened = true;
       loggedPlayer.openedWithType = "sets";
       loggedPlayer.openedSets = sets;
       loggedPlayer.lastOpenScore = openValue;
    } else {
       loggedPlayer.openedSets = [...loggedPlayer.openedSets, ...sets];
       loggedPlayer.lastOpenScore += openValue;
    }

    loggedPlayer.openedThisTurn = true;
    loggedPlayer.currentTurnOpenedTileIds = [...loggedPlayer.currentTurnOpenedTileIds, ...usedTileIds];
    loggedPlayer.canUndoOpen = true;

    nextState.players[mySeatIndex] = loggedPlayer;
    nextState.logs.push(`${playerName} el açtı! Per Toplamı: ${openValue}`);
    sounds.open();

    updateGameState(nextState);
    setSelectedTiles([]);
  };

  // Open Hand Pairs (Çift Açma)
  const handleOpenPairs = () => {
    if (!isMyTurn || !activePlayer) return;
    
    let tilesToOpen: Tile[] = [];
    let isAutoAll = false;
    let pairs: Tile[][] = [];

    const doubleOpenedInGame = gameState!.players.some(p => p.hasOpened && p.openedWithType === "pairs") || gameState!.currentOpenPairs > 0;
    
    let minThreshold = 5;
    if (activePlayer.hasOpened) {
       if (activePlayer.openedWithType === "pairs") {
          minThreshold = 1;
       } else if (activePlayer.openedWithType === "sets" && doubleOpenedInGame) {
          minThreshold = 1;
       } else {
          minThreshold = 5;
       }
    } else {
       minThreshold = gameState!.mode === GameMode.FOLDING ? gameState!.currentOpenPairs + 1 : 5;
    }

    if (selectedTiles.length >= 2) {
      tilesToOpen = selectedTiles.map(id => activePlayer.hand.find(t => t?.id === id)!).filter(Boolean);
      pairs = findPairs(tilesToOpen, gameState!.okeyTile);
    } else {
      // Auto-open: check both contiguous pairs and all possible pairs in hand, select the larger/matching one
      const contiguous = getContiguousPairs(activePlayer.hand, gameState!.okeyTile);
      const allTiles = activePlayer.hand.filter((t): t is Tile => t !== null);
      const allHandPairs = findPairs(allTiles, gameState!.okeyTile);
      
      // If user has manually arranged pairs contiguously and it meets the threshold, respect their layout.
      if (contiguous.length >= minThreshold) {
        pairs = contiguous;
      } else if (allHandPairs.length >= minThreshold) {
        pairs = allHandPairs;
        isAutoAll = true;
      } else {
        pairs = contiguous;
      }
    }

    if (pairs.length === 0) {
      if (isAutoAll) {
        alert("Elinizde geçerli hiçbir çift bulunmuyor.");
      } else {
        alert("Seçtiğiniz taşlar geçerli çiftler (kırmızı 5, kırmızı 5 gibi) oluşturmuyor.");
      }
      sounds.penalty();
      return;
    }

    if (pairs.length < minThreshold) {
       if (isAutoAll) {
         alert(`Elinizdeki çiftlerin toplamı (${pairs.length} çift), barajı (${minThreshold} çift) geçmiyor.`);
       } else {
         alert(`Mevcut baraj için en az ${minThreshold} çift açmanız gerekli. Sizin çiftleriniz: ${pairs.length}. (Not: Taş seçmeden doğrudan 'ÇİFT AÇ' butonuna tıklayarak elinizdeki tüm geçerli çiftleri otomatik açtırabilirsiniz!)`);
       }
       sounds.penalty();
       return;
    }

    let nextState = { ...gameState! };
    const usedTileIds = pairs.flatMap(p => p.map(t => t.id));

    nextState = saveTurnSnapshot(nextState);

    const loggedPlayer = { ...nextState.players[mySeatIndex] };
    loggedPlayer.hand = loggedPlayer.hand.map(t => t && usedTileIds.includes(t.id) ? null : t);

    if (!loggedPlayer.hasOpened) {
       loggedPlayer.hasOpened = true;
       loggedPlayer.openedWithType = "pairs";
       loggedPlayer.openedPairs = pairs;
       loggedPlayer.lastOpenScore = pairs.length;
       loggedPlayer.openedWithPairs = true;
    } else {
       loggedPlayer.openedPairs = [...loggedPlayer.openedPairs, ...pairs];
       if (loggedPlayer.openedWithType === "pairs") {
          loggedPlayer.lastOpenScore += pairs.length;
       }
    }

    loggedPlayer.openedThisTurn = true;
    loggedPlayer.currentTurnOpenedTileIds = [...loggedPlayer.currentTurnOpenedTileIds, ...usedTileIds];
    loggedPlayer.canUndoOpen = true;

    nextState.players[mySeatIndex] = loggedPlayer;
    nextState.logs.push(`${playerName} ${pairs.length} çift ile elini çift açtı!`);
    sounds.open();

    updateGameState(nextState);
    setSelectedTiles([]);
  };

  // Rollback opened combinations back into the player's slots if they click undo
  const handleUndoOpen = () => {
     if (!isMyTurn || !gameState || !activePlayer || !activePlayer.canUndoOpen || !gameState.turnSnapshot) return;
     
     const snapshot = JSON.parse(gameState.turnSnapshot);
     const nextState = { ...gameState };

     // Revert players and table state to snapshot
     nextState.players = snapshot.players;
     nextState.currentOpenScore = snapshot.currentOpenScore;
     nextState.currentOpenPairs = snapshot.currentOpenPairs;

     nextState.players[mySeatIndex].canUndoOpen = false;
     nextState.players[mySeatIndex].openedThisTurn = false;
     nextState.players[mySeatIndex].currentTurnOpenedTileIds = [];
     nextState.turnSnapshot = null;

     nextState.logs.push(`${playerName} el açma/taş işleme girişimini geri aldı.`);
     sounds.sort();

     updateGameState(nextState);
     setSelectedTiles([]);
  };

  // Dropping a single tile to any meld on the table (aşılama / taş işleme & exchange okey)
  const handleProcessTile = (tile: Tile, targetPlayerId: string, setIdx: number, type: "set" | "pair", clickIdx?: number) => {
     if (!isMyTurn || !activePlayer || !activePlayer.hasOpened) {
       alert("Mevcut serilere taş işleyebilmek için önce kendi elinizi açmış olmanız gerekmektedir.");
       return;
     }

     let nextState = { ...gameState! };
     const targetPlayerIndex = nextState.players.findIndex(p => p.id === targetPlayerId);
     if (targetPlayerIndex === -1) return;

     const targetPlayer = nextState.players[targetPlayerIndex];
     const handIndex = activePlayer.hand.findIndex(t => t?.id === tile.id);
     
     if (handIndex === -1) return;

     nextState = saveTurnSnapshot(nextState);

     if (type === "set") {
       const set = targetPlayer.openedSets[setIdx];
       
       // Check standard tile addition
       if (canProcessTile(tile, set, nextState.okeyTile)) {
          set.tiles.push(tile);
          
          // Re-sort runs/groups correctly with fixed unshift-push logic
          if (set.type === "run") {
            const addedTile = set.tiles.pop()!;
            const normalIdx = set.tiles.findIndex(t => !isWildcard(t, nextState.okeyTile));
            if (normalIdx !== -1) {
              const anchorNum = getEffectiveTile(set.tiles[normalIdx], nextState.okeyTile).number;
              const startNum = anchorNum - normalIdx;
              if (isWildcard(addedTile, nextState.okeyTile)) {
                let preferLeft = startNum > 1; // default check
                if (clickIdx !== undefined && set.tiles.length > 0) {
                    const isLeftHalf = clickIdx < set.tiles.length / 2;
                    if (isLeftHalf && startNum > 1) {
                         preferLeft = true;
                    } else if (!isLeftHalf && (startNum + set.tiles.length - 1) < 13) {
                         preferLeft = false;
                    } else if (startNum === 1) {
                         preferLeft = false; // 1'in altına gidemez
                    }
                }
                
                if (preferLeft) {
                  set.tiles.unshift(addedTile);
                } else {
                  set.tiles.push(addedTile);
                }
              } else {
                const effectiveTile = getEffectiveTile(addedTile, nextState.okeyTile);
                if (effectiveTile.number === startNum - 1) {
                  set.tiles.unshift(addedTile);
                } else {
                  set.tiles.push(addedTile);
                }
              }
            } else {
              set.tiles.push(addedTile);
            }
          } else {
             const colorOrder = [Color.RED, Color.YELLOW, Color.BLACK, Color.BLUE, Color.JOKER];
             set.tiles.sort((a, b) => {
               if (isWildcard(a, nextState.okeyTile)) return 1;
               if (isWildcard(b, nextState.okeyTile)) return -1;
               return colorOrder.indexOf(a.color) - colorOrder.indexOf(b.color);
             });
          }

          nextState.players[mySeatIndex].hand[handIndex] = null;
          nextState.players[mySeatIndex].openedThisTurn = true;
          nextState.logs.push(`${playerName}, ${targetPlayer.name} adlı oyuncunun serisine taş işledi: ${tile.number} ${tile.color}`);
          sounds.process();
          
          updateGameState(nextState);
          setSelectedTiles([]);
          return;
       }

       // Check swapping okey tile
       if (canSwapOkey(tile, set, nextState.okeyTile)) {
          let okeyIndex = set.tiles.findIndex(t => isWildcard(t, nextState.okeyTile));
          if (set.type === "run") {
              const normalIdx = set.tiles.findIndex(t => !isWildcard(t, nextState.okeyTile));
              if (normalIdx !== -1) {
                  const anchorNum = getEffectiveTile(set.tiles[normalIdx], nextState.okeyTile).number;
                  const targetNum = getEffectiveTile(tile, nextState.okeyTile).number;
                  const idx = set.tiles.findIndex((t, i) => isWildcard(t, nextState.okeyTile) && (anchorNum + (i - normalIdx) === targetNum));
                  if (idx !== -1) okeyIndex = idx;
              }
          }
          const actualOkeyTile = set.tiles[okeyIndex];
          
          set.tiles[okeyIndex] = tile;
          nextState.players[mySeatIndex].hand[handIndex] = actualOkeyTile; // Real Okey given back to our hand slots!
          nextState.players[mySeatIndex].openedThisTurn = true;
          nextState.logs.push(`${playerName}, yerdeki okeyi alıp kendi taşını yerleştirdi.`);
          sounds.process();

          updateGameState(nextState);
          setSelectedTiles([]);
          return;
       }

     } else if (type === "pair") {
       // Pairs swap checks
       const pair = targetPlayer.openedPairs[setIdx];
       const hasOkeyInPair = pair.some(t => isWildcard(t, nextState.okeyTile));
       
       if (hasOkeyInPair) {
          const normalTile = pair.find(t => !isWildcard(t, nextState.okeyTile))!;
          const effReal = getEffectiveTile(normalTile, nextState.okeyTile);
          const effInput = getEffectiveTile(tile, nextState.okeyTile);

          if (effReal.number === effInput.number && effReal.color === effInput.color) {
             const okeyIdx = pair.findIndex(t => isWildcard(t, nextState.okeyTile));
             const actualOkeyTile = pair[okeyIdx];
             
             pair[okeyIdx] = tile;
             nextState.players[mySeatIndex].hand[handIndex] = actualOkeyTile;
             nextState.players[mySeatIndex].openedThisTurn = true;
             nextState.logs.push(`${playerName}, yerdeki çiftten okeyi alıp kendi taşını yerleştirdi.`);
             sounds.process();

             updateGameState(nextState);
             setSelectedTiles([]);
             return;
          }
       }
     }

     alert("Eşleşmeyen taş! Seçilen taş bu pere işlenemez ve okey değişimi sağlanamaz.");
     sounds.penalty();
  };

  // DND Kit Event handlers
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !gameState) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // 1) Deck drag logic
    if (activeId === "deck-draggable" && overId.startsWith("drop-hand-")) {
      handleDrawTile();
      return;
    }

    // 2) Discard drag logic
    if (activeId === "discard-draggable" && overId.startsWith("drop-hand-")) {
      handleTakeDiscard();
      return;
    }

    // 3) Drag from Hand to Discard Pile
    if (overId === "discard-zone" && activeId.startsWith("tile-")) {
      const tileId = activeId;
      handleDiscardTile(tileId);
      return;
    }

    // 4) Drag Hand card into table opened sets
    if (overId.startsWith("drop-set-") && activeId.startsWith("tile-")) {
      const tileId = activeId;
      const tile = activePlayer?.hand.find(t => t?.id === tileId);
      if (!tile) return;

      const parts = overId.split("-"); // "drop", "set", playerId, type, setIdx
      const targetPlayerId = parts[2];
      const type = parts[3] as "set" | "pair";
      const setIdx = parseInt(parts[4]);

      handleProcessTile(tile, targetPlayerId, setIdx, type);
    }
  };

  // Helper check on clicks for opened sets (hand click trigger support)
  const handleSetClick = (targetPlayerId: string, setIdx: number, type: "set" | "pair", tileIdx?: number) => {
    if (!isMyTurn || selectedTiles.length !== 1 || !activePlayer || !activePlayer.hasOpened) return;
    const tile = activePlayer.hand.find(t => t?.id === selectedTiles[0]);
    if (!tile) return;
    handleProcessTile(tile, targetPlayerId, setIdx, type, tileIdx);
  };

  return (
    <div className={`min-h-screen relative overflow-hidden flex flex-col font-sans transition-colors duration-300 ${darkMode ? "bg-[#0F172A] text-slate-100 dark" : "bg-[#F8FAFC] text-slate-900"}`}>
      {/* Background Geometric Accents */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-100px] left-[-100px] w-[400px] h-[400px] border border-slate-400 dark:border-slate-700 rounded-full"></div>
        <div className="absolute bottom-[-150px] right-[-150px] w-[500px] h-[500px] border border-slate-400 dark:border-slate-700 rounded-full"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-slate-300 dark:border-slate-850"></div>
      </div>

      {/* HEADER BAR */}
      <header className="px-6 py-4 bg-slate-950/40 backdrop-blur-md text-slate-100 border-b border-slate-800/80 flex items-center justify-between shadow-md shrink-0 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-sky-500 rounded-sm rotate-45 flex items-center justify-center shrink-0 shadow-md">
            <div className="w-4 h-4 bg-white rounded-sm -rotate-45"></div>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight uppercase flex items-center gap-1.5 leading-none text-slate-100">
              Nexus 101 Okey <span className="text-sky-400 font-mono text-[9px]">// STABLE</span>
            </h1>
            <p className="text-[9px] text-slate-400 uppercase tracking-widest font-black mt-1">
              Yapay Zekâ ve Çok Oyunculu
            </p>
          </div>
        </div>

        {/* Global Toolbar */}
        <div className="flex items-center gap-2">
          {/* Sound Toggle */}
          <button 
            onClick={toggleSound}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-100 transition-colors"
            title={soundEnabled ? "Sesi Kapat" : "Sesi Aç"}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-rose-400" />}
          </button>

          {/* Theme Toggle */}
          <button 
            onClick={() => setDarkMode(prev => !prev)}
            className="p-1 px-2.5 rounded-sm border border-slate-800 bg-slate-900/60 text-[10px] text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors font-bold uppercase transition-all duration-200"
          >
            {darkMode ? "AÇIK TEMA" : "KOYU TEMA"}
          </button>

          {/* Tabs */}
          <div className="flex bg-slate-900/80 p-0.5 rounded-sm border border-slate-850">
            <button 
              onClick={() => setActiveTab("game")}
              className={`p-1.5 px-3 rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all ${activeTab === 'game' ? 'bg-sky-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              OYUN
            </button>
            <button 
              onClick={() => setActiveTab("rules")}
              className={`p-1.5 px-3 rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all ${activeTab === 'rules' ? 'bg-sky-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              KURALLAR
            </button>
            <button 
              onClick={() => setActiveTab("stats")}
              className={`p-1.5 px-3 rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all ${activeTab === 'stats' ? 'bg-sky-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              İSTATİSTİK
            </button>
          </div>
        </div>
      </header>

      {/* VIEW CONDITIONAL LOGIC */}
      <main className="flex-1 flex overflow-hidden relative z-10">
        {activeTab === "game" && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            
            {/* LOBBY / MENU SETUP SCREEN */}
            {!gameState && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto gap-6 animate-fade-in relative z-20">
                <div className="flex flex-col gap-2">
                  <div className="w-16 h-16 bg-gradient-to-tr from-slate-900/60 to-sky-500/40 border border-sky-500/45 rounded-sm rotate-45 mx-auto flex items-center justify-center text-sky-400 scale-100 mb-4 shadow-xl shadow-sky-500/10">
                    <Gamepad2 className="w-7 h-7 -rotate-45" />
                  </div>
                  <h2 className="text-xl font-black text-slate-200 uppercase tracking-tight font-sans">101 Okey // Nexus OS</h2>
                  <p className="text-xs text-slate-400 max-w-sm font-mono tracking-wide leading-relaxed">
                    Modunuzu seçin: İster akıllı yapay zekaya karşı yerel çevrimdışı oynayın, ister arkadaşlarınızla multiplayer lobi oluşturun!
                  </p>
                </div>

                {/* Name Input */}
                <div className="w-full text-left flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono font-bold text-sky-400 uppercase tracking-widest">
                    00 // PROFİL ADINIZ
                  </label>
                  <input 
                    type="text" 
                    value={playerName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-sm font-mono font-bold text-xs uppercase tracking-wide focus:outline-none focus:ring-1 focus:ring-sky-500 text-slate-200 focus:border-sky-500 transition-all cursor-text"
                    placeholder="Adınızı girin"
                  />
                </div>

                {/* Game Modes */}
                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Single Player Cards */}
                  <div className="p-5 bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-sm flex flex-col text-left justify-between gap-5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 border-r border-t border-slate-800 rounded-full opacity-10 -mr-12 -mt-12"></div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5 font-mono">
                        <span className="text-[10px] font-bold uppercase text-sky-450 tracking-wider">01 // STANDART</span>
                        <Smartphone className="w-3.5 h-3.5 text-sky-400 opacity-80" />
                      </div>
                      <h3 className="font-bold text-sm uppercase tracking-tight text-white">Katlamasız Oyna</h3>
                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                        Klasik 101 Okey kuralları ile 3 akıllı bota karşı internetsiz pratik yapın.
                      </p>
                    </div>
                    <button 
                      onClick={() => handleStartOfflineGame(GameMode.STANDARD)}
                      className="w-full py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-sm font-mono font-black text-[10px] tracking-wider transition-all flex items-center justify-center gap-1 active:scale-95 duration-150 shadow-md cursor-pointer uppercase"
                    >
                      TEKLİ BAŞLAT <Play className="w-3 h-3 fill-slate-950" />
                    </button>
                  </div>

                  <div className="p-5 bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-sm flex flex-col text-left justify-between gap-5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 border-r border-t border-slate-800 rounded-full opacity-10 -mr-12 -mt-12"></div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5 font-mono">
                        <span className="text-[10px] font-bold uppercase text-indigo-400 tracking-wider">02 // KATLAMALI</span>
                        <TrendingUp className="w-3.5 h-3.5 text-indigo-400 opacity-80" />
                      </div>
                      <h3 className="font-bold text-sm uppercase tracking-tight text-white">Katlamalı Oyna</h3>
                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                        Açılan her el barajı yükseltir! Hamlelerinizde ceza yememeye ekstra özen gösterin.
                      </p>
                    </div>
                    <button 
                      onClick={() => handleStartOfflineGame(GameMode.FOLDING)}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-sm font-mono font-black text-[10px] tracking-wider transition-all flex items-center justify-center gap-1 active:scale-95 duration-150 shadow-md cursor-pointer uppercase"
                    >
                      TEKLİ BAŞLAT <Play className="w-3 h-3 fill-white" />
                    </button>
                  </div>

                </div>

                <div className="w-full h-px bg-slate-800/80 my-1" />

                {/* Multiplayer Options Section */}
                <div className="w-full flex flex-col gap-4 text-left p-5 bg-slate-900/20 backdrop-blur-md border border-slate-800 rounded-sm">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-sky-400" />
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-sky-400">03 // ÇOK OYUNCULU SİSTEM</span>
                  </div>

                  {!roomId ? (
                    <div className="flex flex-col gap-3">
                      <button 
                        onClick={() => {
                          setIsMultiplayer(true);
                          handleCreateRoom();
                        }}
                        className="w-full py-2.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 font-mono font-bold text-[10px] tracking-wider rounded-sm flex items-center justify-center gap-1.5 transition-all active:scale-95 duration-150 cursor-pointer uppercase"
                      >
                        YENİ REZERVASYON OLUŞTUR <UserPlus className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex gap-2 items-center">
                        <input 
                          type="text" 
                          value={roomId}
                          onChange={(e) => setRoomId(e.target.value.slice(0,6))}
                          placeholder="LOBİ PORT KODU"
                          className="flex-1 px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-sm font-mono font-bold text-center focus:outline-none focus:ring-1 focus:ring-sky-550 text-xs uppercase text-slate-200 tracking-widest"
                        />
                        <button 
                          onClick={() => {
                            setIsMultiplayer(true);
                            handleJoinRoom();
                          }}
                          disabled={!roomId.trim()}
                          className="py-2.5 px-5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-mono font-semibold text-[10px] tracking-widest rounded-sm border border-transparent disabled:opacity-30 uppercase transition-all duration-150 cursor-pointer"
                        >
                          BAĞLAN
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="p-3 bg-slate-950/60 border border-slate-850 rounded-sm flex items-center justify-between">
                        <div>
                          <p className="text-[8px] text-slate-500 uppercase tracking-widest font-mono font-bold">LOBİ KODU // IP ADDR</p>
                          <h4 className="text-base font-mono font-black text-sky-400 tracking-wider select-all">{roomId}</h4>
                        </div>
                        <button 
                          onClick={disconnectSocket}
                          className="p-1.5 text-slate-500 hover:text-rose-400 border border-transparent hover:border-slate-800 rounded-sm transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[8px] text-sky-450 uppercase tracking-wider font-mono font-bold">BAĞLI AKTİF SÜRÜCÜLER // ({lobbyPlayers.length}/4)</p>
                        <div className="space-y-1">
                          {lobbyPlayers.map((p, idx) => (
                            <div key={p.socketId} className="p-1.5 px-3 bg-slate-900/60 rounded-sm flex items-center justify-between text-xs font-mono font-semibold border border-slate-850">
                              <span className="text-slate-300">{p.name} <span className="opacity-40">// CLIENT</span></span>
                              <span className="text-[9px] text-sky-400 font-bold bg-sky-950/30 px-1.5 py-0.5 rounded-sm border border-sky-900/30">ONLINE</span>
                            </div>
                          ))}
                        </div>
                        {lobbyPlayers.length < 4 && (
                          <p className="text-[8px] font-mono text-slate-500 italic mt-1.5 leading-normal">
                            * 4 terminal tamamlandığında oda başlatılabilir. Eksik oturumlar bot sürücüleri ile otomatik senkronize edilecektir.
                          </p>
                        )}
                      </div>

                      <button 
                        onClick={handleStartOnlineGame}
                        className="w-full py-2.5 bg-sky-500 text-slate-950 font-mono font-semibold text-[10px] tracking-widest rounded-sm hover:bg-sky-400 transition-all flex items-center justify-center gap-1 active:scale-95 mt-2 uppercase shadow-md cursor-pointer"
                      >
                        SİMÜLASYONU BAŞLAT <ArrowRight className="w-3.5 h-3.5 animate-pulse" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ACTIVE GAMEBOARD */}
            {gameState && (
              <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
                <div className="flex-1 flex flex-col p-3 gap-3 overflow-y-auto">
                  
                  {/* CENTER FELT BOARD */}
                  <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 min-h-[300px]">
                    
                    {/* Left: Seri Board */}
                    <div className="lg:col-span-2 flex flex-col gap-2 h-full">
                      <Board gameState={gameState} onSetClick={handleSetClick} />
                    </div>

                    {/* Right: Çift Board & Deck / Discard Centers */}
                    <div className="flex flex-col gap-3 justify-between h-full bg-slate-900/10 backdrop-blur-md rounded-sm p-3 border border-slate-800">
                      
                      {/* PairsBoard inside right */}
                      <PairsBoard gameState={gameState} onSetClick={handleSetClick} />

                      {/* Redesigned 4-Slot Table Control System (Yerden Al, Deste, Gösterge, Benim Attığım) */}
                      <div className="bg-[#131b2e]/60 p-3 rounded-sm border border-slate-800 mt-2 shrink-0">
                        <div className="text-[8px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-2 border-b border-slate-850 pb-1 flex justify-between items-center">
                          <span>MASA KANALLARI</span>
                          {isMyTurn && (
                            <span className="text-sky-400 animate-pulse font-bold">
                              {gameState.phase === GamePhase.PLAYING ? "ADIM 1 // TAŞ ALIN" : "ADIM 2 // TAŞ ATIN"}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-4 gap-2 items-center justify-center">
                          {/* 1. Yerden Al */}
                          <div className="flex flex-col items-center gap-1.5 min-w-0">
                            <span className="text-[8px] font-mono font-bold text-slate-400 uppercase tracking-tighter truncate w-full text-center">
                              YERDEN AL
                            </span>
                            {(() => {
                              const lastDiscard = gameState.discardPile.length > 0 
                                ? gameState.discardPile[gameState.discardPile.length - 1] 
                                : null;
                              const canDrawDiscard = isMyTurn && gameState.phase === GamePhase.PLAYING && lastDiscard;

                              return lastDiscard ? (
                                <div className="relative w-12 h-16 flex items-center justify-center">
                                  <TileComponent 
                                    tile={lastDiscard} 
                                    size="lg" 
                                    onClick={canDrawDiscard ? handleTakeDiscard : undefined}
                                  />
                                  {canDrawDiscard && (
                                    <>
                                      <div className="absolute inset-0 rounded-md ring-2 ring-sky-400 animate-pulse pointer-events-none" />
                                      <div className="absolute -top-1.5 -right-1.5 bg-sky-500 text-slate-950 font-black text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center shadow-md border border-slate-950 pointer-events-none">
                                        +
                                      </div>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <div className="w-12 h-16 rounded-md border border-slate-800 bg-slate-950/40 flex items-center justify-center cursor-default">
                                  <span className="text-[9px] font-mono font-bold text-slate-700">YOK</span>
                                </div>
                              );
                            })()}
                          </div>

                          {/* 2. Desteden Çek */}
                          <div className="flex flex-col items-center gap-1.5 min-w-0">
                            <span className="text-[8px] font-mono font-bold text-slate-400 uppercase tracking-tighter truncate w-full text-center">
                              DESTE ÇEK
                            </span>
                            {(() => {
                              const canDrawDeck = isMyTurn && gameState.phase === GamePhase.PLAYING && gameState.deck.length > 0;

                              return gameState.deck.length > 0 ? (
                                <button
                                  type="button"
                                  onClick={handleDrawTile}
                                  disabled={!canDrawDeck}
                                  className={`w-12 h-16 rounded-md border-2 transition-all flex flex-col items-center justify-center relative select-none ${
                                    canDrawDeck
                                      ? "border-emerald-500 bg-emerald-950/40 hover:bg-emerald-900/40 hover:scale-105 cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.4)] ring-2 ring-emerald-400/20 active:scale-95 animate-pulse"
                                      : "border-slate-800 bg-slate-950/50 cursor-default opacity-85"
                                  }`}
                                  title={canDrawDeck ? "Desteden taş çekmek için tıklayın" : "Sıra sizde değil veya deste boş"}
                                >
                                  <span className="text-[14px] font-mono font-black text-slate-100">
                                    {gameState.deck.length}
                                  </span>
                                  <span className="text-[6px] font-mono text-slate-400 font-bold uppercase tracking-tight leading-none mt-1">
                                    DESTE
                                  </span>
                                  {canDrawDeck && (
                                    <>
                                      <div className="absolute inset-0 rounded-md ring-2 ring-emerald-500 animate-pulse pointer-events-none" />
                                      <div className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-slate-950 font-black text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center shadow-md border border-slate-950">
                                        ↓
                                      </div>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <div className="w-12 h-16 rounded-md border border-slate-800 bg-slate-950/40 flex items-center justify-center cursor-default">
                                  <span className="text-[9px] font-mono font-bold text-slate-700">BOŞ</span>
                                </div>
                              );
                            })()}
                          </div>

                          {/* 3. Gösterge */}
                          <div className="flex flex-col items-center gap-1.5 min-w-0">
                            <span className="text-[8px] font-mono font-bold text-slate-400 uppercase tracking-tighter truncate w-full text-center">
                              GÖSTERGE
                            </span>
                            <div className="w-12 h-16 flex items-center justify-center cursor-default">
                              {gameState.indicator ? (
                                <TileComponent tile={gameState.indicator} size="lg" />
                              ) : (
                                <div className="w-12 h-16 rounded-md border border-slate-800 bg-slate-950/20 flex items-center justify-center">
                                  <span className="text-[9px] font-mono font-bold text-slate-700">YOK</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 4. Taş At */}
                          <div className="flex flex-col items-center gap-1.5 min-w-0">
                            <span className="text-[8px] font-mono font-bold text-slate-400 uppercase tracking-tighter truncate w-full text-center">
                              TAŞ AT
                            </span>
                            {(() => {
                              const canDiscardToSlot = isMyTurn && gameState.phase === GamePhase.DISCARDING && selectedTiles.length === 1;
                              const selectedTileObj = canDiscardToSlot 
                                ? activePlayer?.hand.find(t => t?.id === selectedTiles[0])
                                : null;
                              const myLastDiscard = activePlayer?.lastDiscardedTile;

                              return (
                                <div className="relative w-12 h-16 flex items-center justify-center">
                                  {selectedTileObj ? (
                                    <button
                                      type="button"
                                      onClick={() => handleDiscardTile(selectedTiles[0])}
                                      className="relative w-full h-full transition-all hover:scale-105 active:scale-95 cursor-pointer"
                                      title="Seçili tek taşı yere atmak için tıklayın"
                                    >
                                      <TileComponent tile={selectedTileObj} size="lg" />
                                      <div className="absolute inset-0 rounded-md ring-2 ring-rose-500 animate-pulse pointer-events-none" />
                                      <div className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white font-black text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center shadow-md border border-slate-950">
                                        ✓
                                      </div>
                                    </button>
                                  ) : myLastDiscard ? (
                                    <TileComponent tile={myLastDiscard} size="lg" />
                                  ) : (
                                    <div className="w-12 h-16 rounded-md border border-slate-800 bg-slate-950/40 flex items-center justify-center cursor-default">
                                      <span className="text-[10px] font-mono font-bold text-slate-700">AT</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Optional Discard Return Button */}
                        {isMyTurn && activePlayer?.drawnFromDiscardTile && (
                          <div className="mt-2.5 flex justify-center">
                            <button
                              type="button"
                              onClick={() => {
                                 const nextState = { ...gameState };
                                 const addedIdx = nextState.players[mySeatIndex].hand.findIndex(t => t?.id === activePlayer.drawnFromDiscardTile?.id);
                                 if (addedIdx !== -1) nextState.players[mySeatIndex].hand[addedIdx] = null;
                                 nextState.discardPile.push(activePlayer.drawnFromDiscardTile);
                                 nextState.players[mySeatIndex].drawnFromDiscardTile = null;
                                 nextState.phase = GamePhase.PLAYING;
                                 nextState.logs.push(`${playerName} aldığı taşı yere geri bıraktı.`);
                                 sounds.sort();
                                 updateGameState(nextState);
                              }}
                              className="px-3 py-1 bg-amber-600/90 text-amber-50 hover:bg-amber-500 rounded-sm font-black text-[8px] tracking-wider uppercase flex items-center gap-1 shadow-md transition-all active:scale-95 border border-amber-500/30 font-mono"
                            >
                              ← TAŞI GERİ BIRAK
                            </button>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>

                  {/* TOP OPPONENTS BOX */}
                  <div className="grid grid-cols-3 gap-2">
                    {gameState.players
                      .map((p, index) => ({ p, index }))
                      .filter(({ p, index }) => index !== mySeatIndex)
                      .map(({ p, index }) => {
                        const scoreSum = p.score;
                        const isPlayersTurn = gameState.currentPlayerIndex === index;
                        return (
                          <div 
                            key={p.id} 
                            className={`p-2.5 rounded-sm border flex items-center justify-between transition-all ${
                              isPlayersTurn 
                                ? "bg-slate-900/80 border-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.15)] ring-1 ring-sky-400/20" 
                                : "bg-slate-900/30 border-slate-800/80"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 bg-slate-950 border border-slate-800 rounded-sm rotate-45 flex items-center justify-center shrink-0">
                                <span className="-rotate-45 text-xs font-mono font-black text-sky-400">{p.name[0].toUpperCase()}</span>
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-[10px] font-bold uppercase truncate text-slate-200 flex items-center gap-1">
                                  <span>{p.name}</span>
                                  {p.hasOpened && (
                                    <span className="text-sky-455 font-bold font-mono normal-case text-[9px] bg-sky-950/20 px-1 py-0.5 rounded border border-sky-900/10">
                                      {p.openedWithType === "pairs" ? `${p.lastOpenScore} Çift` : p.lastOpenScore}
                                    </span>
                                  )}
                                </h4>
                                <p className={`text-[8px] font-mono font-bold uppercase tracking-wider ${isPlayersTurn ? "text-sky-400" : "text-slate-500"}`}>
                                  {gameState.currentPlayerIndex === index ? "AKTİF // RUN" : "IDLE // HALT"}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 font-mono">
                              {/* Last discarded tile indicator instead of remaining hand count */}
                              <div className="flex flex-col items-center">
                                <span className="text-[6px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-1">SON ATILAN</span>
                                {p.lastDiscardedTile ? (
                                  <div className="ring-1 ring-slate-800 rounded">
                                    <TileComponent tile={p.lastDiscardedTile} size="xs" />
                                  </div>
                                ) : (
                                  <div className="w-6 h-8 rounded border border-slate-800/50 flex items-center justify-center bg-slate-950/25">
                                    <span className="text-[7px] font-mono text-slate-750 font-bold">YOK</span>
                                  </div>
                                )}
                              </div>
                              {/* Penalties indicator */}
                              <div className="flex flex-col items-end border-l border-slate-850 pl-2">
                                <span className="text-[7px] text-slate-500 font-bold uppercase tracking-wider">CEZA</span>
                                <span className="text-xs font-bold text-rose-450">
                                  {scoreSum}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* ACTIVE PLAYER HAND PANEL */}
                  <PlayerHand 
                    player={activePlayer!} 
                    okeyTile={gameState.okeyTile}
                    selectedTiles={selectedTiles}
                    onTileClick={handleTileSelectToggle}
                    isCurrentPlayer={isMyTurn}
                    onHandReorder={handleHandReorder}
                    onSortSets={handleSortSets}
                    onSortPairs={handleSortPairs}
                    onOpenSets={handleOpenSets}
                    onOpenPairs={handleOpenPairs}
                    onUndoOpen={handleUndoOpen}
                    openedSets={activePlayer!.openedSets}
                    dealingKey={dealingKey}
                    phase={gameState.phase}
                    onDiscardTile={handleDiscardTile}
                    highlightedIds={playableIds}
                    doubleOpenedInGame={gameState.players.some(p => p.hasOpened && p.openedWithType === "pairs") || gameState.currentOpenPairs > 0}
                  />

                </div>

                {/* GAME SIDEBAR CONSOLE / INFORMATION PANELS */}
                <div className="w-full md:w-80 bg-slate-950/40 border-t md:border-t-0 md:border-l border-slate-800/80 flex flex-col overflow-hidden shrink-0">
                  
                  {/* Tab bar inside sidebar */}
                  <div className="p-3 bg-slate-950 border-b border-slate-850 flex items-center justify-between shrink-0 font-mono">
                    <span className="text-[9px] uppercase font-bold tracking-widest text-slate-450 flex items-center gap-1.5 font-mono">
                      <Sparkles className="w-3.5 h-3.5 text-sky-400 animate-pulse" /> TELEMETRİ LOGS
                    </span>
                    <button 
                      onClick={() => handleStartOfflineGame(gameState.mode)}
                      className="p-1 px-2.5 text-[8px] bg-rose-500/10 hover:bg-rose-550/20 text-rose-400 border border-rose-950/30 rounded-sm font-bold uppercase transition-all"
                    >
                      RESET
                    </button>
                  </div>

                  {/* Cumulative scoreboard */}
                  <div className="p-3 bg-slate-950/20 border-b border-slate-850 font-mono text-[9px]">
                    <div className="flex justify-between items-center text-slate-500 pb-1 mb-1 border-b border-slate-850 tracking-widest">
                      <span>CLIENT</span>
                      <span>KÜMÜLATİF SKOR</span>
                    </div>
                    {gameState.players.map(p => (
                      <div key={p.id} className="flex justify-between items-center py-0.5">
                        <span className={p.id === activePlayer?.id ? "text-sky-400 font-bold" : "text-slate-400"}>
                          {p.name}
                          {p.hasOpened && (
                            <span className="text-sky-455 ml-1.5 font-bold font-mono">
                              {p.openedWithType === "pairs" ? `(${p.lastOpenScore} Çift)` : `(${p.lastOpenScore})`}
                            </span>
                          )}
                        </span>
                        <span className="font-bold text-slate-200">
                          {p.score}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Logs area */}
                  <div className="h-64 md:h-[450px] overflow-y-auto p-3 font-mono text-[9px] leading-relaxed flex flex-col gap-1 text-slate-400 custom-scrollbar shrink-0 border-t border-slate-900 bg-slate-950/60">
                    {gameState.logs.map((log, i) => (
                      <div 
                        key={i} 
                        className={`p-1 border-b border-slate-850/40 font-mono ${
                          log.includes("açtı") ? "text-sky-400 bg-sky-950/10" :
                          log.includes("ceza") ? "text-rose-400 bg-rose-950/10" :
                          log.includes("kazandı") ? "text-indigo-400 font-bold bg-indigo-950/20" : ""
                        }`}
                      >
                        {log}
                      </div>
                    ))}
                    {/* Auto scroll bottom block */}
                    <div className="scroll-hook" ref={el => el?.scrollIntoView({ behavior: 'smooth' })} />
                  </div>

                  {/* Mode / Phase footer */}
                  <div className="p-3 bg-slate-950 border-t border-slate-850 flex items-center justify-between text-[8px] font-mono font-bold text-slate-500 uppercase tracking-widest shrink-0">
                    <span>IP // {gameState.mode.toUpperCase()}</span>
                    <span>ACTIVE_SEAT // {gameState.players[gameState.currentPlayerIndex].name}</span>
                  </div>

                </div>
              </DndContext>
            )}
          </div>
        )}

        {/* CUMULATIVE TOURNAMENT SCOREBOARD MODAL OVERLAY */}
        {gameState && gameState.phase === GamePhase.FINISHED && (
          <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fade-in font-mono">
            <div className="bg-[#0f172a] border border-slate-800 w-full max-w-2xl rounded-sm shadow-2xl p-6 flex flex-col gap-5 relative z-50">
              
              {/* Header */}
              <div className="flex flex-col items-center text-center gap-2 border-b border-slate-800 pb-4">
                <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-sm rotate-45 flex items-center justify-center text-amber-400 mb-1">
                  <Trophy className="w-6 h-6 -rotate-45" />
                </div>
                <h2 className="text-base font-black text-[#F1F5F9] uppercase tracking-widest">// MAÇ SONUÇ SKORBORDU</h2>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">
                  MOD: {gameState.mode.toUpperCase()} // EL: {gameState.roundNumber || 1}
                </p>
              </div>

              {/* End Cause Notice */}
              <div className="p-3.5 bg-slate-950/80 border border-slate-900 rounded-sm text-center">
                {gameState.noOneOpened ? (
                  <p className="text-xs text-rose-400 font-bold uppercase tracking-wider font-mono">
                    ⚠️ DESTE TÜKENDİ! HİÇ KİMSE ELİNİ AÇAMADIĞI İÇİN HERKESE +202 CEZA PUANI VERİLDİ.
                  </p>
                ) : (
                  (() => {
                    const winner = gameState.players.find(p => p.id === gameState.winnerId);
                    const discardedTile = gameState.winnerId 
                      ? (gameState.players.find(p => p.id === gameState.winnerId)?.lastDiscardedTile || null) 
                      : null;
                    const finishType = getFinishType(gameState, gameState.winnerId, discardedTile);
                    const finishLabel = (() => {
                      switch (finishType) {
                        case "okeyElden": return "ELDEN + OKEY ATARAK (×4 CEZA)";
                        case "okey":      return "OKEY ATARAK (×2 CEZA)";
                        case "elden":     return "ELDEN BİTİREREK (×2 CEZA)";
                        default:          return "NORMAL EL BİTİRİŞİ";
                      }
                    })();
                    return (
                      <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider font-mono">
                        🎉 TEBRİKLER! {winner ? winner.name : "OYUNCU"} {finishLabel} MAÇI KAZANDI!
                      </p>
                    );
                  })()
                )}
              </div>

              {/* Player Scores List */}
              <div className="flex flex-col gap-2.5">
                <div className="flex text-[9px] uppercase tracking-wider text-slate-500 font-bold px-3 pb-1.5 border-b border-slate-900 justify-between">
                  <span>OYUNCU VE DURUM</span>
                  <span>CEZA BREAKDOWN</span>
                </div>
                {gameState.players.map((p) => {
                  const isWinner = p.id === gameState.winnerId;
                  const isUser = p.id === "localhost";
                  
                  // Compute round penalty exactly matching calculations
                  let roundPenalty = 0;
                  if (gameState.noOneOpened) {
                    roundPenalty = 202;
                  } else if (isWinner) {
                    const discardedTile = p.lastDiscardedTile || null;
                    const finishType = getFinishType(gameState, p.id, discardedTile);
                    switch (finishType) {
                      case "okeyElden": roundPenalty = -404; break;
                      case "okey":
                      case "elden":     roundPenalty = -202; break;
                      default:          roundPenalty = -101;
                    }
                  } else {
                    const discardedTile = gameState.winnerId 
                      ? (gameState.players.find(p => p.id === gameState.winnerId)?.lastDiscardedTile || null) 
                      : null;
                    const finishType = getFinishType(gameState, gameState.winnerId, discardedTile);
                    const penaltyMultiplier = (() => {
                      switch (finishType) {
                        case "okeyElden": return 4;
                        case "okey":
                        case "elden":     return 2;
                        default:          return 1;
                      }
                    })();
                    if (!p.hasOpened) {
                      roundPenalty = 202 * penaltyMultiplier;
                    } else {
                      let handTotal = calculateHandTotal(p.hand, gameState.okeyTile);
                      if (p.hand.some(t => t && isWildcard(t, gameState.okeyTile))) handTotal += 101;
                      roundPenalty = handTotal * penaltyMultiplier;
                    }
                  }

                  const previousScore = Math.max(0, p.score - roundPenalty);

                  return (
                    <div 
                      key={p.id} 
                      className={`p-3 rounded-sm border flex items-center justify-between transition-all ${
                        isWinner 
                          ? "bg-emerald-950/20 border-emerald-800/60 shadow-[0_0_15px_rgba(16,185,129,0.06)]"
                          : "bg-slate-900/40 border-slate-800/80"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-sm rotate-45 flex items-center justify-center font-bold text-xs shrink-0 ${
                          isWinner ? "bg-emerald-500/10 text-emerald-400 border border-emerald-800/30" : "bg-slate-950 text-slate-450 border border-slate-850"
                        }`}>
                          <span className="-rotate-45">{p.name[0].toUpperCase()}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-slate-100 flex items-center gap-1.5 leading-normal uppercase">
                            <span>{p.name}</span>
                            {isUser && <span className="text-[7.5px] font-mono leading-none bg-sky-950 text-sky-400 border border-sky-850 px-1 py-0.5 rounded">SİZ</span>}
                            {p.isAI && <span className="text-[7.5px] font-mono leading-none bg-slate-950 text-slate-500 border border-slate-850 px-1 py-0.5 rounded">BOT</span>}
                          </span>
                          <span className="text-[9px] text-slate-450 uppercase tracking-wide leading-none mt-1">
                            {isWinner ? (
                              <span className="text-emerald-400 font-bold">KAZANDI</span>
                            ) : p.hasOpened ? (
                              <span>AÇTI: <span className="text-sky-450 font-bold">{p.openedWithType === "pairs" ? `${p.lastOpenScore} Çift` : `${p.lastOpenScore} Puan`}</span></span>
                            ) : (
                              <span className="text-rose-400">AÇAMADI / SIRADA</span>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        <div className="flex flex-col text-[8.5px] text-slate-500 leading-normal font-mono font-semibold">
                          <span>ÖNCEKİ CEZA: <span className="text-slate-350">{previousScore}pb</span></span>
                          <span>BU EL: <span className={roundPenalty < 0 ? "text-emerald-400 font-bold" : roundPenalty > 100 ? "text-rose-455 font-bold" : "text-slate-350"}>
                            {roundPenalty >= 0 ? `+${roundPenalty}` : roundPenalty}pb
                          </span></span>
                        </div>
                        <div className="border-l border-slate-850 pl-3.5 flex flex-col items-center">
                          <span className="text-[6.5px] text-slate-500 font-bold uppercase tracking-wider font-mono">TOPLAM</span>
                          <span className="text-sm font-black text-slate-100">{p.score}pb</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer Controls */}
              <div className="grid grid-cols-2 gap-3 mt-2 border-t border-slate-800 pt-5">
                <button
                  type="button"
                  onClick={() => handleStartOfflineGame(gameState.mode)}
                  className="flex items-center justify-center gap-2 py-3 bg-slate-900 border border-slate-850 text-slate-300 hover:bg-slate-800 active:scale-95 transition-all text-[10px] font-bold uppercase rounded-sm cursor-pointer hover:text-rose-400"
                >
                  <RotateCcw className="w-4 h-4" /> KÜMÜLATİF SIFIRLA
                </button>
                <button
                  type="button"
                  onClick={handleStartNextRound}
                  className="flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-sky-500 to-sky-600 text-slate-950 font-black text-[10px] uppercase tracking-wider hover:from-sky-400 hover:to-sky-500 active:scale-95 transition-all rounded-sm shadow-md cursor-pointer shadow-sky-500/10"
                >
                  YENİ EL BAŞLAT <Play className="w-4 h-4 fill-slate-950" />
                </button>
              </div>

            </div>
          </div>
        )}

        {/* RULES VIEW */}
        {activeTab === "rules" && (
          <div className="flex-1 p-6 overflow-y-auto max-w-4xl mx-auto flex flex-col gap-4 animate-fade-in custom-scrollbar">
            <h2 className="text-sm font-black uppercase tracking-wider text-sky-400 font-mono">// 101 OKEY KURAL KATMANLARI VE TACTICAL REZERVLER</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-sm flex flex-col gap-2">
                <h3 className="font-bold text-sm text-slate-200 flex items-center gap-1.5 uppercase font-mono">
                  <Award className="w-4 h-4 text-sky-400" /> EL AÇMA SİSTEMLERİ
                </h3>
                <ul className="text-xs text-slate-400 list-disc list-inside space-y-1.5 leading-relaxed">
                  <li><strong>Seri Açma:</strong> Elinizdeki seri ve grupların sayısal değerlerinin per toplamı en az <strong>101 puan</strong> olmalıdır.</li>
                  <li><strong>Çift Açma:</strong> En az <strong>5 çift</strong> bularak elinizi çift açabilirsiniz. Rakiplerin el çarpanı 2 kat yükseltilir!</li>
                  <li>Kendi elinizi açmadan, başkasının masaya açtığı setlere taş <strong>işleyemezsiniz</strong> veya yerdeki okeyleri <strong>alamazsınız</strong>.</li>
                </ul>
              </div>

              <div className="p-5 bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-sm flex flex-col gap-2">
                <h3 className="font-bold text-sm text-slate-200 flex items-center gap-1.5 uppercase font-mono">
                  <X className="w-4 h-4 text-rose-455" /> CEZALANDIRMA ( +101 PUAN )
                </h3>
                <ul className="text-xs text-slate-400 list-disc list-inside space-y-1.5 leading-relaxed">
                  <li><strong>İşlek Taş Cezası:</strong> Yerdeki açılmış perlere eklenebilecek (işleyen veya okey'yi kurtarabilecek) bir taşı yerdeki discard piline atarsanız anında <strong>+101 ceza puanı</strong> verilir!</li>
                  <li><strong>Okey Atma Cezası:</strong> Yere okey taşı atmak kesinlikle yasaktır ve size doğrudan <strong>+101 ceza</strong> yazdırır.</li>
                </ul>
              </div>
            </div>

            <div className="p-5 bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-sm flex flex-col gap-2">
               <h3 className="font-bold text-sm text-slate-200 uppercase font-mono tracking-wide text-sky-400">// Gelişmiş Taktik Sözlüğü & Puanlama Hesaplayıcı</h3>
               <p className="text-xs text-slate-400 leading-relaxed">
                 <strong>Sahte Okey (Joker):</strong> Gerçek okeyin yerine geçer. Elde kaldığında, yerine geçtiği taşın (Okey'in) sayısal değeri kadar ceza puanı yazılır (101 değil, okey neyi temsil ediyor ise örneğin 5 ise 5 ceza!).
               </p>
               <p className="text-xs text-slate-400 leading-relaxed">
                 <strong>Bitiş Puanları:</strong> Oyunu bitiren oyuncu her el sonunda <strong>-101</strong> puan alır. Elden bitirme <strong>-202</strong>, Okey atarak bitirme <strong>-202</strong> (Elden + Okey ise <strong>-404</strong>) puan kazandırır! Açamayan rakipler net 202 ceza puanı yer.
               </p>
            </div>
          </div>
        )}

        {/* STATS VIEW */}
        {activeTab === "stats" && (
          <div className="flex-1 p-6 overflow-y-auto max-w-lg mx-auto flex flex-col gap-6 text-center justify-center animate-fade-in custom-scrollbar relative z-10">
            <div className="w-12 h-12 bg-sky-500/15 border border-sky-500/30 rounded-sm rotate-45 flex items-center justify-center text-sky-400 mx-auto mb-2">
              <Trophy className="w-5 h-5 -rotate-45" />
            </div>
            
            <div className="flex flex-col gap-1.5 font-mono">
              <h2 className="text-lg font-bold uppercase tracking-widest text-[#F1F5F9]">KARİYER TELEMETRİSİ</h2>
              <p className="text-[10px] text-slate-450 max-w-sm mx-auto uppercase">Mevcut tarayıcıda simüle edilmiş tüm yerel maçların kümülatif analitiği.</p>
            </div>

            <div className="grid grid-cols-2 gap-3.5 font-mono">
              <div className="p-4 bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-sm">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">TOPLAM SİMÜLASYON</p>
                <h3 className="text-xl font-bold text-[#F1F5F9] mt-1">{stats.totalGames}</h3>
              </div>
              <div className="p-4 bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-sm">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">GALİBİYET ORANI</p>
                <h3 className="text-xl font-bold text-sky-400 mt-1">{winRate}%</h3>
              </div>
              <div className="p-4 bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-sm">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">KAZANILAN OYUNLAR</p>
                <h3 className="text-xl font-bold text-indigo-400 mt-1">{stats.wins}</h3>
              </div>
              <div className="p-4 bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-sm">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">EN İYİ CEZA SKORU</p>
                <h3 className="text-xl font-bold text-sky-400 mt-1">{stats.bestScore !== null ? stats.bestScore : "-"}</h3>
              </div>
            </div>

            <button 
              onClick={() => {
                if (confirm("Tüm okey kariyer istatistikleriniz sıfırlanacaktır. Emin misiniz?")) {
                  resetStats();
                }
              }}
              className="py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-450 border border-rose-500/20 text-xs rounded-xl font-black uppercase transition-all"
            >
              İSTATİSTİKLERİ SIFIRLA
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
