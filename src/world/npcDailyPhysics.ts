import * as THREE from "three";

export type DailyPeriod =
  | "dawn_prayers"
  | "morning_training_market"
  | "midday_shade"
  | "afternoon_work"
  | "evening_lamps"
  | "night_rest";

export type DailyScheduleState = {
  period: DailyPeriod;
  kalariActive: boolean;
  marketActive: boolean;
  fieldActive: boolean;
  templeActive: boolean;
  crowdWalkSpeedMult: number;
};

/**
 * Computes authentic 18th-century Kerala village daily activity windows from game hour (0..24).
 */
export function getDailyScheduleState(hour: number): DailyScheduleState {
  if (hour >= 5 && hour < 7) {
    return {
      period: "dawn_prayers",
      kalariActive: true, // Traditional dawn Kalaripayattu practice (Uzhichil & Mei-payattu)
      marketActive: false,
      fieldActive: true,
      templeActive: true,
      crowdWalkSpeedMult: 0.92,
    };
  }
  if (hour >= 7 && hour < 12) {
    return {
      period: "morning_training_market",
      kalariActive: true,
      marketActive: true,
      fieldActive: true,
      templeActive: false,
      crowdWalkSpeedMult: 1.0,
    };
  }
  if (hour >= 12 && hour < 15) {
    return {
      period: "midday_shade",
      kalariActive: false, // Midday heat rest
      marketActive: true,
      fieldActive: false,
      templeActive: false,
      crowdWalkSpeedMult: 0.82,
    };
  }
  if (hour >= 15 && hour < 18) {
    return {
      period: "afternoon_work",
      kalariActive: true, // Late-afternoon weapons & sparring session
      marketActive: true,
      fieldActive: true,
      templeActive: false,
      crowdWalkSpeedMult: 0.98,
    };
  }
  if (hour >= 18 && hour < 20.5) {
    return {
      period: "evening_lamps",
      kalariActive: false,
      marketActive: false,
      fieldActive: false,
      templeActive: true, // Deeparadhana & evening socializing
      crowdWalkSpeedMult: 0.88,
    };
  }
  return {
    period: "night_rest",
    kalariActive: false,
    marketActive: false,
    fieldActive: false,
    templeActive: false,
    crowdWalkSpeedMult: 0.78,
  };
}

export type CrowdPhysicsAgent = {
  object: THREE.Object3D;
  radius: number;
  mobile: boolean;
};

/**
 * Soft NPC-to-NPC & NPC-to-player separation physics + smooth terrain grounding so characters
 * never walk through each other or stack on roads.
 */
export function applyNpcCrowdPhysics(
  agents: CrowdPhysicsAgent[],
  playerX: number,
  playerZ: number,
  terrainHeightFn: (x: number, z: number) => number,
  delta: number,
) {
  const step = Math.min(delta, 0.05);
  const maxPush = 1.6 * step;

  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!a.mobile || !a.object.visible) continue;

    let pushX = 0;
    let pushZ = 0;

    // Soft separation from other nearby NPCs
    for (let j = 0; j < agents.length; j++) {
      if (i === j) continue;
      const b = agents[j];
      if (!b.object.visible) continue;
      const dx = a.object.position.x - b.object.position.x;
      const dz = a.object.position.z - b.object.position.z;
      const minDist = a.radius + b.radius + 0.24;
      const distSq = dx * dx + dz * dz;
      if (distSq > 0.0001 && distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        const strength = ((minDist - dist) / minDist) * 1.35;
        pushX += (dx / dist) * strength;
        pushZ += (dz / dist) * strength;
      }
    }

    // Soft yield around the player so NPCs step naturally aside instead of clipping through Neelan
    const pdx = a.object.position.x - playerX;
    const pdz = a.object.position.z - playerZ;
    const pMin = a.radius + 0.55;
    const pDistSq = pdx * pdx + pdz * pdz;
    if (pDistSq > 0.0001 && pDistSq < pMin * pMin) {
      const pDist = Math.sqrt(pDistSq);
      const strength = ((pMin - pDist) / pMin) * 1.8;
      pushX += (pdx / pDist) * strength;
      pushZ += (pdz / pDist) * strength;
    }

    const pushMag = Math.hypot(pushX, pushZ);
    if (pushMag > 0.0001) {
      const clamped = Math.min(pushMag * step, maxPush);
      a.object.position.x += (pushX / pushMag) * clamped;
      a.object.position.z += (pushZ / pushMag) * clamped;
      // Re-ground smoothly on the terrain after lateral physics push
      const targetY = terrainHeightFn(a.object.position.x, a.object.position.z);
      a.object.position.y = THREE.MathUtils.damp(a.object.position.y, targetY, 10, step);
    }
  }
}

export type KalariPracticeTarget = {
  figure: THREE.Object3D;
  baseX: number;
  baseZ: number;
  baseRotY: number;
  working: boolean;
};

/**
 * Coordinates Kalaripayattu training physics: the Kalari Guru demonstrates & pivots toward each
 * student while the 3 students execute rhythmic Vadivu stances, lunges, and guard pivots in sync.
 */
export function updateKalariPracticePhysics(
  guru: KalariPracticeTarget,
  students: KalariPracticeTarget[],
  elapsed: number,
  delta: number,
  active: boolean,
) {
  const step = Math.min(delta, 0.05);

  // Kalari Guru: stays firmly planted on the red-earth floor (y = 0.1) while turning to guide each student
  if (guru.working) {
    const focusIdx = Math.floor(elapsed * 0.22) % Math.max(1, students.length);
    const focusStudent = students[focusIdx];
    const targetRot =
      active && focusStudent
        ? Math.atan2(
            focusStudent.figure.position.x - guru.figure.position.x,
            focusStudent.figure.position.z - guru.figure.position.z,
          ) + Math.PI
        : guru.baseRotY;
    guru.figure.position.y = 0.1;
    guru.figure.rotation.y = THREE.MathUtils.damp(guru.figure.rotation.y, targetRot, 4, step);
  }

  // Kalari Students: feet stay firmly planted on the red-earth floor (y = 0.1) with grounded martial pivots
  students.forEach((st, idx) => {
    if (!st.working) return;
    const phase = elapsed * 2.0 + idx * 0.9;
    const pivot = active ? Math.sin(phase * 0.5) * 0.18 : 0;

    st.figure.position.x = THREE.MathUtils.damp(st.figure.position.x, st.baseX, 6, step);
    st.figure.position.z = THREE.MathUtils.damp(st.figure.position.z, st.baseZ, 6, step);
    st.figure.position.y = 0.1;
    st.figure.rotation.y = THREE.MathUtils.damp(st.figure.rotation.y, st.baseRotY + pivot, 5, step);
  });
}
