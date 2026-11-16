import * as THREE from "three";
/** Afternoon utsavam every other day; starts on the first playable day. */
export function sampleFestival(day: number, hour: number) {
  const festivalDay = day % 2 === 0;
  return {
    decorated: festivalDay && hour >= 10 && hour < 21,
    active: festivalDay && hour >= 15 && hour < 20,
    arriving: festivalDay && hour >= 14 && hour < 15,
  };
}
export function shopFacing(
  x: number,
  z: number,
  road: { x: number; z: number },
) {
  return Math.atan2(x - road.x, z - road.z);
}
export function makeFestivalOrnaments(center: boolean) {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({
    color: "#c8a342",
    metalness: 0.65,
    roughness: 0.4,
  });
  const red = new THREE.MeshStandardMaterial({
    color: "#8f292b",
    roughness: 0.85,
  });
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.65, 20, 12, 0, Math.PI, 0, Math.PI),
    gold,
  );
  cap.scale.set(0.75, 1.3, 0.12);
  cap.position.set(0, 2.1, -1.7);
  group.add(cap);
  for (let row = 0; row < 5; row++)
    for (let col = -2; col <= 2; col++) {
      const disc = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), gold);
      disc.position.set(col * 0.15, 2.65 - row * 0.23, -1.81);
      group.add(disc);
    }
  for (const side of [-1, 1]) {
    const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.25, 6), red);
    tassel.position.set(side * 0.48, 1.48, -1.7);
    group.add(tassel);
  }
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 1.8), red);
  cloth.position.set(0, 2.9, 0.15);
  group.add(cloth);
  const parasol = new THREE.Mesh(
    new THREE.ConeGeometry(0.85, 0.35, 24),
    new THREE.MeshStandardMaterial({
      color: center ? "#a32939" : "#705b9e",
      roughness: 0.55,
      side: THREE.DoubleSide,
    }),
  );
  parasol.position.set(0.25, 5.25, 0.25);
  group.add(parasol);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 1.7, 8),
    gold,
  );
  pole.position.set(0.25, 4.35, 0.25);
  group.add(pole);
  for (let bead = 0; bead < 24; bead++) {
    const angle = (bead / 24) * Math.PI * 2;
    const ornament = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 6, 5),
      gold,
    );
    ornament.position.set(
      0.25 + Math.cos(angle) * 0.8,
      5.07,
      0.25 + Math.sin(angle) * 0.8,
    );
    group.add(ornament);
  }
  if (center) {
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.75, 0.1), gold);
    plaque.position.set(0, 3.55, -0.65);
    group.add(plaque);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.045, 8, 24),
      gold,
    );
    halo.position.set(0, 3.8, -0.73);
    group.add(halo);
    const idol = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), gold);
    idol.scale.y = 1.5;
    idol.position.set(0, 3.65, -0.79);
    group.add(idol);
  }
  return group;
}

/** Original synthesized percussion pattern, not a sampled recording. */
export class FestivalPercussion {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private lastBeat = -1;
  enabled = false;
  async toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.context ??= new AudioContext();
      if (!this.master) {
        this.master = this.context.createGain();
        this.master.connect(this.context.destination);
      }
      await this.context.resume();
    }
    return this.enabled;
  }
  update(time: number, active: boolean, distance: number) {
    const ctx = this.context,
      master = this.master;
    if (!ctx || !master) return;
    const volume =
      this.enabled && active ? Math.max(0, 1 - distance / 35) * 0.1 : 0;
    master.gain.setTargetAtTime(volume, ctx.currentTime, 0.04);
    const beat = Math.floor(time * 5);
    if (volume === 0 || beat === this.lastBeat) return;
    this.lastBeat = beat;
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(beat % 4 === 0 ? 170 : 270, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.8, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}
