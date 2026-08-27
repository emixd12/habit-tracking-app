export const siteConfig = {
  name: "Cadence",
  shortName: "Cadence",
  language: "en",
  marketingSiteUrl:
    import.meta.env.SITE ?? "https://cadence-marketing-two.vercel.app",
  description:
    "Cadence is an open personal behavior tracker with portable BehaviorLog exports.",
  cadenceAppUrl:
    import.meta.env.PUBLIC_CADENCE_APP_URL ?? "https://cadence-blush-three.vercel.app",
  standardUrl: "https://github.com/emixd12/BehaviorLog-Bundle",
  githubUrl: "https://github.com/emixd12/habit-tracking-app",
  exampleBundlePath: "/examples/cadence-demo.behaviorlog.zip",
  lastModified: "2026-08-27",
  trustUrl: `${import.meta.env.PUBLIC_CADENCE_APP_URL ?? "https://cadence-blush-three.vercel.app"}/trust`,
  trustEvidenceUrl: `${import.meta.env.PUBLIC_CADENCE_APP_URL ?? "https://cadence-blush-three.vercel.app"}/api/public/trust-evidence`,
} as const;

export const primaryCtas = {
  tryCadence: {
    label: "Try Cadence",
    href: `${siteConfig.cadenceAppUrl}/login`,
  },
  logIn: {
    label: "Log in",
    href: `${siteConfig.cadenceAppUrl}/login`,
  },
  readStandard: {
    label: "Read BehaviorLog",
    href: siteConfig.standardUrl,
  },
  viewStandardRepository: {
    label: "View BehaviorLog repository",
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
