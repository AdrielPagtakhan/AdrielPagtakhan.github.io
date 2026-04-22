
// UNICHECK  Firebase Configuration

import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage }     from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

const firebaseConfig = {
  apiKey:            "AIzaSyB0y465dDA5dK1-PAdrHQsa3_nFZ7Z8kX8",
  authDomain:        "unicheck-6a2d7.firebaseapp.com",
  projectId:         "unicheck-6a2d7",
  storageBucket:     "unicheck-6a2d7.firebasestorage.app",
  messagingSenderId: "419341148656",
  appId:             "1:419341148656:web:b99673fcee73509ce47d35",
  measurementId:     "G-Q4VG9GP97Z"
};

const app = initializeApp(firebaseConfig);

export const auth      = getAuth(app);
export const db        = getFirestore(app);
export const storage   = getStorage(app);
export const analytics = getAnalytics(app);
export { logEvent };

// will use Vite on final build dont worry hehe :>