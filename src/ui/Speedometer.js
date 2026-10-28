export class Speedometer {
  constructor() {
    this.container = document.getElementById('vehicle-hud');
    this.speedDisplay = document.getElementById('speed-display');
    this.gearDisplay = document.getElementById('gear-display');
    this.rpmCircle = document.getElementById('speedo-rpm-circle');
    this.carModelName = document.getElementById('car-model-name');

    this.maxCircumference = 408;
  }

  show(modelName = 'GROTTI CHEETAH GT') {
    if (this.container) {
      this.container.style.display = 'flex';
    }
    if (this.carModelName) {
      this.carModelName.innerText = modelName;
    }
  }

  hide() {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  update(vehicle) {
    if (!vehicle || !this.container) return;

    const mph = vehicle.getSpeedMPH();
    this.speedDisplay.innerText = mph;
    this.gearDisplay.innerText = `GEAR ${vehicle.gear}`;

    // RPM ratio: 800 to 7500
    const rpmRatio = Math.min(Math.max((vehicle.rpm - 800) / 6700, 0), 1.0);
    // Offset ranges from 408 (empty) to 120 (full)
    const strokeOffset = this.maxCircumference - (rpmRatio * 288);
    this.rpmCircle.style.strokeDashoffset = strokeOffset;
  }
}
