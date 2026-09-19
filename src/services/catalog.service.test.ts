import { describe, expect, it, vi } from 'vitest'

import type { CatalogDependencies } from './catalog.service'
import { listAvailableCatalog } from './catalog.service'

describe('listAvailableCatalog', () => {
  it('retorna somente itens ativos ligados a categorias ativas e respeita order', async () => {
    const dependencies: CatalogDependencies = {
      listCategories: vi.fn().mockResolvedValue([
        { id: 'inactive', name: 'Inativa', active: false, order: 1 },
        { id: 'domestic', name: 'Domésticos', active: true, order: 20 },
        { id: 'construction', name: 'Construção', active: true, order: 10 },
      ]),
      listSpecialties: vi.fn().mockResolvedValue([
        { id: 'cook', categoryId: 'domestic', name: 'Cozinheiro', active: true, order: 20 },
        { id: 'hidden', categoryId: 'domestic', name: 'Oculta', active: false, order: 1 },
        { id: 'orphan', categoryId: 'inactive', name: 'Sem categoria ativa', active: true, order: 1 },
        { id: 'cleaner', categoryId: 'domestic', name: 'Diarista', active: true, order: 10 },
      ]),
    }

    await expect(listAvailableCatalog(dependencies)).resolves.toEqual({
      categories: [
        { id: 'construction', name: 'Construção', active: true, order: 10 },
        { id: 'domestic', name: 'Domésticos', active: true, order: 20 },
      ],
      specialties: [
        { id: 'cleaner', categoryId: 'domestic', name: 'Diarista', active: true, order: 10 },
        { id: 'cook', categoryId: 'domestic', name: 'Cozinheiro', active: true, order: 20 },
      ],
    })
  })
})
