import {
  Color,
  Component,
  director,
  EventTouch,
  Graphics,
  Label,
  Node,
  Vec2,
  UITransform,
  Vec3,
  _decorator,
} from "cc";
import { WARD_MVP_MAP } from "../../configs/wardMapSample";
import { PlacementSystem } from "../../gameplay/room/PlacementSystem";
import { RoomMapModel } from "../../gameplay/room/RoomMapModel";
import {
  AttackEffectState,
  ActorRuntimeState,
  GhostRuntimeState,
  GridCoord,
  PlacedStructureRuntimeState,
  PlacementItemDefinition,
  PlacementValidationResult,
  RoomRuntimeState,
  RoomOccupantKind,
  UpgradePulseState,
} from "../../gameplay/room/map/MapTypes";
import { BattleMapView } from "./BattleMapView";

const { ccclass, requireComponent } = _decorator;

const SETUP_DURATION = 30;
const ACTOR_MOVE_SPEED = 3.35;
const GHOST_MOVE_SPEED = 4.8;
const GHOST_KILL_RADIUS = 0.72;
const GHOST_REPATH_INTERVAL = 0.35;
const GHOST_ATTACK_INTERVAL = 0.75;
const GHOST_ATTACK_DAMAGE = 1;
const GHOST_MAX_HP = 24;
const GHOST_SPAWN: GridCoord = { x: 1, y: 8 };
const JOYSTICK_RADIUS = 56;
const JOYSTICK_KNOB_RADIUS = 24;
const JOYSTICK_DEAD_ZONE = 0.18;
const JOYSTICK_RESPONSE_EXPONENT = 1.6;
const JOYSTICK_CAPTURE_LEFT_RATIO = 0.58;
const PLAYER_MOVE_RESPONSE = 10;
const HOME_SCENE_NAME = "home";
const PLAYER_BED_NEAR_RADIUS = 1.05;
const LIE_DOWN_DISTANCE = 1.05;
const PLAYER_START_COINS = 0;
const PLAYER_COIN_INCOME_INTERVAL = 1;
const DOOR_REPAIR_DURATION = 10;
const DOOR_REPAIR_TICK_INTERVAL = 1;
const CAMERA_PAN_DRAG_THRESHOLD = 4;
const MAX_STRUCTURE_LEVEL = 4;
const STRUCTURE_UPGRADE_COST_MULTIPLIERS = [1, 1.5, 2.5];
const SCREEN_ATTACK_INTERVAL_BONUS_PER_LEVEL = 0.18;
const UPGRADE_PULSE_DURATION = 0.55;
const ATTACK_EFFECT_DURATION = 0.25;
const SEDATIVE_ATTACK_INTERVAL = 1.6;
const ELECTRO_ATTACK_INTERVAL = 0.95;

const DOOR_LEVEL_CONFIG = [
  { level: 1, maxHp: 8, upgradeCost: 8, repairCostPerSecond: 1, repairAmountPerSecond: 2 },
  { level: 2, maxHp: 12, upgradeCost: 12, repairCostPerSecond: 2, repairAmountPerSecond: 3 },
  { level: 3, maxHp: 16, upgradeCost: 18, repairCostPerSecond: 3, repairAmountPerSecond: 4 },
  { level: 4, maxHp: 22, upgradeCost: null, repairCostPerSecond: 4, repairAmountPerSecond: 5 },
] as const;

const BED_LEVEL_CONFIG = [
  { level: 1, incomePerSecond: 1, upgradeCost: 6 },
  { level: 2, incomePerSecond: 2, upgradeCost: 10 },
  { level: 3, incomePerSecond: 3, upgradeCost: 14 },
  { level: 4, incomePerSecond: 5, upgradeCost: null },
] as const;

interface PlaceableOption {
  id: string;
  label: string;
  baseCost: number;
  item: PlacementItemDefinition;
}

interface PlacementMenuAction {
  kind: "place" | "upgrade" | "close";
  label: string;
  optionId?: string;
  structureId?: string;
}

interface OverlayButtonStyle {
  width?: number;
  height?: number;
  radius?: number;
  fontSize?: number;
  lineHeight?: number;
  fillColor?: Color;
  textColor?: Color;
}

const PLACEABLE_OPTIONS: PlaceableOption[] = [
  {
    id: "monitor",
    label: "监护仪",
    baseCost: 8,
    item: { id: "monitor", width: 1, height: 1, blocksMovement: false },
  },
  {
    id: "medicine_cart",
    label: "药车",
    baseCost: 10,
    item: { id: "medicine_cart", width: 1, height: 1, blocksMovement: true },
  },
  {
    id: "screen",
    label: "屏风",
    baseCost: 6,
    item: { id: "screen", width: 1, height: 1, blocksMovement: true },
  },
  {
    id: "sedative_bottle",
    label: "镇静药",
    baseCost: 12,
    item: { id: "sedative_bottle", width: 1, height: 1, blocksMovement: false },
  },
  {
    id: "electro_device",
    label: "电击仪",
    baseCost: 14,
    item: { id: "electro_device", width: 1, height: 1, blocksMovement: false },
  },
];

const AI_SPAWNS: GridCoord[] = [
  { x: 8, y: 8 },
  { x: 11, y: 8 },
  { x: 14, y: 8 },
  { x: 17, y: 8 },
  { x: 20, y: 8 },
];

@ccclass("BattleMapDebugController")
@requireComponent(BattleMapView)
export class BattleMapDebugController extends Component {
  private initialSceneName = "";
  private mapModel: RoomMapModel | null = null;
  private placementSystem: PlacementSystem | null = null;
  private mapView: BattleMapView | null = null;
  private roomStates: RoomRuntimeState[] = [];
  private actors: ActorRuntimeState[] = [];
  private ghostState: GhostRuntimeState = {
    active: false,
    x: GHOST_SPAWN.x,
    y: GHOST_SPAWN.y,
    maxHp: GHOST_MAX_HP,
    hp: GHOST_MAX_HP,
    targetActorId: null,
    targetRoomId: null,
    mode: "inactive",
  };
  private ghostPath: GridCoord[] = [];
  private ghostPatrolDirection = 1;
  private ghostRepathTimer = 0;
  private ghostAttackTimer = 0;
  private setupCountdown = SETUP_DURATION;
  private hudLabel: Label | null = null;
  private goldLabel: Label | null = null;
  private centerCountdownLabel: Label | null = null;
  private joystickNode: Node | null = null;
  private joystickGraphics: Graphics | null = null;
  private joystickTouchId: number | null = null;
  private joystickVector = { x: 0, y: 0 };
  private playerMoveVector = { x: 0, y: 0 };
  private cameraPanTouchId: number | null = null;
  private cameraPanMoved = false;
  private cameraPanStartUiLocation: { x: number; y: number } | null = null;
  private lastCameraPanUiLocation: { x: number; y: number } | null = null;
  private lieDownButtonNode: Node | null = null;
  private repairButtonNode: Node | null = null;
  private placementMenuNode: Node | null = null;
  private placementMenuPanelNode: Node | null = null;
  private placementMenuLabel: Label | null = null;
  private placementMenuButtons: Node[] = [];
  private placementMenuButtonLabels: Label[] = [];
  private placementMenuCancelButton: Node | null = null;
  private placementMenuActions: PlacementMenuAction[] = [];
  private placementOriginCell: GridCoord | null = null;
  private placementPreview: PlacementValidationResult | null = null;
  private placementSequence = 0;
  private placedStructures = new Map<string, PlacedStructureRuntimeState>();
  private playerCoins = PLAYER_START_COINS;
  private playerCoinIncomeTimer = PLAYER_COIN_INCOME_INTERVAL;
  private activeDoorRepairRoomId: string | null = null;
  private activeDoorRepairRemaining = 0;
  private activeDoorRepairTickTimer = DOOR_REPAIR_TICK_INTERVAL;
  private upgradePulses: UpgradePulseState[] = [];
  private attackEffects: AttackEffectState[] = [];
  private sedativeAttackTimer = SEDATIVE_ATTACK_INTERVAL;
  private electroAttackTimer = ELECTRO_ATTACK_INTERVAL;
  private isGameOver = false;
  private isVictory = false;
  private gameOverOverlay: Node | null = null;
  private gameOverPanelNode: Node | null = null;
  private gameOverHomeButtonNode: Node | null = null;
  private gameOverReplayButtonNode: Node | null = null;
  private victoryOverlay: Node | null = null;
  private victoryHomeButtonNode: Node | null = null;
  private victoryReplayButtonNode: Node | null = null;

  start(): void {
    this.initialSceneName = director.getScene()?.name ?? "";
    this.mapView = this.getComponent(BattleMapView);
    this.ensureHud();
    this.ensureGoldHud();
    this.ensureCenterCountdown();
    this.ensureJoystick();
    this.ensureLieDownButton();
    this.ensureRepairButton();
    this.ensurePlacementMenu();
    this.ensureGameOverOverlay();
    this.ensureVictoryOverlay();
    this.layoutOverlayNodes();
    this.bindInput();
    this.resetRunState();
    this.scheduleOnce(() => {
      this.layoutOverlayNodes();
      this.refreshCamera();
      this.refreshLieDownButton();
      this.mapView?.setSimulationState(
        this.roomStates,
        this.actors,
        this.ghostState,
        Array.from(this.placedStructures.values()),
        this.upgradePulses,
        this.attackEffects,
      );
    }, 0);
  }

  private resetRunState(): void {
    this.mapModel = new RoomMapModel(WARD_MVP_MAP);
    this.placementSystem = new PlacementSystem(this.mapModel);
    this.roomStates = this.createRoomStates();
    this.actors = this.createActors();
    this.placedStructures.clear();
    this.upgradePulses = [];
    this.attackEffects = [];
    this.placementSequence = 0;
    this.playerCoins = PLAYER_START_COINS;
    this.playerCoinIncomeTimer = PLAYER_COIN_INCOME_INTERVAL;
    this.activeDoorRepairRoomId = null;
    this.activeDoorRepairRemaining = 0;
    this.activeDoorRepairTickTimer = DOOR_REPAIR_TICK_INTERVAL;
    this.sedativeAttackTimer = SEDATIVE_ATTACK_INTERVAL;
    this.electroAttackTimer = ELECTRO_ATTACK_INTERVAL;
    this.setupCountdown = SETUP_DURATION;
    this.isGameOver = false;
    this.isVictory = false;
    this.ghostState = {
      active: false,
      x: GHOST_SPAWN.x,
      y: GHOST_SPAWN.y,
      maxHp: GHOST_MAX_HP,
      hp: GHOST_MAX_HP,
      targetActorId: null,
      targetRoomId: null,
      mode: "inactive",
    };
    this.ghostPath = [];
    this.ghostPatrolDirection = 1;
    this.ghostRepathTimer = 0;
    this.ghostAttackTimer = 0;
    for (const room of this.roomStates) {
      this.mapModel.setRoomFloorBuildable(room.roomId, false);
    }

    this.mapView?.setMapModel(this.mapModel);
    const player = this.getPlayerActor();
    if (player) {
      this.mapView?.setCameraCenter(player.x, player.y, false);
    }
    this.mapView?.setSimulationState(
      this.roomStates,
      this.actors,
      this.ghostState,
      Array.from(this.placedStructures.values()),
      this.upgradePulses,
      this.attackEffects,
    );
    this.closePlacementMenu();
    this.clearJoystick();
    this.clearCameraPan();
    if (this.gameOverOverlay) {
      this.gameOverOverlay.active = false;
    }
    if (this.victoryOverlay) {
      this.victoryOverlay.active = false;
    }
    this.refreshCamera();
    this.refreshJoystick();
    this.refreshLieDownButton();
    this.refreshRepairButton();
    this.refreshHud();
    this.refreshGoldHud();
    this.refreshCenterCountdown();
    this.layoutOverlayNodes();
  }

  onDestroy(): void {
    this.unbindInput();
  }

  update(dt: number): void {
    if (this.isGameOver || this.isVictory) {
      this.refreshJoystick();
      this.refreshLieDownButton();
      this.refreshRepairButton();
      this.refreshHud();
      this.refreshGoldHud();
      this.refreshCenterCountdown();
      this.layoutOverlayNodes();
      this.mapView?.setSimulationState(
        this.roomStates,
        this.actors,
        this.ghostState,
        Array.from(this.placedStructures.values()),
        this.upgradePulses,
        this.attackEffects,
      );
      return;
    }

    this.setupCountdown = Math.max(0, this.setupCountdown - dt);

    this.updateActors(dt);
    this.updatePlayerCoinIncome(dt);
    this.updateDoorRepair(dt);
    this.updateUpgradePulses(dt);
    this.updateAttackEffects(dt);
    this.updateGhost(dt);
    this.updateDefenseAttacks(dt);
    if (this.ghostState.active) {
      this.resolveGhostKills();
    }
    this.refreshCamera();
    this.refreshJoystick();
    this.refreshLieDownButton();
    this.refreshRepairButton();
    this.refreshHud();
    this.refreshGoldHud();
    this.refreshCenterCountdown();
    this.layoutOverlayNodes();
    this.mapView?.setSimulationState(
      this.roomStates,
      this.actors,
      this.ghostState,
      Array.from(this.placedStructures.values()),
      this.upgradePulses,
      this.attackEffects,
    );
  }

  private bindInput(): void {
    this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
    this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
  }

  private unbindInput(): void {
    this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
    this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
  }

  private onTouchStart(event: EventTouch): void {
    if (this.isGameOver || this.isVictory) {
      return;
    }

    if (this.isPlacementMenuOpen()) {
      return;
    }

    if (this.isJoystickVisible() && this.tryCaptureJoystick(event)) {
      return;
    }

    if (this.tryStartCameraPan(event)) {
      return;
    }
  }

  private onTouchMove(event: EventTouch): void {
    if (this.isGameOver || this.isVictory) {
      return;
    }

    if (this.isPlacementMenuOpen()) {
      return;
    }

    if (this.joystickTouchId === null || event.getID() !== this.joystickTouchId) {
      if (this.cameraPanTouchId !== null && event.getID() === this.cameraPanTouchId) {
        this.updateCameraPan(event);
      }
      return;
    }

    this.updateJoystickVector(event);
  }

  private onTouchEnd(event: EventTouch): void {
    if (this.isVictory) {
      this.handleVictoryTouch(event);
      return;
    }

    if (this.isGameOver) {
      this.handleGameOverTouch(event);
      return;
    }

    if (this.isPlacementMenuOpen()) {
      this.handlePlacementMenuTouch(event);
      return;
    }

    if (this.joystickTouchId !== null && event.getID() === this.joystickTouchId) {
      this.clearJoystick();
      return;
    }

    if (this.cameraPanTouchId !== null && event.getID() === this.cameraPanTouchId) {
      const shouldConsumeTap = this.cameraPanMoved;
      this.clearCameraPan();
      if (shouldConsumeTap) {
        return;
      }
    }

    const player = this.getPlayerActor();
    if (!player || !player.isAlive) {
      return;
    }

    if (player.isLying) {
      this.handlePlacementTap(player, event);
      return;
    }
  }

  private onTouchCancel(event: EventTouch): void {
    if (this.isGameOver || this.isVictory) {
      return;
    }

    if (this.isPlacementMenuOpen()) {
      return;
    }

    if (this.joystickTouchId !== null && event.getID() === this.joystickTouchId) {
      this.clearJoystick();
    }

    if (this.cameraPanTouchId !== null && event.getID() === this.cameraPanTouchId) {
      this.clearCameraPan();
    }
  }

  private updateActors(dt: number): void {
    for (const actor of this.actors) {
      if (!actor.isAlive || actor.isLying) {
        continue;
      }

      if (actor.kind === "player") {
        this.updatePlayerActor(actor, dt);
        continue;
      }

      const targetRoom = actor.targetRoomId ? this.getRoomById(actor.targetRoomId) : null;
      if (targetRoom?.isDoorClosed && targetRoom.ownerActorId !== actor.id) {
        actor.targetRoomId = null;
        actor.targetBedCell = null;
        actor.path = [];
        actor.phase = "idle";
        actor.canLieDown = false;
        actor.thinkCooldown = actor.kind === "ai" ? this.randomRange(0.3, 1.0) : 0;
      }

      actor.ejectedCooldown = Math.max(0, actor.ejectedCooldown - dt);
      actor.interactCooldown = Math.max(0, actor.interactCooldown - dt);
      actor.thinkCooldown = Math.max(0, actor.thinkCooldown - dt);

      if (actor.phase === "ejected" && actor.ejectedCooldown <= 0) {
        actor.phase = "idle";
      }

      if (actor.path.length > 0) {
        this.moveActorAlongPath(actor, dt);
      } else if (actor.phase === "moving") {
        this.handleActorArrived(actor);
      }

      if (actor.kind === "ai") {
        this.updateAiActor(actor);
      }
    }
  }

  private updatePlayerActor(actor: ActorRuntimeState, dt: number): void {
    const targetRoom = actor.targetRoomId ? this.getRoomById(actor.targetRoomId) : null;
    if (targetRoom?.isDoorClosed && targetRoom.ownerActorId !== actor.id) {
      actor.targetRoomId = null;
      actor.targetBedCell = null;
      actor.canLieDown = false;
    }

    const response = Math.min(1, PLAYER_MOVE_RESPONSE * dt);
    this.playerMoveVector.x += (this.joystickVector.x - this.playerMoveVector.x) * response;
    this.playerMoveVector.y += (this.joystickVector.y - this.playerMoveVector.y) * response;

    const moveX = this.playerMoveVector.x;
    const moveY = this.playerMoveVector.y;
    if (Math.abs(moveX) > 0.01 || Math.abs(moveY) > 0.01) {
      actor.phase = "moving";
      actor.canLieDown = false;
      actor.targetRoomId = null;
      actor.targetBedCell = null;
      this.movePlayerByJoystick(actor, moveX, moveY, dt);
    } else if (actor.phase === "moving") {
      actor.phase = "idle";
    }

    this.updatePlayerBedProximity(actor);
  }

  private updateAiActor(actor: ActorRuntimeState): void {
    if (!actor.isAlive || actor.isLying) {
      return;
    }

    if (actor.phase === "at_bed" && actor.interactCooldown <= 0) {
      this.tryLieDown(actor);
      return;
    }

    if (actor.phase === "idle" && actor.thinkCooldown <= 0) {
      const room = this.pickAiTargetRoom(actor);
      if (room) {
        this.assignActorToRoom(actor, room);
      } else {
        actor.thinkCooldown = this.randomRange(0.5, 1.1);
      }
    }
  }

  private moveActorAlongPath(actor: ActorRuntimeState, dt: number): void {
    const nextCell = actor.path[0];
    const dx = nextCell.x - actor.x;
    const dy = nextCell.y - actor.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.02) {
      actor.x = nextCell.x;
      actor.y = nextCell.y;
      actor.path.shift();
      return;
    }

    const step = Math.min(distance, ACTOR_MOVE_SPEED * dt);
    actor.x += (dx / distance) * step;
    actor.y += (dy / distance) * step;
  }

  private handleActorArrived(actor: ActorRuntimeState): void {
    const room = actor.targetRoomId ? this.getRoomById(actor.targetRoomId) : null;
    if (!room || room.isDoorClosed) {
      actor.phase = "idle";
      actor.canLieDown = false;
      actor.targetRoomId = null;
      actor.targetBedCell = null;
      actor.thinkCooldown = actor.kind === "ai" ? this.randomRange(0.4, 1.0) : 0;
      return;
    }

    const nearBed = Math.abs(actor.x - room.bedAccessCell.x) < 0.1
      && Math.abs(actor.y - room.bedAccessCell.y) < 0.1;
    if (!nearBed) {
      actor.phase = "idle";
      return;
    }

    actor.phase = "at_bed";
    actor.canLieDown = true;
    actor.interactCooldown = actor.kind === "ai" ? this.randomRange(0.45, 1.2) : 0;
  }

  private tryLieDown(actor: ActorRuntimeState): void {
    const room = actor.targetRoomId ? this.getRoomById(actor.targetRoomId) : null;
    if (!room || room.isDoorClosed) {
      actor.phase = "idle";
      actor.canLieDown = false;
      actor.targetRoomId = null;
      actor.targetBedCell = null;
      return;
    }

    const nearBed = this.isActorNearBed(room, actor, LIE_DOWN_DISTANCE);
    if (!nearBed) {
      return;
    }

    room.owner = actor.kind as RoomOccupantKind;
    room.ownerActorId = actor.id;
    room.isDoorClosed = true;
    room.doorHp = room.doorMaxHp;

    actor.x = room.bedCell.x;
    actor.y = room.bedCell.y;
    actor.path = [];
    actor.phase = "lying";
    actor.isLying = true;
    actor.canLieDown = false;

    if (actor.kind === "player") {
      this.mapModel?.setRoomFloorBuildable(room.roomId, true);
      this.clearJoystick();
      this.closePlacementMenu();
    }

    this.resolveRoomLock(room, actor.id);
  }

  private resolveRoomLock(room: RoomRuntimeState, winnerActorId: string): void {
    const doorFront = this.getDoorFrontCell(room);

    for (const actor of this.actors) {
      if (!actor.isAlive || actor.id === winnerActorId || actor.isLying) {
        continue;
      }

      const insideRoom = this.isActorInsideRoom(actor, room);
      const targetingRoom = actor.targetRoomId === room.roomId;
      if (!insideRoom && !targetingRoom) {
        continue;
      }

      if (insideRoom) {
        this.ejectActor(actor, room, doorFront);
        continue;
      }

      actor.targetRoomId = null;
      actor.targetBedCell = null;
      actor.path = [];
      actor.phase = "idle";
      actor.canLieDown = false;
      actor.thinkCooldown = actor.kind === "ai" ? this.randomRange(0.3, 1.0) : 0;
    }
  }

  private ejectActor(actor: ActorRuntimeState, room: RoomRuntimeState, doorFront: GridCoord): void {
    actor.x = doorFront.x;
    actor.y = doorFront.y;
    actor.targetRoomId = null;
    actor.targetBedCell = null;
    actor.path = [];
    actor.phase = "ejected";
    actor.canLieDown = false;
    actor.ejectedCooldown = 0.45;
    actor.thinkCooldown = actor.kind === "ai" ? this.randomRange(0.3, 1.0) : 0;

    if (actor.kind === "player") {
      actor.phase = "idle";
      actor.ejectedCooldown = 0;
    }
  }

  private assignActorToRoom(actor: ActorRuntimeState, room: RoomRuntimeState): void {
    if (!this.mapModel || !actor.isAlive || actor.isLying || room.isDoorClosed) {
      return;
    }

    const start = this.getRoundedActorCell(actor);
    const target = room.bedAccessCell;
    const path = this.findPath(start, target);
    if (!path) {
      actor.phase = "idle";
      actor.targetRoomId = null;
      actor.targetBedCell = null;
      return;
    }

    actor.targetRoomId = room.roomId;
    actor.targetBedCell = room.bedCell;
    actor.path = path;
    actor.phase = path.length === 0 ? "at_bed" : "moving";
    actor.canLieDown = path.length === 0;
    actor.interactCooldown = 0;
  }

  private updateGhost(dt: number): void {
    if (this.setupCountdown > 0) {
      this.ghostState.active = false;
      this.ghostState.mode = "inactive";
      this.ghostState.targetActorId = null;
      this.ghostState.targetRoomId = null;
      this.ghostPath = [];
      this.ghostAttackTimer = 0;
      this.ghostState.x = GHOST_SPAWN.x;
      this.ghostState.y = GHOST_SPAWN.y;
      this.ghostState.hp = this.ghostState.maxHp;
      return;
    }

    if (!this.ghostState.active) {
      this.ghostState.active = true;
      this.ghostState.mode = "patrol";
      this.ghostState.x = GHOST_SPAWN.x;
      this.ghostState.y = GHOST_SPAWN.y;
      this.ghostState.hp = this.ghostState.maxHp;
      this.ghostPath = [];
      this.ghostAttackTimer = 0;
    }

    this.ghostRepathTimer = Math.max(0, this.ghostRepathTimer - dt);
    this.ghostAttackTimer = Math.max(0, this.ghostAttackTimer - dt);

    const breachedOccupant = this.findBreachedRoomOccupant();
    const exposedTarget = this.findNearestExposedPrey();
    const sealedRoom = this.findNearestLockedRoom();
    const reachableTarget = this.findNearestReachableActor();

    if (breachedOccupant) {
      this.ghostState.mode = "chase";
      this.ghostState.targetActorId = breachedOccupant.id;
      this.ghostState.targetRoomId = breachedOccupant.targetRoomId;

      if (this.ghostRepathTimer <= 0 || this.ghostPath.length === 0) {
        const path = this.findPath(
          this.getRoundedGhostCell(),
          this.getRoundedActorCell(breachedOccupant),
        );
        this.ghostPath = path ?? [];
        this.ghostRepathTimer = GHOST_REPATH_INTERVAL;
      }
    } else if (exposedTarget) {
      this.ghostState.mode = "chase";
      this.ghostState.targetActorId = exposedTarget.id;
      this.ghostState.targetRoomId = null;

      if (this.ghostRepathTimer <= 0 || this.ghostPath.length === 0) {
        const path = this.findPath(this.getRoundedGhostCell(), this.getRoundedActorCell(exposedTarget));
        this.ghostPath = path ?? [];
        this.ghostRepathTimer = GHOST_REPATH_INTERVAL;
      }
    } else if (sealedRoom) {
      const doorFront = this.getDoorFrontCell(sealedRoom);
      this.ghostState.mode = "attack_door";
      this.ghostState.targetActorId = sealedRoom.ownerActorId;
      this.ghostState.targetRoomId = sealedRoom.roomId;

      const distanceToDoor = Math.hypot(this.ghostState.x - doorFront.x, this.ghostState.y - doorFront.y);
      if (distanceToDoor <= 0.12) {
        this.ghostPath = [];
        if (this.ghostAttackTimer <= 0) {
          this.ghostAttackTimer = this.getGhostAttackIntervalForRoom(sealedRoom);
          sealedRoom.doorHp = Math.max(0, sealedRoom.doorHp - GHOST_ATTACK_DAMAGE);
          if (sealedRoom.doorHp <= 0) {
            sealedRoom.isDoorClosed = false;
          }
        }
      } else if (this.ghostRepathTimer <= 0 || this.ghostPath.length === 0) {
        const path = this.findPath(this.getRoundedGhostCell(), doorFront);
        this.ghostPath = path ?? [];
        this.ghostRepathTimer = GHOST_REPATH_INTERVAL;
      }
    } else if (reachableTarget) {
      this.ghostState.mode = "chase";
      this.ghostState.targetActorId = reachableTarget.id;
      this.ghostState.targetRoomId = null;

      if (this.ghostRepathTimer <= 0 || this.ghostPath.length === 0) {
        const path = this.findPath(this.getRoundedGhostCell(), this.getRoundedActorCell(reachableTarget));
        this.ghostPath = path ?? [];
        this.ghostRepathTimer = GHOST_REPATH_INTERVAL;
      }
    } else {
      this.ghostState.mode = "patrol";
      this.ghostState.targetActorId = null;
      this.ghostState.targetRoomId = null;

      if (this.ghostPath.length === 0) {
        const patrolTargetX = this.ghostPatrolDirection > 0 ? 24 : 4;
        const path = this.findPath(this.getRoundedGhostCell(), { x: patrolTargetX, y: 8 });
        this.ghostPath = path ?? [];
        this.ghostPatrolDirection *= -1;
      }
    }

    this.moveGhostAlongPath(dt);
  }

  private moveGhostAlongPath(dt: number): void {
    if (this.ghostPath.length === 0) {
      return;
    }

    const nextCell = this.ghostPath[0];
    const dx = nextCell.x - this.ghostState.x;
    const dy = nextCell.y - this.ghostState.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.02) {
      this.ghostState.x = nextCell.x;
      this.ghostState.y = nextCell.y;
      this.ghostPath.shift();
      return;
    }

    const step = Math.min(distance, GHOST_MOVE_SPEED * dt);
    this.ghostState.x += (dx / distance) * step;
    this.ghostState.y += (dy / distance) * step;
  }

  private resolveGhostKills(): void {
    for (const actor of this.actors) {
      if (!actor.isAlive) {
        continue;
      }

      const distance = Math.hypot(this.ghostState.x - actor.x, this.ghostState.y - actor.y);
      if (distance > GHOST_KILL_RADIUS) {
        continue;
      }

      actor.isAlive = false;
      actor.phase = "dead";
      actor.path = [];
      actor.canLieDown = false;
      actor.targetRoomId = null;
      actor.targetBedCell = null;

      if (actor.kind === "player") {
        this.clearJoystick();
        this.clearCameraPan();
        this.triggerGameOver();
      }
    }
  }

  private createRoomStates(): RoomRuntimeState[] {
    if (!this.mapModel) {
      return [];
    }

    const roomIds = [
      "room_top_1",
      "room_top_2",
      "room_top_3",
      "room_bottom_1",
      "room_bottom_2",
      "room_bottom_3",
    ];

    return roomIds.map((roomId, index) => {
      const cells = this.mapModel!.getCellsByRoomId(roomId);
      const bedCell = cells.find((cell) => cell.tags.includes("bed"));
      const doorCell = cells.find((cell) => cell.tileType === "door");
      if (!bedCell || !doorCell) {
        throw new Error(`Room ${roomId} is missing bed or door.`);
      }

      const xs = cells.map((cell) => cell.x);
      const ys = cells.map((cell) => cell.y);

      return {
        roomId,
        label: `病房 ${index + 1}`,
        owner: "empty",
        ownerActorId: null,
        bounds: {
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs) + 1,
          height: Math.max(...ys) - Math.min(...ys) + 1,
        },
        bedCell: { x: bedCell.x, y: bedCell.y },
        bedLevel: 1,
        doorCell: { x: doorCell.x, y: doorCell.y },
        bedAccessCell: { x: bedCell.x + 1, y: bedCell.y },
        doorLevel: 1,
        isDoorClosed: false,
        doorMaxHp: DOOR_LEVEL_CONFIG[0].maxHp,
        doorHp: DOOR_LEVEL_CONFIG[0].maxHp,
      };
    });
  }

  private createActors(): ActorRuntimeState[] {
    const actors: ActorRuntimeState[] = [
      this.createActor("player_1", "你", "player", { x: 5, y: 8 }, 0),
    ];

    for (let i = 0; i < 5; i += 1) {
      actors.push(
        this.createActor(`ai_${i + 1}`, `AI ${i + 1}`, "ai", AI_SPAWNS[i], this.randomRange(0.6, 5.0)),
      );
    }

    return actors;
  }

  private createActor(
    id: string,
    label: string,
    kind: "player" | "ai",
    spawn: GridCoord,
    thinkCooldown: number,
  ): ActorRuntimeState {
    return {
      id,
      label,
      kind,
      x: spawn.x,
      y: spawn.y,
      targetRoomId: null,
      targetBedCell: null,
      path: [],
      phase: "idle",
      isAlive: true,
      isLying: false,
      canLieDown: false,
      thinkCooldown,
      ejectedCooldown: 0,
      interactCooldown: 0,
    };
  }

  private getPlayerActor(): ActorRuntimeState | null {
    return this.actors.find((actor) => actor.kind === "player") ?? null;
  }

  private getRoomById(roomId: string): RoomRuntimeState | null {
    return this.roomStates.find((room) => room.roomId === roomId) ?? null;
  }

  private getRoomStateAtCell(cell: GridCoord): RoomRuntimeState | null {
    return this.roomStates.find((room) =>
      cell.x >= room.bounds.x
      && cell.x < room.bounds.x + room.bounds.width
      && cell.y >= room.bounds.y
      && cell.y < room.bounds.y + room.bounds.height,
    ) ?? null;
  }

  private pickAiTargetRoom(actor: ActorRuntimeState): RoomRuntimeState | null {
    const openRooms = this.roomStates.filter((room) => !room.isDoorClosed);
    if (openRooms.length === 0) {
      return null;
    }

    const preferred = openRooms.filter((room) =>
      room.owner === "empty" || room.ownerActorId === actor.id,
    );
    const source = preferred.length > 0 ? preferred : openRooms;
    return source[Math.floor(Math.random() * source.length)] ?? null;
  }

  private findNearestExposedPrey(): ActorRuntimeState | null {
    let best: ActorRuntimeState | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const actor of this.actors) {
      if (!actor.isAlive || actor.isLying) {
        continue;
      }

      const distance = Math.hypot(this.ghostState.x - actor.x, this.ghostState.y - actor.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = actor;
      }
    }

    return best;
  }

  private findNearestReachableActor(): ActorRuntimeState | null {
    let best: ActorRuntimeState | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const actor of this.actors) {
      if (!actor.isAlive) {
        continue;
      }

      const room = actor.targetRoomId ? this.getRoomById(actor.targetRoomId) : null;
      if (actor.isLying && room?.isDoorClosed) {
        continue;
      }

      const distance = Math.hypot(this.ghostState.x - actor.x, this.ghostState.y - actor.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = actor;
      }
    }

    return best;
  }

  private findBreachedRoomOccupant(): ActorRuntimeState | null {
    let best: ActorRuntimeState | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const room of this.roomStates) {
      if (room.isDoorClosed || !room.ownerActorId) {
        continue;
      }

      const owner = this.actors.find((actor) => actor.id === room.ownerActorId);
      if (!owner || !owner.isAlive) {
        continue;
      }

      const distance = Math.hypot(this.ghostState.x - owner.x, this.ghostState.y - owner.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = owner;
      }
    }

    return best;
  }

  private findNearestLockedRoom(): RoomRuntimeState | null {
    let best: RoomRuntimeState | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const room of this.roomStates) {
      if (!room.isDoorClosed || !room.ownerActorId || room.doorHp <= 0) {
        continue;
      }

      const owner = this.actors.find((actor) => actor.id === room.ownerActorId);
      if (!owner || !owner.isAlive) {
        continue;
      }

      const doorFront = this.getDoorFrontCell(room);
      const distance = Math.hypot(this.ghostState.x - doorFront.x, this.ghostState.y - doorFront.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = room;
      }
    }

    return best;
  }

  private isActorInsideRoom(actor: ActorRuntimeState, room: RoomRuntimeState): boolean {
    return actor.x >= room.bounds.x
      && actor.x < room.bounds.x + room.bounds.width
      && actor.y >= room.bounds.y
      && actor.y < room.bounds.y + room.bounds.height;
  }

  private getDoorFrontCell(room: RoomRuntimeState): GridCoord {
    const corridorAbove = this.mapModel?.getCell(room.doorCell.x, room.doorCell.y + 1);
    if (corridorAbove?.tags.includes("corridor")) {
      return { x: room.doorCell.x, y: room.doorCell.y + 1 };
    }

    return { x: room.doorCell.x, y: room.doorCell.y - 1 };
  }

  private getRoundedActorCell(actor: ActorRuntimeState): GridCoord {
    return {
      x: Math.round(actor.x),
      y: Math.round(actor.y),
    };
  }

  private getRoundedGhostCell(): GridCoord {
    return {
      x: Math.round(this.ghostState.x),
      y: Math.round(this.ghostState.y),
    };
  }

  private isWalkableForPath(cell: GridCoord, goal: GridCoord): boolean {
    if (!this.mapModel) {
      return false;
    }

    if (cell.x === goal.x && cell.y === goal.y) {
      return true;
    }

    const mapCell = this.mapModel.getCell(cell.x, cell.y);
    if (!mapCell) {
      return false;
    }

    if (mapCell.tileType === "door") {
      const room = mapCell.roomId ? this.getRoomById(mapCell.roomId) : null;
      return room ? !room.isDoorClosed : true;
    }

    return mapCell.walkable;
  }

  private findPath(start: GridCoord, goal: GridCoord): GridCoord[] | null {
    if (!this.mapModel) {
      return null;
    }

    if (start.x === goal.x && start.y === goal.y) {
      return [];
    }

    const queue: GridCoord[] = [start];
    const cameFrom = new Map<string, GridCoord | null>();
    cameFrom.set(this.toKey(start), null);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.x === goal.x && current.y === goal.y) {
        break;
      }

      const neighbors: GridCoord[] = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      ];

      for (const neighbor of neighbors) {
        const key = this.toKey(neighbor);
        if (cameFrom.has(key) || !this.isWalkableForPath(neighbor, goal)) {
          continue;
        }

        cameFrom.set(key, current);
        queue.push(neighbor);
      }
    }

    if (!cameFrom.has(this.toKey(goal))) {
      return null;
    }

    const path: GridCoord[] = [];
    let current: GridCoord | null = goal;
    while (current) {
      path.push(current);
      current = cameFrom.get(this.toKey(current)) ?? null;
    }

    path.reverse();
    path.shift();
    return path;
  }

  private toKey(cell: GridCoord): string {
    return `${cell.x},${cell.y}`;
  }

  private getPlaceableOption(optionId: string): PlaceableOption | null {
    return PLACEABLE_OPTIONS.find((entry) => entry.id === optionId) ?? null;
  }

  private getStructureUpgradeCost(structure: PlacedStructureRuntimeState): number | null {
    if (structure.level >= MAX_STRUCTURE_LEVEL) {
      return null;
    }

    const option = this.getPlaceableOption(structure.optionId);
    if (!option) {
      return null;
    }

    const multiplier = STRUCTURE_UPGRADE_COST_MULTIPLIERS[structure.level - 1] ?? 1;
    return Math.ceil(option.baseCost * multiplier);
  }

  private getOptionEffectSummary(optionId: string): string {
    switch (optionId) {
      case "monitor":
        return "每级+1金币/秒";
      case "medicine_cart":
        return "每级修门+1血";
      case "screen":
        return "每级鬼撞门变慢18%";
      case "sedative_bottle":
        return "每级丢药片+1伤害";
      case "electro_device":
        return "每级放电+1伤害";
      default:
        return "";
    }
  }

  private getStructuresByRoom(roomId: string): PlacedStructureRuntimeState[] {
    return Array.from(this.placedStructures.values()).filter((structure) => structure.roomId === roomId);
  }

  private getTotalStructureLevels(roomId: string, optionId: string): number {
    return this.getStructuresByRoom(roomId)
      .filter((structure) => structure.optionId === optionId)
      .reduce((sum, structure) => sum + structure.level, 0);
  }

  private getPlayerOwnedRoom(): RoomRuntimeState | null {
    const player = this.getPlayerActor();
    if (!player?.targetRoomId) {
      return null;
    }

    const room = this.getRoomById(player.targetRoomId);
    if (!room || room.ownerActorId !== player.id) {
      return null;
    }

    return room;
  }

  private getPlayerCoinIncomePerSecond(): number {
    const playerRoom = this.getPlayerOwnedRoom();
    if (!playerRoom) {
      return this.getBedLevelConfig(1).incomePerSecond;
    }

    return this.getBedLevelConfig(playerRoom.bedLevel).incomePerSecond
      + this.getTotalStructureLevels(playerRoom.roomId, "monitor");
  }

  private getBedLevelConfig(level: number) {
    return BED_LEVEL_CONFIG[Math.max(0, Math.min(BED_LEVEL_CONFIG.length - 1, level - 1))];
  }

  private getBedUpgradeCost(room: RoomRuntimeState): number | null {
    return this.getBedLevelConfig(room.bedLevel).upgradeCost;
  }

  private getDoorLevelConfig(level: number) {
    return DOOR_LEVEL_CONFIG[Math.max(0, Math.min(DOOR_LEVEL_CONFIG.length - 1, level - 1))];
  }

  private getDoorUpgradeCost(room: RoomRuntimeState): number | null {
    return this.getDoorLevelConfig(room.doorLevel).upgradeCost;
  }

  private getPlayerDoorRepairAmount(): number {
    const playerRoom = this.getPlayerOwnedRoom();
    if (!playerRoom) {
      return this.getDoorLevelConfig(1).repairAmountPerSecond;
    }

    return this.getDoorLevelConfig(playerRoom.doorLevel).repairAmountPerSecond
      + this.getTotalStructureLevels(playerRoom.roomId, "medicine_cart");
  }

  private getPlayerDoorRepairCostPerSecond(): number {
    const playerRoom = this.getPlayerOwnedRoom();
    if (!playerRoom) {
      return this.getDoorLevelConfig(1).repairCostPerSecond;
    }

    return this.getDoorLevelConfig(playerRoom.doorLevel).repairCostPerSecond;
  }

  private getGhostAttackIntervalForRoom(room: RoomRuntimeState): number {
    const screenLevels = this.getTotalStructureLevels(room.roomId, "screen");
    return GHOST_ATTACK_INTERVAL * (1 + screenLevels * SCREEN_ATTACK_INTERVAL_BONUS_PER_LEVEL);
  }

  private getDoorRepairStatusText(room: RoomRuntimeState | null): string {
    if (!room || this.activeDoorRepairRoomId !== room.roomId || this.activeDoorRepairRemaining <= 0) {
      return "未修门";
    }

    return `修门中 ${Math.ceil(this.activeDoorRepairRemaining)}秒`;
  }

  private getPlayerOwnedRoomForDefense(): RoomRuntimeState | null {
    const playerRoom = this.getPlayerOwnedRoom();
    if (!playerRoom || !this.ghostState.active || this.ghostState.hp <= 0) {
      return null;
    }

    const doorFront = this.getDoorFrontCell(playerRoom);
    const ghostAtDoor = Math.hypot(this.ghostState.x - doorFront.x, this.ghostState.y - doorFront.y) <= 1.35;
    const ghostInRoom = this.ghostState.targetRoomId === playerRoom.roomId
      || this.isCoordInsideRoom(this.ghostState.x, this.ghostState.y, playerRoom);
    return ghostAtDoor || ghostInRoom ? playerRoom : null;
  }

  private isCoordInsideRoom(x: number, y: number, room: RoomRuntimeState): boolean {
    return x >= room.bounds.x
      && x < room.bounds.x + room.bounds.width
      && y >= room.bounds.y
      && y < room.bounds.y + room.bounds.height;
  }

  private getStructureLevelTotal(roomId: string, optionId: string): number {
    return this.getStructuresByRoom(roomId)
      .filter((structure) => structure.optionId === optionId)
      .reduce((sum, structure) => sum + structure.level, 0);
  }

  private getFirstStructureOrigin(roomId: string, optionId: string): GridCoord | null {
    const structure = this.getStructuresByRoom(roomId).find((entry) => entry.optionId === optionId);
    return structure ? { x: structure.origin.x, y: structure.origin.y } : null;
  }

  private randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private ensureHud(): void {
    let labelNode = this.node.getChildByName("DebugHud");
    if (!labelNode) {
      labelNode = new Node("DebugHud");
      labelNode.layer = this.node.layer;
      this.node.addChild(labelNode);
      labelNode.setPosition(new Vec3(-330, 300, 0));

      const transform = labelNode.addComponent(UITransform);
      transform.setContentSize(560, 150);

      const label = labelNode.addComponent(Label);
      label.fontSize = 20;
      label.lineHeight = 26;
      label.color = new Color(30, 41, 59, 255);
      this.hudLabel = label;
      return;
    }

    this.hudLabel = labelNode.getComponent(Label);
  }

  private ensureGoldHud(): void {
    let rootNode = this.node.getChildByName("GoldHud");
    if (!rootNode) {
      rootNode = new Node("GoldHud");
      rootNode.layer = this.node.layer;
      this.node.addChild(rootNode);
      rootNode.setPosition(new Vec3(274, 300, 0));

      const rootTransform = rootNode.addComponent(UITransform);
      rootTransform.setContentSize(228, 72);

      const backgroundNode = new Node("Background");
      backgroundNode.layer = this.node.layer;
      rootNode.addChild(backgroundNode);
      const backgroundTransform = backgroundNode.addComponent(UITransform);
      backgroundTransform.setContentSize(228, 72);
      const background = backgroundNode.addComponent(Graphics);
      background.fillColor = new Color(250, 251, 252, 252);
      background.roundRect(-114, -36, 228, 72, 18);
      background.fill();
      background.strokeColor = new Color(203, 213, 225, 255);
      background.lineWidth = 2;
      background.roundRect(-114, -36, 228, 72, 18);
      background.stroke();

      const labelNode = new Node("Label");
      labelNode.layer = this.node.layer;
      rootNode.addChild(labelNode);
      const labelTransform = labelNode.addComponent(UITransform);
      labelTransform.setContentSize(196, 52);
      const label = labelNode.addComponent(Label);
      label.fontSize = 30;
      label.lineHeight = 36;
      label.horizontalAlign = 1;
      label.verticalAlign = 1;
      label.color = new Color(15, 23, 42, 255);
      this.goldLabel = label;
      return;
    }

    this.goldLabel = rootNode.getChildByName("Label")?.getComponent(Label) ?? null;
  }

  private ensureCenterCountdown(): void {
    let labelNode = this.node.getChildByName("CenterCountdown");
    if (!labelNode) {
      labelNode = new Node("CenterCountdown");
      labelNode.layer = this.node.layer;
      this.node.addChild(labelNode);
      labelNode.setPosition(new Vec3(0, 40, 0));

      const transform = labelNode.addComponent(UITransform);
      transform.setContentSize(320, 180);

      const label = labelNode.addComponent(Label);
      label.fontSize = 56;
      label.lineHeight = 66;
      label.horizontalAlign = 1;
      label.verticalAlign = 1;
      label.color = new Color(15, 23, 42, 240);
      this.centerCountdownLabel = label;
      return;
    }

    this.centerCountdownLabel = labelNode.getComponent(Label);
  }

  private refreshHud(): void {
    if (!this.hudLabel) {
      return;
    }

    if (this.isGameOver) {
      this.hudLabel.string = "游戏结束";
      return;
    }

    if (this.isVictory) {
      this.hudLabel.string = "胜利\n鬼已经被你消灭";
      return;
    }

    const player = this.getPlayerActor();
    const playerRoom = player?.targetRoomId ? this.getRoomById(player.targetRoomId) : null;
    const playerDoorHp = playerRoom ? `${playerRoom.doorHp}/${playerRoom.doorMaxHp}` : "--";
    const aliveAi = this.actors.filter((actor) => actor.kind === "ai" && actor.isAlive).length;
    const settledCount = this.roomStates.filter((room) => room.isDoorClosed).length;
    const goldPerSecond = this.getPlayerCoinIncomePerSecond();
    const repairAmount = this.getPlayerDoorRepairAmount();
    const screenSlowdown = playerRoom
      ? Math.round(this.getTotalStructureLevels(playerRoom.roomId, "screen") * SCREEN_ATTACK_INTERVAL_BONUS_PER_LEVEL * 100)
      : 0;

    let playerText = "用左下角摇杆移动，先抢到床位";
    if (!player?.isAlive) {
      playerText = "你已经被鬼挠死";
    } else if (player.isLying) {
      playerText = `你已躺下并锁定 ${playerRoom?.label ?? "病房"}`;
    } else if (player.canLieDown) {
      playerText = "床边出现了“躺下”按钮，点击即可躺下";
    } else if (player && (Math.abs(this.joystickVector.x) > 0.01 || Math.abs(this.joystickVector.y) > 0.01)) {
      playerText = "用左下角摇杆移动，靠近病床后点“躺下”";
    }

    const ghostText = this.setupCountdown > 0
      ? `鬼将在 ${this.setupCountdown.toFixed(1)} 秒后从走廊尽头出现`
      : this.ghostState.mode === "attack_door"
      ? "鬼正在撞门"
      : this.ghostState.mode === "chase"
      ? "鬼正在追击活人"
      : "鬼已进入走廊";

    this.hudLabel.string =
      `抢床阶段剩余: ${this.setupCountdown.toFixed(1)} 秒\n`
      + `已锁门病房: ${settledCount}/6  AI存活: ${aliveAi}\n`
      + `你的门血: ${playerDoorHp}\n`
      + `鬼血: ${this.ghostState.hp}/${this.ghostState.maxHp}\n`
      + `床等级: Lv${playerRoom?.bedLevel ?? "--"}  门等级: Lv${playerRoom?.doorLevel ?? "--"}  ${this.getDoorRepairStatusText(playerRoom)}\n`
      + `床位收入: ${goldPerSecond}/秒  修门: +${repairAmount}血/秒  屏风减速: ${screenSlowdown}%\n`
      + `${playerText}\n`
      + `${ghostText}`;
  }

  private refreshGoldHud(): void {
    if (!this.goldLabel) {
      return;
    }

    this.goldLabel.string = `金币  ${this.playerCoins}`;
  }

  private layoutOverlayNodes(): void {
    const rootTransform = this.node.parent?.getComponent(UITransform)
      ?? this.node.getComponent(UITransform);
    if (!rootTransform) {
      return;
    }

    const halfWidth = rootTransform.contentSize.width * 0.5;
    const halfHeight = rootTransform.contentSize.height * 0.5;

    const debugHudNode = this.hudLabel?.node;
    if (debugHudNode) {
      debugHudNode.setPosition(new Vec3(-halfWidth + 292, halfHeight - 108, 0));
    }

    const goldHudNode = this.goldLabel?.node.parent;
    if (goldHudNode) {
      goldHudNode.setPosition(new Vec3(halfWidth - 136, halfHeight - 54, 0));
      goldHudNode.setSiblingIndex(this.node.children.length - 1);
    }

    const countdownNode = this.centerCountdownLabel?.node;
    if (countdownNode) {
      countdownNode.setPosition(new Vec3(0, 40, 0));
      countdownNode.setSiblingIndex(this.node.children.length - 1);
    }

    if (this.repairButtonNode) {
      this.repairButtonNode.setPosition(new Vec3(halfWidth - 142, -halfHeight + 98, 0));
      this.repairButtonNode.setSiblingIndex(this.node.children.length - 1);
    }

    if (this.gameOverOverlay) {
      this.gameOverOverlay.setSiblingIndex(this.node.children.length - 1);
    }

    if (this.victoryOverlay) {
      this.victoryOverlay.setSiblingIndex(this.node.children.length - 1);
    }

    if (this.placementMenuNode) {
      this.placementMenuNode.setSiblingIndex(this.node.children.length - 1);
    }
  }

  private ensurePlacementMenu(): void {
    let menuNode = this.node.getChildByName("PlacementMenu");
    if (!menuNode) {
      menuNode = new Node("PlacementMenu");
      menuNode.layer = this.node.layer;
      menuNode.active = false;
      this.node.addChild(menuNode);

      const blocker = new Node("Blocker");
      blocker.layer = this.node.layer;
      menuNode.addChild(blocker);

      const blockerTransform = blocker.addComponent(UITransform);
      blockerTransform.setContentSize(960, 640);
      const blockerGraphics = blocker.addComponent(Graphics);
      blockerGraphics.fillColor = new Color(15, 23, 42, 88);
      blockerGraphics.rect(-480, -320, 960, 640);
      blockerGraphics.fill();
      this.bindOverlayPress(blocker, this.handlePlacementMenuClose.bind(this));

      const panel = new Node("Panel");
      panel.layer = this.node.layer;
      menuNode.addChild(panel);
      this.placementMenuPanelNode = panel;
      panel.setPosition(new Vec3(0, -10, 0));

      const panelTransform = panel.addComponent(UITransform);
      panelTransform.setContentSize(456, 620);
      const panelGraphics = panel.addComponent(Graphics);
      panelGraphics.fillColor = new Color(250, 251, 252, 252);
      panelGraphics.roundRect(-228, -310, 456, 620, 20);
      panelGraphics.fill();

      panelGraphics.strokeColor = new Color(203, 213, 225, 255);
      panelGraphics.lineWidth = 2;
      panelGraphics.roundRect(-228, -310, 456, 620, 20);
      panelGraphics.stroke();

      const titleNode = new Node("Title");
      titleNode.layer = this.node.layer;
      panel.addChild(titleNode);
      titleNode.setPosition(new Vec3(0, 176, 0));
      const titleTransform = titleNode.addComponent(UITransform);
      titleTransform.setContentSize(380, 72);
      const titleLabel = titleNode.addComponent(Label);
      titleLabel.fontSize = 32;
      titleLabel.lineHeight = 38;
      titleLabel.horizontalAlign = 1;
      titleLabel.verticalAlign = 1;
      titleLabel.color = new Color(15, 23, 42, 255);
      titleLabel.string = "选择放置物";
      this.placementMenuLabel = titleLabel;

      const buttonOffsets = [176, 92, 8, -76, -160];
      this.placementMenuButtons = [];
      this.placementMenuButtonLabels = [];
      for (let index = 0; index < buttonOffsets.length; index += 1) {
        const button = this.createOverlayButton("按钮", new Vec3(0, buttonOffsets[index], 0), {
          width: 356,
          height: 72,
          radius: 14,
          fontSize: 24,
          lineHeight: 28,
          fillColor: new Color(241, 245, 249, 255),
          textColor: new Color(15, 23, 42, 255),
        });
        button.name = `PlacementAction:${index}`;
        this.bindOverlayPress(button, () => this.handlePlacementMenuAction(index));
        panel.addChild(button);
        this.placementMenuButtons.push(button);
        const label = button.getComponentInChildren(Label)!;
        label.fontSize = 24;
        label.lineHeight = 28;
        this.placementMenuButtonLabels.push(label);
      }

      const cancelButton = this.createOverlayButton("取消", new Vec3(0, -246, 0), {
        width: 356,
        height: 72,
        radius: 14,
        fontSize: 24,
        lineHeight: 28,
        fillColor: new Color(226, 232, 240, 255),
        textColor: new Color(51, 65, 85, 255),
      });
      cancelButton.name = "PlacementCancel";
      this.bindOverlayPress(cancelButton, this.handlePlacementMenuClose.bind(this));
      panel.addChild(cancelButton);
      this.placementMenuCancelButton = cancelButton;
    }

    this.placementMenuNode = menuNode;
  }

  private refreshCenterCountdown(): void {
    if (!this.centerCountdownLabel) {
      return;
    }

    const node = this.centerCountdownLabel.node;
    if (this.setupCountdown <= 0) {
      node.active = false;
      return;
    }

    node.active = true;
    this.centerCountdownLabel.string = `抢床倒计时\n${Math.ceil(this.setupCountdown)}`;
  }

  private ensureLieDownButton(): void {
    let buttonNode = this.node.getChildByName("LieDownButton");
    if (!buttonNode) {
      buttonNode = this.createOverlayButton("躺下", new Vec3(0, 0, 0), {
        width: 176,
        height: 72,
        radius: 18,
        fontSize: 28,
        lineHeight: 32,
        fillColor: new Color(37, 99, 235, 245),
        textColor: new Color(255, 255, 255, 255),
      });
      buttonNode.name = "LieDownButton";
      buttonNode.active = false;
      this.bindOverlayPress(buttonNode, this.handleLieDownPressed.bind(this));
      this.node.addChild(buttonNode);
    }

    this.lieDownButtonNode = buttonNode;
  }

  private refreshLieDownButton(): void {
    if (!this.lieDownButtonNode || !this.mapView) {
      return;
    }

    const player = this.getPlayerActor();
    const visible = !!player
      && player.isAlive
      && player.canLieDown
      && !player.isLying
      && !this.isGameOver;
    this.lieDownButtonNode.active = visible;

    if (!visible || !player?.targetBedCell) {
      return;
    }

    const bedPosition = this.mapView.getLocalPositionForCell(player.targetBedCell);
    if (!bedPosition) {
      return;
    }

    this.lieDownButtonNode.setPosition(new Vec3(
      bedPosition.x,
      bedPosition.y + 96,
      0,
    ));
  }

  private ensureRepairButton(): void {
    let buttonNode = this.node.getChildByName("RepairButton");
    if (!buttonNode) {
      buttonNode = this.createOverlayButton("修门", new Vec3(250, -252, 0), {
        width: 206,
        height: 82,
        radius: 18,
        fontSize: 26,
        lineHeight: 30,
        fillColor: new Color(15, 118, 110, 240),
        textColor: new Color(255, 255, 255, 255),
      });
      buttonNode.name = "RepairButton";
      buttonNode.active = false;
      this.bindOverlayPress(buttonNode, this.handleRepairPressed.bind(this));
      this.node.addChild(buttonNode);
    }

    this.repairButtonNode = buttonNode;
  }

  private refreshRepairButton(): void {
    if (!this.repairButtonNode) {
      return;
    }

    const player = this.getPlayerActor();
    const room = player?.targetRoomId ? this.getRoomById(player.targetRoomId) : null;
    const canRepair = !!player
      && !!room
      && player.isAlive
      && player.isLying
      && room.ownerActorId === player.id
      && !this.isGameOver;
    this.repairButtonNode.active = canRepair;

    const label = this.repairButtonNode.getComponentInChildren(Label);
    if (label) {
      if (this.activeDoorRepairRoomId === room?.roomId && this.activeDoorRepairRemaining > 0) {
        label.string =
          `停止修门\n${Math.ceil(this.activeDoorRepairRemaining)}秒`;
      } else if (room && room.doorHp >= room.doorMaxHp) {
        label.string =
          `房门满血\nLv${room.doorLevel}`;
      } else {
        label.string =
          `修门10秒\n$${this.getPlayerDoorRepairCostPerSecond()}/秒  +${this.getPlayerDoorRepairAmount()}血`;
      }
    }
  }

  private isPlacementMenuOpen(): boolean {
    return this.placementMenuNode?.active ?? false;
  }

  private handlePlacementTap(actor: ActorRuntimeState, event: EventTouch): void {
    if (!this.mapView || !this.mapModel) {
      return;
    }

    const uiLocation = event.getUILocation();
    const cell = this.mapView.pickCellAtUILocation(uiLocation.x, uiLocation.y);
    if (!cell || !actor.targetRoomId) {
      this.closePlacementMenu();
      return;
    }

    const mapCell = this.mapModel.getCell(cell.x, cell.y);
    if (!mapCell || mapCell.roomId !== actor.targetRoomId) {
      this.closePlacementMenu();
      return;
    }

    const room = this.getRoomById(actor.targetRoomId);
    if (!room || room.ownerActorId !== actor.id) {
      this.closePlacementMenu();
      return;
    }

    if (mapCell.tags.includes("bed")) {
      this.openBedMenu(room);
      return;
    }

    if (mapCell.tileType === "door") {
      this.openDoorMenu(room);
      return;
    }

    if (mapCell.occupantId) {
      const structure = this.placedStructures.get(mapCell.occupantId);
      if (structure) {
        this.openUpgradeMenu(structure.instanceId);
        return;
      }

      this.closePlacementMenu();
      return;
    }

    if (!mapCell.buildable) {
      this.closePlacementMenu();
      return;
    }

    this.openPlacementMenu(cell);
  }

  private openPlacementMenu(cell: GridCoord): void {
    if (!this.placementMenuNode) {
      return;
    }

    this.placementOriginCell = cell;
    this.placementPreview = {
      ok: true,
      cells: [cell],
    };
    this.mapView?.setPlacementPreview(this.placementPreview);
    const actions: PlacementMenuAction[] = [
      ...PLACEABLE_OPTIONS.map((option) => ({
        kind: "place" as const,
        optionId: option.id,
        label: `${option.label}  $${option.baseCost}\n${this.getOptionEffectSummary(option.id)}`,
      })),
    ];
    this.setPlacementMenuActions("选择放置物", actions);
    this.placementMenuNode.active = true;
  }

  private openUpgradeMenu(structureId: string): void {
    if (!this.placementMenuNode || !this.mapModel) {
      return;
    }

    const structure = this.placedStructures.get(structureId);
    const occupancy = this.mapModel.getOccupancy(structureId);
    const option = structure ? this.getPlaceableOption(structure.optionId) : null;
    if (!structure || !occupancy || !option) {
      this.closePlacementMenu();
      return;
    }

    this.placementOriginCell = occupancy.origin;
    this.placementPreview = {
      ok: true,
      cells: occupancy.cells,
    };
    this.mapView?.setPlacementPreview(this.placementPreview);

    const nextLevel = structure.level + 1;
    const upgradeCost = this.getStructureUpgradeCost(structure);
    const actions: PlacementMenuAction[] = [];
    if (upgradeCost !== null) {
      actions.push({
        kind: "upgrade",
        structureId,
        label: `升级到 Lv${nextLevel}  $${upgradeCost}\n${this.getOptionEffectSummary(option.id)}`,
      });
    }

    this.setPlacementMenuActions(
      upgradeCost !== null
        ? `${option.label} Lv${structure.level}`
        : `${option.label} Lv${structure.level}\n已满级`,
      actions,
    );
    this.placementMenuNode.active = true;
  }

  private openDoorMenu(room: RoomRuntimeState): void {
    if (!this.placementMenuNode) {
      return;
    }

    this.placementOriginCell = room.doorCell;
    this.placementPreview = {
      ok: true,
      cells: [room.doorCell],
    };
    this.mapView?.setPlacementPreview(this.placementPreview);

    const upgradeCost = this.getDoorUpgradeCost(room);
    const actions: PlacementMenuAction[] = [];
    if (upgradeCost !== null) {
      actions.push({
        kind: "upgrade",
        structureId: `door:${room.roomId}`,
        label: `升级到 Lv${room.doorLevel + 1}  $${upgradeCost}\n门血上限提升`,
      });
    }

    this.setPlacementMenuActions(
      upgradeCost !== null
        ? `房门 Lv${room.doorLevel}\n耐久 ${room.doorHp}/${room.doorMaxHp}`
        : `房门 Lv${room.doorLevel}\n耐久 ${room.doorHp}/${room.doorMaxHp}\n已满级`,
      actions,
    );
    this.placementMenuNode.active = true;
  }

  private openBedMenu(room: RoomRuntimeState): void {
    if (!this.placementMenuNode) {
      return;
    }

    this.placementOriginCell = room.bedCell;
    this.placementPreview = {
      ok: true,
      cells: [room.bedCell],
    };
    this.mapView?.setPlacementPreview(this.placementPreview);

    const upgradeCost = this.getBedUpgradeCost(room);
    const actions: PlacementMenuAction[] = [];
    if (upgradeCost !== null) {
      actions.push({
        kind: "upgrade",
        structureId: `bed:${room.roomId}`,
        label: `升级到 Lv${room.bedLevel + 1}  $${upgradeCost}\n床位收入提升`,
      });
    }

    this.setPlacementMenuActions(
      upgradeCost !== null
        ? `病床 Lv${room.bedLevel}\n收入 ${this.getBedLevelConfig(room.bedLevel).incomePerSecond}/秒`
        : `病床 Lv${room.bedLevel}\n收入 ${this.getBedLevelConfig(room.bedLevel).incomePerSecond}/秒\n已满级`,
      actions,
    );
    this.placementMenuNode.active = true;
  }

  private closePlacementMenu(): void {
    this.placementOriginCell = null;
    this.placementMenuActions = [];
    this.placementPreview = null;
    this.mapView?.setPlacementPreview(null);
    if (this.placementMenuNode) {
      this.placementMenuNode.active = false;
    }
  }

  private updatePlayerCoinIncome(dt: number): void {
    const player = this.getPlayerActor();
    if (!player || !player.isAlive || !player.isLying) {
      this.playerCoinIncomeTimer = PLAYER_COIN_INCOME_INTERVAL;
      return;
    }

    this.playerCoinIncomeTimer -= dt;
    if (this.playerCoinIncomeTimer > 0) {
      return;
    }

    this.playerCoins += this.getPlayerCoinIncomePerSecond();
    this.playerCoinIncomeTimer = PLAYER_COIN_INCOME_INTERVAL;
  }

  private updateDoorRepair(dt: number): void {
    if (!this.activeDoorRepairRoomId || this.activeDoorRepairRemaining <= 0) {
      this.stopDoorRepair(false);
      return;
    }

    const room = this.getRoomById(this.activeDoorRepairRoomId);
    const player = this.getPlayerActor();
    if (
      !room
      || !player
      || !player.isAlive
      || !player.isLying
      || room.ownerActorId !== player.id
      || room.doorHp >= room.doorMaxHp
    ) {
      this.stopDoorRepair(false);
      return;
    }

    this.activeDoorRepairRemaining = Math.max(0, this.activeDoorRepairRemaining - dt);
    this.activeDoorRepairTickTimer -= dt;

    while (this.activeDoorRepairTickTimer <= 0 && this.activeDoorRepairRemaining > 0) {
      const repairCost = this.getPlayerDoorRepairCostPerSecond();
      if (this.playerCoins < repairCost) {
        this.stopDoorRepair(false);
        return;
      }

      this.playerCoins -= repairCost;
      room.doorHp = Math.min(room.doorMaxHp, room.doorHp + this.getPlayerDoorRepairAmount());
      if (room.doorHp > 0) {
        room.isDoorClosed = true;
      }
      this.activeDoorRepairTickTimer += DOOR_REPAIR_TICK_INTERVAL;
    }

    if (room.doorHp >= room.doorMaxHp || this.activeDoorRepairRemaining <= 0) {
      this.stopDoorRepair(false);
    }
  }

  private updateUpgradePulses(dt: number): void {
    if (this.upgradePulses.length === 0) {
      return;
    }

    const nextPulses: UpgradePulseState[] = [];
    for (const pulse of this.upgradePulses) {
      const nextTtl = pulse.ttl - dt;
      if (nextTtl <= 0) {
        continue;
      }

      nextPulses.push({
        ...pulse,
        ttl: nextTtl,
      });
    }

    this.upgradePulses = nextPulses;
  }

  private updateAttackEffects(dt: number): void {
    if (this.attackEffects.length === 0) {
      return;
    }

    const nextEffects: AttackEffectState[] = [];
    for (const effect of this.attackEffects) {
      const nextTtl = effect.ttl - dt;
      if (nextTtl <= 0) {
        continue;
      }

      nextEffects.push({
        ...effect,
        ttl: nextTtl,
      });
    }

    this.attackEffects = nextEffects;
  }

  private updateDefenseAttacks(dt: number): void {
    const playerRoom = this.getPlayerOwnedRoomForDefense();
    if (!playerRoom) {
      this.sedativeAttackTimer = SEDATIVE_ATTACK_INTERVAL;
      this.electroAttackTimer = ELECTRO_ATTACK_INTERVAL;
      return;
    }

    const sedativeLevels = this.getStructureLevelTotal(playerRoom.roomId, "sedative_bottle");
    if (sedativeLevels > 0) {
      this.sedativeAttackTimer -= dt;
      if (this.sedativeAttackTimer <= 0) {
        this.sedativeAttackTimer += SEDATIVE_ATTACK_INTERVAL;
        this.applyGhostDamage(
          sedativeLevels,
          this.getFirstStructureOrigin(playerRoom.roomId, "sedative_bottle") ?? playerRoom.bedCell,
          "pill",
        );
      }
    } else {
      this.sedativeAttackTimer = SEDATIVE_ATTACK_INTERVAL;
    }

    const electroLevels = this.getStructureLevelTotal(playerRoom.roomId, "electro_device");
    if (electroLevels > 0) {
      this.electroAttackTimer -= dt;
      if (this.electroAttackTimer <= 0) {
        this.electroAttackTimer += ELECTRO_ATTACK_INTERVAL;
        this.applyGhostDamage(
          electroLevels,
          this.getFirstStructureOrigin(playerRoom.roomId, "electro_device") ?? playerRoom.bedCell,
          "shock",
        );
      }
    } else {
      this.electroAttackTimer = ELECTRO_ATTACK_INTERVAL;
    }
  }

  private applyGhostDamage(amount: number, sourceCell: GridCoord, kind: "pill" | "shock"): void {
    if (!this.ghostState.active || this.ghostState.hp <= 0 || amount <= 0) {
      return;
    }

    this.attackEffects.push({
      kind,
      sourceCell: { x: sourceCell.x, y: sourceCell.y },
      targetX: this.ghostState.x,
      targetY: this.ghostState.y,
      ttl: ATTACK_EFFECT_DURATION,
      duration: ATTACK_EFFECT_DURATION,
    });
    this.ghostState.hp = Math.max(0, this.ghostState.hp - amount);
    if (this.ghostState.hp <= 0) {
      this.triggerVictory();
    }
  }

  private pushUpgradePulse(cell: GridCoord, kind: "bed" | "door"): void {
    this.upgradePulses.push({
      cell: { x: cell.x, y: cell.y },
      kind,
      ttl: UPGRADE_PULSE_DURATION,
      duration: UPGRADE_PULSE_DURATION,
    });
  }

  private stopDoorRepair(refreshUi = true): void {
    this.activeDoorRepairRoomId = null;
    this.activeDoorRepairRemaining = 0;
    this.activeDoorRepairTickTimer = DOOR_REPAIR_TICK_INTERVAL;
    if (refreshUi) {
      this.refreshRepairButton();
      this.refreshHud();
      this.refreshGoldHud();
    }
  }

  private refreshCamera(): void {
    if (!this.mapView) {
      return;
    }

    const player = this.getPlayerActor();
    if (!player || !player.isAlive) {
      return;
    }

    if (!player.isLying) {
      this.mapView.setCameraCenter(player.x, player.y, false);
      if (this.cameraPanTouchId !== null) {
        this.clearCameraPan();
      }
    }
  }

  private movePlayerByJoystick(actor: ActorRuntimeState, inputX: number, inputY: number, dt: number): void {
    const distance = Math.hypot(inputX, inputY);
    if (distance <= 0.0001) {
      return;
    }

    const normalizedX = inputX / distance;
    const normalizedY = -inputY / distance;
    const step = ACTOR_MOVE_SPEED * dt;
    const tryX = actor.x + normalizedX * step;
    const tryY = actor.y + normalizedY * step;

    if (this.canActorMoveTo(actor, tryX, actor.y)) {
      actor.x = tryX;
    }

    if (this.canActorMoveTo(actor, actor.x, tryY)) {
      actor.y = tryY;
    }
  }

  private canActorMoveTo(actor: ActorRuntimeState, x: number, y: number): boolean {
    if (!this.mapModel) {
      return false;
    }

    const cell = this.mapModel.getCell(Math.round(x), Math.round(y));
    if (!cell) {
      return false;
    }

    if (cell.tileType === "door") {
      const room = cell.roomId ? this.getRoomById(cell.roomId) : null;
      return room ? !room.isDoorClosed || room.ownerActorId === actor.id : true;
    }

    return cell.walkable;
  }

  private updatePlayerBedProximity(actor: ActorRuntimeState): void {
    actor.canLieDown = false;

    for (const room of this.roomStates) {
      if (room.isDoorClosed) {
        continue;
      }

      const nearBed = this.isActorNearBed(room, actor, PLAYER_BED_NEAR_RADIUS);
      if (!nearBed) {
        continue;
      }

      actor.canLieDown = true;
      actor.targetRoomId = room.roomId;
      actor.targetBedCell = room.bedCell;
      actor.phase = "at_bed";
      return;
    }
  }

  private isActorNearBed(room: RoomRuntimeState, actor: ActorRuntimeState, radius: number): boolean {
    return Math.max(
      Math.abs(actor.x - room.bedCell.x),
      Math.abs(actor.y - room.bedCell.y),
    ) <= radius;
  }

  private ensureJoystick(): void {
    let joystickNode = this.node.getChildByName("VirtualJoystick");
    if (!joystickNode) {
      joystickNode = new Node("VirtualJoystick");
      joystickNode.layer = this.node.layer;
      this.node.addChild(joystickNode);
      joystickNode.setPosition(new Vec3(-280, -260, 0));

      const transform = joystickNode.addComponent(UITransform);
      transform.setContentSize(180, 180);

      this.joystickGraphics = joystickNode.addComponent(Graphics);
      this.joystickNode = joystickNode;
      return;
    }

    this.joystickNode = joystickNode;
    this.joystickGraphics = joystickNode.getComponent(Graphics);
  }

  private ensureGameOverOverlay(): void {
    let overlay = this.node.getChildByName("GameOverOverlay");
    if (!overlay) {
      overlay = new Node("GameOverOverlay");
      overlay.layer = this.node.layer;
      this.node.addChild(overlay);
      overlay.setPosition(new Vec3(0, 0, 0));

      const overlayTransform = overlay.addComponent(UITransform);
      overlayTransform.setContentSize(960, 640);

      const blocker = new Node("Blocker");
      blocker.layer = this.node.layer;
      overlay.addChild(blocker);
      const blockerTransform = blocker.addComponent(UITransform);
      blockerTransform.setContentSize(960, 640);
      const overlayGraphics = blocker.addComponent(Graphics);
      overlayGraphics.fillColor = new Color(15, 23, 42, 104);
      overlayGraphics.rect(-480, -320, 960, 640);
      overlayGraphics.fill();

      const panel = new Node("Panel");
      panel.layer = this.node.layer;
      overlay.addChild(panel);
      this.gameOverPanelNode = panel;
      panel.setPosition(new Vec3(0, 24, 0));

      const panelTransform = panel.addComponent(UITransform);
      panelTransform.setContentSize(468, 324);
      const panelGraphics = panel.addComponent(Graphics);
      panelGraphics.fillColor = new Color(250, 251, 252, 252);
      panelGraphics.roundRect(-234, -162, 468, 324, 20);
      panelGraphics.fill();

      panelGraphics.strokeColor = new Color(203, 213, 225, 255);
      panelGraphics.lineWidth = 2;
      panelGraphics.roundRect(-234, -162, 468, 324, 20);
      panelGraphics.stroke();

      const titleNode = new Node("Title");
      titleNode.layer = this.node.layer;
      panel.addChild(titleNode);
      titleNode.setPosition(new Vec3(0, 66, 0));
      const titleTransform = titleNode.addComponent(UITransform);
      titleTransform.setContentSize(380, 136);
      const titleLabel = titleNode.addComponent(Label);
      titleLabel.fontSize = 38;
      titleLabel.lineHeight = 46;
      titleLabel.horizontalAlign = 1;
      titleLabel.verticalAlign = 1;
      titleLabel.color = new Color(15, 23, 42, 255);
      titleLabel.string = "游戏结束\n你被鬼挠死了";

      const homeButton = this.createOverlayButton("返回首页", new Vec3(-112, -72, 0), {
        width: 180,
        height: 78,
        radius: 18,
        fontSize: 26,
        lineHeight: 30,
        fillColor: new Color(226, 232, 240, 255),
        textColor: new Color(15, 23, 42, 255),
      });
      this.bindOverlayPress(homeButton, this.handleReturnHome.bind(this));
      panel.addChild(homeButton);
      this.gameOverHomeButtonNode = homeButton;

      const replayButton = this.createOverlayButton("再来一局", new Vec3(112, -72, 0), {
        width: 180,
        height: 78,
        radius: 18,
        fontSize: 26,
        lineHeight: 30,
        fillColor: new Color(37, 99, 235, 245),
        textColor: new Color(255, 255, 255, 255),
      });
      this.bindOverlayPress(replayButton, this.handleReplay.bind(this));
      panel.addChild(replayButton);
      this.gameOverReplayButtonNode = replayButton;
    }

    overlay.active = false;
    this.gameOverOverlay = overlay;
  }

  private ensureVictoryOverlay(): void {
    let overlay = this.node.getChildByName("VictoryOverlay");
    if (!overlay) {
      overlay = new Node("VictoryOverlay");
      overlay.layer = this.node.layer;
      this.node.addChild(overlay);
      overlay.setPosition(new Vec3(0, 0, 0));

      const overlayTransform = overlay.addComponent(UITransform);
      overlayTransform.setContentSize(960, 640);

      const blocker = new Node("Blocker");
      blocker.layer = this.node.layer;
      overlay.addChild(blocker);
      const blockerTransform = blocker.addComponent(UITransform);
      blockerTransform.setContentSize(960, 640);
      const overlayGraphics = blocker.addComponent(Graphics);
      overlayGraphics.fillColor = new Color(15, 23, 42, 88);
      overlayGraphics.rect(-480, -320, 960, 640);
      overlayGraphics.fill();

      const panel = new Node("Panel");
      panel.layer = this.node.layer;
      overlay.addChild(panel);
      panel.setPosition(new Vec3(0, 24, 0));

      const panelTransform = panel.addComponent(UITransform);
      panelTransform.setContentSize(468, 324);
      const panelGraphics = panel.addComponent(Graphics);
      panelGraphics.fillColor = new Color(250, 251, 252, 252);
      panelGraphics.roundRect(-234, -162, 468, 324, 20);
      panelGraphics.fill();
      panelGraphics.strokeColor = new Color(203, 213, 225, 255);
      panelGraphics.lineWidth = 2;
      panelGraphics.roundRect(-234, -162, 468, 324, 20);
      panelGraphics.stroke();

      const titleNode = new Node("Title");
      titleNode.layer = this.node.layer;
      panel.addChild(titleNode);
      titleNode.setPosition(new Vec3(0, 66, 0));
      const titleTransform = titleNode.addComponent(UITransform);
      titleTransform.setContentSize(380, 136);
      const titleLabel = titleNode.addComponent(Label);
      titleLabel.fontSize = 38;
      titleLabel.lineHeight = 46;
      titleLabel.horizontalAlign = 1;
      titleLabel.verticalAlign = 1;
      titleLabel.color = new Color(15, 23, 42, 255);
      titleLabel.string = "胜利\n鬼已经被你消灭";

      const homeButton = this.createOverlayButton("返回首页", new Vec3(-112, -72, 0), {
        width: 180,
        height: 78,
        radius: 18,
        fontSize: 26,
        lineHeight: 30,
        fillColor: new Color(226, 232, 240, 255),
        textColor: new Color(15, 23, 42, 255),
      });
      this.bindOverlayPress(homeButton, this.handleReturnHome.bind(this));
      panel.addChild(homeButton);
      this.victoryHomeButtonNode = homeButton;

      const replayButton = this.createOverlayButton("再来一局", new Vec3(112, -72, 0), {
        width: 180,
        height: 78,
        radius: 18,
        fontSize: 26,
        lineHeight: 30,
        fillColor: new Color(37, 99, 235, 245),
        textColor: new Color(255, 255, 255, 255),
      });
      this.bindOverlayPress(replayButton, this.handleReplay.bind(this));
      panel.addChild(replayButton);
      this.victoryReplayButtonNode = replayButton;
    }

    overlay.active = false;
    this.victoryOverlay = overlay;
  }

  private createOverlayButton(
    labelText: string,
    position: Vec3,
    style: OverlayButtonStyle = {},
  ): Node {
    const width = style.width ?? 170;
    const height = style.height ?? 64;
    const radius = style.radius ?? 16;
    const fontSize = style.fontSize ?? 24;
    const lineHeight = style.lineHeight ?? 30;
    const fillColor = style.fillColor ?? new Color(37, 99, 235, 230);
    const textColor = style.textColor ?? new Color(255, 255, 255, 255);

    const buttonNode = new Node(labelText);
    buttonNode.layer = this.node.layer;
    buttonNode.setPosition(position);

    const transform = buttonNode.addComponent(UITransform);
    transform.setContentSize(width, height);

    const graphics = buttonNode.addComponent(Graphics);
    graphics.fillColor = fillColor;
    graphics.roundRect(-width * 0.5, -height * 0.5, width, height, radius);
    graphics.fill();

    graphics.strokeColor = new Color(148, 163, 184, fillColor.a >= 240 ? 90 : 0);
    graphics.lineWidth = 2;
    if (fillColor.a >= 240) {
      graphics.roundRect(-width * 0.5, -height * 0.5, width, height, radius);
      graphics.stroke();
    }

    const labelNode = new Node("Label");
    labelNode.layer = this.node.layer;
    buttonNode.addChild(labelNode);
    const labelTransform = labelNode.addComponent(UITransform);
    labelTransform.setContentSize(width - 24, height - 14);
    const label = labelNode.addComponent(Label);
    label.fontSize = fontSize;
    label.lineHeight = lineHeight;
    label.horizontalAlign = 1;
    label.verticalAlign = 1;
    label.color = textColor;
    label.string = labelText;

    return buttonNode;
  }

  private bindOverlayPress(node: Node, handler: () => void): void {
    node.on(Node.EventType.TOUCH_START, handler, this);
    const labelNode = node.getChildByName("Label");
    if (labelNode) {
      labelNode.on(Node.EventType.TOUCH_START, handler, this);
    }
  }

  private isTouchInsideNode(node: Node | null, event: EventTouch): boolean {
    if (!node || !node.activeInHierarchy) {
      return false;
    }

    const transform = node.getComponent(UITransform);
    if (!transform) {
      return false;
    }

    const uiLocation = event.getUILocation();
    return transform.getBoundingBoxToWorld().contains(new Vec2(uiLocation.x, uiLocation.y));
  }

  private handlePlacementMenuTouch(event: EventTouch): void {
    for (let index = 0; index < this.placementMenuButtons.length; index += 1) {
      const action = this.placementMenuActions[index];
      const button = this.placementMenuButtons[index];
      if (!action || !button.activeInHierarchy) {
        continue;
      }

      if (this.isTouchInsideNode(button, event)) {
        this.handlePlacementMenuAction(index);
        return;
      }
    }

    if (this.isTouchInsideNode(this.placementMenuCancelButton, event)) {
      this.handlePlacementMenuClose();
      return;
    }

    if (!this.isTouchInsideNode(this.placementMenuPanelNode, event)) {
      this.closePlacementMenu();
    }
  }

  private handleGameOverTouch(event: EventTouch): void {
    if (this.isTouchInsideNode(this.gameOverReplayButtonNode, event)) {
      this.handleReplay();
      return;
    }

    if (this.isTouchInsideNode(this.gameOverHomeButtonNode, event)) {
      this.handleReturnHome();
      return;
    }
  }

  private handleVictoryTouch(event: EventTouch): void {
    if (this.isTouchInsideNode(this.victoryReplayButtonNode, event)) {
      this.handleReplay();
      return;
    }

    if (this.isTouchInsideNode(this.victoryHomeButtonNode, event)) {
      this.handleReturnHome();
    }
  }

  private refreshJoystick(): void {
    if (!this.joystickNode || !this.joystickGraphics) {
      return;
    }

    const visible = this.isJoystickVisible();
    this.joystickNode.active = visible;
    this.joystickGraphics.clear();

    if (!visible) {
      return;
    }

    const engaged = this.joystickTouchId !== null;
    this.joystickGraphics.fillColor = engaged
      ? new Color(15, 23, 42, 76)
      : new Color(15, 23, 42, 30);
    this.joystickGraphics.circle(0, 0, JOYSTICK_RADIUS);
    this.joystickGraphics.fill();

    this.joystickGraphics.strokeColor = engaged
      ? new Color(148, 163, 184, 150)
      : new Color(148, 163, 184, 70);
    this.joystickGraphics.lineWidth = 2;
    this.joystickGraphics.circle(0, 0, JOYSTICK_RADIUS);
    this.joystickGraphics.stroke();

    const knobX = this.joystickVector.x * JOYSTICK_RADIUS * 0.55;
    const knobY = this.joystickVector.y * JOYSTICK_RADIUS * 0.55;
    this.joystickGraphics.fillColor = new Color(59, 130, 246, 180);
    this.joystickGraphics.circle(knobX, knobY, JOYSTICK_KNOB_RADIUS);
    this.joystickGraphics.fill();
  }

  private isJoystickVisible(): boolean {
    const player = this.getPlayerActor();
    return !!player && player.isAlive && !player.isLying && !this.isGameOver && !this.isVictory;
  }

  private canPanCamera(): boolean {
    const player = this.getPlayerActor();
    return !!player && player.isAlive && player.isLying && !this.isGameOver && !this.isVictory;
  }

  private tryCaptureJoystick(event: EventTouch): boolean {
    if (!this.joystickNode || !this.isJoystickVisible() || this.joystickTouchId !== null) {
      return false;
    }

    const rootTransform = this.node.getComponent(UITransform);
    if (!rootTransform) {
      return false;
    }

    const uiLocation = event.getUILocation();
    const local = rootTransform.convertToNodeSpaceAR(new Vec3(uiLocation.x, uiLocation.y, 0));
    const captureBoundaryX =
      -rootTransform.contentSize.width * 0.5
      + rootTransform.contentSize.width * JOYSTICK_CAPTURE_LEFT_RATIO;
    if (local.x > captureBoundaryX) {
      return false;
    }

    this.joystickNode.setPosition(new Vec3(local.x, local.y, 0));
    this.joystickTouchId = event.getID();
    this.updateJoystickVector(event);
    return true;
  }

  private tryStartCameraPan(event: EventTouch): boolean {
    if (!this.canPanCamera() || this.cameraPanTouchId !== null) {
      return false;
    }

    const uiLocation = event.getUILocation();
    this.cameraPanTouchId = event.getID();
    this.cameraPanMoved = false;
    this.cameraPanStartUiLocation = { x: uiLocation.x, y: uiLocation.y };
    this.lastCameraPanUiLocation = { x: uiLocation.x, y: uiLocation.y };
    return true;
  }

  private updateCameraPan(event: EventTouch): void {
    if (!this.mapView || !this.lastCameraPanUiLocation) {
      return;
    }

    const uiLocation = event.getUILocation();
    const previousUiLocation = this.lastCameraPanUiLocation;
    const deltaX = uiLocation.x - this.lastCameraPanUiLocation.x;
    const deltaY = uiLocation.y - this.lastCameraPanUiLocation.y;
    if (
      !this.cameraPanMoved
      && this.cameraPanStartUiLocation
      && Math.hypot(
        uiLocation.x - this.cameraPanStartUiLocation.x,
        uiLocation.y - this.cameraPanStartUiLocation.y,
      ) >= CAMERA_PAN_DRAG_THRESHOLD
    ) {
      this.cameraPanMoved = true;
    }

    this.lastCameraPanUiLocation = { x: uiLocation.x, y: uiLocation.y };

    if (!this.cameraPanMoved) {
      return;
    }

    this.mapView.panCameraByScreenDelta(
      uiLocation.x - previousUiLocation.x,
      uiLocation.y - previousUiLocation.y,
    );
  }

  private updateJoystickVector(event: EventTouch): void {
    if (!this.joystickNode) {
      return;
    }

    const transform = this.joystickNode.getComponent(UITransform);
    if (!transform) {
      return;
    }

    const uiLocation = event.getUILocation();
    const local = transform.convertToNodeSpaceAR(new Vec3(uiLocation.x, uiLocation.y, 0));
    const distance = Math.hypot(local.x, local.y);

    if (distance <= 0.001) {
      this.joystickVector.x = 0;
      this.joystickVector.y = 0;
      this.refreshJoystick();
      return;
    }

    const clamped = Math.min(distance, JOYSTICK_RADIUS);
    const normalizedDistance = clamped / JOYSTICK_RADIUS;
    const adjustedDistance = normalizedDistance <= JOYSTICK_DEAD_ZONE
      ? 0
      : Math.pow(
        (normalizedDistance - JOYSTICK_DEAD_ZONE) / (1 - JOYSTICK_DEAD_ZONE),
        JOYSTICK_RESPONSE_EXPONENT,
      );
    this.joystickVector.x = (local.x / distance) * adjustedDistance;
    this.joystickVector.y = (local.y / distance) * adjustedDistance;
    this.refreshJoystick();
  }

  private clearJoystick(): void {
    this.joystickTouchId = null;
    this.joystickVector.x = 0;
    this.joystickVector.y = 0;
    this.playerMoveVector.x = 0;
    this.playerMoveVector.y = 0;
    if (this.joystickNode) {
      this.joystickNode.setPosition(new Vec3(-280, -260, 0));
    }
    this.refreshJoystick();
  }

  private clearCameraPan(): void {
    this.cameraPanTouchId = null;
    this.cameraPanMoved = false;
    this.cameraPanStartUiLocation = null;
    this.lastCameraPanUiLocation = null;
  }

  private consumeOverlayTouch(event?: EventTouch): void {
    if (!event) {
      return;
    }

    (event as EventTouch & { propagationStopped?: boolean }).propagationStopped = true;
  }

  private handleLieDownPressed(event?: EventTouch): void {
    const player = this.getPlayerActor();
    if (!player || !player.isAlive || player.isLying || !player.canLieDown) {
      return;
    }

    this.tryLieDown(player);
    this.refreshLieDownButton();
  }

  private handlePlacementMenuAction(index: number): void {
    const action = this.placementMenuActions[index];
    if (!action) {
      return;
    }

    switch (action.kind) {
      case "place":
        if (action.optionId) {
          this.handlePlaceOption(action.optionId);
        }
        return;
      case "upgrade":
        if (action.structureId) {
          if (action.structureId.startsWith("door:")) {
            this.handleDoorUpgrade(action.structureId.slice(5));
          } else if (action.structureId.startsWith("bed:")) {
            this.handleBedUpgrade(action.structureId.slice(4));
          } else {
            this.handleUpgradeOption(action.structureId);
          }
        }
        return;
      case "close":
      default:
        this.handlePlacementMenuClose();
    }
  }

  private setPlacementMenuActions(title: string, actions: PlacementMenuAction[]): void {
    this.placementMenuActions = actions;
    if (this.placementMenuLabel) {
      this.placementMenuLabel.string = title;
    }

    if (this.placementMenuCancelButton) {
      this.placementMenuCancelButton.active = true;
    }

    for (let index = 0; index < this.placementMenuButtons.length; index += 1) {
      const button = this.placementMenuButtons[index];
      const label = this.placementMenuButtonLabels[index];
      const action = actions[index];
      button.active = !!action;
      if (action && label) {
        this.applyOverlayButtonStyle(
          button,
          action.kind === "upgrade"
            ? {
              fillColor: new Color(37, 99, 235, 245),
              textColor: new Color(255, 255, 255, 255),
            }
            : action.kind === "close"
            ? {
              fillColor: new Color(226, 232, 240, 255),
              textColor: new Color(51, 65, 85, 255),
            }
            : {
              fillColor: new Color(241, 245, 249, 255),
              textColor: new Color(15, 23, 42, 255),
            },
        );
        label.string = action.label;
      }
    }
  }

  private applyOverlayButtonStyle(button: Node, style: OverlayButtonStyle): void {
    const transform = button.getComponent(UITransform);
    const graphics = button.getComponent(Graphics);
    const label = button.getComponentInChildren(Label);
    if (!transform || !graphics || !label) {
      return;
    }

    const width = style.width ?? transform.contentSize.width;
    const height = style.height ?? transform.contentSize.height;
    const radius = style.radius ?? 14;
    const fillColor = style.fillColor ?? new Color(37, 99, 235, 230);
    const textColor = style.textColor ?? new Color(255, 255, 255, 255);

    transform.setContentSize(width, height);
    graphics.clear();
    graphics.fillColor = fillColor;
    graphics.roundRect(-width * 0.5, -height * 0.5, width, height, radius);
    graphics.fill();

    graphics.strokeColor = new Color(148, 163, 184, fillColor.a >= 240 ? 90 : 0);
    graphics.lineWidth = 2;
    if (fillColor.a >= 240) {
      graphics.roundRect(-width * 0.5, -height * 0.5, width, height, radius);
      graphics.stroke();
    }

    const labelTransform = label.node.getComponent(UITransform);
    labelTransform?.setContentSize(width - 24, height - 14);
    label.color = textColor;
  }

  private handlePlaceOption(optionId: string): void {
    if (!this.placementSystem || !this.placementOriginCell) {
      return;
    }

    const option = this.getPlaceableOption(optionId);
    if (!option || this.playerCoins < option.baseCost) {
      if (this.placementMenuLabel) {
        this.placementMenuLabel.string = "金币不够";
      }
      return;
    }

    const result = this.placementSystem.placeItem(
      option.item,
      this.placementOriginCell.x,
      this.placementOriginCell.y,
      `${option.id}_${this.placementSequence}`,
    );
    if (result.ok) {
      this.playerCoins -= option.baseCost;
      if (result.instanceId) {
        const roomId = this.mapModel?.getCell(
          this.placementOriginCell.x,
          this.placementOriginCell.y,
        )?.roomId ?? "";
        this.placedStructures.set(result.instanceId, {
          instanceId: result.instanceId,
          optionId: option.id,
          level: 1,
          roomId,
          origin: {
            x: this.placementOriginCell.x,
            y: this.placementOriginCell.y,
          },
        });
      }
      this.placementSequence += 1;
      this.closePlacementMenu();
      this.refreshHud();
      return;
    }

    this.placementPreview = result;
    this.mapView?.setPlacementPreview(result);
    if (this.placementMenuLabel) {
      this.placementMenuLabel.string = "这个位置不能放";
    }
  }

  private handleUpgradeOption(structureId: string): void {
    const structure = this.placedStructures.get(structureId);
    if (!structure) {
      this.closePlacementMenu();
      return;
    }

    const upgradeCost = this.getStructureUpgradeCost(structure);
    if (upgradeCost === null) {
      if (this.placementMenuLabel) {
        this.placementMenuLabel.string = "已经满级";
      }
      return;
    }

    if (this.playerCoins < upgradeCost) {
      if (this.placementMenuLabel) {
        this.placementMenuLabel.string = "金币不够";
      }
      return;
    }

    this.playerCoins -= upgradeCost;
    structure.level = Math.min(MAX_STRUCTURE_LEVEL, structure.level + 1);
    this.placedStructures.set(structure.instanceId, structure);
    this.closePlacementMenu();
    this.refreshHud();
  }

  private handleDoorUpgrade(roomId: string): void {
    const room = this.getRoomById(roomId);
    if (!room) {
      this.closePlacementMenu();
      return;
    }

    const upgradeCost = this.getDoorUpgradeCost(room);
    if (upgradeCost === null) {
      if (this.placementMenuLabel) {
        this.placementMenuLabel.string = "门已经满级";
      }
      return;
    }

    if (this.playerCoins < upgradeCost) {
      if (this.placementMenuLabel) {
        this.placementMenuLabel.string = "金币不够";
      }
      return;
    }

    const previousMaxHp = room.doorMaxHp;
    room.doorLevel += 1;
    room.doorMaxHp = this.getDoorLevelConfig(room.doorLevel).maxHp;
    room.doorHp = Math.min(room.doorMaxHp, room.doorHp + (room.doorMaxHp - previousMaxHp));
    if (room.ownerActorId && room.doorHp > 0) {
      room.isDoorClosed = true;
    }

    this.playerCoins -= upgradeCost;
    this.pushUpgradePulse(room.doorCell, "door");
    this.closePlacementMenu();
    this.refreshHud();
    this.refreshGoldHud();
    this.refreshRepairButton();
  }

  private handleBedUpgrade(roomId: string): void {
    const room = this.getRoomById(roomId);
    if (!room) {
      this.closePlacementMenu();
      return;
    }

    const upgradeCost = this.getBedUpgradeCost(room);
    if (upgradeCost === null) {
      if (this.placementMenuLabel) {
        this.placementMenuLabel.string = "病床已经满级";
      }
      return;
    }

    if (this.playerCoins < upgradeCost) {
      if (this.placementMenuLabel) {
        this.placementMenuLabel.string = "金币不够";
      }
      return;
    }

    room.bedLevel += 1;
    this.playerCoins -= upgradeCost;
    this.pushUpgradePulse(room.bedCell, "bed");
    this.closePlacementMenu();
    this.refreshHud();
    this.refreshGoldHud();
  }

  private handlePlacementMenuClose(): void {
    this.closePlacementMenu();
  }

  private handleRepairPressed(): void {
    const player = this.getPlayerActor();
    const room = player?.targetRoomId ? this.getRoomById(player.targetRoomId) : null;
    if (
      !player
      || !room
      || !player.isAlive
      || !player.isLying
      || room.ownerActorId !== player.id
      || room.doorHp >= room.doorMaxHp
    ) {
      return;
    }

    if (this.activeDoorRepairRoomId === room.roomId && this.activeDoorRepairRemaining > 0) {
      this.stopDoorRepair();
      return;
    }

    const repairCost = this.getPlayerDoorRepairCostPerSecond();
    if (this.playerCoins < repairCost) {
      return;
    }

    this.activeDoorRepairRoomId = room.roomId;
    this.activeDoorRepairRemaining = DOOR_REPAIR_DURATION;
    this.activeDoorRepairTickTimer = 0;
    this.refreshRepairButton();
    this.refreshHud();
    this.refreshGoldHud();
  }

  private triggerGameOver(): void {
    if (this.isGameOver || this.isVictory) {
      return;
    }

    this.isGameOver = true;
    this.stopDoorRepair(false);
    this.closePlacementMenu();
    this.clearJoystick();
    this.clearCameraPan();
    if (this.gameOverOverlay) {
      this.gameOverOverlay.active = true;
    }
  }

  private triggerVictory(): void {
    if (this.isVictory || this.isGameOver) {
      return;
    }

    this.isVictory = true;
    this.stopDoorRepair(false);
    this.closePlacementMenu();
    this.clearJoystick();
    this.clearCameraPan();
    this.ghostState.active = false;
    this.ghostState.mode = "inactive";
    this.ghostState.targetActorId = null;
    this.ghostState.targetRoomId = null;
    this.ghostPath = [];
    if (this.victoryOverlay) {
      this.victoryOverlay.active = true;
    }
  }

  private handleReplay(): void {
    this.resetRunState();
  }

  private handleReturnHome(): void {
    const currentSceneName = this.initialSceneName || (director.getScene()?.name ?? "");
    if (HOME_SCENE_NAME && HOME_SCENE_NAME !== currentSceneName) {
      director.loadScene(HOME_SCENE_NAME, (err) => {
        if (err && currentSceneName) {
          director.loadScene(currentSceneName);
        }
      });
      return;
    }

    if (currentSceneName) {
      director.loadScene(currentSceneName);
    }
  }
}
