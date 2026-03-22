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
  AttackEffectState,
  ActorRuntimeState,
  GhostRuntimeState,
  GridCoord,
  MapCellState,
  PlacedStructureRuntimeState,
  PlacementValidationResult,
  RoomRuntimeState,
  UpgradePulseState,
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
  private placedStructures = new Map<string, PlacedStructureRuntimeState>();
  private upgradePulses: UpgradePulseState[] = [];
  private attackEffects: AttackEffectState[] = [];
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
    placedStructures: PlacedStructureRuntimeState[] = [],
    upgradePulses: UpgradePulseState[] = [],
    attackEffects: AttackEffectState[] = [],
  ): void {
    this.roomStates = roomStates;
    this.actors = actors;
    this.ghostState = ghostState;
    this.placedStructures = new Map(
      placedStructures.map((structure) => [structure.instanceId, structure]),
    );
    this.upgradePulses = upgradePulses;
    this.attackEffects = attackEffects;
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
    this.drawUpgradePulses();
    this.drawPreview();
    this.drawActors();
    this.drawAttackEffects();
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
      this.drawPlacedStructure(cell, px, py, cellSize);
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

  private drawPlacedStructure(cell: MapCellState, px: number, py: number, cellSize: number): void {
    if (!this.graphics || !cell.occupantId) {
      return;
    }

    const structure = this.placedStructures.get(cell.occupantId);
    if (!structure) {
      this.graphics.fillColor = new Color(45, 125, 255, 190);
      this.graphics.rect(
        px + cellSize * 0.18,
        py + cellSize * 0.18,
        cellSize * 0.64,
        cellSize * 0.64,
      );
      this.graphics.fill();
      return;
    }

    switch (structure.optionId) {
      case "monitor":
        this.drawMonitor(px, py, cellSize, structure.level);
        return;
      case "medicine_cart":
        this.drawMedicineCart(px, py, cellSize, structure.level);
        return;
      case "screen":
        this.drawScreen(px, py, cellSize, structure.level);
        return;
      case "sedative_bottle":
        this.drawSedativeBottle(px, py, cellSize, structure.level);
        return;
      case "electro_device":
        this.drawElectroDevice(px, py, cellSize, structure.level);
        return;
      default:
        this.graphics.fillColor = new Color(45, 125, 255, 190);
        this.graphics.rect(
          px + cellSize * 0.18,
          py + cellSize * 0.18,
          cellSize * 0.64,
          cellSize * 0.64,
        );
        this.graphics.fill();
    }
  }

  private drawMonitor(px: number, py: number, cellSize: number, level: number): void {
    if (!this.graphics) {
      return;
    }

    this.graphics.fillColor = new Color(28, 100, 242, 210);
    this.graphics.roundRect(
      px + cellSize * 0.2,
      py + cellSize * 0.24,
      cellSize * 0.58,
      cellSize * 0.42,
      cellSize * 0.08,
    );
    this.graphics.fill();

    this.graphics.fillColor = new Color(191, 219, 254, 240);
    this.graphics.roundRect(
      px + cellSize * 0.26,
      py + cellSize * 0.3,
      cellSize * 0.46,
      cellSize * 0.3,
      cellSize * 0.05,
    );
    this.graphics.fill();

    this.graphics.fillColor = new Color(30, 41, 59, 220);
    this.graphics.rect(px + cellSize * 0.42, py + cellSize * 0.16, cellSize * 0.12, cellSize * 0.08);
    this.graphics.fill();

    this.drawStructureLevelDots(px, py, cellSize, level);
  }

  private drawMedicineCart(px: number, py: number, cellSize: number, level: number): void {
    if (!this.graphics) {
      return;
    }

    this.graphics.fillColor = new Color(249, 115, 22, 220);
    this.graphics.roundRect(
      px + cellSize * 0.18,
      py + cellSize * 0.22,
      cellSize * 0.64,
      cellSize * 0.44,
      cellSize * 0.08,
    );
    this.graphics.fill();

    this.graphics.fillColor = new Color(255, 237, 213, 245);
    this.graphics.rect(px + cellSize * 0.24, py + cellSize * 0.5, cellSize * 0.52, cellSize * 0.08);
    this.graphics.fill();

    this.graphics.strokeColor = new Color(120, 53, 15, 220);
    this.graphics.lineWidth = 2;
    this.graphics.moveTo(px + cellSize * 0.28, py + cellSize * 0.22);
    this.graphics.lineTo(px + cellSize * 0.28, py + cellSize * 0.14);
    this.graphics.moveTo(px + cellSize * 0.72, py + cellSize * 0.22);
    this.graphics.lineTo(px + cellSize * 0.72, py + cellSize * 0.14);
    this.graphics.stroke();

    this.drawStructureLevelDots(px, py, cellSize, level);
  }

  private drawScreen(px: number, py: number, cellSize: number, level: number): void {
    if (!this.graphics) {
      return;
    }

    this.graphics.fillColor = new Color(20, 184, 166, 215);
    for (let index = 0; index < 3; index += 1) {
      this.graphics.roundRect(
        px + cellSize * (0.18 + index * 0.2),
        py + cellSize * 0.2,
        cellSize * 0.16,
        cellSize * 0.52,
        cellSize * 0.04,
      );
      this.graphics.fill();
    }

    this.graphics.strokeColor = new Color(15, 118, 110, 220);
    this.graphics.lineWidth = 2;
    this.graphics.moveTo(px + cellSize * 0.18, py + cellSize * 0.18);
    this.graphics.lineTo(px + cellSize * 0.78, py + cellSize * 0.18);
    this.graphics.stroke();

    this.drawStructureLevelDots(px, py, cellSize, level);
  }

  private drawSedativeBottle(px: number, py: number, cellSize: number, level: number): void {
    if (!this.graphics) {
      return;
    }

    this.graphics.fillColor = new Color(30, 64, 175, 220);
    this.graphics.roundRect(
      px + cellSize * 0.32,
      py + cellSize * 0.2,
      cellSize * 0.32,
      cellSize * 0.42,
      cellSize * 0.08,
    );
    this.graphics.fill();

    this.graphics.fillColor = new Color(191, 219, 254, 230);
    this.graphics.roundRect(
      px + cellSize * 0.36,
      py + cellSize * 0.28,
      cellSize * 0.24,
      cellSize * 0.24,
      cellSize * 0.05,
    );
    this.graphics.fill();

    this.graphics.fillColor = new Color(148, 163, 184, 245);
    this.graphics.rect(
      px + cellSize * 0.4,
      py + cellSize * 0.62,
      cellSize * 0.16,
      cellSize * 0.08,
    );
    this.graphics.fill();

    this.graphics.fillColor = new Color(250, 204, 21, 235);
    this.graphics.circle(px + cellSize * 0.68, py + cellSize * 0.34, cellSize * 0.07);
    this.graphics.fill();

    this.drawStructureLevelDots(px, py, cellSize, level);
  }

  private drawElectroDevice(px: number, py: number, cellSize: number, level: number): void {
    if (!this.graphics) {
      return;
    }

    this.graphics.fillColor = new Color(22, 101, 52, 220);
    this.graphics.roundRect(
      px + cellSize * 0.22,
      py + cellSize * 0.22,
      cellSize * 0.56,
      cellSize * 0.42,
      cellSize * 0.08,
    );
    this.graphics.fill();

    this.graphics.fillColor = new Color(187, 247, 208, 235);
    this.graphics.roundRect(
      px + cellSize * 0.28,
      py + cellSize * 0.28,
      cellSize * 0.44,
      cellSize * 0.16,
      cellSize * 0.05,
    );
    this.graphics.fill();

    this.graphics.strokeColor = new Color(59, 130, 246, 235);
    this.graphics.lineWidth = 3;
    this.graphics.moveTo(px + cellSize * 0.34, py + cellSize * 0.72);
    this.graphics.lineTo(px + cellSize * 0.42, py + cellSize * 0.56);
    this.graphics.lineTo(px + cellSize * 0.5, py + cellSize * 0.7);
    this.graphics.lineTo(px + cellSize * 0.58, py + cellSize * 0.54);
    this.graphics.lineTo(px + cellSize * 0.66, py + cellSize * 0.68);
    this.graphics.stroke();

    this.drawStructureLevelDots(px, py, cellSize, level);
  }

  private drawStructureLevelDots(px: number, py: number, cellSize: number, level: number): void {
    if (!this.graphics) {
      return;
    }

    for (let index = 0; index < level; index += 1) {
      this.graphics.fillColor = new Color(255, 255, 255, 230);
      this.graphics.circle(
        px + cellSize * (0.24 + index * 0.12),
        py + cellSize * 0.78,
        cellSize * 0.038,
      );
      this.graphics.fill();
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
      const bedAccent = this.getBedAccentColor(roomState.bedLevel);

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

      this.graphics.fillColor = roomState.bedLevel >= 3
        ? new Color(51, 65, 85, 240)
        : new Color(71, 85, 105, 235);
      this.graphics.roundRect(
        px + cellSize * 0.08,
        py + cellSize * 0.14,
        cellSize * 0.72,
        cellSize * 0.58,
        cellSize * 0.12,
      );
      this.graphics.fill();

      this.graphics.fillColor = roomState.bedLevel >= 2
        ? bedAccent
        : new Color(226, 232, 240, 255);
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

      if (roomState.bedLevel >= 2) {
        this.graphics.strokeColor = new Color(255, 255, 255, 210);
        this.graphics.lineWidth = 2;
        this.graphics.roundRect(
          px + cellSize * 0.14,
          py + cellSize * 0.2,
          cellSize * 0.58,
          cellSize * 0.46,
          cellSize * 0.1,
        );
        this.graphics.stroke();
      }

      this.drawLevelPips(
        px + cellSize * 0.16,
        py + cellSize * 0.82,
        roomState.bedLevel,
        cellSize,
        roomState.bedLevel >= 2 ? new Color(255, 255, 255, 235) : new Color(203, 213, 225, 235),
      );

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
      const doorInset = Math.max(4, 10 - roomState.doorLevel);
      const doorColor = this.getDoorColor(roomState);

      if (roomState.isDoorClosed) {
        this.graphics.fillColor = doorColor;
        this.graphics.roundRect(
          px + doorInset,
          py + doorInset,
          cellSize - doorInset * 2,
          cellSize - doorInset * 2,
          cellSize * 0.08,
        );
        this.graphics.fill();

        if (roomState.doorLevel >= 2) {
          this.graphics.strokeColor = new Color(255, 255, 255, 180);
          this.graphics.lineWidth = roomState.doorLevel >= 4 ? 3 : 2;
          this.graphics.roundRect(
            px + doorInset,
            py + doorInset,
            cellSize - doorInset * 2,
            cellSize - doorInset * 2,
            cellSize * 0.08,
          );
          this.graphics.stroke();
        }
      } else {
        this.graphics.strokeColor = doorColor;
        this.graphics.lineWidth = 2;
        this.graphics.roundRect(
          px + cellSize * 0.18,
          py + cellSize * 0.18,
          cellSize * 0.64,
          cellSize * 0.64,
          cellSize * 0.08,
        );
        this.graphics.stroke();
      }

      this.drawLevelPips(
        px + cellSize * 0.2,
        py + cellSize * 0.14,
        roomState.doorLevel,
        cellSize,
        new Color(255, 244, 214, 230),
      );

      if (roomState.isDoorClosed) {
        this.graphics.fillColor = new Color(255, 244, 214, 210);
        this.graphics.circle(px + cellSize * 0.72, py + cellSize * 0.5, cellSize * 0.05);
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

  private drawUpgradePulses(): void {
    if (!this.graphics || !this.mapModel || this.upgradePulses.length === 0) {
      return;
    }

    const cellSize = this.getRenderCellSize();
    for (const pulse of this.upgradePulses) {
      const progress = 1 - pulse.ttl / pulse.duration;
      const centerX = this.originX + (pulse.cell.x + 0.5) * cellSize;
      const centerY = this.originY + (this.mapModel.height - pulse.cell.y - 0.5) * cellSize;
      const baseColor = pulse.kind === "bed"
        ? new Color(56, 189, 248, 255)
        : new Color(250, 204, 21, 255);
      const alpha = Math.max(0, 220 * (1 - progress));
      const radius = cellSize * (0.26 + progress * 0.28);

      this.graphics.strokeColor = new Color(baseColor.r, baseColor.g, baseColor.b, alpha);
      this.graphics.lineWidth = 4 - progress * 2;
      this.graphics.circle(centerX, centerY, radius);
      this.graphics.stroke();

      this.graphics.fillColor = new Color(baseColor.r, baseColor.g, baseColor.b, alpha * 0.12);
      this.graphics.circle(centerX, centerY, radius * 0.82);
      this.graphics.fill();
    }
  }

  private drawAttackEffects(): void {
    if (!this.graphics || !this.mapModel || this.attackEffects.length === 0) {
      return;
    }

    const cellSize = this.getRenderCellSize();
    for (const effect of this.attackEffects) {
      const progress = 1 - effect.ttl / effect.duration;
      const sourceX = this.originX + (effect.sourceCell.x + 0.5) * cellSize;
      const sourceY = this.originY + (this.mapModel.height - effect.sourceCell.y - 0.5) * cellSize;
      const targetX = this.originX + (effect.targetX + 0.5) * cellSize;
      const targetY = this.originY + (this.mapModel.height - effect.targetY - 0.5) * cellSize;
      const currentX = sourceX + (targetX - sourceX) * progress;
      const currentY = sourceY + (targetY - sourceY) * progress;

      if (effect.kind === "pill") {
        this.graphics.fillColor = new Color(250, 204, 21, 235);
        this.graphics.circle(currentX, currentY, cellSize * 0.08);
        this.graphics.fill();
        continue;
      }

      this.graphics.strokeColor = new Color(96, 165, 250, 235);
      this.graphics.lineWidth = 4;
      this.graphics.moveTo(sourceX, sourceY);
      this.graphics.lineTo(
        sourceX + (currentX - sourceX) * 0.42,
        sourceY + (currentY - sourceY) * 1.08,
      );
      this.graphics.lineTo(
        sourceX + (currentX - sourceX) * 0.68,
        sourceY + (currentY - sourceY) * 0.64,
      );
      this.graphics.lineTo(currentX, currentY);
      this.graphics.stroke();
    }
  }

  private getBedAccentColor(level: number): Color {
    switch (level) {
      case 4:
        return new Color(125, 211, 252, 255);
      case 3:
        return new Color(147, 197, 253, 255);
      case 2:
        return new Color(191, 219, 254, 255);
      default:
        return new Color(226, 232, 240, 255);
    }
  }

  private getDoorColor(roomState: RoomRuntimeState): Color {
    if (roomState.owner === "player") {
      switch (roomState.doorLevel) {
        case 4:
          return new Color(29, 78, 216, 235);
        case 3:
          return new Color(37, 99, 235, 228);
        case 2:
          return new Color(59, 130, 246, 222);
        default:
          return new Color(96, 165, 250, 220);
      }
    }

    switch (roomState.doorLevel) {
      case 4:
        return new Color(120, 53, 15, 235);
      case 3:
        return new Color(146, 64, 14, 230);
      case 2:
        return new Color(180, 83, 9, 225);
      default:
        return new Color(194, 101, 27, 220);
    }
  }

  private drawLevelPips(
    startX: number,
    centerY: number,
    level: number,
    cellSize: number,
    color: Color,
  ): void {
    if (!this.graphics) {
      return;
    }

    for (let index = 0; index < level; index += 1) {
      this.graphics.fillColor = color;
      this.graphics.circle(
        startX + index * cellSize * 0.11,
        centerY,
        cellSize * 0.032,
      );
      this.graphics.fill();
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

    this.graphics.fillColor = new Color(15, 23, 42, 220);
    this.graphics.roundRect(
      centerX - cellSize * 0.28,
      centerY + cellSize * 0.38,
      cellSize * 0.56,
      cellSize * 0.08,
      cellSize * 0.03,
    );
    this.graphics.fill();

    const hpRatio = this.ghostState.maxHp > 0
      ? Math.max(0, this.ghostState.hp) / this.ghostState.maxHp
      : 0;
    this.graphics.fillColor = hpRatio > 0.45
      ? new Color(34, 197, 94, 235)
      : new Color(248, 113, 113, 235);
    this.graphics.roundRect(
      centerX - cellSize * 0.28,
      centerY + cellSize * 0.38,
      cellSize * 0.56 * hpRatio,
      cellSize * 0.08,
      cellSize * 0.03,
    );
    this.graphics.fill();
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
