'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type ProfileContextValue = {
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  updateProfile: (patch: Partial<{ firstName: string; lastName: string; avatarUrl: string | null }>) => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

// Seeds from the server-rendered profile on first paint, then lets the
// Settings page push optimistic updates here so the header/sidebar user
// badges reflect a name or avatar change immediately, without waiting for
// a full page reload to re-fetch the server-rendered profile prop.
export function ProfileProvider({
  initialFirstName,
  initialLastName,
  initialAvatarUrl,
  children,
}: {
  initialFirstName: string;
  initialLastName: string;
  initialAvatarUrl: string | null;
  children: ReactNode;
}) {
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);

  const updateProfile = useCallback(
    (patch: Partial<{ firstName: string; lastName: string; avatarUrl: string | null }>) => {
      if (patch.firstName !== undefined) setFirstName(patch.firstName);
      if (patch.lastName !== undefined) setLastName(patch.lastName);
      if (patch.avatarUrl !== undefined) setAvatarUrl(patch.avatarUrl);
    },
    [],
  );

  const value = useMemo(
    () => ({ firstName, lastName, avatarUrl, updateProfile }),
    [firstName, lastName, avatarUrl, updateProfile],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within a ProfileProvider');
  return ctx;
}
