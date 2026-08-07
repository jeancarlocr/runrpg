export default function App() {
  return (
    <div className="app-shell">
      <header className="titlebar">
        <span>RunRPG</span>
        <span className="conn-pill">
          <span className="dot" /> sin conectar (Fase 1 pendiente)
        </span>
      </header>

      <main className="placeholder">
        <h1>Día 1 ✅</h1>
        <p>
          Electron + React + TypeScript arrancando. El siguiente paso (Fase 1) es
          conectar esto a una sesión SSH persistente contra pub400.
        </p>
      </main>
    </div>
  )
}
