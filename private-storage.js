import { auth, storage } from './firebase-config.js';
import { ref, getBlob } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js';

const MAX_FILE_BYTES = 100 * 1024 * 1024;
function storageError(message, code = 'storage/unauthorized') {
  return Object.assign(new Error(message), { code });
}
function signedInUser() {
  const user = auth.currentUser;
  if (!user) throw storageError('Connectez-vous pour consulter ce fichier.');
  return user;
}
function checkSession(uid, signal) {
  if (signal?.aborted) throw new DOMException('Lecture annulée', 'AbortError');
  if (auth.currentUser?.uid !== uid) throw storageError('La session a changé. Reconnectez-vous.');
}
// Legacy download URLs are parsed only. Their token is never requested or sent.
export function privateStoragePath(source) {
  const user = signedInUser();
  if (source && typeof source === 'object' && !('fullPath' in source)) {
    source = source.storagePath || source.downloadURL || '';
  }
  let path, bucket;
  if (source && typeof source === 'object') {
    path = source.fullPath; bucket = source.bucket;
  } else if (typeof source === 'string' && source.startsWith('gs://')) {
    const url = new URL(source); bucket = url.hostname; path = decodeURIComponent(url.pathname.slice(1));
  } else if (typeof source === 'string' && /^https?:\/\//i.test(source)) {
    const url = new URL(source);
    if (url.protocol !== 'https:' || url.hostname !== 'firebasestorage.googleapis.com' || url.username || url.password) {
      throw storageError('Adresse de fichier non autorisée.');
    }
    const parts = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!parts) throw storageError('Adresse Firebase invalide.');
    bucket = decodeURIComponent(parts[1]); path = decodeURIComponent(parts[2]);
  } else path = source;
  const expectedBucket = ref(storage).bucket;
  if (bucket && bucket !== expectedBucket) throw storageError('Ce fichier appartient à un autre espace de stockage.');
  if (typeof path !== 'string') throw storageError('Fichier non disponible.', 'storage/object-not-found');
  const parts = path.split('/');
  if (!['users', 'pdf'].includes(parts[0]) || parts[1] !== user.uid || parts.length < 3 ||
      parts.some(part => !part || part === '.' || part === '..' || /[\u0000-\u001f]/.test(part))) {
    throw storageError('Vous ne pouvez pas consulter ce fichier.');
  }
  return path;
}
export async function getPrivateBlob(source, { signal, maxBytes = MAX_FILE_BYTES } = {}) {
  const uid = signedInUser().uid;
  checkSession(uid, signal);
  if (source && typeof source === 'object' && !('fullPath' in source) && !(source instanceof Blob)) {
    source = source.storagePath || source.downloadURL || source.data;
  }
  let blob;
  if (source instanceof Blob) blob = source;
  else if (typeof source === 'string' && /^(data:(application\/pdf|image\/[^;,]+)[;,]|blob:)/i.test(source)) {
    const response = await fetch(source, { signal });
    if (!response.ok) throw storageError('Fichier local indisponible.', 'storage/object-not-found');
    blob = await response.blob();
  } else {
    const path = privateStoragePath(source);
    blob = await getBlob(ref(storage, path), maxBytes);
  }
  checkSession(uid, signal);
  if (blob.size > maxBytes) throw storageError('Le fichier dépasse la taille de lecture autorisée.', 'storage/download-size-exceeded');
  return blob;
}
export async function getPrivateDataUrl(source) {
  if (!source) return '';
  const uid = signedInUser().uid;
  const blob = await getPrivateBlob(source);
  const result = await new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
  });
  checkSession(uid);
  return result;
}
export async function fetchPrivateFile(source, options = {}) {
  return new Response(await getPrivateBlob(source, options));
}
// Resolve profile images into memory for existing PDF renderers, without storing a shareable URL.
export async function loadPrivateProfile(profile = {}) {
  const uid = signedInUser().uid;
  const result = { ...profile };
  await Promise.all(['Logo', 'Signature', 'CarteGrise'].map(async name => {
    const field = name[0].toLowerCase() + name.slice(1);
    const source = profile[field+'Path'] || profile[field+'Url'] || profile[field+'Data'] ||
      localStorage.getItem(`profile${name}Data_${uid}`) || `users/${uid}/profile${name}Data_${uid}`;
    try { result[field+'Url'] = await getPrivateDataUrl(source); }
    catch (error) {
      if (error.code !== 'storage/object-not-found') throw error;
      result[field+'Url'] = '';
    }
  }));
  checkSession(uid);
  return result;
}
