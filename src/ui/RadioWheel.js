export class RadioWheel {
  constructor(audioManager) {
    this.audio = audioManager;
    this.banner = document.getElementById('radio-banner');
    this.stationText = document.getElementById('radio-station');
    this.trackText = document.getElementById('radio-track');
    this.hideTimeout = null;
  }

  cycleStation() {
    if (!this.audio) return;
    const station = this.audio.nextRadioStation();
    this.showBanner(station.name, station.song);
  }

  showBanner(stationName, trackName) {
    if (!this.banner) return;
    this.stationText.innerText = stationName;
    this.trackText.innerText = trackName;

    this.banner.classList.add('show');

    if (this.hideTimeout) clearTimeout(this.hideTimeout);
    this.hideTimeout = setTimeout(() => {
      this.banner.classList.remove('show');
    }, 3200);
  }
}
