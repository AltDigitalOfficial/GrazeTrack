import admin from "firebase-admin";
import fs from "fs";
import path from "path";

function resolveServiceAccountPath(): string {
  // Prefer your own env var, fall back to Google's standard one.
  const p =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!p) {
    throw new Error(
      "Firebase Admin not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH or GOOGLE_APPLICATION_CREDENTIALS to the service account JSON file path."
    );
  }

  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

export function getFirebaseAdmin() {
  if (admin.apps.length > 0) return admin;

  const filePath = resolveServiceAccountPath();
  if (!fs.existsSync(filePath)) {
    throw new Error(`Firebase service account JSON not found at: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const serviceAccount = JSON.parse(raw) as admin.ServiceAccount & {
    project_id?: string;
  };

  const projectId = serviceAccount.project_id;
  if (!projectId) {
    throw new Error(
      "Service account JSON is missing project_id. Download a proper Firebase Admin SDK service account key from Firebase Console."
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId,
  });

  return admin;
}
