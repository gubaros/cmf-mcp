# CMF MCP Server — Guía del Abogado Validador

> **Audiencia:** Guido Baros, en su rol de validador legal del corpus CMF.
> **Por qué tú:** ya tienes la formación legal, conoces el dominio, y mientras el producto sea gratuito y esté en MVP no se justifica costear un validador externo. La validación legal personal de quien lidera la firma también es **un activo de marca**: el repo público puede acreditar quién firma cada release.
> **Cuándo delegar:** cuando el corpus crezca a Circulares + Oficios (Fase 2) y el volumen exceda lo razonable de tu agenda, o cuando aparezca un cliente piloto con SLA. Hasta entonces, lo absorbes tú.
> **Filosofía:** sin tu firma, el release no se publica. Eres el último checkpoint antes del usuario final.

---

## 1. Por qué este rol es crítico

Un MCP que devuelve normativa con errores es peor que uno que no existe. Si un usuario decide su programa de cumplimiento confiando en un texto que omitimos modificar, o en una norma derogada que mostramos como vigente, el daño reputacional es alto — y como el producto es gratuito y lleva la marca de la firma, **el daño es directamente nuestro, sin contrato que medie**.

El sistema técnico puede tener bugs; tu validación es la red de seguridad. Y como el producto es gratuito y open-source, esa firma vale más: es lo que diferencia este corpus de cualquier scrape sin garantía.

---

## 2. Marco regulatorio relevante

Para validar correctamente conviene tener presente:

### 2.1 Jerarquía y tipología de normas CMF

- **Normas de Carácter General (NCG):** instrumento principal de regulación general. Aplican a una o más industrias supervisadas. Identificadas por número correlativo (ej. NCG N° 461).
- **Circulares:** dirigidas a un sector específico, suelen tener carácter operativo o instructivo. Numeración independiente por sector.
- **Oficios Circulares:** comunican criterios, interpretaciones o instrucciones puntuales.
- **Resoluciones Exentas:** actos administrativos individuales o de alcance acotado.
- **Recopilación Actualizada de Normas (RAN):** compilación viva para bancos. Cada capítulo y sección puede modificarse independientemente.
- **Compendio de Normas para Compañías de Seguros:** equivalente al RAN para el sector asegurador.

### 2.2 Marco legal habilitante (no se incluye en el corpus pero conviene tenerlo presente)

- Ley N° 21.000 (crea la CMF y define facultades).
- Ley N° 18.045 (Mercado de Valores).
- Ley N° 18.046 (Sociedades Anónimas).
- DFL N° 3 / Ley General de Bancos.
- DFL N° 251 (Compañías de Seguros).
- Ley N° 20.712 (Administración de Fondos de Terceros).

Estas leyes **no** están en el MCP. Pero al validar, verificas que las NCG y Circulares no contradigan la ley habilitante y que las referencias legales sean correctas.

### 2.3 Sectores regulados (taxonomía interna del corpus)

| Código | Descripción |
|---|---|
| `BANCARIO` | Bancos, IF, cooperativas de ahorro y crédito supervisadas, emisores y operadores de tarjetas |
| `VALORES` | Emisores, intermediarios, bolsas, depósitos centralizados, clasificadoras |
| `SEGUROS` | Compañías de seguros generales y de vida, corredores, liquidadores, auxiliares |
| `FONDOS` | Administradoras generales de fondos, fondos de inversión, fondos mutuos |
| `INFRA_MERCADO` | ECCs, depósitos centralizados, sistemas de compensación |
| `TRANSVERSAL` | Aplicable a más de un sector (ej: prevención LA/FT, gobierno corporativo) |

Si una norma está mal sectorizada, el motor de búsqueda devuelve resultados incorrectos. **Revisar siempre el campo `sector`.**

---

## 3. Workflow de validación

El scraper produce, en cada corrida, un archivo `data/runs/{timestamp}_diff.md`. Ese es tu input principal. Contiene:

1. Normas nuevas detectadas.
2. Normas modificadas (con diff de texto).
3. Normas marcadas como `DESAPARECIDA` (candidatas a `DEROGADA`).
4. Normas con `PARSE_FAIL` o `requiresReview`.

Tu trabajo se hace contra ese reporte y contra el sitio oficial de CMF, en paralelo.

### 3.1 Checklist por norma nueva

- [ ] **Identidad:** el `id` interno y el número CMF coinciden con la fuente oficial.
- [ ] **Tipo:** NCG / Circular / Oficio / Resolución / RAN / Compendio Seguros está correctamente clasificada.
- [ ] **Sector:** la sectorización corresponde al ámbito real de aplicación. Atención a normas transversales que el scraper puede haber metido en un solo sector.
- [ ] **Vigencia:** fecha de emisión y fecha de entrada en vigencia son correctas y distintas si corresponde. Algunas NCG entran en vigencia diferida.
- [ ] **Texto íntegro:** muestreo de al menos 3 artículos y/o el primer y último anexo, comparando carácter por carácter contra el PDF oficial. Si hay tablas, verificar que están completas.
- [ ] **Estructura:** numeración de artículos sin saltos no justificados. Anexos correctamente identificados como tales.
- [ ] **Referencias cruzadas:** la norma menciona otras normas? ¿Esas referencias están en `normRelations`?
- [ ] **URL oficial:** apunta efectivamente a la versión consolidada en CMF.

Solo cuando los 8 puntos están OK, firmas con tus iniciales y fecha en `validation_log`.

### 3.2 Checklist por norma modificada

Las modificaciones son la parte más sensible.

- [ ] **Diff comprendido:** entiendes qué cambió y por qué.
- [ ] **Versión anterior preservada:** el registro previo está en `articles_history` con `validTo` correcto.
- [ ] **Versión nueva correcta:** el texto vigente es el modificado.
- [ ] **Norma modificadora registrada:** la NCG modificadora figura como `sourceNormId` en `normRelations` con `tipoRelacion=MODIFICA`.
- [ ] **Vigencia del cambio:** la fecha de entrada en vigencia de la modificación es la efectiva, no la de emisión.
- [ ] **Notificación a compliance:** el cambio queda incorporado al reporte del analista regulatorio.

### 3.3 Checklist por norma desaparecida del índice

- [ ] **Verificación manual:** confirmar en cmfchile.cl que efectivamente ya no aparece en normativa vigente.
- [ ] **Buscar la norma derogadora:** ¿qué NCG/Circular la dejó sin efecto? Ese vínculo se carga en `normRelations` con `tipoRelacion=DEROGA`.
- [ ] **Cambio de estado:** la norma pasa a `estado=DEROGADA` con la fecha en que dejó de tener vigencia.
- [ ] **Texto preservado:** la norma derogada no se borra. Sigue siendo consultable, marcada como derogada.

### 3.4 Frente a `PARSE_FAIL` o `requiresReview`

- Abrir el PDF original y el JSON de parseo en paralelo.
- Si el problema es OCR, reescribir manualmente los pasajes problemáticos en `articles.texto` y dejar `articles.textoOriginal` intacto.
- Si el problema es estructural (artículos mal segmentados), avisar al equipo del scraper con el caso específico para ajustar el parser, no parchar manualmente — los parches manuales no escalan.

---

## 4. Muestreo y QA periódico

Además del flujo por corrida, **auditoría aleatoria mensual**:

- 10 normas elegidas al azar del corpus vigente.
- Para cada una, validar 2 artículos al azar carácter por carácter.
- Tasa de error objetivo: **< 0,5% de artículos con discrepancia material**. Por encima, se detiene la publicación de nuevas versiones del corpus hasta corregir el pipeline.

**Discrepancias materiales (bloqueantes):**
- Texto faltante o agregado.
- Cambios de números, fechas, montos o porcentajes.
- Artículos mal numerados.
- Vigencia mal asignada.

**Discrepancias menores (registradas, no bloqueantes):**
- Diferencias de espaciado, saltos de línea.
- Comillas o guiones tipográficos vs. rectos.
- Pies de página decorativos.

---

## 5. Cómo dejar evidencia de validación

Cada validación se registra en la tabla `validation_log`:

```
validation_log
- normId
- validador             // tus iniciales: "GB"
- fecha
- tipoRevision          // ALTA | MODIFICACION | DEROGACION | AUDITORIA_MENSUAL
- resultado             // OK | OBSERVACIONES | RECHAZADA
- comentario
```

**Sin entrada en este log, la norma no se publica.** El servidor MCP en modo release rehúsa servir normas no validadas.

Como subproducto: en el `server_info` del MCP se puede exponer el conteo de normas firmadas por validador y la fecha de la última firma. Esto es **transparencia que se vende sola** — los usuarios ven que hay un humano detrás del corpus.

---

## 6. Lo que NO debes hacer

- **No editar el texto normativo para "mejorarlo".** Aunque haya una errata en el original, se conserva.
- **No interpretar.** Si una norma es ambigua, esa ambigüedad se traslada al usuario. El MCP no es repositorio de doctrina ni de criterios interpretativos en esta fase.
- **No firmar bajo presión de calendario.** Si el deadline aprieta y la validación no está completa, lo que se publica es la última versión validada. Como el producto es gratuito, no hay nadie esperando un release urgente — preferir calidad a frecuencia.
- **No depender solo del diff automático.** El diff focaliza, pero el muestreo carácter-por-carácter es insustituible.

---

## 7. Coordinación con otros roles

| Con quién | Para qué |
|---|---|
| **Desarrollador** | Bugs estructurales, ajustes al esquema de validación, propuestas de nuevos campos. |
| **Scraper** | Casos de parsing recurrente que no son legales sino técnicos. |
| **Analista de compliance** | Comunicar cambios normativos relevantes; confirmar taxonomía sectorial; revisar que las cross-references lleguen al usuario final con valor. |

Reuniones recomendadas:
- **Semanal (30 min):** revisión del diff de la corrida con el desarrollador y analista de compliance.
- **Mensual (1h):** auditoría de calidad y revisión de incidentes.

---

## 8. Plan de transición a un validador externo

Mientras tú firmas, conviene dejar listo el camino para soltar el rol cuando convenga:

- **Documentar cada decisión de criterio** que tomes en un `validation_decisions.md` versionado en el repo. Esto se convierte en el manual del próximo validador.
- **Mantener el `validation_log` limpio y auditable** desde el día uno — es el track record que un validador entrante revisará para tomar el rol con criterio histórico.
- **Disparador para delegar:** cuando dediques más de 4 horas semanales al rol, o cuando el corpus llegue a Fase 2 (Circulares + Oficios). Antes, no se justifica el costo.
