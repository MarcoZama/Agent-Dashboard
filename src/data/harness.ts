export const HARNESS_LABELS = {
  standard: 'Standard Harness',
  github: 'GitHub Harness',
  other: 'Other harness',
  unknown: 'Not reported',
} as const

export type HarnessKind = keyof typeof HARNESS_LABELS

export function classifyHarness(value?: string | null): HarnessKind {
  const code = value?.trim().toLowerCase().replace(/[\s_-]+/g, '') ?? ''
  switch (code) {
    case 'standard':
    case 'standardharness':
      return 'standard'
    case 'github':
    case 'githubcopilot':
    case 'githubharness':
    case 'githubcopilotharness':
      return 'github'
    case '':
    case 'unknown':
    case 'notreported':
    case 'n/a':
      return 'unknown'
    default:
      return 'other'
  }
}
