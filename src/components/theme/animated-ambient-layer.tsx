'use client';

import { motion } from 'framer-motion';
import { useBackground } from './background-context';

export function AnimatedAmbientLayer() {
  const { activeDesignId } = useBackground();

  // 1. Zenith Aurora Glass (User reference design)
  if (activeDesignId === 'aurora' || activeDesignId === 'glassmorphism') {
    return (
      <div className="fixed inset-0 -z-15 overflow-hidden pointer-events-none select-none">
        {/* Aurora Breathing Ambient Light */}
        <motion.div
          animate={{
            opacity: [0.4, 0.8, 0.4],
            scale: [1, 1.08, 1],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-1/4 -inset-x-1/4 h-[85vh] bg-gradient-to-b from-teal-500/20 via-emerald-500/15 to-transparent blur-3xl"
        />

        {/* Floating 4-Point Golden Sparkle Stars (from user reference mockup) */}
        {[
          { top: '14%', left: '7%', delay: 0, size: 'size-4' },
          { top: '35%', left: '3%', delay: 1.5, size: 'size-5' },
          { top: '56%', left: '6%', delay: 3, size: 'size-3.5' },
          { top: '22%', right: '5%', delay: 0.8, size: 'size-4' },
          { top: '68%', right: '4%', delay: 2.2, size: 'size-5' },
          { top: '82%', left: '8%', delay: 4, size: 'size-3' },
          { top: '48%', right: '8%', delay: 3.5, size: 'size-3.5' },
        ].map((star, idx) => (
          <motion.div
            key={idx}
            style={{ top: star.top, left: star.left, right: star.right }}
            animate={{
              scale: [0.75, 1.35, 0.75],
              opacity: [0.35, 1, 0.35],
              rotate: [0, 90, 0],
            }}
            transition={{
              duration: 5 + idx,
              repeat: Infinity,
              delay: star.delay,
              ease: 'easeInOut',
            }}
            className={`absolute ${star.size} text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.9)]`}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
              <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
            </svg>
          </motion.div>
        ))}

        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-teal-950/25 to-black/65 mix-blend-multiply" />
      </div>
    );
  }

  // 2. Kyoto Zen Oasis
  if (activeDesignId === 'kyoto') {
    return (
      <div className="fixed inset-0 -z-15 overflow-hidden pointer-events-none select-none">
        <motion.div
          animate={{ opacity: [0.3, 0.65, 0.3], scale: [1, 1.05, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 bg-gradient-to-b from-emerald-950/30 via-teal-950/20 to-black/60"
        />
        <div className="absolute inset-0 bg-black/40" />
      </div>
    );
  }

  // 3. Royal Obsidian & Gold
  if (activeDesignId === 'midnight' || activeDesignId === 'luxury_velvet') {
    return (
      <div className="fixed inset-0 -z-15 overflow-hidden pointer-events-none select-none">
        <motion.div
          animate={{ opacity: [0.35, 0.7, 0.35] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 bg-gradient-to-b from-amber-950/25 via-black/40 to-amber-950/30"
        />
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ y: '100vh', x: `${14 * i + 8}vw`, opacity: 0 }}
            animate={{ y: '-10vh', opacity: [0, 0.85, 0] }}
            transition={{
              duration: 14 + i * 2,
              repeat: Infinity,
              delay: i * 2.2,
              ease: 'linear',
            }}
            className="absolute size-2 rounded-full bg-amber-300 shadow-[0_0_12px_#f59e0b]"
          />
        ))}
        <div className="absolute inset-0 bg-black/45" />
      </div>
    );
  }

  // 4. Nordic Alpine Mist
  if (activeDesignId === 'nordic') {
    return (
      <div className="fixed inset-0 -z-15 overflow-hidden pointer-events-none select-none">
        <motion.div
          animate={{ opacity: [0.25, 0.55, 0.25] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 bg-gradient-to-b from-sky-950/20 via-slate-950/30 to-black/55"
        />
        <div className="absolute inset-0 bg-black/35" />
      </div>
    );
  }

  // 5. Cosmic Deep Nebula
  if (activeDesignId === 'cosmic' || activeDesignId === 'aurora_mesh') {
    return (
      <div className="fixed inset-0 -z-15 overflow-hidden pointer-events-none select-none bg-slate-950">
        <motion.div
          animate={{
            x: ['-15%', '20%', '-10%'],
            y: ['-10%', '25%', '5%'],
            scale: [1, 1.25, 0.95],
          }}
          transition={{ duration: 18, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
          className="absolute -top-[15%] -left-[10%] h-[55vw] w-[55vw] rounded-full bg-teal-500/25 blur-[100px]"
        />
        <motion.div
          animate={{
            x: ['20%', '-20%', '10%'],
            y: ['10%', '-25%', '20%'],
            scale: [1.1, 0.9, 1.2],
          }}
          transition={{ duration: 22, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
          className="absolute top-[25%] -right-[15%] h-[60vw] w-[60vw] rounded-full bg-purple-600/25 blur-[120px]"
        />
        <div className="absolute inset-0 bg-black/45" />
      </div>
    );
  }

  // 6. Linear Dark Studio
  if (activeDesignId === 'studio') {
    return (
      <div className="fixed inset-0 -z-15 pointer-events-none select-none bg-[#0a0d14]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.15),_transparent_65%)]" />
        <div className="absolute inset-0 bg-black/30" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 -z-15 pointer-events-none select-none">
      <div className="animate-ambient-pulse absolute inset-0 bg-gradient-to-b from-black/50 via-teal-950/20 to-black/60 mix-blend-multiply" />
    </div>
  );
}