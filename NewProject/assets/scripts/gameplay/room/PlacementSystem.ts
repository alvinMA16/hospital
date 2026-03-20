import { RoomMapModel } from "./RoomMapModel";
import {
  GridCoord,
  PlacementItemDefinition,
  PlacementOccupancy,
  PlacementValidationResult,
} from "./map/MapTypes";

export class PlacementSystem {
  constructor(private readonly mapModel: RoomMapModel) {}

  validatePlacement(
    item: PlacementItemDefinition,
    originX: number,
    originY: number,
  ): PlacementValidationResult {
    const cells = this.resolveFootprintCells(item, originX, originY);

    for (const cellCoord of cells) {
      const cell = this.mapModel.getCell(cellCoord.x, cellCoord.y);
      if (!cell) {
        return {
          ok: false,
          reason: "out_of_bounds",
          blockedCell: cellCoord,
          cells,
        };
      }

      if (!cell.buildable) {
        return {
          ok: false,
          reason: "cell_not_buildable",
          blockedCell: cellCoord,
          cells,
        };
      }

      if (cell.occupantId) {
        return {
          ok: false,
          reason: "cell_occupied",
          blockedCell: cellCoord,
          cells,
        };
      }

      if (item.requiredTagsAll && item.requiredTagsAll.some((tag) => !cell.tags.includes(tag))) {
        return {
          ok: false,
          reason: "missing_required_tag",
          blockedCell: cellCoord,
          cells,
        };
      }

      if (item.forbiddenTagsAny && item.forbiddenTagsAny.some((tag) => cell.tags.includes(tag))) {
        return {
          ok: false,
          reason: "forbidden_tag",
          blockedCell: cellCoord,
          cells,
        };
      }
    }

    return {
      ok: true,
      cells,
    };
  }

  placeItem(
    item: PlacementItemDefinition,
    originX: number,
    originY: number,
    instanceId = `${item.id}@${originX},${originY}`,
  ): PlacementValidationResult & { instanceId?: string } {
    const result = this.validatePlacement(item, originX, originY);
    if (!result.ok) {
      return result;
    }

    const occupancy: PlacementOccupancy = {
      itemId: item.id,
      instanceId,
      blocksMovement: item.blocksMovement ?? true,
      origin: { x: originX, y: originY },
      cells: result.cells,
    };

    this.mapModel.occupyCells(occupancy);

    return {
      ...result,
      instanceId,
    };
  }

  removeItem(instanceId: string): void {
    this.mapModel.clearOccupancy(instanceId);
  }

  private resolveFootprintCells(
    item: PlacementItemDefinition,
    originX: number,
    originY: number,
  ): GridCoord[] {
    const footprint = item.footprint ?? this.createRectFootprint(item.width ?? 1, item.height ?? 1);
    return footprint.map((cell) => ({
      x: originX + cell.x,
      y: originY + cell.y,
    }));
  }

  private createRectFootprint(width: number, height: number): GridCoord[] {
    const result: GridCoord[] = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        result.push({ x, y });
      }
    }

    return result;
  }
}
