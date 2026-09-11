/**
 * Contrato comum para repositories. Implementações futuras devem concentrar
 * aqui o acesso ao Firestore, evitando queries dentro de páginas/componentes.
 */
export interface Repository<T, TId = string> {
  findById(id: TId): Promise<T | null>
  list(): Promise<T[]>
}
