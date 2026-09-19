import { beforeEach, describe, expect, it, vi } from 'vitest'

const firebaseMocks = vi.hoisted(() => ({
  firestore: { name: 'firestore' },
  collection: vi.fn(),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  getFirebaseFirestore: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  collection: firebaseMocks.collection,
  getDocs: firebaseMocks.getDocs,
  orderBy: firebaseMocks.orderBy,
  query: firebaseMocks.query,
}))

vi.mock('../lib/firebase', () => ({
  getFirebaseFirestore: firebaseMocks.getFirebaseFirestore,
}))

import { catalogRepository } from './catalog.repository'

function document(id: string, data: Record<string, unknown>) {
  return { id, data: () => data }
}

describe('catalogRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    firebaseMocks.getFirebaseFirestore.mockReturnValue(firebaseMocks.firestore)
    firebaseMocks.collection.mockImplementation((_firestore, name) => ({ name }))
    firebaseMocks.orderBy.mockImplementation((field, direction) => ({ field, direction }))
    firebaseMocks.query.mockImplementation((reference, constraint) => ({ reference, constraint }))
  })

  it('carrega categorias e especialidades ordenadas pelo Firestore', async () => {
    firebaseMocks.getDocs
      .mockResolvedValueOnce({
        docs: [document('construction', { name: 'Construção Civil', active: true, order: 10 })],
      })
      .mockResolvedValueOnce({
        docs: [document('painter', { categoryId: 'construction', name: 'Pintor', active: true, order: 20 })],
      })

    await expect(catalogRepository.listCategories()).resolves.toEqual([
      { id: 'construction', name: 'Construção Civil', active: true, order: 10 },
    ])
    await expect(catalogRepository.listSpecialties()).resolves.toEqual([
      { id: 'painter', categoryId: 'construction', name: 'Pintor', active: true, order: 20 },
    ])
    expect(firebaseMocks.collection).toHaveBeenNthCalledWith(1, firebaseMocks.firestore, 'categories')
    expect(firebaseMocks.collection).toHaveBeenNthCalledWith(2, firebaseMocks.firestore, 'specialties')
    expect(firebaseMocks.orderBy).toHaveBeenCalledTimes(2)
    expect(firebaseMocks.orderBy).toHaveBeenCalledWith('order', 'asc')
  })

  it('recusa documentos que não respeitam o contrato do catálogo', async () => {
    firebaseMocks.getDocs.mockResolvedValue({
      docs: [document('invalid', { name: 'Sem ordem', active: true })],
    })

    await expect(catalogRepository.listCategories()).rejects.toThrow(
      'Campo order inválido no item de catálogo invalid.',
    )
  })
})
