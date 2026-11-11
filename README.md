# Bible Quiz Buzzer (React + Vite Edition)

This is the fully migrated React + Vite implementation of the original Bible Quiz Buzzer application (`complete_quiz_buzzer.html`).

The visual identity, colour palette, typography, button behaviors, Web Audio API sound synthesis, and real-time MQTT networking have been preserved with 100% fidelity to the original.

---

## Quick Start

### 1. Install Dependencies
```bash
npm.cmd install
```

### 2. Run Development Server
```bash
npm.cmd run dev
```
Open `http://localhost:5173` in your browser.

### 3. Build for Production
```bash
npm.cmd run build
```

### 4. Preview Production Build
```bash
npm.cmd run preview
```

---

## Architectural Structure & Strict CSS Separation

This codebase strictly enforces HTML, CSS, and JavaScript separation:
- Every component has its own `.jsx` file and corresponding external `.css` file side-by-side.
- **No inline styles (`style={{...}}`)** are used anywhere in the codebase.
- **No `<style>` tags** exist in any JSX or HTML files.
- Global styles, CSS reset, and custom animations reside exclusively in `src/index.css`.
- All obsolete nested directories and duplicate wrappers have been removed.

```text
src/
├── components/
│   ├── AdminLogin.jsx        # Quiz Master PIN modal with demo authorization warning
│   ├── AdminLogin.css
│   ├── ConnectionState.jsx   # Dedicated connecting spinner & error/retry handler
│   ├── ConnectionState.css
│   ├── ContestantScreen.jsx  # Contestant buzzer interface (LOCKED/OPEN/BUZZED)
│   ├── ContestantScreen.css
│   ├── EntryScreen.jsx       # Host entry, Contestant join form & Public Display launcher
│   ├── EntryScreen.css
│   ├── HostDashboard.jsx     # Quiz Master control room with timer, mode switcher, queue
│   ├── HostDashboard.css
│   ├── PublicDisplay.jsx     # Read-only spectator / projector leaderboard view
│   ├── PublicDisplay.css
│   ├── StatusBar.jsx         # Real-time online/offline network indicator
│   └── StatusBar.css
├── services/
│   ├── audio.js              # Procedural Web Audio API synthesizer
│   ├── mqtt.js               # Real-time WebSocket MQTT client with handshake callbacks
│   └── supabase.js           # Supabase Auth & database abstraction placeholder
├── App.jsx                   # Main SPA controller, router & connection state manager
├── App.css                   # Container layout & styling
├── index.css                 # Global styles, variables & animations
├── styles.css                # Shared style alias
└── main.jsx                  # React root mount point
```

---

## Connection State & Reliability

1. **Verified Connection Handshake**:
   - The application does not transition to Host, Contestant, or Display screens prematurely.
   - When connection is initiated, a dedicated `ConnectionState` component renders with an active loading indicator.
   - The target screen is mounted **only after** `client.on('connect')` successfully completes the WebSocket handshake with the MQTT broker.
   - If the connection fails or times out (10s limit), an error card is displayed with an explanation and a **Retry** option.
   - Users are never shown as connected (`isOnline`) before connection succeeds.

2. **Public Display Mode**:
   - Accessible directly from the Entry Screen by entering a room code and clicking **PUBLIC DISPLAY (SPECTATOR)**.
   - Accessible via URL parameter: `http://localhost:5173/?display=1234` or `?screen=1234`.
   - Accessible from the Quiz Master control room header via the **Projector View** button.
   - Remains strictly read-only: displays room code, live buzzer status badge, and real-time buzz queue without any Quiz Master controls.

3. **Security Notice (Demo PIN vs Supabase Auth)**:
   - The Quiz Master entry modal requires PIN `1234` (from the original application).
   - An explicit security notice inside the modal informs operators that this is an unauthenticated client check, not a server security boundary.
   - `src/services/supabase.js` provides the abstraction hooks (`authService`, `isSupabaseConfigured`) ready for production Supabase Auth integration without exposing secret keys.
