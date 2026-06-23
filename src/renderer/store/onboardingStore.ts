import { create } from 'zustand'

interface OnboardingState {
  isOpen: boolean
  start(): void
  close(): void
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  isOpen: false,
  start: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
