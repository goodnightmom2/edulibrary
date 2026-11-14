import firebaseConfig from '../../firebase-applet-config.json';

export async function getAdminAuth() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');

  if (!getApps().length) {
    initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }

  return getAuth();
}
