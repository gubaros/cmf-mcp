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
});

const MIN_BODY_LEN_CHECK = 99;
