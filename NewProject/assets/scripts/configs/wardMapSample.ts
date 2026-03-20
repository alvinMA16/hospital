import { MapCellDefinition, MapDefinition, TileType } from "../gameplay/room/map/MapTypes";

function createCell(x: number, y: number): MapCellDefinition {
  return {
    x,
    y,
    tileType: "void",
    walkable: false,
    buildable: false,
    roomId: null,
    tags: ["void"],
  };
}

function setRect(
  cells: MapCellDefinition[],
  width: number,
  x: number,
  y: number,
  rectWidth: number,
  rectHeight: number,
  patch: Partial<MapCellDefinition>,
): void {
  for (let iy = y; iy < y + rectHeight; iy += 1) {
    for (let ix = x; ix < x + rectWidth; ix += 1) {
      const index = iy * width + ix;
      const current = cells[index];
      cells[index] = {
        ...current,
        ...patch,
        x: ix,
        y: iy,
        tags: patch.tags ? [...patch.tags] : current.tags,
      };
    }
  }
}

function setCell(
  cells: MapCellDefinition[],
  width: number,
  x: number,
  y: number,
  tileType: TileType,
  walkable: boolean,
  buildable: boolean,
  roomId: string | null,
  tags: string[] = [],
): void {
  const index = y * width + x;
  cells[index] = {
    x,
    y,
    tileType,
    walkable,
    buildable,
    roomId,
    tags,
  };
}

function markRoomBuildableSlots(
  cells: MapCellDefinition[],
  width: number,
  roomId: string,
  slots: Array<[number, number]>,
): void {
  for (const [x, y] of slots) {
    const current = cells[y * width + x];
    cells[y * width + x] = {
      ...current,
      buildable: true,
      roomId,
      tags: [...current.tags],
    };
  }
}

function paintRoom(
  cells: MapCellDefinition[],
  mapWidth: number,
  roomId: string,
  x: number,
  y: number,
  roomWidth: number,
  roomHeight: number,
): void {
  setRect(cells, mapWidth, x, y, roomWidth, roomHeight, {
    tileType: "wall",
    walkable: false,
    buildable: false,
    roomId,
    tags: ["room-shell"],
  });

  setRect(cells, mapWidth, x + 1, y + 1, roomWidth - 2, roomHeight - 2, {
    tileType: "floor",
    walkable: true,
    buildable: false,
    roomId,
    tags: ["room-floor"],
  });
}

function createWardMvpMap(): MapDefinition {
  const width = 29;
  const height = 17;
  const cells = Array.from({ length: width * height }, (_, index) =>
    createCell(index % width, Math.floor(index / width)),
  );

  setRect(cells, width, 1, 7, 27, 3, {
    tileType: "floor",
    walkable: true,
    buildable: false,
    roomId: null,
    tags: ["corridor"],
  });

  const rooms = [
    { id: "room_top_1", x: 1, y: 10 },
    { id: "room_top_2", x: 11, y: 10 },
    { id: "room_top_3", x: 21, y: 10 },
    { id: "room_bottom_1", x: 1, y: 1 },
    { id: "room_bottom_2", x: 11, y: 1 },
    { id: "room_bottom_3", x: 21, y: 1 },
  ];

  for (const room of rooms) {
    paintRoom(cells, width, room.id, room.x, room.y, 7, 6);
  }

  const doors = [
    { x: 4, y: 10, roomId: "room_top_1" },
    { x: 14, y: 10, roomId: "room_top_2" },
    { x: 24, y: 10, roomId: "room_top_3" },
    { x: 4, y: 6, roomId: "room_bottom_1" },
    { x: 14, y: 6, roomId: "room_bottom_2" },
    { x: 24, y: 6, roomId: "room_bottom_3" },
  ];

  for (const door of doors) {
    setCell(cells, width, door.x, door.y, "door", false, false, door.roomId, ["door"]);
  }

  const fixedBeds = [
    [2, 13, "room_top_1"],
    [12, 13, "room_top_2"],
    [22, 13, "room_top_3"],
    [2, 2, "room_bottom_1"],
    [12, 2, "room_bottom_2"],
    [22, 2, "room_bottom_3"],
  ] as const;

  for (const [x, y, roomId] of fixedBeds) {
    setCell(cells, width, x, y, "fixed", false, false, roomId, ["bed"]);
  }

  const powerSlots = [
    [6, 12, "room_top_1"],
    [16, 12, "room_top_2"],
    [26, 12, "room_top_3"],
    [6, 3, "room_bottom_1"],
    [16, 3, "room_bottom_2"],
    [26, 3, "room_bottom_3"],
  ] as const;

  for (const [x, y, roomId] of powerSlots) {
    setCell(cells, width, x, y, "floor", true, true, roomId, ["room-floor", "power-slot"]);
  }

  markRoomBuildableSlots(cells, width, "room_top_1", [
    [3, 11],
    [4, 11],
    [5, 11],
    [3, 12],
    [4, 12],
    [5, 12],
  ]);
  markRoomBuildableSlots(cells, width, "room_top_2", [
    [13, 11],
    [14, 11],
    [15, 11],
    [13, 12],
    [14, 12],
    [15, 12],
  ]);
  markRoomBuildableSlots(cells, width, "room_top_3", [
    [23, 11],
    [24, 11],
    [25, 11],
    [23, 12],
    [24, 12],
    [25, 12],
  ]);
  markRoomBuildableSlots(cells, width, "room_bottom_1", [
    [3, 3],
    [4, 3],
    [5, 3],
    [3, 4],
    [4, 4],
    [5, 4],
  ]);
  markRoomBuildableSlots(cells, width, "room_bottom_2", [
    [13, 3],
    [14, 3],
    [15, 3],
    [13, 4],
    [14, 4],
    [15, 4],
  ]);
  markRoomBuildableSlots(cells, width, "room_bottom_3", [
    [23, 3],
    [24, 3],
    [25, 3],
    [23, 4],
    [24, 4],
    [25, 4],
  ]);

  return {
    id: "ward-mvp",
    width,
    height,
    cells,
  };
}

export const WARD_MVP_MAP = createWardMvpMap();
