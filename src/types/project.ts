export type BenefitIcon = 'location' | 'conversation' | 'trust'

export interface Benefit {
  icon: BenefitIcon
  title: string
  description: string
}
