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
