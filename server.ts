import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';

import { GameState, GameMode, GamePhase, Player, Tile } from './src/types';
import { createDeck, shuffle, determineOkey, sortBySets } from './src/logic/okeyEngine';

async function startServer() {
  const app = express();
  app.use(cors());

  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  interface Room {
    id: string;
    players: { socketId: string; name: string; isReady: boolean }[];
    gameState: GameState | null;
  }

  const rooms: Record<string, Room> = {};

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('createRoom', ({ playerName }) => {
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      rooms[roomId] = {
        id: roomId,
        players: [{ socketId: socket.id, name: playerName, isReady: true }],
        gameState: null
      };
      socket.join(roomId);
      socket.emit('roomCreated', roomId);
      io.to(roomId).emit('roomUpdated', rooms[roomId]);
    });

    socket.on('joinRoom', ({ roomId, playerName }) => {
      const room = rooms[roomId];
      if (room && room.players.length < 4) {
        room.players.push({ socketId: socket.id, name: playerName, isReady: true });
        socket.join(roomId);
        socket.emit('joinedRoom', roomId);
        io.to(roomId).emit('roomUpdated', room);
      } else {
        socket.emit('error', 'Oda dolu veya bulunamadı.');
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      for (const roomId in rooms) {
        const room = rooms[roomId];
        const pIdx = room.players.findIndex(p => p.socketId === socket.id);
        if (pIdx !== -1) {
          room.players.splice(pIdx, 1);
          io.to(roomId).emit('roomUpdated', room);
          if (room.players.length === 0) {
            delete rooms[roomId];
          }
        }
      }
    });

    // Basic game start
    socket.on('startGame', (roomId) => {
      const room = rooms[roomId];
      console.log(`[startGame] roomId=${roomId}, players in room:`, room?.players.map(p => `${p.name}(${p.socketId})`));
      if (room && room.players.length > 0) {
        
        const deck = shuffle(createDeck());
        const indicator = deck.pop()!;
        const okeyTile = determineOkey(indicator);

        // Create Players
        const gamePlayers: Player[] = [];
        for (let i = 0; i < 4; i++) {
          const realPlayer = room.players[i];
          const isAI = !realPlayer;
          const name = realPlayer ? realPlayer.name : `Bot ${i}`;
          const id = realPlayer ? realPlayer.socketId : `bot-${i}`;
          
          const tileCount = i === 0 ? 22 : 21;
          const hand = Array.from({ length: 30 }, (_, idx) => idx < tileCount ? deck.pop()! : null);
          
          gamePlayers.push({
            id,
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

        // Sort hands
        gamePlayers.forEach(p => {
          p.hand = sortBySets(p.hand, okeyTile);
        });

        room.gameState = {
          mode: GameMode.STANDARD,
          players: gamePlayers,
          currentPlayerIndex: 0,
          deck,
          discardPile: [],
          indicator,
          okeyTile,
          phase: GamePhase.DISCARDING, // Player 0 has 22 tiles, must discard one — same as offline mode
          lastOpeningScore: 0,
          lastOpeningPairs: 0,
          currentOpenScore: 0,
          currentOpenPairs: 0,
          winnerId: null,
          logs: ["Oyun başladı! Okey: " + okeyTile.number + " " + okeyTile.color],
          hasDoubleOpen: false,
          hasOkeyDiscard: false,
          hasContinuationDiscard: false,
          hasHandFinish: false,
          noOneOpened: false,
          roundNumber: 1,
          cumulativeScores: {}
        };

        // Send each real player their personal seat index alongside the game state
        room.players.forEach((p, seatIndex) => {
          io.to(p.socketId).emit('gameStarted', { state: room.gameState, mySeatIndex: seatIndex });
        });
      }
    });

    // Action dispatcher
    socket.on('gameAction', ({ roomId, action }) => {
      const room = rooms[roomId];
      if (!room || !room.gameState) return;
      
      if (action.type === 'SYNC_STATE') {
        room.gameState = action.newState;
        socket.to(roomId).emit("gameStateUpdated", room.gameState); // Broadcast to OTHERS in the room
      }
    });
  });

  const PORT = 3000;

  // Mount APIs first
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', playersConnected: io.engine.clientsCount });
  });

  // Vite Integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
