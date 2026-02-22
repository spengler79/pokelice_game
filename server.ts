import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import path from "path";

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
    vote?: "BATTLE" | "STRENGTHEN";
    tournamentStage: number;
  }

  const players = new Map<string, Player>();
  const battles = new Map<string, { p1: string; p2: string; turn: string }>();

  wss.on("connection", (ws) => {
    const playerId = Math.random().toString(36).substring(7);
    players.set(playerId, { ws, id: playerId, searching: false, tournamentStage: 0 });

    ws.send(JSON.stringify({ type: "INIT", playerId }));

    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case "SEARCH_MATCH":
          const player = players.get(playerId);
          if (player) {
            player.searching = true;
            player.pokemon = message.pokemon;
            player.tournamentStage = 1;
            player.vote = undefined;
            
            // Matchmaking
            const opponent = Array.from(players.values()).find(
              (p) => p.searching && p.id !== playerId
            );

            if (opponent) {
              player.searching = false;
              opponent.searching = false;
              player.opponentId = opponent.id;
              opponent.opponentId = player.id;

              player.ws.send(JSON.stringify({ 
                type: "TOURNAMENT_START", 
                opponentName: opponent.pokemon.trainer.name,
                stage: 1
              }));
              opponent.ws.send(JSON.stringify({ 
                type: "TOURNAMENT_START", 
                opponentName: player.pokemon.trainer.name,
                stage: 1
              }));
            }
          }
          break;

        case "TOURNAMENT_VOTE": {
          const pVote = players.get(playerId);
          if (pVote && pVote.opponentId) {
            pVote.vote = message.vote;
            const opp = players.get(pVote.opponentId);
            
            if (opp && opp.vote) {
              // Both voted
              if (pVote.vote === "BATTLE" && opp.vote === "BATTLE") {
                // PvP Battle
                const battleId = `${pVote.id}-${opp.id}`;
                battles.set(battleId, { p1: pVote.id, p2: opp.id, turn: pVote.id });
                
                pVote.ws.send(JSON.stringify({ 
                  type: "MATCH_FOUND", 
                  opponent: opp.pokemon, 
                  battleId,
                  isFirst: true 
                }));
                opp.ws.send(JSON.stringify({ 
                  type: "MATCH_FOUND", 
                  opponent: pVote.pokemon, 
                  battleId,
                  isFirst: false 
                }));
              } else {
                // Continue Tournament (NPC Battle)
                pVote.tournamentStage++;
                opp.tournamentStage++;
                pVote.vote = undefined;
                opp.vote = undefined;
                
                pVote.ws.send(JSON.stringify({ type: "NEXT_STAGE", stage: pVote.tournamentStage }));
                opp.ws.send(JSON.stringify({ type: "NEXT_STAGE", stage: opp.tournamentStage }));
              }
            } else {
              // Wait for opponent
              pVote.ws.send(JSON.stringify({ type: "VOTE_RECEIVED" }));
              opp?.ws.send(JSON.stringify({ type: "OPPONENT_VOTED" }));
            }
          }
          break;
        }

        case "BATTLE_ACTION": {
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
        }

        case "BATTLE_END": {
          battles.delete(message.battleId);
          const pEnd = players.get(playerId);
          if (pEnd) pEnd.opponentId = undefined;
          break;
        }
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
    app.get("*", (req, res) => {
      res.sendFile(path.resolve("dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
