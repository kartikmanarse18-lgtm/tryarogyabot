/* ============================================================
   STORAGE ADAPTER (localStorage by default; mirrors to Firestore
   in real time when FIREBASE_CONFIG below is filled in, so this
   same file works across multiple physical phones)
   ============================================================ */
const LOCAL_CACHE = {}; // in-memory mirror so every db()/dbSet() call stays synchronous
// Remembers the exact 'updatedAt' timestamp we just sent to Firestore for each key, so the
// onSnapshot listener below can tell "the server acknowledging MY write" apart from "another
// device actually changed this" — see initFirebaseSync().
const LAST_LOCAL_WRITE_AT = {};
// Tracks which storage-failure toasts we've already shown this session, so a device
// with a full quota or a dead connection doesn't spam the user with a toast on every
// single write — just once per key until the page reloads.
const STORAGE_WARNED = new Set();
