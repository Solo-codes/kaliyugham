import type { Body } from "../collision";

export type NpcArchetype =
  | "farmer_man"
  | "villager_woman"
  | "elder_man"
  | "landlord"
  | "kalari_student"
  | "fisherman"
  | "kalari_guru"
  | "guard"
  | "karyasthan"
  | "temple_priest";

export type DynamicMoverKind = "kalavandi" | "horse" | "player" | "animal";

export interface DynamicMover extends Body {
  vx: number;
  vz: number;
  kind: DynamicMoverKind;
}

export interface NpcYieldDecision {
  active: boolean;
  mover?: DynamicMover;
  safeX: number;
  safeZ: number;
  /** Whether the NPC has already reached the safe verge and should stop & face the passing mover */
  atSafeVerge: boolean;
  faceX: number;
  faceZ: number;
  /** Speed multiplier when stepping aside (e.g. 1.25 for brisk step, 0.9 for calm elder) */
  evadeSpeedMul: number;
}

export interface NpcBrainContext {
  x: number;
  z: number;
  yaw: number;
  age: number;
  elapsed: number;
  hour: number;
  daylight: number;
  isNight: boolean;
  isPrayerHour: boolean;
  isHeavyRain: boolean;
  distToPlayer: number;
  hasCaneWalkAnim: boolean;
  hasCaneIdleAnim: boolean;
  hasPartner: boolean;
  seedIdx: number;
}

export type NpcArrivalAction = "work" | "smoke" | "pray" | "idle" | "talk" | "argue";

export interface NpcCharacterBrain {
  readonly archetype: NpcArchetype;
  /** How far ahead (meters) this character notices an oncoming Kalavandi/horse */
  readonly trafficLookahead: number;
  /** Desired lateral clearance (meters) from an oncoming vehicle's centerline */
  readonly preferredSideClearance: number;
  /** Speed multiplier when stepping out of the way of an oncoming cart/horse */
  readonly evadeSpeedMul: number;
  /** Whether this character carries a wooden walking stick (Oonnuvadi / Vadi) */
  readonly usesWalkingStick: boolean;
  /** Whether this character can climb roadside Chumaduthangi resting stones */
  readonly canClimbRestingStone: boolean;
  /** Whether this character runs to shelter in heavy monsoon rain */
  readonly runsInHeavyRain: boolean;

  /** Choose what to do upon reaching a waypoint */
  chooseWaypointAction(ctx: NpcBrainContext, job: string, smokeChance: number, prayChance: number): {
    action: NpcArrivalAction;
    duration: number;
  };

  /** Choose greeting animation key when player walks close */
  choosePlayerGreeting(ctx: NpcBrainContext, socialClass: string): "wave" | "greet" | "talk" | "idle";

  /** Choose animation key while waiting on the roadside as a Kalavandi/horse passes */
  chooseYieldWaitAnim(ctx: NpcBrainContext, moverKind: DynamicMoverKind): "idle" | "breathIdle" | "greet" | "caneIdle";

  /** Choose locomotion animation key for normal walking */
  chooseWalkAnim(ctx: NpcBrainContext, carriesLamp: boolean, running: boolean): string;

  /** Choose idle animation key */
  chooseIdleAnim(ctx: NpcBrainContext): string;
}
