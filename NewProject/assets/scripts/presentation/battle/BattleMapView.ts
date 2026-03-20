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
const FORCED_MIN_CELL_SIZE = 132;

@ccclass("BattleMapView")
@requireComponent(Graphics)
@requireComponent(UITransform)
export class BattleMapView extends Component {
  @property
  cellSize = 88;

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
  private cameraCenter: GridCoord = { x: 0, y: 0 };
  private viewportWidth = 0;
  private viewportHeight = 0;
  private clampCameraToMap = true;

  private getRenderCellSize(): number {
    return Math.max(this.cellSize, FORCED_MIN_CELL_SIZE);
  }

  onLoad(): void {
    this.graphics = this.getComponent(Graphics);
    this.transform = this.getComponent(UITransform);
  }

  setMapModel(mapModel: RoomMapModel): void {
    this.mapModel = mapModel;
    this.cameraCenter = {
      x: (mapModel.width - 1) * 0.5,
      y: (mapModel.height - 1) * 0.5,
    };
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

  setCameraCenter(x: number, y: number, clampToMap = true): void {
    this.clampCameraToMap = clampToMap;
    this.cameraCenter = { x, y };
  }

  getLocalPositionForCell(cell: GridCoord): Vec3 | null {
    if (!this.mapModel) {
      return null;
    }

    const cellSize = this.getRenderCellSize();
    return new Vec3(
      this.originX + (cell.x + 0.5) * cellSize,
      this.originY + (this.mapModel.height - cell.y - 0.5) * cellSize,
      0,
    );
  }

  panCameraByScreenDelta(deltaX: number, deltaY: number): void {
    const cellSize = this.getRenderCellSize();
    this.clampCameraToMap = false;
    this.cameraCenter = {
      x: this.cameraCenter.x - deltaX / cellSize,
      y: this.cameraCenter.y + deltaY / cellSize,
    };
  }

  pickCellAtUILocation(uiX: number, uiY: number): GridCoord | null {
    if (!this.transform || !this.mapModel) {
      return null;
    }

    const cellSize = this.getRenderCellSize();
    const local = this.transform.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
    const localX = local.x - this.originX;
    const localY = local.y - this.originY;
    const mapWidth = this.mapModel.width * cellSize;
    const mapHeight = this.mapModel.height * cellSize;

    if (localX < 0 || localY < 0 || localX >= mapWidth || localY >= mapHeight) {
      return null;
    }

    const x = Math.floor(localX / cellSize);
    const yFromBottom = Math.floor(localY / cellSize);
    const y = this.mapModel.height - 1 - yFromBottom;

    return { x, y };
  }

  redraw(): void {
    if (!this.graphics || !this.transform || !this.mapModel) {
      return;
    }

    const cellSize = this.getRenderCellSize();
    const graphics = this.graphics;
    graphics.clear();

    this.updateViewport();
    if (this.clampCameraToMap) {
      this.cameraCenter = this.clampCameraCenter(this.cameraCenter);
    }
    this.originX = -(this.cameraCenter.x + 0.5) * cellSize;
    this.originY = -(this.mapModel.height - this.cameraCenter.y - 0.5) * cellSize;

    this.drawBackdrop();
    this.mapModel.forEachCell((cell) => {
      this.drawCell(cell);
    });

    this.drawBeds();
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

    const cellSize = this.getRenderCellSize();
    const px = this.originX + cell.x * cellSize;
    const py = this.originY + (this.mapModel.height - cell.y - 1) * cellSize;

    if (cell.tileType === "void") {
      return;
    }

    this.graphics.fillColor = this.getCellColor(cell);
    this.graphics.rect(px, py, cellSize, cellSize);
    this.graphics.fill();

    if (this.showBuildableHint && cell.buildable) {
      this.graphics.fillColor = new Color(255, 255, 255, 26);
      this.graphics.circle(px + cellSize * 0.5, py + cellSize * 0.5, cellSize * 0.12);
      this.graphics.fill();
    }

    if (cell.occupantId) {
      this.graphics.fillColor = new Color(45, 125, 255, 190);
      this.graphics.rect(
        px + cellSize * 0.18,
        py + cellSize * 0.18,
        cellSize * 0.64,
        cellSize * 0.64,
      );
      this.graphics.fill();
    }

    if (this.showGrid) {
      this.graphics.strokeColor = new Color(18, 24, 38, 120);
      this.graphics.lineWidth = 1;
      this.graphics.rect(px, py, cellSize, cellSize);
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

    const cellSize = this.getRenderCellSize();
    for (const roomState of this.roomStates) {
      if (roomState.owner === "empty") {
        continue;
      }

      const px = this.originX + roomState.bounds.x * cellSize;
      const py =
        this.originY
        + (this.mapModel.height - roomState.bounds.y - roomState.bounds.height) * cellSize;
      const width = roomState.bounds.width * cellSize;
      const height = roomState.bounds.height * cellSize;

      this.graphics.strokeColor = roomState.owner === "player"
        ? new Color(59, 130, 246, 220)
        : new Color(245, 158, 11, 210);
      this.graphics.lineWidth = 3;
      this.graphics.rect(px + 1.5, py + 1.5, width - 3, height - 3);
      this.graphics.stroke();
    }
  }

  private drawBeds(): void {
    if (!this.graphics || !this.mapModel) {
      return;
    }

    const cellSize = this.getRenderCellSize();
    for (const roomState of this.roomStates) {
      const px = this.originX + roomState.bedCell.x * cellSize;
      const py = this.originY + (this.mapModel.height - roomState.bedCell.y - 1) * cellSize;

      if (!roomState.isDoorClosed) {
        this.graphics.strokeColor = new Color(14, 165, 233, 190);
        this.graphics.lineWidth = 2;
        this.graphics.roundRect(
          px + cellSize * 0.06,
          py + cellSize * 0.06,
          cellSize * 0.88,
          cellSize * 0.88,
          cellSize * 0.12,
        );
        this.graphics.stroke();
      }

      this.graphics.fillColor = new Color(71, 85, 105, 235);
      this.graphics.roundRect(
        px + cellSize * 0.08,
        py + cellSize * 0.14,
        cellSize * 0.72,
        cellSize * 0.58,
        cellSize * 0.12,
      );
      this.graphics.fill();

      this.graphics.fillColor = new Color(226, 232, 240, 255);
      this.graphics.roundRect(
        px + cellSize * 0.14,
        py + cellSize * 0.2,
        cellSize * 0.58,
        cellSize * 0.46,
        cellSize * 0.1,
      );
      this.graphics.fill();

      this.graphics.fillColor = new Color(248, 250, 252, 255);
      this.graphics.roundRect(
        px + cellSize * 0.18,
        py + cellSize * 0.5,
        cellSize * 0.26,
        cellSize * 0.12,
        cellSize * 0.05,
      );
      this.graphics.fill();

      const accessPx = this.originX + roomState.bedAccessCell.x * cellSize;
      const accessPy =
        this.originY + (this.mapModel.height - roomState.bedAccessCell.y - 1) * cellSize;

      if (!roomState.isDoorClosed) {
        this.graphics.strokeColor = new Color(250, 204, 21, 210);
        this.graphics.lineWidth = 2;
        this.graphics.rect(
          accessPx + cellSize * 0.18,
          accessPy + cellSize * 0.18,
          cellSize * 0.64,
          cellSize * 0.64,
        );
        this.graphics.stroke();
      }
    }
  }

  private drawDoorStates(): void {
    if (!this.graphics || !this.mapModel) {
      return;
    }

    const cellSize = this.getRenderCellSize();
    for (const roomState of this.roomStates) {
      const px = this.originX + roomState.doorCell.x * cellSize;
      const py = this.originY + (this.mapModel.height - roomState.doorCell.y - 1) * cellSize;

      if (roomState.isDoorClosed) {
        this.graphics.fillColor = roomState.owner === "player"
          ? new Color(37, 99, 235, 220)
          : new Color(146, 64, 14, 220);
        this.graphics.rect(px + 4, py + 4, cellSize - 8, cellSize - 8);
        this.graphics.fill();
      }

      if (roomState.ownerActorId && roomState.doorHp < roomState.doorMaxHp) {
        const ratio = Math.max(0, roomState.doorHp) / roomState.doorMaxHp;
        this.graphics.fillColor = new Color(15, 23, 42, 220);
        this.graphics.rect(px + 2, py + cellSize - 6, cellSize - 4, 4);
        this.graphics.fill();

        this.graphics.fillColor = ratio > 0.4
          ? new Color(250, 204, 21, 230)
          : new Color(248, 113, 113, 230);
        this.graphics.rect(px + 2, py + cellSize - 6, (cellSize - 4) * ratio, 4);
        this.graphics.fill();
      }
    }
  }

  private drawPreview(): void {
    if (!this.graphics || !this.mapModel || !this.preview) {
      return;
    }

    const cellSize = this.getRenderCellSize();
    const previewColor = this.preview.ok
      ? new Color(52, 211, 153, 110)
      : new Color(248, 113, 113, 120);

    for (const cell of this.preview.cells) {
      const px = this.originX + cell.x * cellSize;
      const py = this.originY + (this.mapModel.height - cell.y - 1) * cellSize;

      this.graphics.fillColor = previewColor;
      this.graphics.rect(px + 1, py + 1, cellSize - 2, cellSize - 2);
      this.graphics.fill();
    }
  }

  private drawActors(): void {
    if (!this.graphics || !this.mapModel) {
      return;
    }

    const cellSize = this.getRenderCellSize();
    for (const actor of this.actors) {
      const centerX = this.originX + (actor.x + 0.5) * cellSize;
      const centerY = this.originY + (this.mapModel.height - actor.y - 0.5) * cellSize;

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
          centerX - cellSize * 0.4,
          centerY - cellSize * 0.16,
          cellSize * 0.8,
          cellSize * 0.32,
          cellSize * 0.12,
        );
        this.graphics.fill();
        continue;
      }

      if (actor.canLieDown) {
        this.graphics.strokeColor = actor.kind === "player"
          ? new Color(37, 99, 235, 220)
          : new Color(245, 158, 11, 220);
        this.graphics.lineWidth = 2;
        this.graphics.circle(centerX, centerY, cellSize * 0.34);
        this.graphics.stroke();
      }

      this.graphics.fillColor = actor.kind === "player"
        ? new Color(29, 78, 216, 235)
        : new Color(234, 88, 12, 228);
      this.graphics.circle(centerX, centerY, cellSize * 0.24);
      this.graphics.fill();
    }
  }

  private drawGhost(): void {
    if (!this.graphics || !this.mapModel || !this.ghostState || !this.ghostState.active) {
      return;
    }

    const cellSize = this.getRenderCellSize();
    const centerX = this.originX + (this.ghostState.x + 0.5) * cellSize;
    const centerY = this.originY + (this.mapModel.height - this.ghostState.y - 0.5) * cellSize;

    this.graphics.fillColor = this.ghostState.mode === "attack_door"
      ? new Color(153, 27, 27, 240)
      : this.ghostState.mode === "chase"
      ? new Color(220, 38, 38, 240)
      : new Color(190, 24, 93, 230);
    this.graphics.circle(centerX, centerY, cellSize * 0.3);
    this.graphics.fill();

    this.graphics.strokeColor = new Color(15, 23, 42, 220);
    this.graphics.lineWidth = 2;
    this.graphics.circle(centerX, centerY, cellSize * 0.3);
    this.graphics.stroke();
  }

  private drawBackdrop(): void {
    if (!this.graphics) {
      return;
    }

    this.graphics.fillColor = new Color(198, 208, 221, 255);
    this.graphics.rect(
      -this.viewportWidth * 0.5,
      -this.viewportHeight * 0.5,
      this.viewportWidth,
      this.viewportHeight,
    );
    this.graphics.fill();

    this.graphics.fillColor = new Color(184, 196, 211, 255);
    this.graphics.rect(
      -this.viewportWidth * 0.5,
      -this.viewportHeight * 0.18,
      this.viewportWidth,
      this.viewportHeight * 0.36,
    );
    this.graphics.fill();
  }

  private updateViewport(): void {
    if (!this.transform) {
      return;
    }

    const parentTransform = this.node.parent?.getComponent(UITransform);
    const width = parentTransform?.contentSize.width ?? this.transform.contentSize.width;
    const height = parentTransform?.contentSize.height ?? this.transform.contentSize.height;

    this.viewportWidth = width;
    this.viewportHeight = height;
    this.transform.setContentSize(width, height);
  }

  private clampCameraCenter(center: GridCoord): GridCoord {
    if (!this.mapModel) {
      return center;
    }

    const cellSize = this.getRenderCellSize();
    const halfViewWidthInCells = this.viewportWidth / cellSize * 0.5;
    const halfViewHeightInCells = this.viewportHeight / cellSize * 0.5;
    const minX = halfViewWidthInCells - 0.5;
    const maxX = this.mapModel.width - halfViewWidthInCells - 0.5;
    const minY = halfViewHeightInCells - 0.5;
    const maxY = this.mapModel.height - halfViewHeightInCells - 0.5;

    if (minX > maxX || minY > maxY) {
      return {
        x: (this.mapModel.width - 1) * 0.5,
        y: (this.mapModel.height - 1) * 0.5,
      };
    }

    return {
      x: Math.min(Math.max(center.x, minX), maxX),
      y: Math.min(Math.max(center.y, minY), maxY),
    };
  }
}
