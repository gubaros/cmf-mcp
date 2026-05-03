# CMF MCP Server — Guía del Analista de Compliance / Regulatorio

> **Audiencia:** analista regulatorio o de compliance que usa el MCP como herramienta de investigación y monitoreo, y aporta el lente "del cliente final" al diseño del producto.
> **Rol dual:** (1) usuario power del MCP en proyectos reales y (2) curador del valor regulatorio que el corpus debe entregar.
> **Contexto clave:** el producto es **gratuito y open-source**. La métrica que importa no es facturación directa por uso, sino **cuántas conversaciones comerciales abre y cuánta autoridad regulatoria construye para la firma**.

---

## 1. Por qué este rol existe

Un corpus técnicamente correcto y jurídicamente validado puede aún ser **inútil** si no responde a las preguntas que un compliance officer chileno se hace en su día a día. Tu trabajo es asegurar que el MCP no sea solo un buscador de PDFs, sino una herramienta que se gana un lugar en el flujo de trabajo regulatorio real.

Y como el producto es gratuito, hay un segundo trabajo encima del primero: **convertir uso en demanda**. Cada interacción útil con el MCP es una oportunidad para que un usuario externo descubra que detrás hay una firma capaz de resolver problemas regulatorios complejos en Chile.

Tienes dos canales de impacto:

1. **Uso en casos reales** dentro de la firma o de clientes piloto. Cada caso resuelto valida o invalida el diseño.
2. **Feedback estructurado** al equipo: qué falta, qué sobra, qué se cita mal, qué está mal taxonomizado.

---

## 2. Mapa mental del corpus

### 2.1 Por sector regulado

| Sector | Cuerpo normativo principal | Volumen aprox. |
|---|---|---|
| **Bancario** | RAN (Recopilación Actualizada de Normas) | Capítulos 1 al 21+, cientos de secciones |
| **Mercado de Valores** | NCGs + Circulares para emisores e intermediarios | Cientos de NCGs vigentes |
| **Seguros** | Compendio de Normas para Compañías de Seguros | 5 libros principales |
| **Fondos** | NCGs específicas para AGFs y fondos | Decenas de NCGs |
| **Infraestructura de mercado** | NCGs y Circulares para ECCs, depósitos centralizados | Volumen acotado |
| **Transversales** | Prevención LA/FT, gobierno corporativo, ciberseguridad | Crecientes en relevancia |

### 2.2 Por temáticas de alta demanda en compliance

Estas son las "rutas calientes" — donde más consultas vas a hacer y donde más se demuestra valor:

- **Gestión de riesgos:** crédito, mercado, liquidez, operacional, ciber. Banca (RAN cap. 1 y 4), seguros (Compendio Libro III) y mercado de valores.
- **Gobierno corporativo:** directorios, comités, independencia, auditoría interna.
- **Prevención LA/FT y financiamiento del terrorismo:** transversal.
- **Conducta de mercado y protección al inversionista:** información a clientes, suitability, conflictos de interés.
- **Reportería y hechos esenciales:** plazos, formatos, sanciones por incumplimiento.
- **Capital regulatorio y solvencia:** Basilea III en banca, capital basado en riesgo en seguros.
- **Outsourcing y nube:** crecientemente regulado, especialmente en banca.

Cuando se decida qué expandir, **tu voz pesa más en estas temáticas**.

---

## 3. Casos de uso típicos

Estos son los workflows que el MCP debe resolver bien.

### 3.1 Mapeo regulatorio de una obligación

> "¿Qué normas CMF aplican a la gestión del riesgo operacional en un banco?"

El analista busca por temática, filtra por sector `BANCARIO`, identifica las normas relevantes, y construye un mapa: norma → artículo → obligación → evidencia esperada.

### 3.2 Análisis de impacto de un cambio normativo

> "Salió la NCG N° XXX que modifica obligaciones de reporte. ¿Qué cambia para mi cliente?"

Consulta la nueva norma, sus relaciones (`get_relations`), y compara la versión anterior con la actual (`compare_articles`). Output: memo de impacto.

### 3.3 Construcción de checklist de cumplimiento

> "Cliente entrante en sector seguros. Necesito un checklist completo de obligaciones permanentes."

Recorre el Compendio de Seguros por secciones, extrae obligaciones, y arma una matriz de cumplimiento.

### 3.4 Investigación retrospectiva

> "En 2022, ¿cuál era el régimen de información sobre cyber-incidentes?"

Consulta la versión histórica del artículo con `articles_history`. Esto exige que el MCP exponga la dimensión temporal correctamente (Fase 3).

### 3.5 Comparativa entre sectores

> "¿Cómo se trata el outsourcing en banca vs. seguros vs. mercado de valores?"

Busca el mismo concepto con filtros de sector distintos, compara, y produce una tabla comparativa.

---

## 4. Tu interacción con el resto del equipo

### 4.1 Lo que recibes

- **Reporte semanal de cambios** (`{timestamp}_diff.md`): normas nuevas, modificadas, derogadas. Llega cada lunes.
- **Log de validación:** consultable. Sabes en cualquier momento qué normas están firmadas y cuáles no.

### 4.2 Lo que produces

1. **Newsletter regulatorio público (semanal o quincenal)** basado en el reporte de cambios. **Como el producto es gratuito y open-source, este newsletter es el principal canal de demanda comercial.** Va por LinkedIn, blog de la firma, o lista propia. Destaca:
   - Qué cambió.
   - A quién aplica (sector, tipo de entidad).
   - Plazo para implementar.
   - Recomendación accionable de alto nivel.
   - **Cierre con CTA suave:** "este análisis se hizo con el MCP de CMF que mantenemos abierto en `gubaros/cmf-mcp`. Para casos específicos en su organización, contáctenos."

2. **Issues al desarrollador** sobre:
   - Búsquedas que no devuelven lo esperado.
   - Sectorizaciones incorrectas detectadas en uso real.
   - Necesidades de nuevos filtros, campos o tools.
   - Cross-references que faltan.

3. **Validaciones cruzadas** sobre el trabajo del validador legal: si en uso real un artículo "no calza" con la fuente oficial, levantas el caso.

4. **Priorización de fases del corpus.** Cuando se decida qué normativa sumar fuera del MVP, propones priorización basada en **demanda observada en uso público y en consultas que llegan a la firma**.

---

## 5. Disciplinas para usar bien el MCP

### 5.1 Siempre cita la fuente

Cualquier output que generes basado en una consulta al MCP debe llevar la cita de la norma + URL oficial. **No publiques análisis sin trazabilidad** — y menos en un newsletter público que lleva la marca de la firma.

### 5.2 No confundas "vigente" con "aplicable"

El MCP filtra por `estado=VIGENTE`, pero que algo esté vigente no significa que aplique al sujeto que estás analizando. Un banco grande tiene obligaciones que un emisor mediano no. **La aplicabilidad la pones tú con criterio, no la deduce el sistema.**

### 5.3 Cruzá siempre con la ley

El MCP de CMF tiene normativa CMF, no leyes. Si una NCG dice "según lo dispuesto en el artículo X de la Ley 18.045", el MCP no resolverá ese artículo. Tienes que ir a la ley aparte. **Esto es deliberado** — la cobertura legislativa chilena es otro producto. Si el patrón se repite mucho, lo evaluamos como Fase 2.

### 5.4 Documenta los huecos

Lleva un archivo `gaps.md` versionado en el repo del proyecto con:
- Preguntas que el MCP no responde bien.
- Normas que faltarían para responderlas (ley habilitante, jurisprudencia, instructivos UAF).
- Frecuencia con que aparecen esos huecos.

Este archivo es **oro** para decidir el roadmap del producto y para identificar qué temas convertir en consultas pagas para la firma.

---

## 6. Métricas que importan en un producto gratuito

Como no hay ingreso directo por uso, las métricas son indirectas pero medibles:

| Métrica | Cómo medir | Por qué importa |
|---|---|---|
| **Stars y forks del repo** | GitHub | Proxy de adopción y autoridad técnica |
| **Suscriptores al newsletter regulatorio** | Lista propia | Lead pool calificado |
| **Consultas entrantes a la firma atribuibles al MCP** | Tag en CRM | Conversión real producto → revenue |
| **Cobertura efectiva** | % de consultas reales que se responden sin salir del MCP | Mide utilidad |
| **Frecuencia de gaps** | Updates a `gaps.md` por mes | Guía el roadmap |
| **Tiempo a respuesta** | Tiempo medio para responder una consulta con MCP vs. sin MCP | Justifica el ROI internamente |

**Métrica que NO usar (todavía):** uso técnico del MCP en runtime de los usuarios externos. Como el servidor corre local en la máquina de cada usuario, no hay telemetría — y agregar telemetría a un producto open-source genera fricción y desconfianza. Si en Fase 4 abrimos un endpoint HTTP gestionado, ahí sí.

---

## 7. Lo que NO debes hacer

- **No emitir opinión legal en nombre del MCP.** El MCP devuelve texto y metadata. La opinión es tuya o del abogado.
- **No completar campos a mano en la base.** Si encuentras un error, va por issue al desarrollador o validador. Editar la DB rompe la trazabilidad.
- **No prometer cobertura que no existe.** Si un usuario asume que el MCP cubre normas tributarias del SII o instructivos de la UAF, corregir expectativas. Cobertura clara > sobrevender.
- **No reciclar análisis sin re-validar vigencia.** Lo que valió hace 6 meses pudo cambiar.
- **No cobrar por consultas que el MCP responde gratis.** Cobrar por preguntas que cualquiera puede resolver con la herramienta abierta destruye la confianza. La firma cobra por **interpretación, implementación y respaldo profesional** — no por mostrar un artículo. Si una consulta se resuelve mirando el MCP, se resuelve gratis y se sigue conversando.

---

## 8. Tu input para la estrategia comercial

Como vives el corpus, eres una fuente clave para:

- **Identificar qué tipo de empresa pregunta más** — sector, tamaño, tipo de problema. Insumo directo para targeting.
- **Casos de uso para demo:** identificar 3–5 consultas reales y representativas para mostrar la herramienta.
- **Argumentos de venta:** cobertura, frescura del corpus, trazabilidad, validación humana firmada. Tú las vives todos los días.
- **Detección de oportunidades de upsell:** una consulta que el MCP responde a medias es exactamente donde la firma ofrece servicio profesional. Marcar esos casos.

Pasamos esos insumos al equipo comercial mensualmente.
