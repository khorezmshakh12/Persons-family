'use client';

import dynamic from 'next/dynamic';
import { GlassCardSkeleton } from '@/components/skeletons/glass-skeletons';

// The realtime chat room is client-only interactive UI with no SEO value —
// ssr: false keeps its Firestore realtime wiring and message list out of the
// initial server HTML payload entirely, and next/dynamic code-splits it
// into its own chunk instead of bundling it into every page that embeds it.
export const StaffChatRoomLazy = dynamic(
  () => import('./staff-chat-room').then((mod) => mod.StaffChatRoom),
  {
    ssr: false,
    loading: () => <GlassCardSkeleton />,
  },
);
