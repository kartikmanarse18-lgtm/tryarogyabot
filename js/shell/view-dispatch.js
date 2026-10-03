/* ============================================================
   VIEW RENDER DISPATCH
   ============================================================ */
function renderCurrentView(navId){
  const isSectionSwitch = navId !== currentView;
  const uiFirstRender = (currentView === null);   // first render after a page load (see js/core/view-state.js)
  currentView = navId;
  try{ localStorage.setItem('abot2_lastView', navId); }catch(e){}
  setActiveNav(navId);
  cleanupMap();
  // Jump the scroll box back to the top when landing on a different section
  // (but not on a same-section background re-render — see scheduleRemoteRefresh,
  // which saves/restores scrollTop itself for that case).
  if(isSectionSwitch){
    const scrollBox = document.getElementById('app-content-area');
    if(scrollBox) scrollBox.scrollTop = 0;
  }
  const c = document.getElementById('active-view-container');
  const renderers = {
    'p-dash': viewPatientDash, 'p-sos': viewPatientSOS, 'p-chat': viewPatientChat, 'p-history': viewPatientSymptomHistory, 'p-records': viewPatientRecords,
    'p-tele': viewPatientTele, 'p-rx': viewPatientRx, 'p-pharmacy': viewPatientPharmacy, 'p-fitness': viewPatientFitness, 'p-nutrition': viewPatientNutrition, 'p-vitals': viewPatientVitals, 'p-meds': viewPatientMeds, 'p-lifestyle': viewPatientLifestyle, 'p-women': viewPatientWomen, 'p-insurance': viewPatientInsurance, 'p-documents': viewPatientDocuments, 'p-abha': viewPatientAbha,
    'r-dash': viewResponderDash, 'r-queue': viewResponderQueue, 'r-active': viewResponderActive,
    'po-dash': viewPoliceDash, 'po-feed': viewPoliceFeed,
    'h-dash': viewHospitalDash, 'h-incoming': viewHospitalIncoming, 'h-roster': viewHospitalRoster, 'h-tele': viewHospitalTele, 'h-verify': viewHospitalVerify, 'h-audit': viewHospitalAudit,
    'ph-dash': viewPharmacyDash, 'ph-orders': viewPharmacyOrders, 'ph-inventory': viewPharmacyInventory, 'ph-billing': viewPharmacyBilling, 'ph-delivery-roster': viewPharmacyDeliveryRoster,
    'd-dash': viewDoctorDash, 'd-appts': viewDoctorAppts, 'd-slots': viewDoctorSlots, 'd-profile': viewDoctorProfile,
    'dl-dash': viewDeliveryDash, 'dl-orders': viewDeliveryOrders, 'dl-profile': viewDeliveryProfile,
    'about': viewAbout,
  };
  c.innerHTML = renderers[navId] ? renderers[navId]() : '<div class="empty-state">View not found</div>';
  postRenderHooks(navId);
  if(typeof uiStateAfterRender==='function') uiStateAfterRender(navId, uiFirstRender);   // re-apply a reload draft / drop a stale one
  refreshBell();
}
function postRenderHooks(navId){
  if(navId==='p-sos'){ initSosMapIfNeeded(); startLiveIncidentTracking(); rehydrateInProgressSOS(); }
  if(navId==='r-active'){ initResponderMap(); startLiveIncidentTracking(); }
  if(navId==='r-queue'){
    lastRQueueSnapshot = pendingIncidentsForMe().map(i=>i.id).sort().join(',');
    startLiveIncidentTracking();
  }
  if(navId==='po-feed'){ initPoliceMap(); startLiveIncidentTracking(); }
  if(navId==='p-women'){ renderCycleCalendar(); renderPregnancyTools(); }
  if(navId==='p-fitness'){ renderBMI(); renderIBW(); renderBMR(); renderBodyFat(); renderWHR(); }
  if(navId==='p-nutrition'){ renderNutritionTable(); renderMacroCalc(); renderWaterCalc(); renderMealBuilder(); }
  if(navId==='p-vitals') renderVitalsAll();
  if(navId==='p-meds'){ renderChildDose(); }
  if(navId==='p-lifestyle'){ renderSleepTool(); renderStepCalc(); renderPackYears(); }
  if(navId==='p-tele'){
    const inCall = db('activeCall');
    if(inCall && inCall.ownerId===currentPatientId() && document.getElementById('rtc-remote-video')){
      rtcJoinCall(inCall.apptId, 'rtc-local-video', 'rtc-remote-video');
    }
  }
  if(navId==='d-appts'){
    const inCall = db('activeCall');
    const dRec = currentDoctorRecord();
    if(inCall && dRec && inCall.doctor===dRec.name && document.getElementById('rtc-remote-video')){
      rtcJoinCall(inCall.apptId, 'rtc-local-video', 'rtc-remote-video');
    }
  }
  if(navId==='p-rx'){
    const activeDelivery = db('prescriptions').filter(r=>r.ownerId===currentPatientId()).find(r=>r.deliveryStatus==='out_for_delivery');
    if(activeDelivery && document.getElementById('leaflet-map-box')){
      initDeliveryTrackingMap(activeDelivery); // paint immediately from cache
      startDeliveryBoyLiveTracking(activeDelivery.deliveryBoyId); // then keep it live — see the function for why this is scoped to one doc
    } else {
      stopDeliveryBoyLiveTracking(); // no active delivery on screen (e.g. just got marked delivered) — nothing left to track
    }
  } else {
    // Left p-rx entirely — don't keep a listener open for a screen that isn't showing.
    stopDeliveryBoyLiveTracking();
  }
}
function viewHeader(eyebrow,title,sub){
  return `<div class="view-header"><div class="view-eyebrow">${eyebrow}</div><h1 class="view-title">${title}</h1><p class="view-subtitle">${sub||''}</p></div>`;
}
// Reusable "what is this / how it's used" info blurb shown under every calculator —
// written for people who may not know the shortform (BMI, BMR, HbA1c, etc.) or why the number matters.
function calcInfo(title, html){
  return `<div class="calc-info-box"><div class="ci-title"><i class="fa-solid fa-circle-info"></i>${title}</div>${html}</div>`;
}
