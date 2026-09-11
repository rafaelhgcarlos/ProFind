import type { Benefit } from '../types/project'

const benefits: Benefit[] = [
  {
    icon: 'location',
    title: 'Perto de você',
    description: 'Descubra profissionais que atendem na sua região.',
  },
  {
    icon: 'conversation',
    title: 'Contato direto',
    description: 'Converse e alinhe os detalhes do serviço com facilidade.',
  },
  {
    icon: 'trust',
    title: 'Mais confiança',
    description: 'Tenha informações claras para escolher melhor.',
  },
]

export const projectService = {
  listBenefits(): Benefit[] {
    return benefits.map((benefit) => ({ ...benefit }))
  },
}
