import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc } from "firebase/firestore";
import fs from 'fs';

const configStr = fs.readFileSync('firebase-applet-config.json', 'utf-8');
const config = JSON.parse(configStr);

const app = initializeApp(config);

const db = getFirestore(app, config.firestoreDatabaseId || undefined);

async function seed() {
  console.log("Seeding data...");
  const dateStr = new Date().toISOString();
  
  const users = [
    { id: "u1", email: "contact@entreprise-alpha.dz", displayName: "Entreprise Alpha", plan: "free", createdAt: dateStr },
    { id: "u2", email: "support@boutique-beta.dz", displayName: "Boutique Beta", plan: "pro", createdAt: dateStr },
    { id: "u3", email: "hello@startup-dz.com", displayName: "Startup DZ", plan: "basic", createdAt: dateStr }
  ];

  const assistants = [
    { id: "a1", uid: "u1", userId: "u1", name: "Assistant Alpha", businessName: "Entreprise Alpha", plan: "free", createdAt: dateStr },
    { id: "a2", uid: "u2", userId: "u2", name: "Beta Bot", businessName: "Boutique Beta", plan: "pro", createdAt: dateStr },
    { id: "a3", uid: "u3", userId: "u3", name: "Support Startup DZ", businessName: "Startup DZ", plan: "basic", createdAt: dateStr }
  ];

  const invoices = [
    { id: "inv1", amountUsd: 0, amountDzd: 0, planName: "free", customerEmail: "contact@entreprise-alpha.dz", status: "paid", createdAt: dateStr, date: "2023-10-01" },
    { id: "inv2", amountUsd: 29.99, amountDzd: 6500, planName: "pro", customerEmail: "support@boutique-beta.dz", status: "paid", createdAt: dateStr, date: "2023-10-15" },
    { id: "inv3", amountUsd: 9.99, amountDzd: 2200, planName: "basic", customerEmail: "hello@startup-dz.com", status: "pending", createdAt: dateStr, date: "2023-10-20" }
  ];

  const usages = [
    { id: "a1", count: 120 },
    { id: "a2", count: 4500 },
    { id: "a3", count: 850 }
  ];

  for (const u of users) {
    await setDoc(doc(db, "users", u.id), u);
  }
  for (const a of assistants) {
    await setDoc(doc(db, "assistants", a.id), a);
  }
  for (const i of invoices) {
    await setDoc(doc(db, "invoices", i.id), i);
  }
  for (const u of usages) {
    await setDoc(doc(db, "usage", u.id), u);
  }
  
  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch(console.error);
