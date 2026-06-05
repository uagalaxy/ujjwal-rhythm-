// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDoVWb4rxNm5Urf85vPiuRzXm5S2f1U_oA",
  authDomain: "ujjwal-rhythm.firebaseapp.com",
  databaseURL: "https://ujjwal-rhythm-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ujjwal-rhythm",
  storageBucket: "ujjwal-rhythm.firebasestorage.app",
  messagingSenderId: "594042991928",
  appId: "1:594042991928:web:0c2f5a95d38b18b3f5fdcd",
  measurementId: "G-XRGXZZQ5TE"
};importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');


firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

