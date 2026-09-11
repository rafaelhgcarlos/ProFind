import type { Benefit } from '../types/project'

const benefits: Benefit[] = [
  {
    icon: '📍',
    title: 'Perto de você',
    description: 'Descubra profissionais que atendem na sua região.',
  },
  {
    icon: '💬',
    title: 'Contato direto',
    description: 'Converse e alinhe os detalhes do serviço com facilidade.',
  },
  {
    icon: '✓',
    title: 'Mais confiança',
    description: 'Tenha informações claras para escolher melhor.',
  },
]

export const projectService = {
  listBenefits(): Benefit[] {
    return benefits.map((benefit) => ({ ...benefit }))
  },
}
