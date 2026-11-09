# Auditoría técnica del scaffold de Wormzilla

**Fecha:** 2026-11-08  
**Alcance:** inspección estática local de `/home/ubuntu/wormzilla`; no se modificaron scripts, escenas ni assets de runtime, no se inició ningún servidor y no se consultó el repositorio remoto.

## Resumen

El proyecto es un scaffold Godot 4.7 de la demo **Generic Game Template**, no una base específica de Wormzilla. La escena `scenes/main.tscn` sólo contiene un `Control` raíz con `scripts/main.gd`; casi toda la UI, el flujo de pantallas y la composición del mundo se construyen dinámicamente desde ese script. El gameplay existente es un laberinto de recolección/persecución por casillas: un `MazeRunner` recoge nodos y power-ups, varios `MazeSentinel` lo persiguen, y `MazeWorld` dibuja paredes, objetos y efectos.

El Blueprint de Wormzilla (juego 2D offline en español: gusano que crece al comer, puntuación, rivales, HUD y reinicio) puede reutilizar la infraestructura de arranque/presentación y varios contratos de servicios, pero no debe intentarse obtener renombrando superficialmente `runner`/`sentinel` o conservando el modelo de laberinto. La migración recomendada es mantener la capa de aplicación inicialmente y sustituir por módulos la simulación, entidades, datos de arena, localización y pruebas.

**Conclusión:** reutilizable como esqueleto de aplicación, entrada, pausa/reinicio, HUD y persistencia local; heredado y no apto como lógica central de Wormzilla: `MazeWorld`, `MazeRunner`, `MazeSentinel`, `StageCatalog` y todos los assets/identificadores de `assets/template` que representan la demo.

## Archivos relevantes y clasificación

### Entrada y composición

- `project.godot:11-38`: identidad todavía genérica (`Generic Game Template`), descripción de maze-chase, `scenes/main.tscn` como entrypoint y autoloads (`TuningBridge`, `ManusFontTheme`, `SaveStore`, `I18n`, `TuningStore`, `AudioDirector`). El modo de render es GL Compatibility y el viewport 1280×720; esto es compatible con un juego 2D offline.
- `scenes/main.tscn:1-13`: escena deliberadamente mínima. El único owner serializado es `Main`; el resto de nodos son hijos runtime creados por `scripts/main.gd`.
- `scripts/main.gd`: owner de facto del flujo de aplicación. Construye título, HUD, pausa, confirmación, resultado, leaderboard, tutorial, controles táctiles, transiciones y el `WorldRoot`; en `_start_stage()` instancia `MazeWorld`, conecta sus señales y arranca el ciclo. Es el archivo más grande y más acoplado al vocabulario/flujo genérico.

### Gameplay heredado de la demo

- `scripts/game/maze_world.gd`: owner de simulación actual. Mantiene grid, paredes, pellets, cinco tipos de power-up, spawns, vidas, colisiones, IA de persecución, efectos, dibujado de laberinto y progresión de dos stages. Es la principal pieza a reemplazar, no sólo a renombrar.
- `scripts/entities/runner.gd`: `MazeRunner`, movimiento continuo entre celdas, dirección solicitada y señal `entered_cell`; usa `assets/template/characters/runner.png`. Su contrato de entrada/cambio de celda podría inspirar un controlador de dirección, pero no modela segmentos, longitud ni crecimiento.
- `scripts/entities/sentinel.gd`: `MazeSentinel`, movimiento por grid con callback de IA, spawn/reset y tintes; usa `sentinel.png`. La idea de actor rival y reset es reutilizable conceptualmente, pero la implementación está atada a celdas y persecución de `MazeWorld`.
- `scripts/game/stage_catalog.gd`: datos de dos laberintos 21×17 y validador de símbolos (`# . o s t m P E`). El contrato de catálogo/validación puede conservarse sólo si se transforma a arenas Wormzilla; las filas y símbolos son contenido de demo.
- `scripts/effects/effects_director.gd`: presentación de bursts/clear asociada a celdas y tamaño de mundo. Reutilizable tras cambiar puntos de emisión y eliminar supuestos de “stage clear” de laberinto.
- `scripts/score/run_score_service.gd`: servicio desacoplado (`RefCounted`) para iniciar, premiar eventos y finalizar una partida idempotentemente. Es buen owner reutilizable; deben cambiarse los IDs/valores (`energy`, `sentinel_disable`, `stage_clear`) por eventos de comida, crecimiento y colisión según el diseño de Wormzilla.

### Presentación y servicios potencialmente reutilizables

- `scripts/ui/screen_factory.gd`, `scripts/ui/menu_list.gd`, `scripts/ui/arena_frame.gd`, `scripts/ui/tutorial_callout.gd`, `scripts/ui/title_art.gd`: kit visual, controles, paneles, foco, responsive layout y tutorial. `title_art.gd` dibuja explícitamente maze/runner/sentinels y por tanto es demo heredada; `ScreenFactory` es reutilizable sólo si se sustituyen las rutas de fuentes genéricas o se acepta conservar el estilo.
- `autoload/save_store.gd`: persistencia local `user://game_generic_save.json`, nombre de jugador, tutorial y top-10 local. Es compatible con el requisito offline, pero hay que renombrar/migrar la clave/archivo si Wormzilla no debe compartir datos del template; mantener sanitización, copias defensivas y escritura temporal.
- `autoload/i18n.gd`: localización offline basada en JSON y fallback. Actualmente sólo soporta `en` y `zh-CN` (`CATALOG_PATHS`, `set_locale`, `SaveStore`); no cumple “en español”. Debe añadirse `es.json`, actualizar selección/toggle y migrar todo el texto de demo.
- `autoload/tuning_store.gd`, `autoload/audio_director.gd`, `autoload/manus_font_theme.gd`: infraestructura transversal útil, aunque tuning contiene IDs de jugador/enemigos/maze y audio sólo tiene rutas semánticas. Revisar cada setting antes de exponerlo a Wormzilla.
- `scripts/manus/*`, shaders y herramientas de fuente: soporte de plataforma/presentación, no lógica de Wormzilla. Conservar sólo lo requerido por exportación y licencias.

### Contenido/documentación de demo que delata la herencia

- `README.md`, `.manus-game-template.json`, `template.json`, `template-provenance.json`, `assets.lock.json`, `asset-provenance.json`, `docs/minimalist-redesign.md`, `docs/game-multiplayer.md` y `assets/template/provenance/*` describen o registran Generic Game Template.
- `assets/template/characters/*`, `assets/template/powerups/*`, `assets/template/environment/*`, `assets/template/ui/*` son assets de la demo. No deben asumirse como arte de gusano/comida/rival final.
- `localization/en.json` y `localization/zh-CN.json` contienen textos como “Generic Game Template”, “runner”, “sentinels”, “nodes”, “power-ups”, “stage” y leaderboard; además no existe catálogo español.
- `test/test_suite.gd`, `test/test_suite.tscn`, `tools/verify_exported_pack.gd` y `tools/capture_native.gd` codifican expectativas de la demo: dos stages, dimensiones 21×17, símbolos de power-up, assets template y título genérico. Son referencias valiosas de infraestructura, pero fallarán o validarán incorrectamente Wormzilla hasta sustituir sus aserciones.

## Owners y contratos que sí se pueden reutilizar

1. **`Main`/flujo de aplicación:** conservar de inicio la máquina de estados title → game → pause/result y las señales de HUD, pero reemplazar nombres/semántica de stage, vidas y tutorial conforme al Blueprint.
2. **`ScreenFactory` y widgets UI:** conservar factories de botones, paneles, labels, layouts responsive y foco. Desacoplar rutas de fuentes/arte de `assets/template` si esos recursos no serán definitivos.
3. **`SaveStore`:** conservar persistencia local y sanitización para un juego offline. Definir explícitamente si Wormzilla necesita leaderboard; si no, retirar la pantalla sin romper el save básico.
4. **`I18n`:** conservar API `text/t`, fallback y señal `locale_changed`; añadir español como catálogo primario y probar que no quede texto inglés/chino visible en el flujo requerido.
5. **`RunScoreService`:** conservar como owner de score/finalización, renombrando eventos y manteniendo idempotencia y límites.
6. **`EffectsDirector`/`AudioDirector`:** conservar sólo como adaptadores de feedback. Las señales del nuevo mundo deben emitir eventos semánticos (`food_eaten`, `growth`, `rival_hit`, `player_hit`, `game_over`) en vez de depender de celdas/pellets.
7. **`StageCatalog` como patrón de datos:** reutilizar `get_stage`, `dimensions` y validación si las arenas se siguen definiendo por datos; cambiar el schema a límites de arena, puntos de comida, spawns y reglas de rivales.

## Plan de migración por módulos

### Fase 0 — Contrato y aislamiento

- Congelar el scaffold actual como referencia; no mezclar cambios de Wormzilla con los cambios preexistentes del árbol de trabajo.
- Definir el contrato mínimo: movimiento del gusano, lista ordenada de segmentos, comida consumible, crecimiento, score, rivales, límites/colisiones, estado de partida y reinicio.
- Elegir si la arena es libre (recomendado para Wormzilla) o grid. No conservar implícitamente el supuesto de laberinto sólo porque el scaffold es grid-based.

### Fase 1 — Datos y simulación

- Crear un owner de arena Wormzilla separado de `MazeWorld` (por ejemplo, `WormArena`/`WormGame`), con un estado de partida explícito: `playing`, `paused`, `game_over`/`victory`.
- Sustituir `StageCatalog.STAGES` por arenas/reglas de Wormzilla: tamaño, comida inicial/respawn, spawn del jugador, spawns de rivales y parámetros de dificultad. Mantener un validador que compruebe límites, spawns válidos y comida alcanzable.
- Implementar `Worm` como owner de cabeza + segmentos, historial de posiciones o solución equivalente, crecimiento al comer y reset limpio. No derivarlo de `MazeRunner`: su señal `entered_cell` no representa crecimiento ni cuerpo.
- Implementar rivales como entidades independientes; reutilizar sólo la idea de `advance/reset`, no `MazeSentinel` ni su callback de persecución por pasillos.
- Definir colisión con cuerpo propio, bordes y rivales. El orden de actualización debe ser determinista: entrada → movimiento → inserción/consumo → crecimiento → colisiones → score/HUD.

### Fase 2 — Score, HUD y ciclo de partida

- Adaptar `RunScoreService` a eventos de comida, bonus por crecimiento/racha y colisión/fin, conservando límites e idempotencia.
- En `main.gd`, sustituir `_start_stage()`/`_on_stage_completed()` por creación y conexión del nuevo owner. Mantener pausa y confirmación de reinicio, pero reiniciar un snapshot completo de partida (longitud, comida, rivales, score y estado), no sólo posiciones de celdas.
- Rediseñar el HUD para mostrar en español al menos puntuación, longitud/crecimiento, estado y acción de reinicio. Mantener responsive layout y accesibilidad del factory.
- Revisar si “vidas”, “stages”, tutorial y leaderboard son requisitos reales; no arrastrarlos por defecto desde la demo.

### Fase 3 — Localización y presentación

- Crear catálogo `localization/es.json`, registrar `es` en `autoload/i18n.gd` y hacer que el idioma inicial/fallback cumpla español.
- Reemplazar claves y textos de demo (`runner`, `sentinel`, `stage`, `powerups`, `nodes`) y renombrar la identidad en `project.godot`/pantallas.
- Reemplazar o aislar `title_art.gd`, texturas y rutas template. Evitar modificar assets de runtime durante esta auditoría; la sustitución de arte debe ser una tarea posterior explícita.

### Fase 4 — Pruebas y exportación

- Reescribir las pruebas de catálogo para el schema de arena y añadir pruebas deterministas de comer, crecer, respawn, colisiones, game-over y reinicio.
- Mantener pruebas de persistencia offline, localización española, score idempotente y ausencia de red.
- Actualizar `verify_exported_pack.gd` y cualquier hook `game-verification.json` para que no exijan dos laberintos 21×17 ni assets template.
- Ejecutar verificación nativa y exportada sólo después de que exista el runtime de Wormzilla; no usar la suite actual como evidencia de cumplimiento del Blueprint.

## Riesgos de reemplazar la lógica

- **Acoplamiento de nombres y tipos:** `main.gd` tipa `_world` como `MazeWorld`, pre-carga `MazeWorldType` y conecta señales específicas (`pellet_collected`, `stage_completed`). Cambiar la clase sin adaptar todos los puntos de conexión produce errores de parseo/runtime.
- **Modelo de movimiento incompatible:** `MazeRunner` avanza de celda en celda y gira según `StageCatalog.DIRECTIONS`; un worm libre necesita trayectoria/segmentos. Un simple renombrado permitiría movimiento visual pero no crecimiento ni colisiones correctas.
- **Colisiones incompletas para Wormzilla:** la demo sólo compara distancia jugador-sentinel; no contempla cuerpo propio, longitud, solapamiento de segmentos, comida ocupada ni límites como exige Wormzilla.
- **Estado y reinicio parcial:** `_restart_stage()` reinicia score/vidas al snapshot y recrea `MazeWorld`; el nuevo juego debe garantizar limpieza de comida, segmentos, rivales, timers, tweens y señales para evitar duplicados o referencias colgantes.
- **Reglas de finalización heredadas:** `remaining_collectibles()==0` completa un stage y `RunScoreService` premia `stage_clear`; esto no equivale necesariamente a la condición de victoria/derrota de una arena de gusano.
- **Persistencia contaminada:** `SaveStore.SAVE_PATH` es `user://game_generic_save.json`; reutilizarlo sin migración puede mezclar resultados del template con Wormzilla. También hay límites de stage basados en `StageCatalog.count()`.
- **Localización insuficiente:** el sistema no conoce `es`; añadir sólo textos españoles sin registrar el locale hace que `I18n` haga fallback. Las pruebas actuales exigen exactamente los catálogos EN/zh-CN y el título genérico.
- **Referencias de assets:** `runner.gd`, `sentinel.gd`, `maze_world.gd`, `main.gd`, `title_art.gd`, tests y verificadores cargan rutas bajo `assets/template`. Eliminar/renombrar recursos antes de retirar sus `preload` rompe carga de scripts o escenas.
- **Verificación engañosa:** una suite verde hoy sólo demuestra que sigue funcionando la demo; sus aserciones (`Generic Game Template`, dos stages, 21×17, power-ups) deben cambiarse antes de considerar cumplimiento.
- **Dependencias transversales:** `TuningStore` y `AudioDirector` se consultan desde gameplay/UI; quitar autoloads o IDs sin una capa de compatibilidad produce fallos al arrancar.
- **Scope creep de UI:** `main.gd` contiene gran cantidad de presentación, tutorial, leaderboard y responsive layout. Reescribirlo entero aumenta regresiones; conviene sustituir primero el owner de simulación detrás de un contrato de señales estable y migrar UI después.

## Comandos de verificación sugeridos

Ejecutar desde `/home/ubuntu/wormzilla`, sin red ni servidores:

```bash
# 1) Confirmar que sólo se creó/modificó la nota esperada (considerar los cambios previos ya existentes).
git status --short --untracked-files=all

git diff --check

# 2) Detectar residuos de identidad/lógica genérica tras cada fase.
grep -RInE 'Generic Game Template|MazeWorld|MazeRunner|MazeSentinel|pellet|sentinel|assets/template|stage_[12]' \
  --exclude-dir=.git --exclude-dir=.godot --exclude='*.import' .

# 3) Validar JSON y configuración sin ejecutar red.
python3 - <<'PY'
import json, pathlib
for p in [pathlib.Path('project.godot'), pathlib.Path('localization/en.json'),
          pathlib.Path('localization/es.json')]:
    if p.suffix == '.json' and p.exists():
        json.load(p.open())
        print('JSON OK', p)
PY

# 4) Verificador oficial del runtime (requiere GAME_RUNTIME local ya configurado).
bash tools/verify.sh

# 5) Verificación de paquete exportado, cuando el juego nuevo ya esté listo.
bash tools/verify.sh --export

# 6) Verificar sintaxis/importación de scripts y pruebas desde Godot instalado,
#    ajustando la ruta del binario según el entorno.
godot --headless --path . --editor --quit
# Si la suite sigue siendo el entrypoint temporal:
godot --headless --path . --scene res://test/test_suite.tscn
```

**Criterios de aceptación recomendados para la nueva suite:** juego arranca offline sin errores; idioma español se carga desde el primer frame; comer incrementa score y longitud; cada crecimiento actualiza HUD; rival y cuerpo/arena producen la derrota correcta; reinicio deja estado determinista y no duplica nodos/señales; el score final se guarda localmente sólo si esa función permanece; exportación no contiene referencias obligatorias a assets o nombres de la demo.

## Estado de la auditoría

No se modificaron archivos de código, escenas ni assets de runtime. La comprobación local observó cambios/archivos no relacionados ya presentes antes de esta nota: `asset-provenance.json` modificado y `agent-notes/github-reference.md`/`game-sharing.json` sin seguimiento. No se hicieron commits, no se iniciaron servidores y no se usó el remoto.
