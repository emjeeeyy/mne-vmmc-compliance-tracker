export const ease = {
  out: [0.22, 1, 0.36, 1] as const,
  std: [0.4, 0, 0.2, 1] as const,
}

export const fadeRise = {
  hidden: { opacity: 0, y: 12 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.38, ease: ease.out, delay: i * 0.07 },
  }),
}

export const pageTransition = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: ease.out } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.22, ease: ease.std } },
}
