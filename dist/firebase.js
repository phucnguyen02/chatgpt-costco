var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
    try {
        app = initializeApp(firebaseConfig);
        firestoreDb = getFirestore();
    }
    catch (error) {
        console.log(error);
    }
};
const getAllStations = () => __awaiter(this, void 0, void 0, function* () {
    try {
        const collectionRef = collection(firestoreDb, "warehouses");
        const finalData = [];
        const q = query(collectionRef);
        const docSnap = yield getDocs(q);
        docSnap.forEach(doc => finalData.push(doc.data()));
        return finalData;
    }
    catch (error) {
        console.log(error);
    }
});
module.exports = { initializeFirebaseApp, getAllStations };
