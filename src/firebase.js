const { initializeApp } = require("firebase/app");
const { getAnalytics } = require("firebase/analytics");
const { getFirestore, collection, getDocs, query } = require("firebase/firestore");
require('dotenv').config();

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

let app;
let firestoreDb;

// Initialize Firebase
const initializeFirebaseApp = () => {
    try{
        app = initializeApp(firebaseConfig);
        firestoreDb = getFirestore();
    }
    catch(error){
        console.log(error);
    }
}

const getAllStations = async () => {
    try{
        const collectionRef = collection(firestoreDb, "warehouses");
        const finalData = [];
        const q = query(collectionRef);

        const docSnap = await getDocs(q);
        docSnap.forEach(doc => finalData.push(doc.data()));
        return finalData;
    }
    catch(error){
        console.log(error);
    }
}

module.exports = {initializeFirebaseApp, getAllStations};