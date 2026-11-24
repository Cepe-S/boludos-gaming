import React, { useEffect, useRef } from 'react';
import { MeshGradient } from '@mesh-gradient/core';
import 'particles.js';
import { getStoredTheme, THEME_PALETTES, ThemePaletteId } from '@/lib/theme';

interface ParticlesJSInstance {
  pJS?: {
    fn?: {
      vendors?: {
        destroypJS?: () => void;
        draw?: () => void;
      };
      drawAnimFrame?: number;
    };
    particles?: {
      move?: { enable?: boolean };
    };
  };
}

declare global {
  interface Window {
    particlesJS?: (tagId: string, params: Record<string, unknown>) => void;
    pJSDom?: ParticlesJSInstance[];
  }
}

function getPaletteForTheme(themeId: ThemePaletteId) {
  return THEME_PALETTES.find((p) => p.id === themeId) ?? THEME_PALETTES[0];
}

function getMeshColors(themeId: ThemePaletteId): [string, string, string, string] {
  const palette = getPaletteForTheme(themeId);
  if (palette.meshColors) return palette.meshColors;
  return [
    palette.colors[0],
    palette.colors[1],
    palette.colors[2],
    palette.colors[3],
  ];
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function destroyParticlesInstances() {
  if (typeof window === 'undefined') return;
  const instances = Array.isArray(window.pJSDom) ? [...window.pJSDom] : [];
  window.pJSDom = [];
  for (const instance of instances) {
    try {
      instance?.pJS?.fn?.vendors?.destroypJS?.();
    } catch {
      // Ignore cleanup errors during StrictMode remounts
    }
  }
  window.pJSDom = [];
}

function setParticlesPaused(paused: boolean) {
  if (typeof window === 'undefined' || !Array.isArray(window.pJSDom)) return;
  for (const instance of window.pJSDom) {
    const pJS = instance?.pJS;
    if (!pJS) continue;
    try {
      if (paused) {
        if (typeof pJS.fn?.drawAnimFrame === 'number') {
          window.cancelAnimationFrame(pJS.fn.drawAnimFrame);
          pJS.fn.drawAnimFrame = undefined;
        }
      } else if (!pJS.fn?.drawAnimFrame && typeof pJS.fn?.vendors?.draw === 'function') {
        pJS.fn.vendors.draw();
      }
    } catch {
      // Ignore pause/resume edge errors
    }
  }
}

interface ObjectConstructorWithDeepExtend extends ObjectConstructor {
  deepExtend?: <T extends Record<string, unknown>>(
    destination: T,
    source: Record<string, unknown>
  ) => T;
}

// particles.js v2.0.0 uses `arguments.callee` inside Object.deepExtend, which throws in ES module strict mode.
function patchParticlesDeepExtend() {
  const objConstructor = Object as ObjectConstructorWithDeepExtend;
  objConstructor.deepExtend = function deepExtend<T extends Record<string, unknown>>(
    destination: T,
    source: Record<string, unknown>
  ): T {
    for (const property in source) {
      const sourceVal = source[property];
      if (
        sourceVal &&
        typeof sourceVal === 'object' &&
        sourceVal.constructor === Object
      ) {
        const destRecord = destination as Record<string, unknown>;
        const existing = destRecord[property];
        destRecord[property] =
          existing && typeof existing === 'object' ? existing : {};
        deepExtend(
          destRecord[property] as Record<string, unknown>,
          sourceVal as Record<string, unknown>
        );
      } else {
        (destination as Record<string, unknown>)[property] = sourceVal;
      }
    }
    return destination;
  };
}

function mountParticles(themeId: ThemePaletteId) {
  if (typeof window === 'undefined' || typeof window.particlesJS !== 'function') return;
  if (prefersReducedMotion()) return;
  const container = document.getElementById('particles-js');
  if (!container) return;

  patchParticlesDeepExtend();
  destroyParticlesInstances();

  const palette = getPaletteForTheme(themeId);
  const accentColor = palette.swatch;
  const lightColor =
    palette.id === 'aldosivi' ? '#FFFFFF' : (palette.colors[4] ?? '#F2F3F5');

  window.particlesJS('particles-js', {
    particles: {
      number: {
        value: 26,
        density: {
          enable: true,
          value_area: 1050,
        },
      },
      color: {
        value: [accentColor, lightColor],
      },
      shape: {
        type: 'circle',
      },
      opacity: {
        value: 0.32,
        random: true,
        anim: {
          enable: false,
        },
      },
      size: {
        value: 2.3,
        random: true,
        anim: {
          enable: false,
        },
      },
      line_linked: {
        enable: true,
        distance: 130,
        color: accentColor,
        opacity: 0.18,
        width: 1,
      },
      move: {
        enable: true,
        speed: 0.65,
        direction: 'none',
        random: true,
        straight: false,
        out_mode: 'out',
        bounce: false,
      },
    },
    interactivity: {
      detect_on: 'canvas',
      events: {
        onhover: {
          enable: false,
        },
        onclick: {
          enable: false,
        },
        resize: true,
      },
    },
    retina_detect: false,
  });
}

export const MeshBackground: React.FC = React.memo(() => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gradientRef = useRef<MeshGradient | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    const initialTheme = getStoredTheme();
    const reduced = prefersReducedMotion();
    let gradient: MeshGradient | null = null;

    // Defer WebGL + Particles boot by 1 frame so first paint and initial clicks remain instant
    const bootRaf = window.requestAnimationFrame(() => {
      if (cancelled) return;

      if (MeshGradient.isSupported()) {
        try {
          gradient = new MeshGradient();
          gradientRef.current = gradient;
          gradient.init(canvas, {
            colors: getMeshColors(initialTheme),
            animationSpeed: reduced ? 0 : 0.45,
            seed: 42,
            darkenTop: true,
          });
          if (reduced || document.hidden) {
            gradient.pause?.();
          }
        } catch {
          gradient = null;
          gradientRef.current = null;
        }
      }

      if (!reduced) {
        try {
          mountParticles(initialTheme);
          if (document.hidden) {
            setParticlesPaused(true);
          }
        } catch {
          // Ignore particles mount failure in restricted environments
        }
      }
    });

    const handleVisibilityChange = () => {
      if (reduced) return;
      const hidden = document.hidden;
      try {
        if (hidden) {
          gradient?.pause?.();
        } else {
          gradient?.play?.();
        }
      } catch {
        // Ignore pause/play failure
      }
      setParticlesPaused(hidden);
    };

    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<ThemePaletteId>;
      const nextTheme = customEvent.detail ?? getStoredTheme();
      if (gradient) {
        try {
          gradient.update({
            colors: getMeshColors(nextTheme),
            transition: !reduced,
            transitionDuration: 400,
          });
        } catch {
          // Ignore WebGL update failure
        }
      }
      if (!reduced) {
        try {
          mountParticles(nextTheme);
          if (document.hidden) setParticlesPaused(true);
        } catch {
          // Ignore particles remount failure
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('boludos-theme-change', handleThemeChange);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(bootRaf);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('boludos-theme-change', handleThemeChange);
      destroyParticlesInstances();
      if (gradient) {
        try {
          gradient.destroy();
        } catch {
          // Ignore WebGL destroy failure
        }
      }
      gradientRef.current = null;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 -z-10 pointer-events-none bg-background overflow-hidden contain-strict"
      aria-hidden="true"
    >
      {/* Render soft mesh gradient at 50% backing size & upscale cleanly for 4x lower GPU fill-rate */}
      <div className="w-[50%] h-[50%] origin-top-left scale-[2] opacity-55 will-change-transform">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
        />
      </div>
      <div
        id="particles-js"
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
});
