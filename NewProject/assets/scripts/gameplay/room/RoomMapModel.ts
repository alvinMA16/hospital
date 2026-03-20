import {
  GridCoord,
  MapCellState,
  MapDefinition,
  PlacementOccupancy,
  TileType,
} from "./map/MapTypes";

export class RoomMapModel {
  readonly id: string;
  readonly width: number;
  readonly height: number;

  private readonly cells: MapCellState[];
  private readonly occupancyByInstanceId = new Map<string, PlacementOccupancy>();

  constructor(definition: MapDefinition) {
    this.id = definition.id;
    this.width = definition.width;
    this.height = definition.height;
    this.cells = definition.cells.map((cell) => ({
      ...cell,
      roomId: cell.roomId ?? null,
      tags: cell.tags ? [...cell.tags] : [],
      occupantId: null,
    }));
  }

  forEachCell(visitor: (cell: MapCellState) => void): void {
    for (const cell of this.cells) {
      visitor(cell);
    }
  }

  getCell(x: number, y: number): MapCellState | null {
    if (!this.isInBounds(x, y)) {
      return null;
    }

    return this.cells[this.toIndex(x, y)];
  }

  isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  isBlockedForPath(x: number, y: number): boolean {
    const cell = this.getCell(x, y);
    if (!cell) {
      return true;
    }

    if (!cell.walkable) {
      return true;
    }

    if (!cell.occupantId) {
      return false;
    }

    const occupancy = this.occupancyByInstanceId.get(cell.occupantId);
    return occupancy?.blocksMovement ?? false;
  }

  occupyCells(occupancy: PlacementOccupancy): void {
    this.occupancyByInstanceId.set(occupancy.instanceId, occupancy);

    for (const cellCoord of occupancy.cells) {
      const cell = this.getCell(cellCoord.x, cellCoord.y);
      if (cell) {
        cell.occupantId = occupancy.instanceId;
      }
    }
  }

  clearOccupancy(instanceId: string): void {
    const occupancy = this.occupancyByInstanceId.get(instanceId);
    if (!occupancy) {
      return;
    }

    for (const cellCoord of occupancy.cells) {
      const cell = this.getCell(cellCoord.x, cellCoord.y);
      if (cell?.occupantId === instanceId) {
        cell.occupantId = null;
      }
    }

    this.occupancyByInstanceId.delete(instanceId);
  }

  getOccupancy(instanceId: string): PlacementOccupancy | null {
    return this.occupancyByInstanceId.get(instanceId) ?? null;
  }

  getOccupiedCells(): GridCoord[] {
    const result: GridCoord[] = [];

    this.forEachCell((cell) => {
      if (cell.occupantId) {
        result.push({ x: cell.x, y: cell.y });
      }
    });

    return result;
  }

  getCellsByTileType(tileType: TileType): MapCellState[] {
    const result: MapCellState[] = [];

    this.forEachCell((cell) => {
      if (cell.tileType === tileType) {
        result.push(cell);
      }
    });

    return result;
  }

  getCellsByRoomId(roomId: string): MapCellState[] {
    const result: MapCellState[] = [];

    this.forEachCell((cell) => {
      if (cell.roomId === roomId) {
        result.push(cell);
      }
    });

    return result;
  }

  setRoomFloorBuildable(roomId: string, buildable: boolean): void {
    this.forEachCell((cell) => {
      if (cell.roomId !== roomId || cell.tileType !== "floor") {
        return;
      }

      cell.buildable = buildable;
    });
  }

  private toIndex(x: number, y: number): number {
    return y * this.width + x;
  }
}
