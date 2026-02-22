export enum PokemonType {
  GRASS = 'Grass',
  FIRE = 'Fire',
  WATER = 'Water',
  ELECTRIC = 'Electric',
  NORMAL = 'Normal',
}

export interface Stats {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
}

export interface Move {
  name: string;
  power: number;
  type: PokemonType;
  accuracy: number;
}

export interface PokemonBase {
  id: number;
  name: string;
  types: PokemonType[];
  baseStats: Stats;
  sprite: string;
  moves: Move[];
  evolutionLevel?: number;
  evolvesTo?: number; // ID of the next evolution
}

export interface UserPokemon extends PokemonBase {
  level: number;
  experience: number;
  experienceToNextLevel: number;
  currentStats: Stats;
  trainingPoints: number;
  wins: number;
  totalWins: number;
  recoveryEndTime?: number;
}

export interface UserProfile {
  name: string;
  avatar: string;
}

export type GamePhase = 'START' | 'HUB' | 'BATTLE' | 'TRAINING' | 'EVOLUTION' | 'POKEMON_CENTER' | 'ONLINE_BATTLE' | 'PROFILE_SETUP' | 'TOURNAMENT' | 'TOURNAMENT_VOTE';
