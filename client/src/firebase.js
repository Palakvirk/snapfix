import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAbXFH2kxjemrU9_BekZ69d8anqupfhqnY",
  authDomain: "snapfix-b4dc7.firebaseapp.com",
  databaseURL: "https://snapfix-b4dc7-default-rtdb.firebaseio.com",
  projectId: "snapfix-b4dc7",
  storageBucket: "snapfix-b4dc7.firebasestorage.app",
  messagingSenderId: "745760869891",
  appId: "1:745760869891:web:1f473b686a302ce3860836"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export default app;