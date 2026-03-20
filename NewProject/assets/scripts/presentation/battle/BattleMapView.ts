import {
  Color,
  Component,
  Graphics,
  UITransform,
  Vec3,
  _decorator,
} from "cc";
import { RoomMapModel } from "../../gameplay/room/RoomMapModel";
import {
  GridCoord,
  MapCellState,
  PlacementValidationResult,
} from "../../gameplay/room/map/MapTypes";

const { ccclass, property, requireComponent } = _decorator;

@ccclass("BattleMapView")
@requireComponent(Graphics)
@requireComponent(UITransform)
export class BattleMapView extends Component {
  @property
  cellSize = 28;

  @property
  showGrid = true;

  @property
  showBuildableHint = true;

  private graphics: Graphics | null = null;
  private transform: UITransform | null = null;
  private mapModel: RoomMapModel | null = null;
  private originX = 0;
  private originY = 0;
  private preview: PlacementValidationResult | null = null;

  onLoad(): void {
    this.graphics = this.getComponent(Graphics);
    this.transform = this.getComponent(UITransform);
  }

  setMapModel(mapModel: RoomMapModel): void {
    this.mapModel = mapModel;
    this.redraw();
  }

  setPlacementPreview(preview: PlacementValidationResult | null): void {
    this.preview = preview;
    this.redraw();
  }

  pickCellAtUILocation(uiX: number, uiY: number): GridCoord | null {
    if (!this.transform || !this.mapModel) {
      return null;
    }

    const local = this.transform.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
    const localX = local.x - this.originX;
    const localY = local.y - this.originY;
    const mapWidth = this.mapModel.width * this.cellSize;
    const mapHeight = this.mapModel.height * this.cellSize;

    if (localX < 0 || localY < 0 || localX >= mapWidth || localY >= mapHeight) {
      return null;
    }

    const x = Math.floor(localX / this.cellSize);
    const yFromBottom = Math.floor(localY / this.cellSize);
    const y = this.mapModel.height - 1 - yFromBottom;

    return { x, y };
  }

  redraw(): void {
    if (!this.graphics || !this.transform || !this.mapModel) {
      return;
    }

    const graphics = this.graphics;
    graphics.clear();

    this.transform.setContentSize(
      this.mapModel.width * this.cellSize,
      this.mapModel.height * this.cellSize,
    );

    this.originX = -this.mapModel.width * this.cellSize * 0.5;
    this.originY = -this.mapModel.height * this.cellSize * 0.5;

    this.mapModel.forEachCell((cell) => {
      this.drawCell(cell);
    });

    this.drawPreview();
  }

  private drawCell(cell: MapCellState): void {
    if (!this.graphics || !this.mapModel) {
      return;
    }

    const px = this.originX + cell.x * this.cellSize;
    const py = this.originY + (this.mapModel.height - cell.y - 1) * this.cellSize;

    if (cell.tileType === "void") {
      return;
    }

    this.graphics.fillColor = this.getCellColor(cell);
    this.graphics.rect(px, py, this.cellSize, this.cellSize);
    this.graphics.fill();

    if (this.showBuildableHint && cell.buildable) {
      this.graphics.fillColor = new Color(255, 255, 255, 26);
      this.graphics.circle(px + this.cellSize * 0.5, py + this.cellSize * 0.5, this.cellSize * 0.12);
      this.graphics.fill();
    }

    if (cell.occupantId) {
      this.graphics.fillColor = new Color(45, 125, 255, 190);
      this.graphics.rect(
        px + this.cellSize * 0.18,
        py + this.cellSize * 0.18,
        this.cellSize * 0.64,
        this.cellSize * 0.64,
      );
      this.graphics.fill();
    }

    if (this.showGrid) {
      this.graphics.strokeColor = new Color(18, 24, 38, 120);
      this.graphics.lineWidth = 1;
      this.graphics.rect(px, py, this.cellSize, this.cellSize);
      this.graphics.stroke();
    }
  }

  private getCellColor(cell: MapCellState): Color {
    switch (cell.tileType) {
      case "void":
        return new Color(0, 0, 0, 0);
      case "wall":
        return new Color(44, 54, 76, 255);
      case "door":
        return new Color(151, 90, 45, 255);
      case "fixed":
        return new Color(99, 111, 128, 255);
      case "floor":
      default:
        if (cell.tags.includes("corridor")) {
          return new Color(90, 103, 122, 255);
        }

        if (cell.buildable) {
          return new Color(132, 153, 177, 255);
        }

        return new Color(111, 125, 143, 255);
    }
  }

  private drawPreview(): void {
    if (!this.graphics || !this.mapModel || !this.preview) {
      return;
    }

    const previewColor = this.preview.ok
      ? new Color(52, 211, 153, 110)
      : new Color(248, 113, 113, 120);

    for (const cell of this.preview.cells) {
      const px = this.originX + cell.x * this.cellSize;
      const py = this.originY + (this.mapModel.height - cell.y - 1) * this.cellSize;

      this.graphics.fillColor = previewColor;
      this.graphics.rect(px + 1, py + 1, this.cellSize - 2, this.cellSize - 2);
      this.graphics.fill();
    }

    if (this.preview.blockedCell) {
      const px = this.originX + this.preview.blockedCell.x * this.cellSize;
      const py =
        this.originY + (this.mapModel.height - this.preview.blockedCell.y - 1) * this.cellSize;

      this.graphics.strokeColor = new Color(127, 29, 29, 255);
      this.graphics.lineWidth = 2;
      this.graphics.rect(px + 2, py + 2, this.cellSize - 4, this.cellSize - 4);
      this.graphics.stroke();
    }
  }
}
