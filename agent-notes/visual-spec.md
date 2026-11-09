# Wormzilla — especificación visual

**Estado:** dirección visual aprobada para implementación posterior; este documento no genera ni descarga assets.

## 1. Intención y límites

Wormzilla es un arcade 2D offline en español. La identidad debe sentirse propia: **gusanos de laboratorio sobre una arena de señales y comida energética**, con formas geométricas suaves, contornos gruesos y una paleta nocturna de alta legibilidad. No se deben copiar arte, nombres, siluetas, tipografías, interfaz ni convenciones distintivas de Wormate u otros juegos de gusanos.

La especificación cubre exactamente cinco roles: **gusano del jugador, gusanos rivales, comida recogible, arena jugable y HUD de puntuación/estado**. El aspecto visual nunca decide colisiones, recompensas, velocidad o autoridad de la simulación; sólo representa el estado que entrega la lógica.

Se parte de una ventana objetivo de 1280×720 con escalado `canvas_items` y proporción expandible. La composición debe seguir siendo legible en 720×960: el mundo conserva su área central y el HUD puede apilarse en dos filas. No se requiere descargar ni conservar imágenes externas. La implementación debe poder arrancar con primitivas dibujadas por Godot y texto vivo.

## 2. Sistema visual

### Paleta base

| Token | Hex | Uso | Regla |
|---|---:|---|---|
| `fondo_profundo` | `#08131A` | fondo fuera de la arena | Nunca usar para texto pequeño sobre texto; sirve de separación. |
| `arena_base` | `#102630` | superficie jugable | Mate, sin textura ruidosa. |
| `arena_celda` | `#173743` | cuadrícula/puntos de orientación | Opacidad aproximada 35–50%; nunca compite con actores. |
| `borde_arena` | `#2A5963` | límite y obstáculos | Línea de 3–4 px a 1280×720. |
| `tinta` | `#F4F7F2` | texto principal y contornos destacados | Contraste mínimo objetivo 4.5:1 en paneles. |
| `texto_secundario` | `#A9C0C1` | ayudas, etiquetas y estado inactivo | No usar para puntuación principal. |
| `panel` | `#102D36` | placas translúcidas del HUD | Opacidad base 94%, respetando `ui.hud.opacity`. |
| `jugador` | `#FFCC4D` | cuerpo del jugador | Amarillo cálido reservado al jugador. |
| `jugador_luz` | `#FFF1A6` | brillo, cabeza y lectura de dirección | Sólo detalles, nunca relleno dominante de rivales. |
| `rival` | `#D75B7D` | cuerpo de rivales | Rosa rojizo inequívoco, con contorno oscuro. |
| `rival_alerta` | `#FF705C` | rival atacando/dañado | Destello breve; no sustituye la silueta. |
| `comida` | `#61E6B0` | comida normal | Verde menta, forma de semilla/rombo. |
| `comida_borde` | `#D7FFF0` | halo de recogible | Halo pequeño y pulsación lenta. |
| `peligro` | `#FF6B4A` | fin de partida, choque, aviso | Reservado a estados de peligro; no pintar todo el mundo. |

Usar contornos `#061015` de 2–4 px según escala para separar objetos. Evitar gradientes como información principal: si se usa un degradado, el valor de la silueta debe seguir siendo reconocible en escala de grises.

### Forma, ritmo y capas

- Estilo **top-down, vectorial/procedural, redondeado y compacto**; sin caras, ojos, logos, ropa, texto dentro de sprites ni decoración que parezca de una franquicia existente.
- Orden de capas: fondo profundo → arena base → marcas discretas → límites/obstáculos → comida → rivales → jugador → efectos de estado → HUD.
- El HUD queda en una capa fija de cámara y no bloquea input ni oculta el área útil. Reservar márgenes de 24 px (horizontal) y 18 px (vertical) en 1280×720.
- Mantener una escala mínima visible de 12 px de diámetro para la comida y 24 px de grosor total para un segmento de gusano. Si la cámara reduce más estos valores, subir escala visual sin cambiar colisiones.

## 3. Los cinco roles

### Gusano del jugador

Construirlo como una cadena de cápsulas/círculos solapados, con variación leve de tamaño hacia la cabeza. Relleno amarillo cálido `#FFCC4D`, contorno oscuro y una franja interna clara `#FFF1A6` desplazada hacia el lado de avance. La cabeza es un disco redondeado ligeramente mayor, con una muesca o flecha abstracta de dirección; no usar ojos para comunicar orientación.

- Identidad persistente: amarillo + doble contorno + pequeño aro de enfoque bajo la cabeza.
- Movimiento: el aro puede tener un pulso suave, pero no hacer rebote exagerado.
- Crecimiento: añadir segmentos visuales al recibir una recogida; el cuerpo no debe cambiar de color como única señal.
- Invulnerable/respawn: parpadeo de opacidad controlado, con aro cian discontinuo. En `reduced_motion`, mostrar aro estático y cambio de valor, no parpadeo.
- Daño/fin: contorno `peligro` y breve compresión de la cabeza; no aplicar sacudida de pantalla obligatoria.

### Gusanos rivales

Usar la misma gramática de segmentos para que sean parte del mismo mundo, pero diferenciarlos de forma redundante: relleno rosa rojizo `#D75B7D`, contorno oscuro más grueso, cabeza en forma de gota/triángulo redondeado orientado al movimiento y una marca diagonal corta en cada segundo segmento. No usar amarillo, aro de enfoque ni franja de dirección del jugador.

- Rival normal: rosa rojizo uniforme con sombra inferior corta.
- Rival agresivo: borde `#FF705C` y dos marcas angulares, sin convertirlo en un destello continuo.
- Rival ralentizado: reducción de saturación y anillo azul pálido discontinuo; la silueta sigue rosa.
- Rival vulnerable/neutralizado: relleno desaturado `#89999A`, patrón de puntos; nunca hacerlo parecer comida.
- Múltiples rivales: alternar sólo matiz dentro de la familia rosa/roja, nunca usar el amarillo del jugador.

### Comida recogible

Representar la comida como una **semilla/rombo redondeado** de 14–20 px, con cuatro vértices suaves y un punto interno. Relleno menta `#61E6B0`, contorno claro y halo de 2–3 px. La forma romboidal la separa de los segmentos circulares del jugador/rivales.

- Idle: escala fija; opcionalmente un pulso de 2% cada 1.2 s.
- A punto de recogerse: halo se cierra hacia el centro durante menos de 180 ms.
- Recogida: mostrar una cruz/estrella procedural de cuatro puntas durante 120–180 ms y un incremento de puntuación en el HUD; el efecto no debe permanecer como objeto jugable.
- No usar comida roja o amarilla, ni monedas, frutas o iconografía reconocible de otro juego.

### Arena jugable

Arena rectangular o de bordes suavemente recortados, base `#102630`, con una retícula de puntos/cuadrículas en `#173743` cada 48–64 px y opacidad baja. El límite se dibuja con línea doble: borde exterior `#2A5963` y línea interior de 1 px `#61E6B0` a baja opacidad. Los obstáculos, si la simulación los tiene, usan cápsulas o bloques redondeados en `#1D4650`, siempre con contraste menor que los actores.

La arena debe ser tranquila y no distractora: nada de partículas permanentes densas, texturas fotográficas, fondos escénicos ni parallax que oculten colisiones. El área peligrosa o fuera de límites se marca con una banda interior discontinua `#FF6B4A` de baja opacidad, no con un muro rojo sólido. Reservar el tercio central para movimiento y mantener el HUD fuera del área de colisión.

### HUD de puntuación y estado

HUD fijo, compacto y en español, con placas panel `#102D36` y contorno `#2A5963`. Prioridad de lectura:

1. **Puntuación** grande, arriba a la izquierda: `PUNTUACIÓN` y número con `tinta`.
2. **Longitud** o crecimiento, debajo o junto a la puntuación: `LONGITUD 12`.
3. **Vidas** en iconos de cápsula amarilla con texto redundante: `VIDAS 3`.
4. **Estado de partida** arriba a la derecha: `EN JUEGO`, `PAUSA`, `¡HAS PERDIDO!` o `VICTORIA`.
5. **Acción contextual** sólo cuando aplique: `REANUDAR`, `REINTENTAR`, `VOLVER AL INICIO`.
6. Mensaje breve inferior/central durante eventos: `+10 COMIDA`, `RIVAL RALENTIZADO`, `CUIDADO: BORDE`.

Reglas de copy:

- Usar español claro, mayúsculas sólo en etiquetas cortas y números; evitar abreviaturas ambiguas.
- No comunicar un estado sólo por color: cada estado tiene texto, forma o cambio de valor.
- Fuente de interfaz: Figtree disponible para lectura; Sora disponible sólo para título/contador grande. Mantener cuerpo mínimo aproximado de 18 px a 1280×720 y 22 px para puntuación principal.
- Texto principal debe alcanzar contraste mínimo objetivo 4.5:1 contra su placa; usar sombra/contorno de 2 px si el fondo detrás es variable.
- Placas tienen esquinas 10–14 px, padding 12–16 px y separación entre grupos de al menos 12 px.
- En vertical 720×960, apilar `PUNTUACIÓN`, `LONGITUD` y `VIDAS` en una banda superior de dos filas; nunca superponerlos con la cabeza del jugador.

## 4. Reglas anti-confusión

1. El jugador siempre es el único actor amarillo cálido y el único con aro de enfoque.
2. Los rivales siempre usan familia rosa/roja y marca diagonal/forma de cabeza distinta; ningún rival recibe amarillo por variedad cosmética.
3. La comida siempre es pequeña, menta y romboidal; nunca circular del mismo tamaño que un segmento.
4. La arena usa valores oscuros y baja saturación; no usar `jugador`, `rival` o `comida` como color de fondo.
5. Los estados se comunican redundante: color + patrón/forma + texto o cambio de tamaño/valor.
6. Los contornos deben sobrevivir a reducción de escala y a daltonismo aproximado; validar también en desaturación y con un filtro de contraste alto.
7. No usar efectos de brillo que borren el borde del jugador o conviertan un rival en recogible.
8. En capturas con muchos actores, el jugador debe encontrarse en menos de un segundo por silueta amarilla, doble contorno y aro, incluso si está parcialmente tapado.

## 5. Implementación original/procedural

La primera implementación no necesita ningún PNG, catálogo, descarga o repositorio hidratado. Crear una pequeña capa de dibujo visual separada de la simulación:

- `ArenaVisual`: `draw_rect`, `draw_line`, polígonos redondeados y puntos de retícula; recibe límites y obstáculos ya calculados.
- `WormVisual`: dibuja segmentos con círculos/cápsulas, cabeza y contorno; recibe posición, dirección, longitud y estado. Una semilla fija para variaciones de fase evita parpadeos aleatorios.
- `PickupVisual`: dibuja rombo/semilla, halo y evento temporal; recibe posición, tipo y estado de recogida.
- `HudVisual`: `Control` en cámara, etiquetas vivas y placas vectoriales; recibe puntuación, longitud, vidas y estado de partida desde el controlador existente.

Si posteriormente se necesitan recursos raster, producirlos internamente a partir de esta misma geometría (SVG o raster pequeño con alpha limpio), uno por rol y sin copiar referencias externas. Los textos y números siempre permanecen vivos en Godot. Mantener los datos de paleta como constantes/tokens, no dispersos en scripts. Todo efecto cosmético debe respetar `ui.hud.opacity`, `ui.reduced_motion`, la escala visual del jugador/rivales y el orden de capas; no cambiar IDs de tuning ni contratos de guardado.

La lógica de colisiones, puntuación, vidas, pausa y reinicio permanece en sus propietarios actuales. Los overlays deben ser transparentes al input salvo sus botones explícitos. La pantalla de pausa puede reutilizar la misma placa y tokens, pero no debe introducir un sexto rol de gameplay.

## 6. Assets mínimos

**Mínimo requerido: cero assets externos.** Con primitivas y fuentes ya presentes se cubren los cinco roles. Si la implementación decide materializar recursos para rendimiento o consistencia, el conjunto mínimo es:

1. `gusano_jugador.svg/png`: una hoja cuadrada con cuerpo, cabeza y estado invulnerable; alpha limpio.
2. `gusano_rival.svg/png`: una hoja cuadrada con cuerpo, cabeza y estados normal/agresivo/ralentizado.
3. `comida.svg/png`: semilla/rombo y su halo, con alpha limpio.
4. `arena.svg/png` opcional: sólo una textura procedural de baja frecuencia; nunca imprescindible para jugar.
5. `hud` no requiere imagen: placas, iconos de vidas, pausa y estados se dibujan con formas y texto vivos.

No generar, descargar, integrar ni publicar estos assets durante esta fase. Si se materializan después, registrar procedencia, licencia y hash; comprobar alpha real sobre fondos claro y oscuro. No depender de `assets/template/*` para que la dirección funcione.

## 7. Criterios de legibilidad y aceptación

- En 1280×720, jugador, rival y comida se distinguen en una captura estática sin inspección ampliada.
- En 720×960, HUD, arena y jugador no se superponen; el texto `PUNTUACIÓN`, el valor y `REINTENTAR` se leen sin recorte.
- Una prueba en escala de grises conserva tres siluetas diferentes: cápsula amarilla del jugador, gusano rosa con cabeza marcada del rival y rombo pequeño de comida.
- Contraste objetivo mínimo 4.5:1 para texto normal y 3:1 para texto grande; los actores mantienen contorno oscuro visible sobre cualquier zona de arena.
- La puntuación cambia de forma estable y no depende de animación; la comida recogida desaparece y comunica `+N COMIDA` sin dejar un duplicado visual.
- `PAUSA`, `¡HAS PERDIDO!` y `VICTORIA` se identifican por texto y composición, no sólo por rojo o transparencia.
- Con movimiento reducido, se eliminan pulsos/parpadeos y se conservan halos estáticos, cambios de valor y texto de estado.
- Con opacidad HUD reducida al mínimo configurado, la información sigue siendo legible y el panel no invade la arena.
- No aparecen nombres, formas, iconos, fondos o composiciones que sugieran una copia de Wormate; la combinación de laboratorio nocturno, semilla romboidal, jugador amarillo y rivales rosa es la identidad de Wormzilla.
