import type { Benefit } from '../types/project'

const benefits: Benefit[] = [
  {
    icon: 'location',
    title: 'Comece pela sua região',
    description: 'Encontre profissionais pela área aproximada de atendimento.',
  },
  {
    icon: 'conversation',
    title: 'Converse com contexto',
    description: 'Alinhe necessidades e expectativas antes de tomar uma decisão.',
  },
  {
    icon: 'trust',
    title: 'Compare o que importa',
    description: 'Use reputação e experiência para fazer uma escolha informada.',
  },
]

export const projectService = {
  listBenefits(): Benefit[] {
    return benefits.map((benefit) => ({ ...benefit }))
  },
}
