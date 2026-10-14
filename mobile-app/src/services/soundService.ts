type AudioAction = 'PLAY_SIREN' | 'STOP_SIREN' | 'PLAY_CHIME';
type AudioListener = (action: AudioAction) => void;

class SoundService {
  private listeners: Set<AudioListener> = new Set();
  private isSirenPlaying = false;

  subscribe(listener: AudioListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Play emergency siren loop (works in Expo Go via AudioPlayer bridge)
   */
  playEmergencySiren(durationMs: number = 8000): void {
    this.isSirenPlaying = true;
    this.notify('PLAY_SIREN');

    if (durationMs > 0) {
      setTimeout(() => {
        this.stopEmergencySiren();
      }, durationMs);
    }
  }

  /**
   * Stop emergency siren immediately
   */
  stopEmergencySiren(): void {
    if (!this.isSirenPlaying) return;
    this.isSirenPlaying = false;
    this.notify('STOP_SIREN');
  }

  /**
   * Play short notification chime for voucher or dispatch message
   */
  playNotificationChime(): void {
    this.notify('PLAY_CHIME');
  }

  isPlaying(): boolean {
    return this.isSirenPlaying;
  }

  private notify(action: AudioAction) {
    this.listeners.forEach((listener) => {
      try {
        listener(action);
      } catch (err) {
        console.warn('[SoundService] Listener error:', err);
      }
    });
  }
}

export const soundService = new SoundService();
