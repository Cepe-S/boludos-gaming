/**
 * Push Notifications & Web Audio Sound Engine for Boludos Gaming.
 * Provides native browser & Service Worker notifications, plus synthesized
 * sound chimes via the Web Audio API without requiring external audio assets.
 */

let serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioContext) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      sharedAudioContext = new AudioCtx();
    }
  }
  if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

/**
 * Registers the Service Worker safely for PWA and push notifications.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  // Avoid registering service worker in unsupported protocols (like file://)
  if (!window.location.protocol.startsWith('http')) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    serviceWorkerRegistration = registration;
    return registration;
  } catch (error) {
    // If sw.js does not exist yet or fails, log quietly and continue without breaking
    console.debug('ServiceWorker registration skipped or failed:', error);
    return null;
  }
}

/**
 * Requests browser permission for Web Push and OS notifications.
 */
export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (error) {
    console.warn('Error requesting notification permission:', error);
    return 'unsupported';
  }
}

/**
 * Returns current notification permission status.
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Displays a native OS / device notification using ServiceWorkerRegistration if available,
 * or standard Notification API as a direct fallback.
 */
export async function showNativeNotification(
  title: string,
  options?: NotificationOptions
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  const notificationOptions: NotificationOptions = {
    icon: 'https://api.dicebear.com/7.x/bottts/svg?seed=BoludosGamingLogo&backgroundColor=6366f1',
    badge: 'https://api.dicebear.com/7.x/bottts/svg?seed=BoludosGamingLogo',
    silent: false,
    ...options,
  };

  try {
    // Prefer Service Worker registration if active
    if (serviceWorkerRegistration && 'showNotification' in serviceWorkerRegistration) {
      await serviceWorkerRegistration.showNotification(title, notificationOptions);
      return true;
    }

    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'TRIGGER_LOCAL_PUSH',
        title,
        options: notificationOptions,
      });
      return true;
    }

    // Direct browser Notification fallback
    new Notification(title, notificationOptions);
    return true;
  } catch (error) {
    console.warn('Error showing native notification:', error);
    try {
      new Notification(title, notificationOptions);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Synthesizes dynamic gaming sound chimes using the Web Audio API.
 * 100% free, works offline, zero network requests or mp3 files.
 */
export function playNotificationSound(type: 'ping' | 'roulette' | 'sanction' | 'message'): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    switch (type) {
      case 'ping': {
        // Double high-pitch chime: 880Hz (A5) then 1174Hz (D6)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, now);
        gain1.gain.setValueAtTime(0.15, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.15);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1174, now + 0.12);
        gain2.gain.setValueAtTime(0.18, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.35);
        break;
      }

      case 'roulette': {
        // Ascending victorious arpeggio: C5 -> E5 -> G5 -> C6 fanfare
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
          const startTime = now + idx * 0.08;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, startTime);
          gain.gain.setValueAtTime(0.2, startTime);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(startTime);
          osc.stop(startTime + 0.25);
        });
        break;
      }

      case 'sanction': {
        // Dramatic low descending buzz / gavel thud
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.45);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.45);
        break;
      }

      case 'message': {
        // Crisp friendly pop: 587Hz (D5)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
        break;
      }
    }
  } catch (error) {
    console.debug('Could not play audio chime:', error);
  }
}
