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
  ActorRuntimeState,
  GhostRuntimeState,
  GridCoord,
  MapCellState,
  PlacementValidationResult,
  RoomRuntimeState,
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
  private roomStates: RoomRuntimeState[] = [];
  private actors: ActorRuntimeState[] = [];
  private ghostState: GhostRuntimeState | null = null;

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

  setSimulationState(
    roomStates: RoomRuntimeState[],
    actors: ActorRuntimeState[],
    ghostState: GhostRuntimeState | null,
  ): void {
    this.roomStates = roomStates;
    this.actors = actors;
    this.ghostState = ghostState;
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

    this.drawRoomOwnership();
    this.drawDoorStates();
    this.drawPreview();
    this.drawActors();
    this.drawGhost();
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
        return new Color(73, 80, 99, 255);
      case "door":
        return new Color(170, 119, 69, 255);
      case "fixed":
        return cell.tags.includes("bed")
          ? new Color(190, 204, 224, 255)
          : new Color(99, 111, 128, 255);
      case "floor":
      default:
        if (cell.tags.includes("corridor")) {
          return new Color(124, 135, 148, 255);
        }

        if (cell.buildable) {
          return new Color(211, 221, 232, 255);
        }

        return new Color(188, 198, 212, 255);
    }
  }

  private drawRoomOwnership(): void {
    if (!this.graphics || !this.mapModel) {
      return;
    }

    for (const roomState of this.roomStates) {
      if (roomState.owner === "empty") {
        continue;
      }

      const px = this.originX + roomState.bounds.x * this.cellSize;
      const py =
        this.originY
        + (this.mapModel.height - roomState.bounds.y - roomState.bounds.height) * this.cellSize;
      const width = roomState.bounds.width * this.cellSize;
      const height = roomState.bounds.height * this.cellSize;

      this.graphics.strokeColor = roomState.owner === "player"
        ? new Color(59, 130, 246, 220)
        : new Color(245, 158, 11, 210);
      this.graphics.lineWidth = 3;
      this.graphics.rect(px + 1.5, py + 1.5, width - 3, height - 3);
      this.graphics.stroke();
    }
  }

  private drawDoorStates(): void {
    if (!this.graphics || !this.mapModel) {
      return;
    }

    for (const roomState of this.roomStates) {
      const px = this.originX + roomState.doorCell.x * this.cellSize;
      const py = this.originY + (this.mapModel.height - roomState.doorCell.y - 1) * this.cellSize;

      if (roomState.isDoorClosed) {
        this.graphics.fillColor = roomState.owner === "player"
          ? new Color(37, 99, 235, 220)
          : new Color(146, 64, 14, 220);
        this.graphics.rect(px + 4, py + 4, this.cellSize - 8, this.cellSize - 8);
        this.graphics.fill();
      }

      if (roomState.ownerActorId && roomState.doorHp < roomState.doorMaxHp) {
        const ratio = Math.max(0, roomState.doorHp) / roomState.doorMaxHp;
        this.graphics.fillColor = new Color(15, 23, 42, 220);
        this.graphics.rect(px + 2, py + this.cellSize - 6, this.cellSize - 4, 4);
        this.graphics.fill();

        this.graphics.fillColor = ratio > 0.4
          ? new Color(250, 204, 21, 230)
          : new Color(248, 113, 113, 230);
        this.graphics.rect(px + 2, py + this.cellSize - 6, (this.cellSize - 4) * ratio, 4);
        this.graphics.fill();
      }
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
  }

  private drawActors(): void {
    if (!this.graphics || !this.mapModel) {
      return;
    }

    for (const actor of this.actors) {
      const centerX = this.originX + (actor.x + 0.5) * this.cellSize;
      const centerY = this.originY + (this.mapModel.height - actor.y - 0.5) * this.cellSize;

      if (!actor.isAlive) {
        this.graphics.strokeColor = new Color(71, 85, 105, 220);
        this.graphics.lineWidth = 2.5;
        this.graphics.moveTo(centerX - 6, centerY - 6);
        this.graphics.lineTo(centerX + 6, centerY + 6);
        this.graphics.moveTo(centerX + 6, centerY - 6);
        this.graphics.lineTo(centerX - 6, centerY + 6);
        this.graphics.stroke();
        continue;
      }

      if (actor.isLying && actor.targetBedCell) {
        this.graphics.fillColor = actor.kind === "player"
          ? new Color(37, 99, 235, 220)
          : new Color(217, 119, 6, 220);
        this.graphics.roundRect(
          centerX - this.cellSize * 0.4,
          centerY - this.cellSize * 0.16,
          this.cellSize * 0.8,
          this.cellSize * 0.32,
          this.cellSize * 0.12,
        );
        this.graphics.fill();
        continue;
      }

      if (actor.canLieDown) {
        this.graphics.strokeColor = actor.kind === "player"
          ? new Color(37, 99, 235, 220)
          : new Color(245, 158, 11, 220);
        this.graphics.lineWidth = 2;
        this.graphics.circle(centerX, centerY, this.cellSize * 0.34);
        this.graphics.stroke();
      }

      this.graphics.fillColor = actor.kind === "player"
        ? new Color(29, 78, 216, 235)
        : new Color(234, 88, 12, 228);
      this.graphics.circle(centerX, centerY, this.cellSize * 0.24);
      this.graphics.fill();
    }
  }

  private drawGhost(): void {
    if (!this.graphics || !this.mapModel || !this.ghostState || !this.ghostState.active) {
      return;
    }

    const centerX = this.originX + (this.ghostState.x + 0.5) * this.cellSize;
    const centerY = this.originY + (this.mapModel.height - this.ghostState.y - 0.5) * this.cellSize;

    this.graphics.fillColor = this.ghostState.mode === "attack_door"
      ? new Color(153, 27, 27, 240)
      : this.ghostState.mode === "chase"
      ? new Color(220, 38, 38, 240)
      : new Color(190, 24, 93, 230);
    this.graphics.circle(centerX, centerY, this.cellSize * 0.3);
    this.graphics.fill();

    this.graphics.strokeColor = new Color(15, 23, 42, 220);
    this.graphics.lineWidth = 2;
    this.graphics.circle(centerX, centerY, this.cellSize * 0.3);
    this.graphics.stroke();
  }
}
