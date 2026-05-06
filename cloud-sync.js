import { db } from "./firebase-config.js";

import {
  doc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

export async function saveModuleData(uid, moduleName, data) {
  if (!uid) return;

  await setDoc(
    doc(db, "users", uid, "modules", moduleName),
    {
      ...data,
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  );
}

export async function loadModuleData(uid, moduleName) {
  if (!uid) return null;

  const snap = await getDoc(
    doc(db, "users", uid, "modules", moduleName)
  );

  if (!snap.exists()) return null;

  return snap.data();
}