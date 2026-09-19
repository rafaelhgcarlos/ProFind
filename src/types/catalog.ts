export interface CatalogCategory {
  id: string
  name: string
  active: boolean
  order: number
}

export interface CatalogSpecialty {
  id: string
  categoryId: string
  name: string
  active: boolean
  order: number
}

export interface ServiceCatalog {
  categories: CatalogCategory[]
  specialties: CatalogSpecialty[]
}
