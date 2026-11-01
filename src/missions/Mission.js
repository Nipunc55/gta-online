/**
 * Base Mission Lifecycle Class.
 * Manages mission state ('inactive' | 'active' | 'completed' | 'failed'),
 * current objective text, 3D/radar target waypoint, optional countdown timer,
 * and temporary 3D mission props.
 */
export class Mission {
  constructor(game, config = {}) {
    this.game = game;
    this.id = config.id || 'mission';
    this.chapter = config.chapter || 'CHAPTER 1: OUT ON BAIL';
    this.title = config.title || 'UNTITLED MISSION';
    this.reward = config.reward || 1000;
    this.stage = 'inactive'; // 'inactive' | 'active' | 'completed' | 'failed'
    this.stepIndex = 0;

    this.objectiveText = '';
    this.subText = '';
    this.waypoint = null; // { x, z, radius, color, label }
    this.timer = null;

    this.tempMeshes = [];
  }

  addTempMesh(mesh) {
    this.game.scene.add(mesh);
    this.tempMeshes.push(mesh);
    return mesh;
  }

  clearTempMeshes() {
    for (const m of this.tempMeshes) {
      if (m && m.parent) m.parent.remove(m);
    }
    this.tempMeshes = [];
  }

  setObjective(text, subText = '', waypoint = null) {
    this.objectiveText = text;
    this.subText = subText;
    this.waypoint = waypoint;
    if (this.game.missions) {
      this.game.missions.syncObjectiveUI();
    }
  }

  start() {
    this.stage = 'active';
    this.stepIndex = 0;
    this.timer = null;
    this.clearTempMeshes();
    this.game.audio.play('missionStart', 0.9);
    this.game.events.emit('mission:started', { id: this.id, title: this.title });
    this.onStart();
  }

  onStart() {}

  update(dt) {
    if (this.stage !== 'active') return;
    if (this.timer !== null) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0;
        this.fail('TIME EXPIRED');
        return;
      }
    }
    this.onUpdate(dt);
  }

  onUpdate(_dt) {}

  onNPCKilled(_npc) {}

  complete() {
    if (this.stage !== 'active') return;
    this.stage = 'completed';
    this.waypoint = null;
    this.timer = null;
    this.clearTempMeshes();
    this.game.player.addCash(this.reward);
    this.game.audio.play('missionPassed', 1.0);
    this.game.events.emit('mission:completed', {
      id: this.id,
      title: this.title,
      reward: this.reward
    });
  }

  fail(reason = 'MISSION FAILED') {
    if (this.stage !== 'active') return;
    this.stage = 'failed';
    this.waypoint = null;
    this.timer = null;
    this.clearTempMeshes();
    this.game.pedestrians.clearMissionActors();
    this.game.audio.play('missionFailed', 1.0);
    this.game.events.emit('mission:failed', {
      id: this.id,
      title: this.title,
      reason
    });
  }

  cleanup() {
    this.waypoint = null;
    this.timer = null;
    this.clearTempMeshes();
    this.game.pedestrians.clearMissionActors();
  }
}
