const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

try {
  const app = initializeApp();
  const db = getFirestore(app);
  db.collection("users").limit(1).get().then(snap => {
    console.log("Success! Found", snap.size, "users");
  }).catch(e => {
    console.error("Query Error:", e.message);
  });
} catch (e) {
  console.error("Init Error:", e);
}
