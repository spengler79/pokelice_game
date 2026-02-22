/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sword, 
  Shield, 
  Zap, 
  Heart, 
  Trophy, 
  Dumbbell, 
  ChevronRight, 
  Sparkles,
  RotateCcw,
  Gamepad2,
  Circle,
  Users,
  Globe
} from 'lucide-react';
import { PokemonType, UserPokemon, Stats, GamePhase, Move } from './types';
import { POKEMON_DATA, WILD_POKEMON, FINAL_BOSS } from './constants';

const XP_PER_LEVEL = 100;

export default function App() {
  const [phase, setPhase] = useState<GamePhase>('START');
  const [party, setParty] = useState<UserPokemon[]>([]);
  const [activePokemonIndex, setActivePokemonIndex] = useState(0);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [enemy, setEnemy] = useState<any>(null);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [evolutionPending, setEvolutionPending] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [onlineBattleId, setOnlineBattleId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [playerAnim, setPlayerAnim] = useState<'idle' | 'attack' | 'hit'>('idle');
  const [enemyAnim, setEnemyAnim] = useState<'idle' | 'attack' | 'hit'>('idle');
  const [battleFlash, setBattleFlash] = useState(false);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "MATCH_FOUND":
          setEnemy(msg.opponent);
          setOnlineBattleId(msg.battleId);
          setIsPlayerTurn(msg.isFirst);
          setPhase('ONLINE_BATTLE');
          setIsSearching(false);
          setBattleLog(['Online match found!']);
          break;
        case "OPPONENT_ACTION":
          if (msg.action === "ATTACK") {
            handleOpponentAttack(msg.move);
          }
          break;
        case "OPPONENT_DISCONNECTED":
          setBattleLog(prev => [...prev, "Opponent disconnected. You win!"]);
          setTimeout(() => setPhase('HUB'), 2000);
          break;
      }
    };

    setSocket(ws);
    return () => ws.close();
  }, []);

  const handleOpponentAttack = (move: Move) => {
    setEnemyAnim('attack');
    setTimeout(() => setEnemyAnim('idle'), 300);

    setTimeout(() => {
      setPlayerAnim('hit');
      setBattleFlash(true);
      setTimeout(() => {
        setPlayerAnim('idle');
        setBattleFlash(false);
      }, 300);

      setParty(prev => {
        const newParty = [...prev];
        const p = newParty[activePokemonIndex];
        const damage = Math.max(5, Math.floor(((enemy.attack * (move.power / 100)) * 0.5) - (p.currentStats.defense * 0.2)));
        const newHp = Math.max(0, p.currentStats.hp - damage);
        
        newParty[activePokemonIndex] = {
          ...p,
          currentStats: { ...p.currentStats, hp: newHp }
        };
        
        setBattleLog(prevLog => [...prevLog, `Opponent's ${enemy.name} used ${move.name}! Dealt ${damage} damage.`]);
        
        if (newHp <= 0) {
          handleLoss();
        } else {
          setIsPlayerTurn(true);
        }
        
        return newParty;
      });
    }, 300);
  };

  const startOnlineSearch = () => {
    if (!pokemon || pokemon.currentStats.hp <= 0 || isRecovering) return;
    setIsSearching(true);
    socket?.send(JSON.stringify({ 
      type: "SEARCH_MATCH", 
      pokemon: {
        name: pokemon.name,
        sprite: pokemon.sprite,
        attack: pokemon.currentStats.attack,
        defense: pokemon.currentStats.defense,
        maxHp: pokemon.currentStats.maxHp,
        hp: pokemon.currentStats.hp,
        moves: pokemon.moves,
        level: pokemon.level
      } 
    }));
  };

  const handleOnlineAttack = (move: Move) => {
    if (!isPlayerTurn || !onlineBattleId) return;

    setPlayerAnim('attack');
    setTimeout(() => setPlayerAnim('idle'), 300);

    setTimeout(() => {
      setEnemyAnim('hit');
      setBattleFlash(true);
      setTimeout(() => {
        setEnemyAnim('idle');
        setBattleFlash(false);
      }, 300);

      const damage = Math.max(5, Math.floor(((pokemon.currentStats.attack * (move.power / 100)) * 0.5) - (enemy.defense * 0.2)));
      const newEnemyHp = Math.max(0, enemy.hp - damage);
      
      setEnemy({ ...enemy, hp: newEnemyHp });
      setBattleLog(prev => [...prev, `${pokemon.name} used ${move.name}! Dealt ${damage} damage.`]);

      socket?.send(JSON.stringify({
        type: "BATTLE_ACTION",
        battleId: onlineBattleId,
        action: "ATTACK",
        move
      }));

      if (newEnemyHp <= 0) {
        handleWin();
        socket?.send(JSON.stringify({ type: "BATTLE_END", battleId: onlineBattleId }));
        return;
      }

      setIsPlayerTurn(false);
    }, 300);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setCurrentTime(now);
      
      setParty(prev => {
        let changed = false;
        const newParty = prev.map(p => {
          if (p.recoveryEndTime && now >= p.recoveryEndTime) {
            changed = true;
            return {
              ...p,
              recoveryEndTime: undefined,
              currentStats: { ...p.currentStats, hp: p.currentStats.maxHp }
            };
          }
          return p;
        });
        return changed ? newParty : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const pokemon = party[activePokemonIndex] || null;
  const isRecovering = pokemon?.recoveryEndTime !== undefined;

  // Initialize Starter
  const selectStarter = (id: number) => {
    const base = POKEMON_DATA[id];
    const starter: UserPokemon = {
      ...base,
      level: 5,
      experience: 0,
      experienceToNextLevel: XP_PER_LEVEL,
      currentStats: { ...base.baseStats },
      trainingPoints: 0,
      wins: 0,
      totalWins: 0,
    };
    setParty([starter]);
    setPhase('HUB');
  };

  // Training Logic
  const trainStat = (stat: keyof Stats) => {
    if (!pokemon || pokemon.trainingPoints <= 0) return;

    setParty(prev => {
      const newParty = [...prev];
      const p = { ...newParty[activePokemonIndex] };
      const newStats = { ...p.currentStats };
      newStats[stat] += 2;
      if (stat === 'maxHp') newStats.hp = newStats.maxHp;
      p.currentStats = newStats;
      p.trainingPoints -= 1;
      newParty[activePokemonIndex] = p;
      return newParty;
    });
  };

  // Battle Logic
  const startBattle = (isBoss = false) => {
    if (isBoss) {
      setEnemy({
        ...FINAL_BOSS,
        level: 50,
        hp: FINAL_BOSS.hp,
        maxHp: FINAL_BOSS.hp,
        attack: FINAL_BOSS.attack,
        defense: FINAL_BOSS.defense,
        isBoss: true
      });
      setBattleLog(['THE FINAL BOSS MEWTWO CHALLENGES YOU!']);
    } else {
      const randomEnemyBase = WILD_POKEMON[Math.floor(Math.random() * WILD_POKEMON.length)];
      const enemyLevel = Math.max(1, (pokemon?.level || 5) + Math.floor(Math.random() * 3) - 2);
      const multiplier = 1 + (enemyLevel * 0.08); // Reduced difficulty multiplier
      
      setEnemy({
        ...randomEnemyBase,
        level: enemyLevel,
        hp: Math.floor(randomEnemyBase.hp * multiplier),
        maxHp: Math.floor(randomEnemyBase.hp * multiplier),
        attack: Math.floor(randomEnemyBase.attack * multiplier),
        defense: Math.floor(randomEnemyBase.defense * multiplier),
      });
      setBattleLog(['A wild ' + randomEnemyBase.name + ' appeared!']);
    }
    setPhase('BATTLE');
    setIsPlayerTurn(true);
  };

  const handleAttack = (move: Move) => {
    if (!pokemon || !enemy || !isPlayerTurn) return;

    setPlayerAnim('attack');
    setTimeout(() => setPlayerAnim('idle'), 300);

    setTimeout(() => {
      setEnemyAnim('hit');
      setBattleFlash(true);
      setTimeout(() => {
        setEnemyAnim('idle');
        setBattleFlash(false);
      }, 300);

      // Player attacks - Buffed damage for easier gameplay
      const damage = Math.max(10, Math.floor(((pokemon.currentStats.attack * (move.power / 100)) * 0.8) - (enemy.defense * 0.1)));
      const newEnemyHp = Math.max(0, enemy.hp - damage);
      
      setEnemy({ ...enemy, hp: newEnemyHp });
      setBattleLog(prev => [...prev, `${pokemon.name} used ${move.name}! Dealt ${damage} damage.`]);

      if (newEnemyHp <= 0) {
        handleWin();
        return;
      }

      setIsPlayerTurn(false);
      
      // Enemy counter-attack - Nerfed damage for easier gameplay, but Boss is stronger
      setTimeout(() => {
        const enemyMove = enemy.moves[Math.floor(Math.random() * enemy.moves.length)];
        const damageMultiplier = enemy.isBoss ? 0.7 : 0.3;
        const enemyDamage = Math.max(2, Math.floor(((enemy.attack * (enemyMove.power / 100)) * damageMultiplier) - (pokemon.currentStats.defense * 0.2)));
        const newPlayerHp = Math.max(0, pokemon.currentStats.hp - enemyDamage);
        
        setEnemyAnim('attack');
        setTimeout(() => setEnemyAnim('idle'), 300);

        setTimeout(() => {
          setPlayerAnim('hit');
          setBattleFlash(true);
          setTimeout(() => {
            setPlayerAnim('idle');
            setBattleFlash(false);
          }, 300);

          setParty(prev => {
            const newParty = [...prev];
            newParty[activePokemonIndex] = {
              ...newParty[activePokemonIndex],
              currentStats: { ...newParty[activePokemonIndex].currentStats, hp: newPlayerHp }
            };
            return newParty;
          });
          
          setBattleLog(prev => [...prev, `${enemy.name} used ${enemyMove.name}! Dealt ${enemyDamage} damage.`]);
          
          if (newPlayerHp <= 0) {
            handleLoss();
          } else {
            setIsPlayerTurn(true);
          }
        }, 300);
      }, 800);
    }, 300);
  };

  const handleCapture = () => {
    if (!pokemon || !enemy || !isPlayerTurn) return;

    const captureChance = (1 - (enemy.hp / enemy.maxHp)) * 0.8 + 0.1;
    const success = Math.random() < captureChance;

    setBattleLog(prev => [...prev, `You threw a Pokéball...`]);
    setIsPlayerTurn(false);

    setTimeout(() => {
      if (success) {
        setBattleLog(prev => [...prev, `Gotcha! ${enemy.name} was caught!`]);
        
        const newPokemon: UserPokemon = {
          ...enemy,
          types: [PokemonType.NORMAL], // Default for wild if not specified, but constants have them
          experience: 0,
          experienceToNextLevel: XP_PER_LEVEL,
          currentStats: {
            hp: enemy.maxHp,
            maxHp: enemy.maxHp,
            attack: enemy.attack,
            defense: enemy.defense,
            speed: enemy.speed,
          },
          trainingPoints: 0,
          wins: 0,
          totalWins: 0,
        };

        setParty(prev => [...prev, newPokemon]);
        
        setTimeout(() => {
          setPhase('HUB');
          setEnemy(null);
        }, 1500);
      } else {
        setBattleLog(prev => [...prev, `Oh no! The ${enemy.name} broke free!`]);
        
        // Enemy counter-attack after failed capture
        setTimeout(() => {
          const enemyMove = enemy.moves[Math.floor(Math.random() * enemy.moves.length)];
          const enemyDamage = Math.max(3, Math.floor(((enemy.attack * (enemyMove.power / 100)) * 0.4) - (pokemon.currentStats.defense * 0.2)));
          const newPlayerHp = Math.max(0, pokemon.currentStats.hp - enemyDamage);
          
          setParty(prev => {
            const newParty = [...prev];
            newParty[activePokemonIndex] = {
              ...newParty[activePokemonIndex],
              currentStats: { ...newParty[activePokemonIndex].currentStats, hp: newPlayerHp }
            };
            return newParty;
          });
          
          setBattleLog(prev => [...prev, `${enemy.name} used ${enemyMove.name}! Dealt ${enemyDamage} damage.`]);
          
          if (newPlayerHp <= 0) {
            handleLoss();
          } else {
            setIsPlayerTurn(true);
          }
        }, 1000);
      }
    }, 1500);
  };

  const handleWin = () => {
    const xpGained = 60 + (enemy.level * 15); // Increased XP for easier leveling
    const isBossWin = enemy.isBoss;
    setBattleLog(prev => [...prev, `${enemy.name} fainted! Gained ${xpGained} XP.`]);
    if (isBossWin) {
      setBattleLog(prev => [...prev, "CONGRATULATIONS! YOU DEFEATED THE FINAL BOSS!"]);
    }
    
    setTimeout(() => {
      setParty(prev => {
        const newParty = [...prev];
        const p = { ...newParty[activePokemonIndex] };
        
        let newXp = p.experience + xpGained;
        let newLevel = p.level;
        let newTrainingPoints = p.trainingPoints + (isBossWin ? 10 : 0);
        let newWins = p.wins + 1;
        let newTotalWins = p.totalWins + 1;
        let stats = { ...p.currentStats, hp: p.currentStats.maxHp };

        while (newXp >= p.experienceToNextLevel) {
          newXp -= p.experienceToNextLevel;
          newLevel++;
          newTrainingPoints += 3; // Increased training points per level
          stats.maxHp += 8; // Increased HP gain
          stats.hp = stats.maxHp;
          stats.attack += 3;
          stats.defense += 3;
          stats.speed += 3;
        }

        const updated = {
          ...p,
          level: newLevel,
          experience: newXp,
          trainingPoints: newTrainingPoints,
          currentStats: stats,
          wins: newWins,
          totalWins: newTotalWins,
        };

        // Check evolution: 3 wins
        if (updated.wins >= 3 && updated.evolvesTo) {
          setEvolutionPending(updated.evolvesTo);
        }

        newParty[activePokemonIndex] = updated;
        return newParty;
      });
      
      setPhase('HUB');
      setEnemy(null);
    }, 2000);
  };

  const handleLoss = () => {
    setBattleLog(prev => [...prev, `${pokemon?.name} fainted! Visit the Pokemon Center to heal.`]);
    setTimeout(() => {
      setParty(prev => {
        const newParty = [...prev];
        newParty[activePokemonIndex] = {
          ...newParty[activePokemonIndex],
          currentStats: { ...newParty[activePokemonIndex].currentStats, hp: 0 }
        };
        return newParty;
      });
      setPhase('HUB');
      setEnemy(null);
    }, 1500);
  };

  const evolve = () => {
    if (!evolutionPending || !pokemon) return;
    const nextBase = POKEMON_DATA[evolutionPending];
    setParty(prev => {
      const newParty = [...prev];
      const p = { ...newParty[activePokemonIndex] };
      const evolved = {
        ...p,
        ...nextBase,
        wins: 0,
        currentStats: {
          ...p.currentStats,
          maxHp: p.currentStats.maxHp + 20,
          hp: p.currentStats.maxHp + 20,
          attack: p.currentStats.attack + 10,
          defense: p.currentStats.defense + 10,
          speed: p.currentStats.speed + 10,
        }
      };
      newParty[activePokemonIndex] = evolved;
      return newParty;
    });
    setEvolutionPending(null);
    setPhase('HUB');
  };

  const startHealing = (index: number) => {
    setParty(prev => {
      const newParty = [...prev];
      newParty[index] = {
        ...newParty[index],
        recoveryEndTime: Date.now() + 60000, // 1 minute
      };
      return newParty;
    });
  };

  // Render Helpers
  const StatBar = ({ label, value, max, icon: Icon, color }: any) => (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center text-xs font-mono uppercase tracking-wider opacity-60">
        <div className="flex items-center gap-1">
          <Icon size={12} />
          <span>{label}</span>
        </div>
        <span>{value} / {max}</span>
      </div>
      <div className="h-1.5 w-full bg-black/10 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, (value / max) * 100)}%` }}
          className={`h-full ${color}`}
        />
      </div>
    </div>
  );

  if (phase === 'START') {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex items-center justify-center p-6 font-sans">
        <div className="max-w-4xl w-full">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <h1 className="text-6xl font-black tracking-tighter uppercase italic mb-2">Pokelice</h1>
            <p className="text-sm font-mono opacity-50 uppercase tracking-[0.2em]">Choose your destiny</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 4, 7].map(id => (
              <motion.button
                key={id}
                whileHover={{ scale: 1.02, y: -5 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => selectStarter(id)}
                className="group relative bg-white border border-black/10 p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Gamepad2 size={120} />
                </div>
                <img 
                  src={POKEMON_DATA[id].sprite} 
                  alt={POKEMON_DATA[id].name}
                  className="w-40 h-40 mx-auto mb-6 object-contain drop-shadow-2xl"
                />
                <h3 className="text-2xl font-bold uppercase tracking-tight mb-1">{POKEMON_DATA[id].name}</h3>
                <span className="text-xs font-mono px-2 py-1 bg-black/5 rounded uppercase opacity-60">
                  {POKEMON_DATA[id].types[0]}
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (evolutionPending) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 text-white overflow-hidden">
        <div className="text-center z-10">
          <motion.div
            animate={{ 
              scale: [1, 1.2, 1],
              rotate: [0, 5, -5, 0],
              filter: ["brightness(1)", "brightness(3)", "brightness(1)"]
            }}
            transition={{ duration: 2, repeat: Infinity }}
            className="mb-8"
          >
            <Sparkles className="mx-auto mb-4 text-yellow-400" size={48} />
            <h2 className="text-4xl font-black uppercase italic mb-2">What?</h2>
            <p className="text-xl opacity-70">{pokemon?.name} is evolving!</p>
          </motion.div>
          
          <div className="relative w-64 h-64 mx-auto mb-12">
            <motion.img
              key="old"
              src={pokemon?.sprite}
              className="absolute inset-0 w-full h-full object-contain"
              animate={{ opacity: [1, 0, 1], scale: [1, 0.5, 1] }}
              transition={{ duration: 0.5, repeat: 4 }}
            />
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={evolve}
            className="px-8 py-4 bg-white text-black font-bold uppercase tracking-widest rounded-full hover:bg-yellow-400 transition-colors"
          >
            Complete Evolution
          </motion.button>
        </div>
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="h-full w-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F4] text-[#141414] font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Stats & Info */}
        <div className="lg:col-span-4 space-y-6">
          <motion.div 
            layoutId="poke-card"
            className="bg-white border border-black/5 rounded-3xl p-8 shadow-sm"
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-40">Level {pokemon?.level}</span>
                <h2 className="text-3xl font-black uppercase italic tracking-tight">{pokemon?.name}</h2>
              </div>
              <div className="flex gap-1">
                {pokemon?.types.map(t => (
                  <span key={t} className="text-[10px] font-mono px-2 py-1 bg-black text-white rounded uppercase">
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative group mb-8">
              <div className="absolute inset-0 bg-black/5 rounded-full scale-90 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <img 
                src={pokemon?.sprite} 
                alt={pokemon?.name}
                className="w-48 h-48 mx-auto object-contain relative z-10 drop-shadow-xl"
              />
            </div>

            <div className="space-y-4">
              <StatBar label="HP" value={pokemon?.currentStats.hp} max={pokemon?.currentStats.maxHp} icon={Heart} color="bg-emerald-500" />
              <StatBar label="Attack" value={pokemon?.currentStats.attack} max={200} icon={Sword} color="bg-rose-500" />
              <StatBar label="Defense" value={pokemon?.currentStats.defense} max={200} icon={Shield} color="bg-blue-500" />
              <StatBar label="Speed" value={pokemon?.currentStats.speed} max={200} icon={Zap} color="bg-amber-500" />
            </div>

            <div className="mt-8 pt-6 border-t border-black/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-mono uppercase opacity-40">Evolution Progress</span>
                <span className="text-[10px] font-mono">{pokemon?.wins} / 3 Wins</span>
              </div>
              <div className="h-1 w-full bg-black/5 rounded-full overflow-hidden mb-4">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(pokemon?.wins || 0) / 3 * 100}%` }}
                  className="h-full bg-amber-500"
                />
              </div>

              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-mono uppercase opacity-40">Experience</span>
                <span className="text-[10px] font-mono">{pokemon?.experience} / {XP_PER_LEVEL}</span>
              </div>
              <div className="h-1 w-full bg-black/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(pokemon?.experience || 0) / XP_PER_LEVEL * 100}%` }}
                  className="h-full bg-black"
                />
              </div>
            </div>
          </motion.div>

          {/* Party Section */}
          <div className="bg-white border border-black/5 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Users size={16} className="opacity-40" />
              <h3 className="text-xs font-mono uppercase tracking-widest opacity-40">Your Party</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {party.map((p, i) => {
                const recovering = p.recoveryEndTime !== undefined;
                return (
                  <button 
                    key={i}
                    onClick={() => setActivePokemonIndex(i)}
                    className={`p-2 rounded-xl border transition-all relative ${activePokemonIndex === i ? 'border-black bg-black/5' : 'border-black/5 hover:border-black/20'} ${recovering ? 'grayscale opacity-60' : ''}`}
                  >
                    <img src={p.sprite} className="w-12 h-12 mx-auto object-contain" />
                    {recovering && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <RotateCcw size={16} className="text-rose-500 animate-spin" />
                      </div>
                    )}
                  </button>
                );
              })}
              {Array.from({ length: 6 - party.length }).map((_, i) => (
                <div key={i} className="p-2 rounded-xl border border-dashed border-black/10 flex items-center justify-center">
                  <Circle size={12} className="opacity-10" />
                </div>
              ))}
            </div>
          </div>

          {pokemon?.trainingPoints && pokemon.trainingPoints > 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-black text-white rounded-3xl p-6 shadow-xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <Dumbbell className="text-yellow-400" />
                <h3 className="font-bold uppercase tracking-tight">Training Center</h3>
                <span className="ml-auto bg-white/20 px-2 py-1 rounded text-xs font-mono">
                  {pokemon.trainingPoints} pts
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => trainStat('maxHp')} className="p-3 bg-white/10 hover:bg-white/20 rounded-xl text-xs uppercase font-bold transition-colors">Boost HP</button>
                <button onClick={() => trainStat('attack')} className="p-3 bg-white/10 hover:bg-white/20 rounded-xl text-xs uppercase font-bold transition-colors">Boost ATK</button>
                <button onClick={() => trainStat('defense')} className="p-3 bg-white/10 hover:bg-white/20 rounded-xl text-xs uppercase font-bold transition-colors">Boost DEF</button>
                <button onClick={() => trainStat('speed')} className="p-3 bg-white/10 hover:bg-white/20 rounded-xl text-xs uppercase font-bold transition-colors">Boost SPD</button>
              </div>
            </motion.div>
          ) : null}
        </div>

        {/* Right Column: Actions & Battle */}
        <div className="lg:col-span-8">
          <AnimatePresence mode="wait">
            {phase === 'HUB' ? (
              <motion.div 
                key="hub"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full"
              >
                <button 
                  disabled={!pokemon || pokemon.currentStats.hp <= 0 || isRecovering}
                  onClick={() => startBattle()}
                  className="group relative bg-white border border-black/5 rounded-3xl p-12 flex flex-col items-center justify-center gap-6 hover:border-black transition-all overflow-hidden shadow-sm hover:shadow-xl disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                >
                  <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Sword size={160} />
                  </div>
                  <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Sword size={32} />
                  </div>
                  <div className="text-center">
                    <h3 className="text-2xl font-black uppercase italic">Wild Battle</h3>
                    <p className="text-sm opacity-50 font-mono">Gain XP and Training Points</p>
                  </div>
                  {(!pokemon || pokemon.currentStats.hp <= 0 || isRecovering) && (
                    <p className="text-[10px] font-mono text-rose-500 uppercase mt-2">Pokemon unable to battle</p>
                  )}
                  <ChevronRight className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>

                {pokemon && pokemon.totalWins >= 7 ? (
                  <button 
                    onClick={() => startBattle(true)}
                    className="group relative bg-black text-white rounded-3xl p-12 flex flex-col items-center justify-center gap-6 hover:bg-rose-900 transition-all overflow-hidden shadow-xl"
                  >
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Trophy size={160} />
                    </div>
                    <div className="w-20 h-20 bg-rose-600 text-white rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(225,29,72,0.5)]">
                      <Trophy size={32} />
                    </div>
                    <div className="text-center">
                      <h3 className="text-2xl font-black uppercase italic text-rose-500">FINAL BOSS</h3>
                      <p className="text-sm opacity-50 font-mono">Challenge Mewtwo</p>
                    </div>
                    <ChevronRight className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ) : (
                  <div className="bg-white border border-black/5 rounded-3xl p-12 flex flex-col items-center justify-center gap-6 opacity-40 grayscale">
                    <div className="w-20 h-20 bg-black/10 text-black/40 rounded-full flex items-center justify-center">
                      <Trophy size={32} />
                    </div>
                    <div className="text-center">
                      <h3 className="text-2xl font-black uppercase italic">Final Boss</h3>
                      <p className="text-sm opacity-50 font-mono">Win {7 - (pokemon?.totalWins || 0)} more battles to unlock</p>
                    </div>
                  </div>
                )}

                <button 
                  disabled={!pokemon || pokemon.currentStats.hp <= 0 || isRecovering || isSearching}
                  onClick={startOnlineSearch}
                  className="group relative bg-white border border-black/5 rounded-3xl p-12 flex flex-col items-center justify-center gap-6 hover:border-black transition-all overflow-hidden shadow-sm hover:shadow-xl disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                >
                  <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Globe size={160} />
                  </div>
                  <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    {isSearching ? <RotateCcw size={32} className="animate-spin" /> : <Globe size={32} />}
                  </div>
                  <div className="text-center">
                    <h3 className="text-2xl font-black uppercase italic">{isSearching ? 'Searching...' : 'Online Play'}</h3>
                    <p className="text-sm opacity-50 font-mono">Battle other trainers</p>
                  </div>
                  <ChevronRight className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>

                <button 
                  onClick={() => setPhase('POKEMON_CENTER')}
                  className="group relative bg-white border border-black/5 rounded-3xl p-12 flex flex-col items-center justify-center gap-6 hover:border-black transition-all overflow-hidden shadow-sm hover:shadow-xl"
                >
                  <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Heart size={160} />
                  </div>
                  <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Heart size={32} />
                  </div>
                  <div className="text-center">
                    <h3 className="text-2xl font-black uppercase italic">Pokemon Center</h3>
                    <p className="text-sm opacity-50 font-mono">Heal your tired Pokemon</p>
                  </div>
                  <ChevronRight className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </motion.div>
            ) : phase === 'POKEMON_CENTER' ? (
              <motion.div 
                key="pc"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-black/5 rounded-3xl p-8 shadow-sm h-full flex flex-col"
              >
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center">
                    <Heart size={24} />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black uppercase italic tracking-tight">Pokemon Center</h2>
                    <p className="text-xs font-mono opacity-40 uppercase tracking-widest">Healing takes 1 minute per Pokemon</p>
                  </div>
                  <button 
                    onClick={() => setPhase('HUB')}
                    className="ml-auto px-6 py-2 border border-black/10 rounded-full text-xs font-bold uppercase hover:bg-black/5 transition-colors"
                  >
                    Back to Hub
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto pr-2">
                  {party.map((p, i) => {
                    const needsHealing = p.currentStats.hp < p.currentStats.maxHp;
                    const recovering = p.recoveryEndTime !== undefined;
                    const timeLeft = recovering ? Math.ceil(((p.recoveryEndTime || 0) - currentTime) / 1000) : 0;

                    return (
                      <div key={i} className="border border-black/5 rounded-2xl p-4 flex items-center gap-4 bg-black/[0.02]">
                        <img src={p.sprite} className="w-16 h-16 object-contain" />
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold uppercase italic text-sm">{p.name}</span>
                            <span className="text-[10px] font-mono opacity-40">Lv. {p.level}</span>
                          </div>
                          <StatBar label="HP" value={p.currentStats.hp} max={p.currentStats.maxHp} icon={Heart} color="bg-emerald-500" />
                        </div>
                        <div className="min-w-[100px] flex justify-end">
                          {recovering ? (
                            <div className="text-center">
                              <RotateCcw size={16} className="text-rose-500 animate-spin mx-auto mb-1" />
                              <span className="text-xs font-mono font-bold">{timeLeft}s</span>
                            </div>
                          ) : needsHealing ? (
                            <button 
                              onClick={() => startHealing(i)}
                              className="px-4 py-2 bg-emerald-500 text-white text-[10px] font-bold uppercase rounded-lg hover:bg-emerald-600 transition-colors"
                            >
                              Heal
                            </button>
                          ) : (
                            <span className="text-[10px] font-mono text-emerald-500 uppercase font-bold">Healthy</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ) : phase === 'BATTLE' || phase === 'ONLINE_BATTLE' ? (
              <motion.div 
                key="battle"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white border border-black/5 rounded-3xl overflow-hidden flex flex-col h-full shadow-2xl"
              >
                {/* Battle Arena */}
                <div className={`flex-1 relative p-12 flex flex-col justify-between min-h-[400px] transition-colors duration-100 ${battleFlash ? 'bg-white' : 'bg-[#E4E3E0]'}`}>
                  {/* Enemy Side */}
                  <div className="flex justify-end items-start gap-8">
                    <motion.div 
                      initial={{ x: 50, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 w-64"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold uppercase italic">{enemy?.name}</span>
                        <span className="text-[10px] font-mono">Lv. {enemy?.level}</span>
                      </div>
                      <StatBar label="HP" value={enemy?.hp} max={enemy?.maxHp} icon={Heart} color="bg-rose-500" />
                    </motion.div>
                    <motion.img 
                      variants={{
                        idle: { y: [0, -10, 0], transition: { repeat: Infinity, duration: 2 } },
                        attack: { x: -40, scale: 1.2, transition: { duration: 0.2 } },
                        hit: { x: [0, -10, 10, -10, 10, 0], filter: 'brightness(2) sepia(1) hue-rotate(-50deg)', transition: { duration: 0.3 } }
                      }}
                      animate={enemyAnim}
                      src={enemy?.sprite} 
                      className="w-40 h-40 object-contain drop-shadow-2xl"
                    />
                  </div>

                  {/* Player Side */}
                  <div className="flex justify-start items-end gap-8">
                    <motion.img 
                      variants={{
                        idle: { y: [0, -10, 0], transition: { repeat: Infinity, duration: 2.5 } },
                        attack: { x: 40, scale: 1.2, transition: { duration: 0.2 } },
                        hit: { x: [0, -10, 10, -10, 10, 0], filter: 'brightness(2) sepia(1) hue-rotate(-50deg)', transition: { duration: 0.3 } }
                      }}
                      animate={playerAnim}
                      src={pokemon?.sprite} 
                      className="w-48 h-48 object-contain drop-shadow-2xl"
                    />
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 w-64">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold uppercase italic">{pokemon?.name}</span>
                        <span className="text-[10px] font-mono">Lv. {pokemon?.level}</span>
                      </div>
                      <StatBar label="HP" value={pokemon?.currentStats.hp} max={pokemon?.currentStats.maxHp} icon={Heart} color="bg-emerald-500" />
                    </div>
                  </div>

                  {/* Battle Log Overlay */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full px-12 pointer-events-none">
                    <AnimatePresence>
                      {battleLog.slice(-1).map((log, i) => (
                        <motion.div 
                          key={log + i}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="bg-black text-white px-6 py-3 rounded-full text-center font-mono text-sm shadow-xl mx-auto w-fit"
                        >
                          {log}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Battle Controls */}
                <div className="p-8 bg-white border-t border-black/5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    {pokemon?.moves.map((move, i) => (
                      <button 
                        key={i}
                        disabled={!isPlayerTurn || enemy?.hp <= 0}
                        onClick={() => phase === 'ONLINE_BATTLE' ? handleOnlineAttack(move) : handleAttack(move)}
                        className="p-4 bg-black/5 hover:bg-black text-black hover:text-white rounded-xl font-bold uppercase text-xs transition-all disabled:opacity-50"
                      >
                        {move.name}
                        <div className="text-[8px] opacity-60 mt-1">{move.type} | {move.power}</div>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-4">
                    {phase !== 'ONLINE_BATTLE' && (
                      <button 
                        disabled={!isPlayerTurn || enemy?.hp <= 0 || party.length >= 6}
                        onClick={handleCapture}
                        className="flex-1 py-4 bg-rose-600 text-white rounded-xl font-black uppercase italic tracking-widest hover:bg-rose-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-3"
                      >
                        <Circle size={20} />
                        Capture
                      </button>
                    )}
                    <button 
                      disabled={!isPlayerTurn || enemy?.hp <= 0}
                      onClick={() => {
                        if (phase === 'ONLINE_BATTLE') {
                          socket?.send(JSON.stringify({ type: "BATTLE_END", battleId: onlineBattleId }));
                        }
                        setPhase('HUB');
                      }}
                      className="px-8 py-4 border border-black/10 rounded-xl font-bold uppercase tracking-widest hover:bg-black/5 transition-colors"
                    >
                      {phase === 'ONLINE_BATTLE' ? 'Forfeit' : 'Run'}
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Info */}
      <div className="max-w-6xl mx-auto mt-12 pt-8 border-t border-black/5 flex flex-col md:flex-row justify-between items-center gap-4 opacity-30">
        <div className="flex items-center gap-2">
          <Gamepad2 size={16} />
          <span className="text-xs font-mono uppercase tracking-widest">Pokelice Engine v1.1</span>
        </div>
        <div className="flex gap-6">
          <span className="text-xs font-mono uppercase tracking-widest">© 2026 Pokémon Clone</span>
          <button onClick={() => window.location.reload()} className="flex items-center gap-1 text-xs font-mono uppercase tracking-widest hover:underline">
            <RotateCcw size={12} /> Reset Game
          </button>
        </div>
      </div>
    </div>
  );
}
