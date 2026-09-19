import { catalogRepository } from '../repositories/catalog.repository'
import type {
  CatalogCategory,
  CatalogSpecialty,
  ServiceCatalog,
} from '../types/catalog'

export interface CatalogDependencies {
  listCategories(): Promise<CatalogCategory[]>
  listSpecialties(): Promise<CatalogSpecialty[]>
}

const defaultDependencies: CatalogDependencies = catalogRepository

function compareCatalogItems(
  left: CatalogCategory | CatalogSpecialty,
  right: CatalogCategory | CatalogSpecialty,
) {
  return left.order - right.order || left.name.localeCompare(right.name, 'pt-BR')
}

export async function listAvailableCatalog(
  dependencies: CatalogDependencies = defaultDependencies,
): Promise<ServiceCatalog> {
  const [allCategories, allSpecialties] = await Promise.all([
    dependencies.listCategories(),
    dependencies.listSpecialties(),
  ])
  const categories = allCategories
    .filter((category) => category.active)
    .sort(compareCatalogItems)
  const activeCategoryIds = new Set(categories.map((category) => category.id))
  const specialties = allSpecialties
    .filter(
      (specialty) =>
        specialty.active && activeCategoryIds.has(specialty.categoryId),
    )
    .sort(compareCatalogItems)

  return {
    categories: categories.map((category) => ({ ...category })),
    specialties: specialties.map((specialty) => ({ ...specialty })),
  }
}
