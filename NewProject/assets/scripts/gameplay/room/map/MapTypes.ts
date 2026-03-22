export type TileType = "void" | "floor" | "wall" | "door" | "fixed";

export interface GridCoord {
  x: number;
  y: number;
}

export interface MapCellDefinition {
  x: number;
  y: number;
  tileType: TileType;
  walkable: boolean;
  buildable: boolean;
  roomId?: string | null;
  tags?: string[];
}

export interface MapDefinition {
  id: string;
  width: number;
  height: number;
  cells: MapCellDefinition[];
}

export interface MapCellState extends MapCellDefinition {
  occupantId: string | null;
}

export interface PlacementItemDefinition {
  id: string;
  footprint?: GridCoord[];
  width?: number;
  height?: number;
  blocksMovement?: boolean;
  requiredTagsAll?: string[];
  forbiddenTagsAny?: string[];
}

export interface PlacementOccupancy {
  itemId: string;
  instanceId: string;
  blocksMovement: boolean;
  origin: GridCoord;
  cells: GridCoord[];
}

export type PlacementBlockReason =
  | "out_of_bounds"
  | "cell_not_buildable"
  | "cell_occupied"
  | "missing_required_tag"
  | "forbidden_tag";

export interface PlacementValidationResult {
  ok: boolean;
  reason?: PlacementBlockReason;
  blockedCell?: GridCoord;
  cells: GridCoord[];
}

export interface DoorRuntimeState {
  roomId: string;
  cell: GridCoord;
  maxHp: number;
  hp: number;
}

export interface WatcherRenderState {
  x: number;
  y: number;
  targetRoomId: string | null;
  isAttacking: boolean;
}

export type RoomOccupantKind = "empty" | "player" | "ai";

export interface RoomRuntimeState {
  roomId: string;
  label: string;
  owner: RoomOccupantKind;
  ownerActorId: string | null;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  bedCell: GridCoord;
  bedLevel: number;
  doorCell: GridCoord;
  bedAccessCell: GridCoord;
  doorLevel: number;
  isDoorClosed: boolean;
  doorMaxHp: number;
  doorHp: number;
}

export interface PlayerRenderState {
  x: number;
  y: number;
  assignedRoomId: string | null;
  isLying: boolean;
  canLieDown: boolean;
}

export type ActorKind = "player" | "ai";

export type ActorPhase =
  | "idle"
  | "moving"
  | "at_bed"
  | "lying"
  | "ejected"
  | "dead";

export interface ActorRuntimeState {
  id: string;
  label: string;
  kind: ActorKind;
  x: number;
  y: number;
  targetRoomId: string | null;
  targetBedCell: GridCoord | null;
  path: GridCoord[];
  phase: ActorPhase;
  isAlive: boolean;
  isLying: boolean;
  canLieDown: boolean;
  thinkCooldown: number;
  ejectedCooldown: number;
  interactCooldown: number;
}

export interface GhostRuntimeState {
  active: boolean;
  x: number;
  y: number;
  maxHp: number;
  hp: number;
  targetActorId: string | null;
  targetRoomId: string | null;
  mode: "inactive" | "patrol" | "chase" | "attack_door";
}

export interface PlacedStructureRuntimeState {
  instanceId: string;
  optionId: string;
  level: number;
  roomId: string;
  origin: GridCoord;
}

export interface UpgradePulseState {
  cell: GridCoord;
  kind: "bed" | "door";
  ttl: number;
  duration: number;
}

export interface AttackEffectState {
  kind: "pill" | "shock";
  sourceCell: GridCoord;
  targetX: number;
  targetY: number;
  ttl: number;
  duration: number;
}
