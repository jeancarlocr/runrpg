# RunRPG

Scratchpad de escritorio para practicar RPG Full Free contra un IBM i real, estilo RunJS.

## Estado actual: Día 1 — Setup

Scaffold de Electron + Vite + React + TypeScript. Todavía no hay conexión SSH
(eso es la Fase 1, días 2-5).

## Cómo correrlo

```bash
npm install
npm run dev
```

Esto debería abrir una ventana de Electron con un mensaje "Día 1 ✅".

## Antes de seguir a la Fase 1, confirma manualmente:

```bash
ssh TU_USUARIO@pub400.com
```

Debes poder entrar a un QSH funcional. Si no tienes cuenta todavía,
regístrate en https://pub400.com — es gratuito y pensado para pruebas
como esta.

## Roadmap completo

Ver `dspf-studio-roadmap.md` / el roadmap de RunRPG compartido en la
conversación para el detalle día por día de las siguientes fases:

1. **Fase 1** (días 2-5): sesión SSH persistente hacia pub400.
2. **Fase 2** (días 6-10): pipeline compilar → correr → capturar salida (DSPLY vía job log).
3. **Fase 3** (días 11-15): UI real (Monaco editor + panel de consola).
4. **Fase 4** (días 16-18): cierre, empaquetado y ejercicios de práctica.

## Nota de uso responsable

pub400.com es un recurso comunitario compartido. Evita compilar en cada
tecla (a diferencia de RunJS); usa un trigger explícito con límites de
tiempo agresivos al `CALL`.
