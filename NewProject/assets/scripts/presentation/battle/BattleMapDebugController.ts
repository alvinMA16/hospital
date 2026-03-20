import { Component, EventTouch, Node, _decorator } from "cc";
import { WARD_MVP_MAP } from "../../configs/wardMapSample";
import { PlacementSystem } from "../../gameplay/room/PlacementSystem";
import { RoomMapModel } from "../../gameplay/room/RoomMapModel";
import {
  GridCoord,
  PlacementItemDefinition,
  PlacementValidationResult,
} from "../../gameplay/room/map/MapTypes";
import { BattleMapView } from "./BattleMapView";

const { ccclass, requireComponent } = _decorator;

const MONITOR: PlacementItemDefinition = {
  id: "monitor",
  width: 1,
  height: 1,
  blocksMovement: false,
  requiredTagsAll: ["power-slot"],
};

const TEST_SUPPLY_BOX: PlacementItemDefinition = {
  id: "test_supply_box",
  width: 1,
  height: 1,
  blocksMovement: true,
};

@ccclass("BattleMapDebugController")
@requireComponent(BattleMapView)
export class BattleMapDebugController extends Component {
  private mapModel: RoomMapModel | null = null;
  private placementSystem: PlacementSystem | null = null;
  private mapView: BattleMapView | null = null;
  private placementPreview: PlacementValidationResult | null = null;
  private previewOrigin: GridCoord | null = null;
  private placementSequence = 0;

  start(): void {
    this.mapModel = new RoomMapModel(WARD_MVP_MAP);
    this.placementSystem = new PlacementSystem(this.mapModel);
    this.mapView = this.getComponent(BattleMapView);

    this.placementSystem.placeItem(MONITOR, 6, 12, "room_top_1_monitor");
    this.mapView?.setMapModel(this.mapModel);
    this.bindInput();
  }

  onDestroy(): void {
    this.unbindInput();
  }

  private bindInput(): void {
    this.node.on(Node.EventType.TOUCH_START, this.onTouchUpdate, this);
    this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchUpdate, this);
    this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
  }

  private unbindInput(): void {
    this.node.off(Node.EventType.TOUCH_START, this.onTouchUpdate, this);
    this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchUpdate, this);
    this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
  }

  private onTouchUpdate(event: EventTouch): void {
    if (!this.placementSystem || !this.mapView) {
      return;
    }

    const uiLocation = event.getUILocation();
    const cell = this.mapView.pickCellAtUILocation(uiLocation.x, uiLocation.y);
    if (!cell) {
      this.previewOrigin = null;
      this.placementPreview = null;
      this.mapView.setPlacementPreview(null);
      return;
    }

    this.previewOrigin = cell;
    this.placementPreview = this.placementSystem.validatePlacement(TEST_SUPPLY_BOX, cell.x, cell.y);
    this.mapView.setPlacementPreview(this.placementPreview);
  }

  private onTouchEnd(event: EventTouch): void {
    this.onTouchUpdate(event);

    if (
      !this.placementSystem ||
      !this.mapView ||
      !this.previewOrigin ||
      !this.placementPreview?.ok
    ) {
      return;
    }

    this.placementSequence += 1;
    this.placementSystem.placeItem(
      TEST_SUPPLY_BOX,
      this.previewOrigin.x,
      this.previewOrigin.y,
      `test_supply_box_${this.placementSequence}`,
    );

    this.placementPreview = null;
    this.mapView.setPlacementPreview(null);
  }

  private onTouchCancel(): void {
    this.previewOrigin = null;
    this.placementPreview = null;
    this.mapView?.setPlacementPreview(null);
  }
}
