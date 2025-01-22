import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SoundStore {
  isSoundEnabled: boolean;
  toggleSound: () => void;
}

export const useSoundStore = create<SoundStore>()(
  persist(
    (set) => ({
      isSoundEnabled: true,
      toggleSound: () => set((state) => ({ isSoundEnabled: !state.isSoundEnabled })),
    }),
    {
      name: 'sound-settings',
    }
  )
);
