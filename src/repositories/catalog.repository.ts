import {
  collection,
  getDocs,
  orderBy,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'

import { getFirebaseFirestore } from '../lib/firebase'
import type { CatalogCategory, CatalogSpecialty } from '../types/catalog'

function requiredString(
  document: QueryDocumentSnapshot<DocumentData>,
  field: string,
) {
  const value = document.data()[field]

  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Campo ${field} inválido no item de catálogo ${document.id}.`)
  }

  return value.trim()
}

function requiredBoolean(
  document: QueryDocumentSnapshot<DocumentData>,
  field: string,
) {
  const value = document.data()[field]

  if (typeof value !== 'boolean') {
    throw new Error(`Campo ${field} inválido no item de catálogo ${document.id}.`)
  }

  return value
}

function requiredOrder(document: QueryDocumentSnapshot<DocumentData>) {
  const value = document.data().order

  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Campo order inválido no item de catálogo ${document.id}.`)
  }

  return value
}

function mapCategory(
  document: QueryDocumentSnapshot<DocumentData>,
): CatalogCategory {
  return {
    id: document.id,
    name: requiredString(document, 'name'),
    active: requiredBoolean(document, 'active'),
    order: requiredOrder(document),
  }
}

function mapSpecialty(
  document: QueryDocumentSnapshot<DocumentData>,
): CatalogSpecialty {
  return {
    id: document.id,
    categoryId: requiredString(document, 'categoryId'),
    name: requiredString(document, 'name'),
    active: requiredBoolean(document, 'active'),
    order: requiredOrder(document),
  }
}

export const catalogRepository = {
  async listCategories(): Promise<CatalogCategory[]> {
    const snapshot = await getDocs(
      query(
        collection(getFirebaseFirestore(), 'categories'),
        orderBy('order', 'asc'),
      ),
    )

    return snapshot.docs.map(mapCategory)
  },

  async listSpecialties(): Promise<CatalogSpecialty[]> {
    const snapshot = await getDocs(
      query(
        collection(getFirebaseFirestore(), 'specialties'),
        orderBy('order', 'asc'),
      ),
    )

    return snapshot.docs.map(mapSpecialty)
  },
}
