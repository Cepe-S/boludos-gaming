import React, { useEffect, useRef } from 'react';
import { MeshGradient } from '@mesh-gradient/core';
import 'particles.js';
import { getStoredTheme, THEME_PALETTES, ThemePaletteId } from '@/lib/theme';

interface ParticlesJSInstance {
  pJS?: {
    fn?: {
      vendors?: {
        destroypJS?: () => void;
      };
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
  // particles.js v2.0.0 sets `pJSDom = null` inside destroypJS(), which throws on `pJSDom.push(...)` on remount.
  window.pJSDom = [];
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
        value: 48,
        density: {
          enable: true,
          value_area: 900,
        },
      },
      color: {
        value: [accentColor, lightColor],
      },
      shape: {
        type: 'circle',
      },
      opacity: {
        value: 0.35,
        random: true,
        anim: {
          enable: true,
          speed: 0.6,
          opacity_min: 0.1,
          sync: false,
        },
      },
      size: {
        value: 2.5,
        random: true,
        anim: {
          enable: false,
        },
      },
      line_linked: {
        enable: true,
        distance: 140,
        color: accentColor,
        opacity: 0.22,
        width: 1,
      },
      move: {
        enable: true,
        speed: 0.9,
        direction: 'none',
        random: true,
        straight: false,
        out_mode: 'out',
        bounce: false,
      },
    },
    interactivity: {
      detect_on: 'window',
      events: {
        onhover: {
          enable: true,
          mode: 'grab',
        },
        onclick: {
          enable: false,
        },
        resize: true,
      },
      modes: {
        grab: {
          distance: 150,
          line_linked: {
            opacity: 0.45,
          },
        },
      },
    },
    retina_detect: true,
  });
}

export const MeshBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gradientRef = useRef<MeshGradient | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const initialTheme = getStoredTheme();
    let gradient: MeshGradient | null = null;

    if (MeshGradient.isSupported()) {
      try {
        gradient = new MeshGradient();
        gradientRef.current = gradient;
        gradient.init(canvas, {
          colors: getMeshColors(initialTheme),
          animationSpeed: 0.6,
          seed: 42,
          darkenTop: true,
        });
      } catch {
        gradient = null;
        gradientRef.current = null;
      }
    }

    try {
      mountParticles(initialTheme);
    } catch {
      // Ignore particles mount failure in restricted environments
    }

    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<ThemePaletteId>;
      const nextTheme = customEvent.detail ?? getStoredTheme();
      if (gradient) {
        try {
          gradient.update({
            colors: getMeshColors(nextTheme),
            transition: true,
            transitionDuration: 450,
          });
        } catch {
          // Ignore WebGL update failure
        }
      }
      try {
        mountParticles(nextTheme);
      } catch {
        // Ignore particles remount failure
      }
    };

    window.addEventListener('boludos-theme-change', handleThemeChange);

    return () => {
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
      className="fixed inset-0 -z-10 pointer-events-none bg-background overflow-hidden"
      aria-hidden="true"
    >
      <div className="w-full h-full opacity-55">
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
};
