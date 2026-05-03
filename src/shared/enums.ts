export const TipoNorma = {
  NCG: "NCG",
  CIRCULAR: "CIRCULAR",
  OFICIO_CIRC: "OFICIO_CIRC",
  RES_EXENTA: "RES_EXENTA",
  RAN: "RAN",
  COMPENDIO_SEG: "COMPENDIO_SEG",
} as const;
export type TipoNorma = (typeof TipoNorma)[keyof typeof TipoNorma];

export const Sector = {
  BANCARIO: "BANCARIO",
  VALORES: "VALORES",
  SEGUROS: "SEGUROS",
  FONDOS: "FONDOS",
  INFRA_MERCADO: "INFRA_MERCADO",
  TRANSVERSAL: "TRANSVERSAL",
} as const;
export type Sector = (typeof Sector)[keyof typeof Sector];

export const EstadoVigencia = {
  VIGENTE: "VIGENTE",
  DEROGADA: "DEROGADA",
  MODIFICADA: "MODIFICADA",
  SUSPENDIDA: "SUSPENDIDA",
} as const;
export type EstadoVigencia = (typeof EstadoVigencia)[keyof typeof EstadoVigencia];

export const EstadoArticulo = {
  VIGENTE: "VIGENTE",
  DEROGADO: "DEROGADO",
  MODIFICADO: "MODIFICADO",
} as const;
export type EstadoArticulo = (typeof EstadoArticulo)[keyof typeof EstadoArticulo];

export const TipoRelacion = {
  MODIFICA: "MODIFICA",
  DEROGA: "DEROGA",
  COMPLEMENTA: "COMPLEMENTA",
  CITA: "CITA",
} as const;
export type TipoRelacion = (typeof TipoRelacion)[keyof typeof TipoRelacion];

export const NivelSeccion = {
  LIBRO: "LIBRO",
  TITULO: "TITULO",
  CAPITULO: "CAPITULO",
  SECCION: "SECCION",
  ANEXO: "ANEXO",
} as const;
export type NivelSeccion = (typeof NivelSeccion)[keyof typeof NivelSeccion];

export const TipoRevision = {
  INICIAL: "INICIAL",
  ACTUALIZACION: "ACTUALIZACION",
  SPOT_CHECK: "SPOT_CHECK",
} as const;
export type TipoRevision = (typeof TipoRevision)[keyof typeof TipoRevision];

export const ResultadoValidacion = {
  APROBADO: "APROBADO",
  RECHAZADO: "RECHAZADO",
  OBSERVADO: "OBSERVADO",
} as const;
export type ResultadoValidacion = (typeof ResultadoValidacion)[keyof typeof ResultadoValidacion];
