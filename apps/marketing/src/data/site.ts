export const siteConfig = {
  name: "BehaviorLog and Cadence",
  shortName: "BehaviorLog",
  language: "en",
  marketingSiteUrl:
    import.meta.env.SITE ?? "https://cadence-marketing-two.vercel.app",
  description:
    "BehaviorLog is an open behavior-history bundle standard. Cadence is the reference tracker that produces practical bundles.",
  cadenceAppUrl:
    import.meta.env.PUBLIC_CADENCE_APP_URL ?? "https://cadence-blush-three.vercel.app",
  standardUrl: "https://github.com/emixd12/BehaviorLog-Bundle",
  githubUrl: "https://github.com/emixd12/habit-tracking-app",
  exampleBundlePath: "/examples/cadence-demo.behaviorlog.zip",
  lastModified: "2026-06-20",
} as const;

export const primaryCtas = {
  tryCadence: {
    label: "Try Cadence",
    href: `${siteConfig.cadenceAppUrl}/login`,
  },
  readStandard: {
    label: "Read the Standard",
    href: siteConfig.standardUrl,
  },
  downloadExample: {
    label: "Download Example Bundle",
    href: siteConfig.exampleBundlePath,
  },
  viewGithub: {
    label: "View on GitHub",
    href: siteConfig.githubUrl,
  },
} as const;
