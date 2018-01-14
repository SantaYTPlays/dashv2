import GPGPU from "./../../GPGPU2.js";
import Car from "../../physics/Car.js";
import xyObstacleGrid from "./gpgpu-programs/xyObstacleGrid.js";
import slObstacleGrid from "./gpgpu-programs/slObstacleGrid.js";
import slObstacleGridDilation from "./gpgpu-programs/slObstacleGridDilation.js";
import xyCostMap from "./gpgpu-programs/xyCostMap.js";

const config = {
  spatialHorizon: 100, // meters
  stationInterval: 0.5, // meters

  xyGridCellSize: 0.3, // meters
  slGridCellSize: 0.15, // meters
  gridMargin: 10, // meters

  lethalDilationS: Car.HALF_CAR_LENGTH + 0.6, // meters
  hazardDilationS: 2, // meters
  lethalDilationL: Car.HALF_CAR_WIDTH + 0.3, //meters
  hazardDilationL: 1, // meters

  laneWidth: 3.7, // meters
  laneShoulderCost: 5,
  laneShoulderLatitude: 3.7 / 2 - Car.HALF_CAR_WIDTH,
  laneCostSlope: 0.5 // cost / meter
};

/* Obstacle cost map:
 *
 * 1. Rasterize triangles from polygonal obstacles into XY-space occupancy grid
 * 2. Convert occupancy grid to SL-space
 *    * Width is spatial horizon of the state lattice
 *    * Height is lane width
 *    * Resolution should be higher than XY-grid
 *    * Get XY position from centerline texture
 *    * Lookup XY in XY occupancy grid (nearest)
 * 3. Dilate SL-space grid using two passes (along station, then along latitude)
 *    * lethal area: half car size + 0.3m
 *    * high cost area: 1 meter
 * 4. Convert back to XY-space using XYSL map
 */

export default class PathPlanner {
  constructor() {
  }

  plan(lanePath, obstacles) {
    const centerlineRaw = lanePath.sampleStations(0, Math.ceil(config.spatialHorizon / config.stationInterval), config.stationInterval);

    // Transform all centerline points into vehicle frame
    const vehicleXform = vehicleTransform(centerlineRaw[0]);
    const rot = centerlineRaw[0].rot;
    const centerline = centerlineRaw.map(c => { return { pos: c.pos.clone().applyMatrix3(vehicleXform), rot: c.rot - rot, curv: c.curv } });

    const centerlineBuffer = GPGPU.alloc(centerline.length, 3);
    const maxPoint = new THREE.Vector2(0, 0);
    const minPoint = new THREE.Vector2(0, 0);

    for (let i = 0; i < centerline.length; i++) {
      const sample = centerline[i];
      const pos = sample.pos;
      centerlineBuffer[i * 3 + 0] = pos.x;
      centerlineBuffer[i * 3 + 1] = pos.y;
      centerlineBuffer[i * 3 + 2] = sample.rot;

      maxPoint.max(pos);
      minPoint.min(pos);
    }

    const diff = maxPoint.clone().sub(minPoint);
    const xyCenterPoint = minPoint.clone().add(maxPoint).divideScalar(2);
    const xyWidth = Math.ceil((diff.x + config.gridMargin * 2) / config.xyGridCellSize);
    const xyHeight = Math.ceil((diff.y + config.gridMargin * 2) / config.xyGridCellSize);

    const slCenterPoint = new THREE.Vector2(config.spatialHorizon / 2, 0);
    const slObstacleWidth = Math.ceil(config.spatialHorizon / config.slGridCellSize);
    const slObstacleHeight = Math.ceil((config.laneWidth + config.gridMargin * 2) / config.slGridCellSize);

    const programs = [
      xyObstacleGrid(config, xyWidth, xyHeight, xyCenterPoint, vehicleXform, obstacles),
      slObstacleGrid(config, slObstacleWidth, slObstacleHeight, slCenterPoint, xyCenterPoint),
      ...slObstacleGridDilation(config, slObstacleWidth, slObstacleHeight),
      xyCostMap(config, xyWidth, xyHeight, xyCenterPoint, slCenterPoint)
    ];

    const shared = {
      centerline: {
        width: centerline.length,
        height: 1,
        channels: 3,
        data: centerlineBuffer
      }
    }

    const gpgpu = new GPGPU(programs, shared);
    return { xysl: gpgpu.run()[4], width: xyWidth, height: xyHeight, center: xyCenterPoint.applyMatrix3((new THREE.Matrix3()).getInverse(vehicleXform)), rot: centerlineRaw[0].rot };
  }
}

PathPlanner.config = config;

function vehicleTransform({ pos, rot }) {
  const translate = new THREE.Matrix3();
  translate.set(
    1, 0, -pos.x,
    0, 1, -pos.y,
    0, 0, 1
  );

  const cosRot = Math.cos(rot);
  const sinRot = Math.sin(rot);

  const rotate = new THREE.Matrix3();
  rotate.set(
    cosRot, sinRot, 0,
    -sinRot, cosRot, 0,
    0, 0, 1
  );

  return rotate.multiply(translate);
}

function obstacleTransform(vehicleXform, xyCenterPoint, width, height) {
  const translate = new THREE.Matrix3();
  translate.set(
    1, 0, -xyCenterPoint.x,
    0, 1, -xyCenterPoint.y,
    0, 0, 1
  );

  const scale = new THREE.Matrix3();
  scale.set(
    2 / width, 0, 0,
    0, 2 / height, 0,
    0, 0, 1
  );

  return scale.multiply(translate).multiply(vehicleXform);
}