import test from "node:test";
import assert from "node:assert/strict";
import {
  DAY_SECONDS,
  sampleDayNight,
  simulationDay,
  WeatherCycle,
} from "../src/world/environment.ts";

test("the clock starts in the morning and completes a full day", () => {
  const morning = sampleDayNight(0);
  const noon = sampleDayNight(DAY_SECONDS / 6);
  const night = sampleDayNight((DAY_SECONDS * 14) / 24);
  assert.equal(morning.label, "08:00 · Morning");
  assert.equal(noon.hour, 12);
  assert.ok(noon.daylight > 0.99);
  assert.equal(night.hour, 22);
  assert.ok(night.daylight < 0.01);
  assert.equal(sampleDayNight(DAY_SECONDS).label, morning.label);
  assert.equal(DAY_SECONDS, 720);
  assert.equal(simulationDay(0), 0);
  assert.equal(simulationDay(720), 1);
});

test("weather changes randomly and rain fades in rather than appearing abruptly", () => {
  const samples = [0, 0.999, 0];
  const weather = new WeatherCycle(() => samples.shift() ?? 0);
  assert.deepEqual(weather.sample(0), {
    kind: "clear",
    label: "Clear",
    cloud: 0.05,
    rain: 0,
  });
  const beginning = weather.sample(32);
  const halfway = weather.sample(35);
  const settled = weather.sample(38);
  assert.equal(beginning.kind, "monsoon");
  assert.equal(beginning.rain, 0);
  assert.ok(halfway.rain > 0 && halfway.rain < 1);
  assert.equal(settled.rain, 1);
  assert.deepEqual(weather.sample(38), settled);
});
