import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

async function startServer() {
  const app = express();
  const server = createServer(app);
  const PORT = 3000;

  // WebSocket Server
  const wss = new WebSocketServer({ server });

  interface Player {
    ws: WebSocket;
    id: string;
    pokemon?: any;
    searching: boolean;
    opponentId?: string;
  }

  const players = new Map<string, Player>();
  const battles = new Map<string, { p1: string; p2: string; turn: string }>();

  wss.on("connection", (ws) => {
    const playerId = Math.random().toString(36).substring(7);
    players.set(playerId, { ws, id: playerId, searching: false });

    ws.send(JSON.stringify({ type: "INIT", playerId }));

    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case "SEARCH_MATCH":
          const player = players.get(playerId);
          if (player) {
            player.searching = true;
            player.pokemon = message.pokemon;
            
            // Matchmaking
            const opponent = Array.from(players.values()).find(
              (p) => p.searching && p.id !== playerId
            );

            if (opponent) {
              player.searching = false;
              opponent.searching = false;
              player.opponentId = opponent.id;
              opponent.opponentId = player.id;

              const battleId = `${player.id}-${opponent.id}`;
              battles.set(battleId, { p1: player.id, p2: opponent.id, turn: player.id });

              player.ws.send(JSON.stringify({ 
                type: "MATCH_FOUND", 
                opponent: opponent.pokemon, 
                battleId,
                isFirst: true 
              }));
              opponent.ws.send(JSON.stringify({ 
                type: "MATCH_FOUND", 
                opponent: player.pokemon, 
                battleId,
                isFirst: false 
              }));
            }
          }
          break;

        case "BATTLE_ACTION":
          const b = battles.get(message.battleId);
          if (b) {
            const opponentId = playerId === b.p1 ? b.p2 : b.p1;
            const opponent = players.get(opponentId);
            if (opponent) {
              opponent.ws.send(JSON.stringify({
                type: "OPPONENT_ACTION",
                action: message.action,
                move: message.move
              }));
            }
          }
          break;

        case "BATTLE_END":
          battles.delete(message.battleId);
          const p = players.get(playerId);
          if (p) p.opponentId = undefined;
          break;
      }
    });

    ws.on("close", () => {
      const player = players.get(playerId);
      if (player?.opponentId) {
        const opponent = players.get(player.opponentId);
        opponent?.ws.send(JSON.stringify({ type: "OPPONENT_DISCONNECTED" }));
      }
      players.delete(playerId);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
