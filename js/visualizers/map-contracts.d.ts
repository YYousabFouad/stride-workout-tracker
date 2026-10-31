export type Coordinate = [number, number];

export interface RouteUpdate {
  coords: Coordinate[];
  distanceKm: number;
  currentPosition: Coordinate;
  speedKmh: number;
  isMoving: boolean;
}

export interface RouteTrackingOptions {
  initialCoords?: Coordinate[];
  initialDistanceKm?: number;
  onUpdate?: ((update: RouteUpdate) => void) | null;
}
