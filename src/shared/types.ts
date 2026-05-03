import type { EstadoVigencia, Sector, TipoNorma } from "./enums";

export type IndexEntry = {
  id: string;
  tipo: TipoNorma;
  numero: string;
  titulo: string;
  sector: Sector;
  fechaEmision: string;
  estado: EstadoVigencia;
  urlPdf: string;
  modifica: string[];
  modificadaPor: string[];
  deroga: string[];
  derogadaPor: string[];
};
