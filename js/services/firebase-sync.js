/* ============================================================
   FIREBASE REALTIME SYNC — OPTIONAL
   Fill FIREBASE_CONFIG in below and this file syncs shared state
   (incidents, notifications, hospital beds, responder positions...)
   across every phone that opens it, in real time.
   Leave apiKey as "PASTE_..." and the app runs standalone on
   localStorage only (single device, same as before).
   ============================================================ */
/* FIREBASE_CONFIG → moved to js/config/app-config.js */
// Everyone who opens the app with the same ?room= link shares one live incident feed.
// Change the fallback string (or add ?room=yourname to the URL) so your demo doesn't collide with someone else's.
const ROOM_ID = (new URLSearchParams(location.search).get('room')) || 'arogya-demo-room';
const SYNC_KEYS = ['hospitals','responders','police','doctors','pharmacies','incidents','notifications','audit','appointments','prescriptions','reminders','claims','insurance','documents','policeProfile','users','users_responder','users_police','users_hospital','users_pharmacy','users_doctor','phoneComplaints','revokedEmails','pharmacyInventory','pharmacyBills','deliveryBoys','aadhaarDirectory','accessGrants'];
// NOTE: 'profile' is intentionally NOT in this list. It's a per-device cache of whichever
// account/family-member is currently logged in on THIS device, refreshed from that
// account's own record in 'users' on login/signup/switch (see loadActiveMemberIntoProfile()
// and persistActiveProfileBackToMember()). It used to be synced as one shared room-wide
// doc, which meant two different real patients in the same room would overwrite each
// other's live profile — now each account's data lives isolated inside 'users'.
