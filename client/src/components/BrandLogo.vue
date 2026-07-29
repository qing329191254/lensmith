<script setup lang="ts">
defineProps<{
  compact?: boolean
}>()
</script>

<template>
  <span class="brand" :class="{ 'brand--compact': compact }" aria-label="Lensmith">
    <span class="brand-mark" aria-hidden="true">
      <svg class="brand-svg" viewBox="0 0 40 40" fill="none">
        <defs>
          <radialGradient id="brandLensGlow" cx="50%" cy="40%" r="55%">
            <stop offset="0%" stop-color="#f3d2b4" stop-opacity="0.95" />
            <stop offset="45%" stop-color="#e8a87c" stop-opacity="0.55" />
            <stop offset="100%" stop-color="#7eb8c9" stop-opacity="0.15" />
          </radialGradient>
          <linearGradient id="brandSweep" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fff6ec" stop-opacity="0" />
            <stop offset="45%" stop-color="#fff6ec" stop-opacity="0.75" />
            <stop offset="100%" stop-color="#fff6ec" stop-opacity="0" />
          </linearGradient>
        </defs>

        <!-- outer barrel -->
        <circle cx="20" cy="20" r="18.2" stroke="rgba(232,220,196,0.28)" stroke-width="1.2" />
        <circle cx="20" cy="20" r="15.4" stroke="rgba(232,168,124,0.55)" stroke-width="1.1" />

        <!-- rotating aperture ring -->
        <g class="brand-iris">
          <path
            d="M20 5.8 L23.4 12.4 L20 14.2 L16.6 12.4 Z
               M34.2 20 L27.6 23.4 L25.8 20 L27.6 16.6 Z
               M20 34.2 L16.6 27.6 L20 25.8 L23.4 27.6 Z
               M5.8 20 L12.4 16.6 L14.2 20 L12.4 23.4 Z
               M29.8 10.2 L28.1 17.2 L25.2 16.1 L24.2 12.8 Z
               M29.8 29.8 L22.8 28.1 L23.9 25.2 L27.2 24.2 Z
               M10.2 29.8 L11.9 22.8 L14.8 23.9 L15.8 27.2 Z
               M10.2 10.2 L17.2 11.9 L16.1 14.8 L12.8 15.8 Z"
            fill="rgba(232,168,124,0.22)"
            stroke="rgba(232,168,124,0.7)"
            stroke-width="0.6"
            stroke-linejoin="round"
          />
        </g>

        <!-- glass -->
        <circle cx="20" cy="20" r="7.2" fill="url(#brandLensGlow)" />
        <circle cx="20" cy="20" r="7.2" stroke="rgba(255,246,236,0.35)" stroke-width="0.7" />
        <ellipse class="brand-flare" cx="17.2" cy="16.8" rx="2.4" ry="1.35" fill="url(#brandSweep)" />

        <!-- focus ticks -->
        <g class="brand-ticks" stroke="rgba(232,220,196,0.55)" stroke-width="1" stroke-linecap="round">
          <path d="M20 2.8 v3.2" />
          <path d="M20 34 v3.2" />
          <path d="M2.8 20 h3.2" />
          <path d="M34 20 h3.2" />
        </g>
      </svg>
    </span>

    <span class="brand-word display">
      <span class="brand-base" aria-hidden="true">
        <span class="brand-lens">Lens</span><span class="brand-smith">mith</span>
      </span>
      <span class="brand-shimmer" aria-hidden="true">Lensmith</span>
    </span>
  </span>
</template>

<style scoped>
.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  color: var(--text);
  text-decoration: none;
  user-select: none;
  line-height: 1;
}

.brand-mark {
  position: relative;
  display: grid;
  place-items: center;
  width: 2.95rem;
  height: 2.95rem;
  flex-shrink: 0;
  filter: drop-shadow(0 0 8px rgba(232, 168, 124, 0.35));
}

.brand--compact .brand-mark {
  width: 2.2rem;
  height: 2.2rem;
}

.brand-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
  display: block;
}

.brand-iris {
  transform-origin: 20px 20px;
  animation: brand-spin 9s linear infinite;
}

.brand-flare {
  transform-origin: 17px 17px;
  animation: brand-breathe 3.4s ease-in-out infinite;
}

.brand-ticks {
  transform-origin: 20px 20px;
  animation: brand-tick 4.8s ease-in-out infinite;
}

.brand-word {
  position: relative;
  display: inline-grid;
  align-items: center;
  height: 2.95rem;
  font-size: 1.7rem;
  line-height: 1;
  letter-spacing: -0.02em;
  white-space: nowrap;
  /* Optical: serif caps sit high against a circular mark */
  transform: translateY(0.08em);
}

.brand--compact .brand-word {
  height: 2.2rem;
  font-size: 1.25rem;
}

.brand-base,
.brand-shimmer {
  grid-area: 1 / 1;
}

.brand-lens {
  color: var(--accent);
  background: linear-gradient(105deg, #f3d2b4 0%, #e8a87c 42%, #7eb8c9 100%);
  background-size: 180% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: brand-flow 5.5s ease-in-out infinite;
}

.brand-smith {
  color: var(--text);
}

/* Shine clipped to glyph shapes only (not a rectangular band) */
.brand-shimmer {
  background-image: linear-gradient(
    105deg,
    transparent 0%,
    transparent 42%,
    rgba(255, 246, 236, 0.92) 50%,
    transparent 58%,
    transparent 100%
  );
  background-size: 220% 100%;
  background-repeat: no-repeat;
  background-position: 120% 0;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: brand-sweep 4.2s ease-in-out infinite;
  pointer-events: none;
}

.brand:hover .brand-iris {
  animation-duration: 2.4s;
}

.brand:hover .brand-flare {
  animation-duration: 1.2s;
}

.brand:hover .brand-shimmer {
  animation-duration: 1.6s;
}

.brand:hover .brand-mark {
  filter: drop-shadow(0 0 14px rgba(232, 168, 124, 0.55));
}

@keyframes brand-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes brand-breathe {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(0.92) translate(0, 0);
  }
  50% {
    opacity: 1;
    transform: scale(1.15) translate(0.4px, -0.3px);
  }
}

@keyframes brand-tick {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(1);
  }
  50% {
    opacity: 0.95;
    transform: scale(1.06);
  }
}

@keyframes brand-flow {
  0%,
  100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

@keyframes brand-sweep {
  0%,
  55% {
    background-position: 120% 0;
  }
  85%,
  100% {
    background-position: -120% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .brand-iris,
  .brand-flare,
  .brand-ticks,
  .brand-lens,
  .brand-shimmer {
    animation: none;
  }

  .brand-lens {
    color: var(--accent);
    background: none;
    -webkit-background-clip: unset;
    background-clip: unset;
  }
}
</style>
