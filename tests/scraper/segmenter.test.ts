import { describe, expect, it } from "vitest";
import { segmentNorm } from "../../src/scraper/segmenter";

// NCG with real article structure
const NCG_SUBSTANTIVE = `
Artículo 1.- Las entidades sujetas a la fiscalización de la Comisión para el
Mercado Financiero deberán mantener en todo momento un patrimonio efectivo no
inferior al mínimo que establezca la normativa vigente. Lo anterior aplica a
todas las instituciones reguladas sin excepción, conforme a los criterios
generales que esta Norma establece para el cálculo y reporte del patrimonio.

Artículo 2.- Para los efectos de lo dispuesto en el artículo precedente,
el patrimonio efectivo se calculará de acuerdo con las instrucciones
contenidas en el Capítulo 21-11 de esta misma Recopilación, aplicando los
factores de ponderación que se indican en los párrafos siguientes de esta norma.
`.trim();

// RAN 1-13 pattern: body text cites LGB articles inline — no real article headers
const RAN_LGB_INLINE = `
I. CLASIFICACIÓN DE GESTIÓN Y SOLVENCIA

Las instituciones clasificadas en esta categoría no cumplen con la relación
de capital exigida en el artículo 65 de la Ley General de Bancos, o bien
presentan deficiencias graves en su gestión interna y gobierno corporativo.
Asimismo, cuando la relación entre el capital básico establecida en el
artículo 66 bis de la Ley General de Bancos sea mayor o igual a 10,5% y a
su vez la relación de capital del artículo 66 quáter de la Ley General de
Bancos no alcance el umbral requerido, la entidad quedará clasificada en
categoría B de solvencia según los criterios que aquí se establecen.

II. CONSECUENCIAS DE LA CLASIFICACIÓN

Los bancos clasificados según lo dispuesto en el artículo 66 quinquies de la
Ley General de Bancos deberán presentar un plan de regularización dentro del
plazo que la Comisión establezca mediante resolución fundada, el que no podrá
exceder de noventa días corridos desde la fecha de notificación.
`.trim();

// RAN 20-9 pattern: Roman-numeral sections, no inline art citations (guard regression)
const RAN_ROMAN = `
I. ÁMBITO DE APLICACIÓN

La presente norma aplica a todas las instituciones bancarias que mantengan
operaciones de intermediación financiera, con independencia de su escala
y estructura societaria. Las disposiciones aquí contenidas son de carácter
obligatorio y complementan las instrucciones generales de la Comisión.

II. PROCEDIMIENTO DE REPORTE

Las instituciones deberán remitir a la Comisión, dentro de los plazos que
se establezcan, los antecedentes que acrediten el cumplimiento de los
requisitos aquí dispuestos, conforme al formato oficial que se publique en
el sitio web institucional de la Comisión para el Mercado Financiero.
`.trim();

// Norm with real articles that also contain inline LGB references in the body
const NCG_MIXED = `
Artículo 1.- Para efectos del cálculo del patrimonio efectivo exigido en
el artículo 65 de la Ley General de Bancos, las entidades deberán incluir
el capital pagado, las reservas y las utilidades retenidas, aplicando los
ajustes y deducciones que esta norma establece de manera detallada.

Artículo 2.- El exceso de capital sobre el mínimo del artículo 66 bis de
la Ley General de Bancos podrá ser computado como capital de nivel 2,
conforme a los criterios establecidos en el Capítulo 21-11 de esta Recopilación
de Normas, con las limitaciones y condiciones que se señalan a continuación.
`.trim();

// RAN 20-7 pattern: TÍTULO I / TÍTULO II / ANEXO N° headings
const RAN_TITULO_ESTRUCTURA = `
TÍTULO I - Definiciones

Para los efectos de esta norma se entenderá por proveedor externo aquel que
proporciona infraestructura tecnológica crítica. Las definiciones aquí contenidas
son de carácter amplio y deben interpretarse en concordancia con la normativa
vigente de la Comisión para el Mercado Financiero y sus instrucciones conexas.

TÍTULO II - Requisitos generales

Las instituciones reguladas deberán adoptar medidas de seguridad adecuadas
para garantizar la continuidad operacional y la protección de los datos de sus
clientes, conforme a los estándares internacionales aplicables al sector financiero.

TÍTULO III - Procedimientos de revisión

La Comisión podrá requerir información a las instituciones en cualquier momento
y estas deberán proporcionarla en el plazo que se indique mediante resolución,
sin perjuicio de las facultades de inspección que le otorga la ley vigente.

ANEXO N° 1 - Formulario de evaluación

Las instituciones completarán los campos indicados en el presente formulario
de acuerdo con las instrucciones publicadas en el sitio web de la Comisión
para el Mercado Financiero, en la sección de normativa aplicable.
`.trim();

// Same structure with PDF running headers injected between sections
const RAN_CON_HEADERS_PDF = `
RECOPILACION ACTUALIZADA DE NORMAS
Capítulo 20-7
Hoja N° 1

TÍTULO I - Definiciones

Para los efectos de esta norma se entenderá por proveedor externo aquel que
proporciona infraestructura tecnológica crítica y que actúa en nombre de la
institución financiera regulada, conforme a la ley.

Circular N° 3.629 / 27.12.2017

TÍTULO II - Requisitos

Las instituciones reguladas deberán adoptar medidas de seguridad adecuadas
para garantizar la continuidad operacional conforme a la normativa vigente
de la Comisión para el Mercado Financiero y demás instrucciones aplicables.
`.trim();

// ran-8-41 pattern: Arabic numeral top-level sections (Bug #1)
const RAN_ARABIC_SECTIONS = `
1. Emisión de tarjetas

Las entidades emisoras de tarjetas de pago deberán ajustarse a las instrucciones contenidas en
el presente capítulo, complementando las disposiciones generales establecidas por la Comisión para
el Mercado Financiero en materia de medios de pago electrónicos y sistemas de compensación
interbancaria, conforme a los estándares internacionales aplicables al sector financiero chileno.

2. Normas comunes a emisores

Sin perjuicio de las instrucciones particulares para cada tipo de tarjeta, los emisores deberán
cumplir con los requisitos mínimos de capital, gestión de riesgos y continuidad operacional que
establece la Ley General de Bancos y la normativa complementaria vigente de la Comisión para el
Mercado Financiero en concordancia con las instrucciones que se dicten mediante circular o resolución.

3. Tarjetas de débito

Los emisores de tarjetas de débito deberán mantener los fondos de los titulares en cuentas
separadas e identificadas, garantizando la disponibilidad inmediata de los recursos y la correcta
liquidación de las transacciones conforme a los plazos establecidos por la Comisión.
`.trim();

// ran-12-20 pattern: Roman sections + standalone unnumbered Anexo (Bug #2)
const RAN_ANEXO_SIN_NUMERO = `
I. ÁMBITO DE APLICACIÓN

La presente norma regula la gestión de la posición de liquidez de las empresas bancarias sujetas
a la supervisión de la Comisión para el Mercado Financiero, conforme a los criterios establecidos
por el Comité de Basilea y los estándares internacionales aplicables al sector financiero chileno
y en concordancia con las instrucciones que se dicten mediante circular o resolución de la Comisión.

II. METODOLOGÍA DE CÁLCULO

Las instituciones deberán calcular diariamente su razón de cobertura de liquidez y su razón de
financiamiento estable neto, utilizando las instrucciones detalladas en el Anexo de este capítulo
y las definiciones establecidas por la Comisión para el Mercado Financiero y sus instrucciones.

Anexo

Instrucciones para el cómputo de flujos de efectivo en el cálculo de las razones de liquidez.
Las entidades clasificarán cada flujo según la categoría que corresponda conforme a lo indicado
en las tablas siguientes, respetando los factores de ponderación establecidos por la Comisión
para el Mercado Financiero en concordancia con los estándares de Basilea III vigentes.
`.trim();

// OCR artifact: "ANEXO N° 1 ANEXO N°1" on the same line (Bug #3)
const RAN_ANEXO_RUBRICA_DUPLICADA = `
TÍTULO I - Definiciones

Para los efectos de esta norma se entenderá por proveedor externo aquel que proporciona
infraestructura tecnológica crítica y que actúa en nombre de la institución financiera regulada,
conforme a la ley vigente y las instrucciones de la Comisión para el Mercado Financiero.

TÍTULO II - Requisitos generales

Las instituciones reguladas deberán adoptar medidas de seguridad adecuadas para garantizar la
continuidad operacional y la protección de los datos de sus clientes, conforme a los estándares
internacionales aplicables al sector financiero regulado por la Comisión para el Mercado Financiero.

ANEXO N° 1 ANEXO N°1

Instrucciones específicas para completar los campos requeridos en este formulario de evaluación
de proveedores externos, conforme a la normativa vigente de la Comisión para el Mercado Financiero
en materia de externalización de servicios y gestión de riesgo tecnológico y operacional.
`.trim();

// OCR splits heading across two lines: "I. TITLE LINE 1\nLINE 2." (Bug #4)
const RAN_RUBRICA_MULTILINEA = `
I. PRINCIPALES RIESGOS QUE SE ASUMEN CON MOTIVO
DE LA EXTERNALIZACIÓN DE SERVICIOS.

Las instituciones deberán identificar y evaluar todos los riesgos asociados a la contratación
de proveedores externos, incluyendo riesgo operacional, tecnológico, legal y de concentración,
conforme a los estándares establecidos por la Comisión para el Mercado Financiero vigentes.

II. CONDICIONES QUE DEBEN CUMPLIRSE EN LA
EXTERNALIZACIÓN DE SERVICIOS.

Los contratos de externalización deberán incluir cláusulas que aseguren el acceso irrestricto de
la Comisión para el Mercado Financiero a la información y sistemas del proveedor, así como las
condiciones de reversibilidad y continuidad operacional en caso de término anticipado del contrato.
`.trim();

// ran-20-7 realistic: Roman-numeral sections + ANEXO (no TÍTULO keyword)
const RAN_ROMAN_CON_ANEXOS = `
I. ÁMBITO DE APLICACIÓN

La presente norma aplica a todas las instituciones que presten servicios
de externalización de procesos o funciones. Las disposiciones aquí contenidas
son de carácter obligatorio y complementan las instrucciones generales de la
Comisión para el Mercado Financiero y demás normativa aplicable a las entidades
bancarias fiscalizadas conforme a la Ley General de Bancos vigente.

II. REQUISITOS DE EXTERNALIZACIÓN

Las entidades deberán contar con políticas y procedimientos formales para la
gestión de proveedores de servicios externalizados, conforme a los estándares
internacionales aplicables al sector financiero regulado por la Comisión y en
concordancia con las instrucciones que se dicten mediante circular o resolución.

ANEXO N° 1 - Formulario de evaluación

Instrucciones específicas para completar los campos requeridos en este formulario
de evaluación de proveedores externos, conforme a la normativa vigente de la
Comisión para el Mercado Financiero en materia de externalización de servicios.
`.trim();

describe("segmentNorm", () => {
  it("NCG sustantiva: segmenta artículos reales correctamente", () => {
    const { mode, articles } = segmentNorm("ncg-test", NCG_SUBSTANTIVE);
    expect(mode).toBe("substantive");
    expect(articles).toHaveLength(2);
    expect(articles[0]?.numero).toBe("1");
    expect(articles[1]?.numero).toBe("2");
    for (const art of articles) {
      expect(art.texto.length).toBeGreaterThan(MIN_BODY_LEN_CHECK);
    }
  });

  it("RAN con referencias LGB inline (ran-1-13): secciones romanas segmentadas, sin fragmentos LGB", () => {
    const { mode, articles } = segmentNorm("ran-1-13", RAN_LGB_INLINE);
    // Roman headers I. and II. are real structural sections → mode substantive
    // Inline LGB citations ("artículo 65 de la LGB") do NOT generate additional splits
    expect(mode).toBe("substantive");
    expect(articles).toHaveLength(2);
    expect(articles[0]?.numero).toBe("I");
    expect(articles[1]?.numero).toBe("II");
    for (const art of articles) {
      expect(art.texto.length).toBeGreaterThan(MIN_BODY_LEN_CHECK);
    }
  });

  it("RAN con secciones romanas (ran-20-9): body íntegro, sin fragmentar (regresión)", () => {
    const { articles } = segmentNorm("ran-20-9", RAN_ROMAN);
    const total = articles.reduce((s, a) => s + a.texto.length, 0);
    expect(total).toBeGreaterThan(RAN_ROMAN.length * 0.5);
    for (const art of articles) {
      expect(art.texto.length).toBeGreaterThan(MIN_BODY_LEN_CHECK);
    }
  });

  it("NCG con artículos reales que citan LGB en el body: segmenta correctamente", () => {
    const { mode, articles } = segmentNorm("ncg-mixed", NCG_MIXED);
    // The article headers ARE at line starts and are not followed by "de la"
    expect(mode).toBe("substantive");
    expect(articles).toHaveLength(2);
    for (const art of articles) {
      expect(art.texto.length).toBeGreaterThan(MIN_BODY_LEN_CHECK);
    }
  });

  it("RAN con TÍTULO/ANEXO (ran-20-7): segmenta en unidades atómicas con rubrica", () => {
    const { mode, articles } = segmentNorm("ran-20-7", RAN_TITULO_ESTRUCTURA);
    expect(mode).toBe("substantive");
    // TÍTULO I, II, III + ANEXO N° 1 = 4 unidades
    expect(articles).toHaveLength(4);
    expect(articles[0]?.numero).toBe("I");
    expect(articles[1]?.numero).toBe("II");
    expect(articles[2]?.numero).toBe("III");
    expect(articles[3]?.numero).toBe("Anexo-1");
    // rubrica poblada desde el heading
    expect(articles[0]?.rubrica).toBe("Definiciones");
    expect(articles[3]?.rubrica).toContain("Anexo N° 1");
    for (const art of articles) {
      expect(art.texto.length).toBeGreaterThan(MIN_BODY_LEN_CHECK);
    }
  });

  it("RAN con secciones I. + ANEXO (ran-20-7 realista): segmenta cuerpo y anexos", () => {
    const { mode, articles } = segmentNorm("ran-20-7", RAN_ROMAN_CON_ANEXOS);
    expect(mode).toBe("substantive");
    expect(articles).toHaveLength(3); // I, II, Anexo-1
    expect(articles[0]?.numero).toBe("I");
    expect(articles[1]?.numero).toBe("II");
    expect(articles[2]?.numero).toBe("Anexo-1");
    expect(articles[0]?.rubrica).toBe("ÁMBITO DE APLICACIÓN");
    expect(articles[1]?.rubrica).toBe("REQUISITOS DE EXTERNALIZACIÓN");
    expect(articles[2]?.rubrica).toContain("Anexo N° 1");
    for (const art of articles) {
      expect(art.texto.length).toBeGreaterThan(MIN_BODY_LEN_CHECK);
    }
  });

  it("Bug #1 — RAN con secciones arábiga top-level (ran-8-41): segmenta por numerales", () => {
    const { mode, articles } = segmentNorm("ran-8-41", RAN_ARABIC_SECTIONS);
    expect(mode).toBe("substantive");
    expect(articles).toHaveLength(3);
    expect(articles[0]?.numero).toBe("1");
    expect(articles[1]?.numero).toBe("2");
    expect(articles[2]?.numero).toBe("3");
    for (const art of articles) {
      expect(art.texto.length).toBeGreaterThan(MIN_BODY_LEN_CHECK);
    }
  });

  it("Bug #2 — Anexo sin numeral (ran-12-20): Anexo separado como artículo propio", () => {
    const { mode, articles } = segmentNorm("ran-12-20", RAN_ANEXO_SIN_NUMERO);
    expect(mode).toBe("substantive");
    const anexo = articles.find((a) => a.numero.toLowerCase().startsWith("anexo"));
    expect(anexo).toBeDefined();
    expect(anexo?.texto.length).toBeGreaterThan(MIN_BODY_LEN_CHECK);
    // Annex content must NOT be merged into the last roman section
    const lastRoman = articles.find((a) => a.numero === "II");
    expect(lastRoman?.texto).not.toContain("Instrucciones para el cómputo");
  });

  it("Bug #3 — Rúbrica de Anexo duplicada: rubrica limpia sin repetición ANEXO N°X", () => {
    const { articles } = segmentNorm("ran-test", RAN_ANEXO_RUBRICA_DUPLICADA);
    const anexo = articles.find((a) => a.numero === "Anexo-1");
    expect(anexo).toBeDefined();
    // Must NOT contain "— ANEXO N°1" or similar self-referential suffix
    expect(anexo?.rubrica).not.toMatch(/—\s*ANEXO\s*N[°º]?\s*\d+\s*$/i);
    expect(anexo?.rubrica).toMatch(/Anexo N° 1/);
  });

  it("Bug #4 — Rúbrica multilínea: continuación unida a rubrica, fuera del texto", () => {
    const { articles } = segmentNorm("ran-20-7", RAN_RUBRICA_MULTILINEA);
    expect(articles).toHaveLength(2);
    const art1 = articles[0];
    expect(art1?.rubrica).toContain("EXTERNALIZACIÓN DE SERVICIOS");
    // Continuation line must not leak into texto
    expect(art1?.texto).not.toMatch(/^DE LA EXTERNALIZACIÓN/);
    const art2 = articles[1];
    expect(art2?.rubrica).toContain("EXTERNALIZACIÓN DE SERVICIOS");
    expect(art2?.texto).not.toMatch(/^EXTERNALIZACIÓN DE SERVICIOS/);
  });

  // ---- Second bug-report patterns ----

  it("Bug B — artículo con sufijo ordinal (quinquies): numero incluye sufijo, rubrica limpia", () => {
    const text = [
      "Artículo 66 quinquies.- Requisitos de capital adicional",
      "",
      "Las instituciones deberán mantener un colchón de capital adicional conforme a los",
      "criterios establecidos en la normativa vigente de la Comisión para el Mercado Financiero,",
      "complementando las exigencias del artículo 66 de la Ley General de Bancos en todo momento.",
    ].join("\n");
    const text2 = [
      "Artículo 1.- Definiciones generales",
      "",
      "Para efectos de esta norma se entiende por capital básico aquel exigido conforme",
      "a los criterios prudenciales de la Comisión para el Mercado Financiero vigentes.",
    ].join("\n");
    // Single-article → modifier (< 2 real headers); test via a two-article fixture
    const twoArt = `${text}\n\n${text2}`;
    const { articles } = segmentNorm("ran-21-13", twoArt);
    const art66q = articles.find((a) => a.numero.includes("66"));
    expect(art66q).toBeDefined();
    expect(art66q?.numero).toBe("66-quinquies");
    expect(art66q?.rubrica).toBe("Requisitos de capital adicional");
    expect(art66q?.rubrica).not.toMatch(/quinquies/i);
  });

  it("Bug B — cita LGB OCR-split en línea (artículo 6\\n6 de la LGB): no genera artículo espurio", () => {
    // OCR splits "artículo 66 de la LGB" across two lines: "artículo 6\n6 de la LGB..."
    // splitOnArticulos must bail out and let splitOnDispositivos handle the norm.
    const text = [
      "Las entidades sujetas al artículo 6",
      "6 de la Ley General de Bancos deberán cumplir con las exigencias mínimas de capital",
      "establecidas por la Comisión para el Mercado Financiero conforme a esta norma vigente.",
      "Asimismo, según el artículo 7",
      "0 de la misma ley, se considerarán las reservas técnicas y los ajustes regulatorios",
      "indicados por la Comisión en las instrucciones complementarias que se emitan al efecto.",
    ].join("\n");
    const { articles } = segmentNorm("ran-11-6", text);
    // Should fall through to dispositivos (1 article), not produce multiple spurious ones
    for (const art of articles) {
      expect(art.rubrica ?? "").not.toMatch(/^\d+\s+de\s+/i);
    }
  });

  it("Bug A — rúbrica multilínea sin punto final: continuación unida aunque no termine en punto", () => {
    const text = [
      "III. AJUSTES REGULATORIOS Y EXCLUSIONES DE PARTIDAS DE",
      "ACTIVOS O PASIVOS EN LOS COMPONENTES DE CAPITAL",
      "",
      "En esta sección se detallan los ajustes regulatorios y exclusiones de partidas de activos",
      "o pasivos que deben aplicarse sobre los componentes de capital básico y patrimonio efectivo",
      "conforme a la normativa vigente de la Comisión para el Mercado Financiero en materia.",
      "",
      "IV. SOBRE LA MEDICIÓN DE LOS LÍMITES LEGALES Y",
      "APLICACIÓN DE ESTA NORMA",
      "",
      "El capital básico y patrimonio efectivo, una vez efectuados los ajustes regulatorios,",
      "se emplean para verificar los límites legales establecidos en la Ley General de Bancos",
      "y en las instrucciones impartidas por la Comisión para el Mercado Financiero vigentes.",
    ].join("\n");
    const { articles } = segmentNorm("ran-21-1", text);
    const art3 = articles.find((a) => a.numero === "III");
    const art4 = articles.find((a) => a.numero === "IV");
    expect(art3?.rubrica).toContain("ACTIVOS O PASIVOS");
    expect(art4?.rubrica).toContain("APLICACIÓN DE ESTA NORMA");
    // Continuation must not bleed into text body
    expect(art3?.texto).not.toMatch(/^ACTIVOS O PASIVOS/);
    expect(art4?.texto).not.toMatch(/^APLICACIÓN DE ESTA NORMA/);
  });

  it("Bug A_HYPHEN — rúbrica con guion OCR: palabra reconstituida correctamente", () => {
    // OCR splits "documentos" as "docu-\nmentos" within an article rubric
    const text = [
      "Artículo 3.- Giro de los importes depositados y liberación de docu-",
      "mentos antes de obtenerse el pago de los valores en cobro.",
      "",
      "Las retenciones señaladas en las instrucciones anteriores se liberarán una vez que",
      "el banco haya recibido confirmación de pago de los documentos remitidos al cobro",
      "conforme a los plazos establecidos por la Comisión para el Mercado Financiero vigente.",
      "",
      "Artículo 4.- Prohibición de pagar cheques a cargo de otros bancos.",
      "",
      "En relación con la naturaleza jurídica de las operaciones, los bancos no podrán pagar",
      "cheques a cargo de otras instituciones bancarias salvo las excepciones calificadas que",
      "establece la normativa vigente de la Comisión para el Mercado Financiero aplicables.",
    ].join("\n");
    const { articles } = segmentNorm("ran-3-1", text);
    const art3 = articles.find((a) => a.numero === "3");
    expect(art3?.rubrica).not.toMatch(/docu-$/);
    expect(art3?.rubrica).toContain("documentos");
    expect(art3?.texto).not.toMatch(/^mentos/);
  });

  it("Bug D — Anexo con Hoja en rúbrica: rúbrica limpia sin artefacto Hoja N°", () => {
    const text = [
      "TÍTULO I - Definiciones",
      "",
      "Para los efectos de esta norma se entenderá por institución regulada aquella que",
      "se encuentra sujeta a la supervisión de la Comisión para el Mercado Financiero.",
      "",
      "TÍTULO II - Requisitos generales",
      "",
      "Las instituciones deberán adoptar las medidas de seguridad adecuadas conforme a",
      "los estándares internacionales aplicables al sector financiero supervisado por la Comisión.",
      "",
      "ANEXO N° 2 – Hoja N°1",
      "",
      "Instrucciones específicas para el formulario de evaluación de proveedores externos",
      "de servicios tecnológicos críticos, conforme a la normativa de la Comisión vigente.",
    ].join("\n");
    const { articles } = segmentNorm("ran-21-1", text);
    const anexo = articles.find((a) => a.numero === "Anexo-2");
    expect(anexo).toBeDefined();
    expect(anexo?.rubrica).not.toMatch(/Hoja/i);
    expect(anexo?.rubrica).toMatch(/Anexo N° 2/);
  });

  it("RAN con headers PDF: headers stripeados, estructura preservada", () => {
    const { mode, articles } = segmentNorm("ran-20-7-b", RAN_CON_HEADERS_PDF);
    expect(mode).toBe("substantive");
    expect(articles).toHaveLength(2);
    // Headers de PDF no deben aparecer en el texto
    for (const art of articles) {
      expect(art.texto).not.toContain("RECOPILACION ACTUALIZADA DE NORMAS");
      expect(art.texto).not.toContain("Capítulo 20-7");
      expect(art.texto).not.toContain("Hoja N°");
      expect(art.texto).not.toMatch(/^Circular\s+N[°º]\s*[\d.]+\s*\//m);
    }
  });

  it("Bug E — sección romana Title Case detectada (ran-21-13 §III usa mixed case)", () => {
    // Old RE_ROMAN_SECTION used [^\na-z]{4,} which required ALL CAPS titles.
    // ran-21-13 §III heading is "III. Informe de Autoevaluación..." — mixed case.
    // New regex uses [^\n]{4,} to allow any non-newline chars in the title.
    const text = [
      "I. OBJETIVO DEL PROCESO",
      "",
      "La presente norma establece los criterios para evaluar la suficiencia del capital interno",
      "de las empresas bancarias, conforme a los principios de Basilea y las instrucciones vigentes",
      "de la Comisión para el Mercado Financiero aplicables al sector bancario supervisado.",
      "",
      "II. CRITERIOS DE EVALUACIÓN",
      "",
      "Las instituciones deberán documentar su metodología de evaluación interna conforme a los",
      "parámetros establecidos por la Comisión, incluyendo los escenarios de estrés y las",
      "proyecciones de capital ajustadas por riesgo para el horizonte de planificación definido.",
      "",
      "III. Informe de Autoevaluación de Patrimonio",
      "",
      "Las instituciones deberán elaborar anualmente un informe de autoevaluación conforme a las",
      "instrucciones que imparta la Comisión, aprobado por el directorio y remitido dentro del",
      "plazo establecido en la normativa vigente de la Comisión para el Mercado Financiero.",
    ].join("\n");
    const { mode, articles } = segmentNorm("ran-21-13", text);
    expect(mode).toBe("substantive");
    expect(articles).toHaveLength(3);
    expect(articles[0]?.numero).toBe("I");
    expect(articles[1]?.numero).toBe("II");
    expect(articles[2]?.numero).toBe("III");
    expect(articles[2]?.rubrica).toContain("Informe de Autoevaluación");
  });

  it("Bug E — sección romana con formato I.- detectada (ran-12-4 usa punto+guion)", () => {
    // Old RE_ROMAN_SECTION used \.\s+ which didn't match the "I.-" separator.
    // ran-12-4 uses "I.- PERSONAS RELACIONADAS…" with hyphen after the period.
    // New regex uses \.(?:-\s+|\s+) to accept both "I. TITLE" and "I.- TITLE".
    const text = [
      "I.- PERSONAS RELACIONADAS CON LA PROPIEDAD",
      "",
      "Para efectos de esta norma, se entenderá por personas relacionadas con la propiedad o",
      "gestión de un banco aquellas señaladas en la normativa vigente y sus instrucciones",
      "complementarias emitidas por la Comisión para el Mercado Financiero aplicables.",
      "",
      "II.- MEDICIÓN DE LA CONCENTRACIÓN DE CRÉDITOS",
      "",
      "Las instituciones deberán calcular la concentración de créditos conforme a los límites",
      "establecidos en la normativa y las instrucciones de la Comisión, utilizando los métodos",
      "de medición que se detallan en el presente capítulo de la norma vigente aplicable.",
    ].join("\n");
    const { mode, articles } = segmentNorm("ran-12-4", text);
    expect(mode).toBe("substantive");
    expect(articles).toHaveLength(2);
    expect(articles[0]?.numero).toBe("I");
    expect(articles[1]?.numero).toBe("II");
  });

  it("Bug E — citación inline LGB al inicio de línea (ran-12-3): cae a secciones romanas", () => {
    // OCR wraps sentences so "artículo 84 Nº 2" lands at the start of a line mid-paragraph.
    // Without the \n\n guard, splitOnArticulos treated these as real article headers (Patrón B).
    // The guard now rejects any match not preceded by \n\n; the norm falls through to
    // splitOnRomanSections and produces the correct Roman-section structure.
    const text = [
      "I. CUENTAS EN MONEDA EXTRANJERA",
      "",
      "Las instituciones bancarias que mantengan operaciones en moneda extranjera deberán reportar",
      "sus posiciones conforme a las instrucciones de la Comisión, incluyendo lo dispuesto en el",
      "artículo 84 Nº 2 de la Ley General de Bancos relativo a los límites de concentración y los",
      "criterios de valorización establecidos en la normativa vigente de la Comisión aplicable.",
      "",
      "II. LÍMITES DE POSICIÓN",
      "",
      "Los límites de posición en moneda extranjera están determinados por el capital básico,",
      "conforme a lo dispuesto en el artículo 74 Nº 1 de la Ley General de Bancos, considerando",
      "las deducciones y ajustes que correspondan según las instrucciones de la Comisión vigente.",
    ].join("\n");
    const { mode, articles } = segmentNorm("ran-12-3", text);
    expect(mode).toBe("substantive");
    expect(articles).toHaveLength(2);
    expect(articles[0]?.numero).toBe("I");
    expect(articles[1]?.numero).toBe("II");
    // No false article boundaries from inline LGB citations
    expect(articles.find((a) => a.numero === "84")).toBeUndefined();
    expect(articles.find((a) => a.numero === "74")).toBeUndefined();
  });
});

const MIN_BODY_LEN_CHECK = 99;
