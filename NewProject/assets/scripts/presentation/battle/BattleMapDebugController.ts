import {
  Color,
  Component,
  director,
  EventTouch,
  Graphics,
  Label,
  Node,
  UITransform,
  Vec3,
  _decorator,
} from "cc";
import { WARD_MVP_MAP } from "../../configs/wardMapSample";
import { PlacementSystem } from "../../gameplay/room/PlacementSystem";
import { RoomMapModel } from "../../gameplay/room/RoomMapModel";
import {
  ActorRuntimeState,
  GhostRuntimeState,
  GridCoord,
  PlacementItemDefinition,
  PlacementValidationResult,
  RoomRuntimeState,
  RoomOccupantKind,
} from "../../gameplay/room/map/MapTypes";
import { BattleMapView } from "./BattleMapView";

const { ccclass, requireComponent } = _decorator;

const SETUP_DURATION = 30;
const ACTOR_MOVE_SPEED = 3.35;
const DOOR_MAX_HP = 8;
const GHOST_MOVE_SPEED = 4.8;
const GHOST_KILL_RADIUS = 0.72;
const GHOST_REPATH_INTERVAL = 0.35;
const GHOST_ATTACK_INTERVAL = 0.75;
const GHOST_ATTACK_DAMAGE = 1;
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
const PLAYER_START_REPAIR_POINTS = 5;
const PLAYER_MAX_REPAIR_POINTS = 8;
const PLAYER_REPAIR_REGEN_INTERVAL = 4.5;
const PLAYER_REPAIR_COST = 1;
const PLAYER_REPAIR_AMOUNT = 1;
const CAMERA_PAN_DRAG_THRESHOLD = 4;

interface PlaceableOption {
  id: string;
  label: string;
  item: PlacementItemDefinition;
}

const PLACEABLE_OPTIONS: PlaceableOption[] = [
  {
    id: "monitor",
    label: "监护仪",
    item: { id: "monitor", width: 1, height: 1, blocksMovement: false },
  },
  {
    id: "medicine_cart",
    label: "药车",
    item: { id: "medicine_cart", width: 1, height: 1, blocksMovement: true },
  },
  {
    id: "screen",
    label: "屏风",
    item: { id: "screen", width: 1, height: 1, blocksMovement: true },
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
  private mapModel: RoomMapModel | null = null;
  private placementSystem: PlacementSystem | null = null;
  private mapView: BattleMapView | null = null;
  private roomStates: RoomRuntimeState[] = [];
  private actors: ActorRuntimeState[] = [];
  private ghostState: GhostRuntimeState = {
    active: false,
    x: GHOST_SPAWN.x,
    y: GHOST_SPAWN.y,
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
  private placementMenuLabel: Label | null = null;
  private placementOriginCell: GridCoord | null = null;
  private placementPreview: PlacementValidationResult | null = null;
  private placementSequence = 0;
  private playerRepairPoints = PLAYER_START_REPAIR_POINTS;
  private playerRepairRegenTimer = PLAYER_REPAIR_REGEN_INTERVAL;
  private isGameOver = false;
  private gameOverOverlay: Node | null = null;

  start(): void {
    this.mapModel = new RoomMapModel(WARD_MVP_MAP);
    this.placementSystem = new PlacementSystem(this.mapModel);
    this.mapView = this.getComponent(BattleMapView);
    this.roomStates = this.createRoomStates();
    this.actors = this.createActors();
    for (const room of this.roomStates) {
      this.mapModel.setRoomFloorBuildable(room.roomId, false);
    }

    this.mapView?.setMapModel(this.mapModel);
    const player = this.getPlayerActor();
    if (player) {
      this.mapView?.setCameraCenter(player.x, player.y, false);
    }
    this.mapView?.setSimulationState(this.roomStates, this.actors, this.ghostState);
    this.ensureHud();
    this.ensureCenterCountdown();
    this.ensureJoystick();
    this.ensureLieDownButton();
    this.ensureRepairButton();
    this.ensurePlacementMenu();
    this.ensureGameOverOverlay();
    this.refreshCamera();
    this.refreshJoystick();
    this.refreshLieDownButton();
    this.refreshRepairButton();
    this.refreshHud();
    this.bindInput();
    this.scheduleOnce(() => {
      this.refreshCamera();
      this.refreshLieDownButton();
      this.mapView?.setSimulationState(this.roomStates, this.actors, this.ghostState);
    }, 0);
  }

  onDestroy(): void {
    this.unbindInput();
  }

  update(dt: number): void {
    if (this.isGameOver) {
      this.refreshJoystick();
      this.refreshLieDownButton();
      this.refreshRepairButton();
      this.refreshHud();
      this.refreshCenterCountdown();
      this.mapView?.setSimulationState(this.roomStates, this.actors, this.ghostState);
      return;
    }

    this.setupCountdown = Math.max(0, this.setupCountdown - dt);

    this.updateActors(dt);
    this.updatePlayerRepairEconomy(dt);
    this.updateGhost(dt);
    if (this.ghostState.active) {
      this.resolveGhostKills();
    }
    this.refreshCamera();
    this.refreshJoystick();
    this.refreshLieDownButton();
    this.refreshRepairButton();
    this.refreshHud();
    this.refreshCenterCountdown();
    this.mapView?.setSimulationState(this.roomStates, this.actors, this.ghostState);
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
    if (this.isGameOver) {
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
    if (this.isGameOver) {
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
    if (this.isGameOver) {
      return;
    }

    if (this.isPlacementMenuOpen()) {
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
    if (this.isGameOver) {
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
      return;
    }

    if (!this.ghostState.active) {
      this.ghostState.active = true;
      this.ghostState.mode = "patrol";
      this.ghostState.x = GHOST_SPAWN.x;
      this.ghostState.y = GHOST_SPAWN.y;
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
          this.ghostAttackTimer = GHOST_ATTACK_INTERVAL;
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
        doorCell: { x: doorCell.x, y: doorCell.y },
        bedAccessCell: { x: bedCell.x + 1, y: bedCell.y },
        isDoorClosed: false,
        doorMaxHp: DOOR_MAX_HP,
        doorHp: DOOR_MAX_HP,
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

    const player = this.getPlayerActor();
    const playerRoom = player?.targetRoomId ? this.getRoomById(player.targetRoomId) : null;
    const playerDoorHp = playerRoom ? `${playerRoom.doorHp}/${playerRoom.doorMaxHp}` : "--";
    const aliveAi = this.actors.filter((actor) => actor.kind === "ai" && actor.isAlive).length;
    const settledCount = this.roomStates.filter((room) => room.isDoorClosed).length;

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
      + `已锁门病房: ${settledCount}/6  AI存活: ${aliveAi}  护理点: ${this.playerRepairPoints}\n`
      + `你的门血: ${playerDoorHp}\n`
      + `${playerText}\n`
      + `${ghostText}`;
  }

  private ensurePlacementMenu(): void {
    let menuNode = this.node.getChildByName("PlacementMenu");
    if (!menuNode) {
      menuNode = new Node("PlacementMenu");
      menuNode.layer = this.node.layer;
      menuNode.active = false;
      this.node.addChild(menuNode);

      const blockerTransform = menuNode.addComponent(UITransform);
      blockerTransform.setContentSize(960, 640);
      const blockerGraphics = menuNode.addComponent(Graphics);
      blockerGraphics.fillColor = new Color(15, 23, 42, 120);
      blockerGraphics.rect(-480, -320, 960, 640);
      blockerGraphics.fill();
      menuNode.on(Node.EventType.TOUCH_END, this.handlePlacementMenuClose, this);

      const panel = new Node("Panel");
      panel.layer = this.node.layer;
      menuNode.addChild(panel);
      panel.setPosition(new Vec3(0, -10, 0));

      const panelTransform = panel.addComponent(UITransform);
      panelTransform.setContentSize(360, 300);
      const panelGraphics = panel.addComponent(Graphics);
      panelGraphics.fillColor = new Color(248, 250, 252, 245);
      panelGraphics.roundRect(-180, -150, 360, 300, 22);
      panelGraphics.fill();

      const titleNode = new Node("Title");
      titleNode.layer = this.node.layer;
      panel.addChild(titleNode);
      titleNode.setPosition(new Vec3(0, 105, 0));
      const titleTransform = titleNode.addComponent(UITransform);
      titleTransform.setContentSize(280, 52);
      const titleLabel = titleNode.addComponent(Label);
      titleLabel.fontSize = 24;
      titleLabel.lineHeight = 30;
      titleLabel.horizontalAlign = 1;
      titleLabel.verticalAlign = 1;
      titleLabel.color = new Color(15, 23, 42, 255);
      titleLabel.string = "选择放置物";
      this.placementMenuLabel = titleLabel;

      let offsetY = 34;
      for (const option of PLACEABLE_OPTIONS) {
        const button = this.createOverlayButton(option.label, new Vec3(0, offsetY, 0));
        button.name = `PlaceOption:${option.id}`;
        button.on(Node.EventType.TOUCH_END, () => this.handlePlaceOption(option.id), this);
        panel.addChild(button);
        offsetY -= 84;
      }

      const cancelButton = this.createOverlayButton("取消", new Vec3(0, -118, 0));
      cancelButton.on(Node.EventType.TOUCH_END, this.handlePlacementMenuClose, this);
      panel.addChild(cancelButton);
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
      buttonNode = this.createOverlayButton("躺下", new Vec3(0, 0, 0));
      buttonNode.name = "LieDownButton";
      buttonNode.active = false;
      buttonNode.on(Node.EventType.TOUCH_END, this.handleLieDownPressed, this);
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
      buttonNode = this.createOverlayButton("修门", new Vec3(250, -260, 0));
      buttonNode.name = "RepairButton";
      buttonNode.active = false;
      buttonNode.on(Node.EventType.TOUCH_END, this.handleRepairPressed, this);
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
      && room.doorHp < room.doorMaxHp
      && this.playerRepairPoints >= PLAYER_REPAIR_COST
      && !this.isGameOver;
    this.repairButtonNode.active = canRepair;

    const label = this.repairButtonNode.getComponentInChildren(Label);
    if (label) {
      label.string = `修门\n${PLAYER_REPAIR_COST}点`;
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
    if (
      !mapCell
      || mapCell.roomId !== actor.targetRoomId
      || !mapCell.buildable
      || mapCell.occupantId
    ) {
      this.closePlacementMenu();
      return;
    }

    this.openPlacementMenu(cell);
  }

  private openPlacementMenu(cell: GridCoord): void {
    if (!this.placementMenuNode) {
      return;
    }

    if (this.placementMenuLabel) {
      this.placementMenuLabel.string = "选择放置物";
    }
    this.placementOriginCell = cell;
    this.placementPreview = {
      ok: true,
      cells: [cell],
    };
    this.mapView?.setPlacementPreview(this.placementPreview);
    this.placementMenuNode.active = true;
  }

  private closePlacementMenu(): void {
    this.placementOriginCell = null;
    this.placementPreview = null;
    this.mapView?.setPlacementPreview(null);
    if (this.placementMenuNode) {
      this.placementMenuNode.active = false;
    }
  }

  private updatePlayerRepairEconomy(dt: number): void {
    const player = this.getPlayerActor();
    if (!player || !player.isAlive || !player.isLying) {
      this.playerRepairRegenTimer = PLAYER_REPAIR_REGEN_INTERVAL;
      return;
    }

    if (this.playerRepairPoints >= PLAYER_MAX_REPAIR_POINTS) {
      this.playerRepairRegenTimer = PLAYER_REPAIR_REGEN_INTERVAL;
      return;
    }

    this.playerRepairRegenTimer -= dt;
    if (this.playerRepairRegenTimer > 0) {
      return;
    }

    this.playerRepairPoints = Math.min(PLAYER_MAX_REPAIR_POINTS, this.playerRepairPoints + 1);
    this.playerRepairRegenTimer = PLAYER_REPAIR_REGEN_INTERVAL;
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
      const overlayGraphics = overlay.addComponent(Graphics);
      overlayGraphics.fillColor = new Color(15, 23, 42, 188);
      overlayGraphics.rect(-480, -320, 960, 640);
      overlayGraphics.fill();

      const panel = new Node("Panel");
      panel.layer = this.node.layer;
      overlay.addChild(panel);
      panel.setPosition(new Vec3(0, 40, 0));

      const panelTransform = panel.addComponent(UITransform);
      panelTransform.setContentSize(440, 280);
      const panelGraphics = panel.addComponent(Graphics);
      panelGraphics.fillColor = new Color(248, 250, 252, 242);
      panelGraphics.roundRect(-220, -140, 440, 280, 22);
      panelGraphics.fill();

      const titleNode = new Node("Title");
      titleNode.layer = this.node.layer;
      panel.addChild(titleNode);
      titleNode.setPosition(new Vec3(0, 52, 0));
      const titleTransform = titleNode.addComponent(UITransform);
      titleTransform.setContentSize(360, 120);
      const titleLabel = titleNode.addComponent(Label);
      titleLabel.fontSize = 30;
      titleLabel.lineHeight = 40;
      titleLabel.horizontalAlign = 1;
      titleLabel.verticalAlign = 1;
      titleLabel.color = new Color(15, 23, 42, 255);
      titleLabel.string = "游戏结束\n你被鬼挠死了";

      const homeButton = this.createOverlayButton("返回首页", new Vec3(-105, -56, 0));
      homeButton.on(Node.EventType.TOUCH_END, this.handleReturnHome, this);
      panel.addChild(homeButton);

      const replayButton = this.createOverlayButton("再来一局", new Vec3(105, -56, 0));
      replayButton.on(Node.EventType.TOUCH_END, this.handleReplay, this);
      panel.addChild(replayButton);
    }

    overlay.active = false;
    this.gameOverOverlay = overlay;
  }

  private createOverlayButton(labelText: string, position: Vec3): Node {
    const buttonNode = new Node(labelText);
    buttonNode.layer = this.node.layer;
    buttonNode.setPosition(position);

    const transform = buttonNode.addComponent(UITransform);
    transform.setContentSize(170, 64);

    const graphics = buttonNode.addComponent(Graphics);
    graphics.fillColor = new Color(37, 99, 235, 230);
    graphics.roundRect(-85, -32, 170, 64, 16);
    graphics.fill();

    const labelNode = new Node("Label");
    labelNode.layer = this.node.layer;
    buttonNode.addChild(labelNode);
    const labelTransform = labelNode.addComponent(UITransform);
    labelTransform.setContentSize(150, 42);
    const label = labelNode.addComponent(Label);
    label.fontSize = 24;
    label.lineHeight = 30;
    label.horizontalAlign = 1;
    label.verticalAlign = 1;
    label.color = new Color(255, 255, 255, 255);
    label.string = labelText;

    return buttonNode;
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
    return !!player && player.isAlive && !player.isLying && !this.isGameOver;
  }

  private canPanCamera(): boolean {
    const player = this.getPlayerActor();
    return !!player && player.isAlive && player.isLying && !this.isGameOver;
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

  private handleLieDownPressed(event?: EventTouch): void {
    const player = this.getPlayerActor();
    if (!player || !player.isAlive || player.isLying || !player.canLieDown) {
      return;
    }

    this.tryLieDown(player);
    this.refreshLieDownButton();
  }

  private handlePlaceOption(optionId: string): void {
    if (!this.placementSystem || !this.placementOriginCell) {
      return;
    }

    const option = PLACEABLE_OPTIONS.find((entry) => entry.id === optionId);
    if (!option) {
      return;
    }

    const result = this.placementSystem.placeItem(
      option.item,
      this.placementOriginCell.x,
      this.placementOriginCell.y,
      `${option.id}_${this.placementSequence}`,
    );
    if (result.ok) {
      this.placementSequence += 1;
      this.closePlacementMenu();
      return;
    }

    this.placementPreview = result;
    this.mapView?.setPlacementPreview(result);
    if (this.placementMenuLabel) {
      this.placementMenuLabel.string = "这个位置不能放";
    }
  }

  private handlePlacementMenuClose(): void {
    if (this.placementMenuLabel) {
      this.placementMenuLabel.string = "选择放置物";
    }
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
      || this.playerRepairPoints < PLAYER_REPAIR_COST
      || room.doorHp >= room.doorMaxHp
    ) {
      return;
    }

    this.playerRepairPoints -= PLAYER_REPAIR_COST;
    room.doorHp = Math.min(room.doorMaxHp, room.doorHp + PLAYER_REPAIR_AMOUNT);
    if (room.doorHp > 0) {
      room.isDoorClosed = true;
    }

    this.refreshRepairButton();
    this.refreshHud();
  }

  private triggerGameOver(): void {
    if (this.isGameOver) {
      return;
    }

    this.isGameOver = true;
    this.closePlacementMenu();
    this.clearJoystick();
    this.clearCameraPan();
    if (this.gameOverOverlay) {
      this.gameOverOverlay.active = true;
    }
  }

  private handleReplay(): void {
    const currentSceneName = director.getScene()?.name;
    if (currentSceneName) {
      director.loadScene(currentSceneName);
    }
  }

  private handleReturnHome(): void {
    const currentSceneName = director.getScene()?.name ?? "";
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
