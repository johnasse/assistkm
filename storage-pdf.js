import { storage, auth } from "./firebase-config.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js";

export async function uploadPdfToStorage(blob, fileName) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Utilisateur non connecté");
  }

  const storagePath = `users/${user.uid}/pdfs/${fileName}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, blob, {
    contentType: "application/pdf"
  });

  const downloadURL = await getDownloadURL(storageRef);

  return {
    storagePath,
    downloadURL
  };
}

export async function deletePdfFromStorage(storagePath) {
  if (!storagePath) return;
  const storageRef = ref(storage, storagePath);
  await deleteObject(storageRef);
}