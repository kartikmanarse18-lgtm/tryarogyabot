/* ============================================================
   SCHEMES REGISTRY (gap analysis D1) — one place for state-wise scheme data.
   RULES FOR EDITING THIS FILE
   - ok:true  = confirmed in a government/news source during the 3 Oct 2026 review. Only these show a cover amount.
   - ok:false = scheme name from background knowledge. The app shows the name and "check the official site", NEVER an amount.
     (coverUnverified is kept only so a maintainer can see what still needs checking; the UI never prints it.)
   - Add `url` only after opening it and confirming it is the official state health-agency page.
   - Bump SCHEMES_REGISTRY_REVIEWED whenever you re-check rows.
   ============================================================ */
const SCHEMES_REGISTRY_REVIEWED = '2026-10-03';
const SCHEMES_FALLBACK_URL = 'https://www.myscheme.gov.in/';

const SCHEME_STATES = [
  {code:'AP', name:'Andhra Pradesh', kind:'state', schemes:[{ok:true, name:'Dr NTR Vaidya Seva', cover:'Up to ₹25 lakh per year (₹2.5 lakh through the insurer, the rest through the state trust)', note:'Universal health policy approved Sep 2025, with PM-JAY.'}]},
  {code:'AR', name:'Arunachal Pradesh', kind:'state', schemes:[{ok:false, name:'Chief Minister Arogya Arunachal Yojana', coverUnverified:'~₹5 lakh'}]},
  {code:'AS', name:'Assam', kind:'state', schemes:[{ok:false, name:'Atal Amrit Abhiyan', coverUnverified:'~₹2 lakh'}]},
  {code:'BR', name:'Bihar', kind:'state', schemes:[{ok:false, name:'Ayushman Bharat Mukhyamantri Jan Arogya Yojana', coverUnverified:'₹5 lakh'}]},
  {code:'CG', name:'Chhattisgarh', kind:'state', schemes:[{ok:false, name:'Dr Khubchand Baghel Swasthya Sahayata Yojana (with PM-JAY)', coverUnverified:'~₹5 lakh'}]},
  {code:'GA', name:'Goa', kind:'state', schemes:[{ok:false, name:'Deen Dayal Swasthya Seva Yojana', coverUnverified:'~₹4 lakh'}]},
  {code:'GJ', name:'Gujarat', kind:'state', schemes:[{ok:false, name:'Mukhyamantri Amrutum (MA) / PMJAY-MA', coverUnverified:'₹5 lakh (one source says ₹10 lakh)'}]},
  {code:'HR', name:'Haryana', kind:'state', schemes:[{ok:false, name:'Chirayu Ayushman Bharat', coverUnverified:'₹5 lakh'}]},
  {code:'HP', name:'Himachal Pradesh', kind:'state', schemes:[{ok:true, name:'HIMCARE (Mukh Mantri Jan Arogya Yojana)', cover:'₹5 lakh', note:'Also covers families who are outside PM-JAY.'}]},
  {code:'JH', name:'Jharkhand', kind:'state', schemes:[{ok:false, name:'Abua Swasthya Suraksha / serious-illness fund', coverUnverified:'verify'}]},
  {code:'KA', name:'Karnataka', kind:'state', schemes:[{ok:false, name:'Arogya Karnataka (with PM-JAY)', coverUnverified:'~₹5 lakh'}]},
  {code:'KL', name:'Kerala', kind:'state', schemes:[{ok:true, name:'Karunya Arogya Suraksha Padhathi (KASP)', cover:'₹5 lakh'}]},
  {code:'MP', name:'Madhya Pradesh', kind:'state', schemes:[{ok:false, name:'Ayushman Bharat Niramayam / Sambal', coverUnverified:'₹5 lakh'}]},
  {code:'MH', name:'Maharashtra', kind:'state', url:'https://www.jeevandayee.gov.in/', schemes:[{ok:false, name:'Mahatma Jyotiba Phule Jan Arogya Yojana (MJPJAY), integrated with PM-JAY', coverUnverified:'sources disagree', note:'Sources disagree on the cover amount (an older ₹1.5 lakh figure and a newer ₹5 lakh figure). Confirm the current amount at jeevandayee.gov.in.'}]},
  {code:'MN', name:'Manipur', kind:'state', schemes:[{ok:false, name:"Chief Minister's Hakshelgi Tengbang", coverUnverified:'~₹5 lakh'}]},
  {code:'ML', name:'Meghalaya', kind:'state', schemes:[{ok:false, name:'Megha Health Insurance Scheme', coverUnverified:'verify'}]},
  {code:'MZ', name:'Mizoram', kind:'state', schemes:[{ok:false, name:'Mizoram State Health Care Scheme', coverUnverified:'verify'}]},
  {code:'NL', name:'Nagaland', kind:'state', schemes:[{ok:false, name:'Nagaland Health Insurance Scheme / CM scheme', coverUnverified:'~₹5 lakh'}]},
  {code:'OD', name:'Odisha', kind:'state', schemes:[{ok:true, name:'Gopabandhu Jan Arogya Yojana (now with PM-JAY)', cover:'₹5 lakh, plus an extra ₹5 lakh for women'}]},
  {code:'PB', name:'Punjab', kind:'state', schemes:[{ok:true, name:'Mukh Mantri Sehat Yojana', cover:'₹10 lakh per family', note:'Universal for all residents, from 22 Jan 2026.'}]},
  {code:'RJ', name:'Rajasthan', kind:'state', schemes:[{ok:true, name:'Mukhyamantri Ayushman Arogya (MAA) Yojana (merged Chiranjeevi)', cover:'₹25 lakh for inpatient care'}, {ok:true, name:'MADBY (accident cover)', cover:'₹10 lakh'}]},
  {code:'SK', name:'Sikkim', kind:'state', schemes:[{ok:false, name:'PM-JAY (a separate state scheme is not confirmed)', coverUnverified:'verify'}]},
  {code:'TN', name:'Tamil Nadu', kind:'state', schemes:[{ok:true, name:'CMCHIS (Kalaignar Kaappittu Thittam), converged with PM-JAY', cover:'₹5 lakh, over 1,090 procedures'}]},
  {code:'TS', name:'Telangana', kind:'state', schemes:[{ok:true, name:'Aarogyasri', cover:'Up to ₹10 lakh'}]},
  {code:'TR', name:'Tripura', kind:'state', schemes:[{ok:false, name:'Mukhya Mantri Jan Arogya Yojana', coverUnverified:'verify'}]},
  {code:'UP', name:'Uttar Pradesh', kind:'state', schemes:[{ok:true, name:'Ayushman Bharat–Mukhyamantri Jan Arogya Yojana', cover:'₹5 lakh'}]},
  {code:'UK', name:'Uttarakhand', kind:'state', schemes:[{ok:false, name:'Atal Ayushman Uttarakhand Yojana', coverUnverified:'~₹5 lakh'}]},
  {code:'WB', name:'West Bengal', kind:'state', schemes:[
    {ok:true, name:'PM-JAY (state signed the agreement on 8 Jun 2026)', cover:'₹5 lakh'},
    {ok:true, name:'Swasthya Sathi (continues in parallel for now)', note:'Ask your health centre which one applies to your family.'},
    {ok:true, name:'Mukhyamantri Swasthya Bima Yojana', note:'For Swasthya Sathi members who are not eligible for PM-JAY.'}]},
  {code:'DL', name:'Delhi', kind:'ut', schemes:[{ok:true, name:'PM-JAY with the Delhi top-up (joined Apr 2025)', cover:'₹5 lakh + ₹5 lakh top-up = ₹10 lakh'}]},
  {code:'JK', name:'Jammu & Kashmir', kind:'ut', schemes:[{ok:false, name:'Ayushman Bharat SEHAT', coverUnverified:'~₹5 lakh, universal'}]},
  {code:'LA', name:'Ladakh', kind:'ut', schemes:[{ok:false, name:'PM-JAY / SEHAT-linked', coverUnverified:'verify'}]},
  {code:'CH', name:'Chandigarh', kind:'ut', schemes:[{ok:false, name:'PM-JAY', coverUnverified:'verify'}]},
  {code:'PY', name:'Puducherry', kind:'ut', schemes:[{ok:false, name:'PM-JAY and a UT scheme', coverUnverified:'verify'}]},
  {code:'AN', name:'Andaman & Nicobar Islands', kind:'ut', schemes:[{ok:false, name:'PM-JAY', coverUnverified:'verify'}]},
  {code:'DD', name:'Dadra & Nagar Haveli and Daman & Diu', kind:'ut', schemes:[{ok:false, name:'PM-JAY', coverUnverified:'verify'}]},
  {code:'LD', name:'Lakshadweep', kind:'ut', schemes:[{ok:false, name:'PM-JAY', coverUnverified:'verify'}]}
];
function schemeStateByCode(code){ return SCHEME_STATES.find(s=>s.code===code) || null; }
