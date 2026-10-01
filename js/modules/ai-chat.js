/* ============================================================
   PATIENT — AI CHAT (symptom checker)
   ============================================================ */
// ----------------------------------------------------------------------
// Structured symptom knowledge base. Each entry drives a full "mini report"
// card: basic reason -> mild/moderate/severe causes -> when to see a doctor
// -> home remedies -> specialist to consult -> red-flag warning signs.
// This is a local rule-based knowledge base, NOT a live AI model — see the
// note at the end of this reply for what would be needed to go further.
// ----------------------------------------------------------------------
const SYMPTOM_KB = [
  {key:'fever', match:/\bfever|temperature|chills\b/i, icon:'fa-solid fa-thermometer-full', title:'Fever', severity:'moderate',
    basicReason:"Fever is your immune system deliberately raising body temperature to fight off an infection — it's a response, not a disease by itself.",
    causes:[{level:'mild',text:'Common cold or mild viral infection'},{level:'moderate',text:'Flu, tonsillitis, ear or urinary tract infection'},{level:'severe',text:'Dengue, malaria, typhoid, pneumonia, or sepsis'}],
    whenToSeeDoctor:'See a doctor if temperature exceeds 39.5°C (103°F), lasts more than 3 days, or comes with rash, stiff neck, severe headache, or breathing trouble.',
    homeRemedies:['Rest and drink plenty of water or ORS','Tepid sponging to bring temperature down gradually','A general OTC fever reducer as directed on the label','Light, breathable clothing and a cool room'],
    specialist:'General Physician; Infectious Disease specialist if it persists beyond a week',
    possibleDiseases:["Common cold","Influenza","Dengue fever","Typhoid fever","Malaria","COVID-19"],
    differentialDiagnosis:["Dengue — high fever with rash, severe body/joint pain, low platelet count","Malaria — cyclical fever with chills, common in malaria-endemic areas","Typhoid — prolonged low-grade fever with abdominal pain, often after contaminated food/water","Viral fever/flu — fever with cold-like symptoms, usually resolves in 3-5 days"],
    confirmatoryDiagnosis:"Complete blood count (CBC), dengue NS1/IgM antigen test, malaria rapid test/smear, and Widal test or blood culture for typhoid, as guided by a doctor based on exposure and symptom pattern.",
    redFlags:['Temperature above 40°C (104°F)','Seizures or convulsions','Difficulty breathing','Persistent vomiting','Confusion or unresponsiveness']},
  {key:'cough_cold', match:/\bcough|cold|runny nose|sneezing|congestion|flu\b/i, icon:'fa-solid fa-head-side-cough', title:'Cough, Cold & Flu', severity:'mild',
    basicReason:'Coughing and a runny/blocked nose are usually the body clearing irritants or mucus produced while fighting a viral upper-respiratory infection.',
    causes:[{level:'mild',text:'Common cold or seasonal allergies'},{level:'moderate',text:'Influenza (flu), sinusitis, bronchitis'},{level:'severe',text:'Pneumonia, whooping cough, or a worsening chronic condition (asthma/COPD flare)'}],
    whenToSeeDoctor:'See a doctor if a cough lasts beyond 2-3 weeks, produces blood or thick discolored mucus, or is paired with fever, chest pain, or breathlessness.',
    homeRemedies:['Warm fluids — soup, herbal tea, warm water with honey','Steam inhalation to loosen congestion','Rest and adequate sleep','Salt-water gargles for throat irritation'],
    specialist:'General Physician; Pulmonologist (lung specialist) if symptoms persist or recur',
    possibleDiseases:["Common cold","Influenza","Sinusitis","Bronchitis","Pneumonia"],differentialDiagnosis:["Common cold \u2014 mild symptoms, no fever, resolves within a week","Influenza \u2014 sudden onset, high fever, body aches","Sinusitis \u2014 facial pain/pressure with thick nasal discharge","Bronchitis or pneumonia \u2014 persistent cough with fever, chest pain, or breathlessness"],confirmatoryDiagnosis:"Usually a clinical diagnosis; chest X-ray and sputum culture if pneumonia or bronchitis is suspected, or a rapid flu/COVID test if indicated.",redFlags:['Shortness of breath or wheezing','Bluish lips or face','Coughing up blood','Chest pain when breathing','High fever with the cough']},
  {key:'headache', match:/head ?ache|migraine/i, icon:'fa-solid fa-brain', title:'Headache / Migraine', severity:'mild',
    basicReason:'Most headaches come from muscle tension, dehydration, eye strain, or blood-vessel changes in the head — the brain itself has no pain receptors, so pain comes from surrounding tissue.',
    causes:[{level:'mild',text:'Tension headache, dehydration, eye strain, skipped meals'},{level:'moderate',text:'Migraine, sinus infection, poor sleep, caffeine withdrawal'},{level:'severe',text:'Very high blood pressure, meningitis, or bleeding in the brain'}],
    whenToSeeDoctor:'See a doctor for headaches that are frequent, worsening, or that interfere with daily life, and get urgent care for a sudden, severe "worst headache of your life."',
    homeRemedies:['Hydrate well and rest in a quiet, dark room','A cold or warm compress on the head/neck','Regular meals and a consistent sleep schedule','An OTC pain reliever as directed on the label'],
    specialist:'General Physician; Neurologist for recurring migraines',
    possibleDiseases:["Tension headache","Migraine","Sinus headache","Hypertension-related headache"],differentialDiagnosis:["Tension headache \u2014 dull, band-like pressure on both sides of the head","Migraine \u2014 throbbing, usually one-sided, with nausea or light sensitivity","Sinus headache \u2014 pain over forehead/cheeks with nasal congestion","Secondary headache needing urgent evaluation \u2014 sudden severe onset with neurological symptoms"],confirmatoryDiagnosis:"Usually a clinical diagnosis based on history and pattern; blood pressure check, and brain imaging (CT/MRI) only if red-flag features are present.",redFlags:['Sudden, "worst headache of my life"','Headache with fever and stiff neck','Headache after a head injury','Slurred speech, weakness, or vision loss alongside it','Headache that wakes you from sleep']},
  {key:'chest_pain', match:/chest pain|heart pain|tight(ness)? in (my )?chest/i, icon:'fa-solid fa-heart-pulse', title:'Chest Pain', severity:'severe',
    basicReason:'Chest pain can come from the heart, lungs, muscles, or even digestion (acid reflux) — because these causes range from harmless to life-threatening, chest pain is always treated cautiously.',
    causes:[{level:'mild',text:'Muscle strain, acid reflux/heartburn, anxiety'},{level:'moderate',text:'Costochondritis (rib-cartilage inflammation), gallstones'},{level:'severe',text:'Heart attack, angina, blood clot in the lung (pulmonary embolism)'}],
    whenToSeeDoctor:'Any new, unexplained chest pain deserves prompt medical evaluation, even if it seems mild — don\'t wait it out at home.',
    homeRemedies:['If pain is mild and clearly linked to reflux, an antacid may help','Rest and avoid exertion until evaluated','These are supportive only — chest pain still needs a professional check'],
    specialist:'Emergency Physician first; Cardiologist for follow-up',
    possibleDiseases:["Muscle strain","Acid reflux (GERD)","Costochondritis","Angina","Heart attack (myocardial infarction)","Pulmonary embolism"],differentialDiagnosis:["Musculoskeletal pain \u2014 worsens with movement or pressing on the chest wall","Acid reflux \u2014 burning sensation linked to meals or lying down","Angina/heart attack \u2014 pressure-like pain radiating to the arm/jaw, with sweating or breathlessness","Pulmonary embolism \u2014 sudden chest pain with breathlessness, often after prolonged immobility"],confirmatoryDiagnosis:"ECG, troponin blood test, and chest X-ray at minimum; echocardiogram or CT pulmonary angiogram as directed by an emergency physician.",redFlags:['Pain radiating to the arm, jaw, neck, or back','Pain with sweating, nausea, or shortness of breath','Crushing or squeezing pressure in the chest','Sudden severe pain with breathlessness']},
  {key:'abdominal_pain', match:/stomach ?ache|abdominal pain|belly pain|tummy pain|stomach pain|stomach hurt|belly hurt|tummy hurt/i, icon:'fa-solid fa-stethoscope', title:'Abdominal / Stomach Pain', severity:'moderate',
    basicReason:'Abdominal pain can originate from the stomach, intestines, gallbladder, appendix, kidneys, or reproductive organs — location and pattern of the pain usually point to the cause.',
    causes:[{level:'mild',text:'Indigestion, gas, mild food intolerance, constipation'},{level:'moderate',text:'Gastritis, stomach flu, urinary tract infection, gallstones'},{level:'severe',text:'Appendicitis, intestinal obstruction, pancreatitis, ectopic pregnancy'}],
    whenToSeeDoctor:'See a doctor if pain is severe, localized (especially lower-right), lasts more than 24-48 hours, or comes with fever, vomiting, or a rigid abdomen.',
    homeRemedies:['Sip clear fluids and eat bland food (rice, banana, toast)','A warm compress on the abdomen for cramping','Avoid oily, spicy, or heavy food until it settles','Rest in a comfortable position'],
    specialist:'General Physician; Gastroenterologist for recurring issues; Emergency care for sudden severe pain',
    possibleDiseases:["Gastritis / indigestion","Urinary tract infection","Gallstones","Appendicitis","Pancreatitis"],differentialDiagnosis:["Indigestion/gastritis \u2014 upper-abdomen discomfort linked to meals","Appendicitis \u2014 pain starting near the navel, moving to the lower-right abdomen","Gallstones \u2014 pain in the upper-right abdomen, often after fatty food","UTI \u2014 lower-abdomen pain with burning urination"],confirmatoryDiagnosis:"Physical examination, urine test, blood tests, and abdominal ultrasound or CT scan depending on the suspected cause.",redFlags:['Severe pain that comes on suddenly','Pain with a rigid, tender abdomen','Blood in vomit or stool','High fever with abdominal pain','Pain during pregnancy']},
  {key:'back_pain', match:/back ?ache|back pain|spine pain/i, icon:'fa-solid fa-person-falling', title:'Back Pain', severity:'mild',
    basicReason:'Most back pain comes from strained muscles or ligaments, often from posture, lifting, or prolonged sitting — the spine itself is rarely the direct cause in mild cases.',
    causes:[{level:'mild',text:'Muscle strain, poor posture, prolonged sitting'},{level:'moderate',text:'Slipped/herniated disc, sciatica, arthritis of the spine'},{level:'severe',text:'Spinal infection, fracture, or kidney-related pain (e.g., kidney stones/infection)'}],
    whenToSeeDoctor:'See a doctor if pain persists beyond 2 weeks, radiates down a leg, or is accompanied by numbness, weakness, or loss of bladder/bowel control.',
    homeRemedies:['Gentle stretching and short walks rather than complete bed rest','A warm compress for muscle tightness, or ice for acute injury','Maintain good posture; use a supportive chair','An OTC pain reliever as directed on the label'],
    specialist:'General Physician; Orthopedist or Physiotherapist for persistent pain',
    possibleDiseases:["Muscle strain","Herniated disc","Sciatica","Kidney stone or infection"],differentialDiagnosis:["Muscle strain \u2014 pain worsens with movement, improves with rest","Sciatica/herniated disc \u2014 pain radiating down one leg with numbness or tingling","Kidney-related pain \u2014 one-sided pain, often with fever or urinary symptoms"],confirmatoryDiagnosis:"Clinical examination; spine X-ray or MRI for suspected disc/nerve issues, urine test and ultrasound if kidney involvement is suspected.",redFlags:['Numbness or weakness in the legs','Loss of bladder or bowel control','Pain after a fall or injury','Unexplained weight loss with back pain','Fever with back pain']},
  {key:'sore_throat', match:/sore throat|throat pain|throat irritation/i, icon:'fa-solid fa-lungs', title:'Sore Throat', severity:'mild',
    basicReason:'A sore throat is usually inflammation of the throat lining, most often from a viral infection, though bacteria (like strep) or dry/irritated air can also cause it.',
    causes:[{level:'mild',text:'Viral infection, dry air, mild irritation from shouting/dust'},{level:'moderate',text:'Strep throat (bacterial), tonsillitis'},{level:'severe',text:'Peritonsillar abscess, severe airway swelling (rare but urgent)'}],
    whenToSeeDoctor:'See a doctor if the sore throat lasts more than a week, is severe, or comes with high fever, white patches on the tonsils, or trouble swallowing/breathing.',
    homeRemedies:['Warm salt-water gargles several times a day','Warm fluids like tea with honey','Throat lozenges to ease irritation','A humidifier if the air is dry'],
    specialist:'General Physician; ENT (Ear, Nose & Throat) specialist for recurring cases',
    possibleDiseases:["Viral pharyngitis","Strep throat (bacterial)","Tonsillitis","Peritonsillar abscess"],differentialDiagnosis:["Viral sore throat \u2014 gradual onset, often with cold symptoms and cough","Strep throat \u2014 sudden severe pain, fever, white patches on tonsils, usually no cough","Peritonsillar abscess \u2014 one-sided severe pain, muffled voice, difficulty opening the mouth"],confirmatoryDiagnosis:"Throat examination; rapid strep test or throat culture if a bacterial infection is suspected.",redFlags:['Difficulty breathing or swallowing','Drooling (in children)','Muffled "hot potato" voice','High fever with a very swollen throat']},
  {key:'diarrhea', match:/diarrhea|loose motion|loose stools/i, icon:'fa-solid fa-toilet', title:'Diarrhea', severity:'moderate',
    basicReason:'Diarrhea usually means the intestines are moving food through too quickly, often to flush out an infection, irritant, or something the gut can\'t tolerate well.',
    causes:[{level:'mild',text:'Food intolerance, mild indigestion, dietary change'},{level:'moderate',text:'Viral or bacterial gastroenteritis ("stomach flu"), food poisoning'},{level:'severe',text:'Cholera, severe dehydration, or an underlying bowel disease'}],
    whenToSeeDoctor:'See a doctor if it lasts more than 2 days, is bloody, or comes with signs of dehydration (dizziness, very little urine, extreme thirst).',
    homeRemedies:['ORS (oral rehydration solution) or clear fluids to replace lost fluids/salts','Bland foods — rice, banana, toast, yogurt','Avoid dairy, caffeine, and oily food until it settles','Rest and wash hands frequently to avoid spreading it'],
    specialist:'General Physician; Gastroenterologist if it becomes chronic',
    possibleDiseases:["Viral gastroenteritis","Bacterial food poisoning","Cholera","Irritable bowel syndrome"],differentialDiagnosis:["Viral gastroenteritis \u2014 watery stools with mild fever, resolves in a few days","Bacterial food poisoning \u2014 sudden onset after a specific meal, may include blood/mucus","Cholera \u2014 profuse watery (\"rice-water\") stools with rapid dehydration"],confirmatoryDiagnosis:"Stool routine and culture test, plus blood tests to check hydration/electrolyte status if symptoms are severe or prolonged.",redFlags:['Blood or mucus in stool','Signs of dehydration (dizziness, dry mouth, little/no urine)','High fever with diarrhea','Severe abdominal pain']},
  {key:'vomiting', match:/vomit|nausea|throwing up/i, icon:'fa-solid fa-house-medical', title:'Vomiting / Nausea', severity:'moderate',
    basicReason:'Vomiting is the body\'s way of expelling something irritating or harmful from the stomach — it can be triggered by infection, food, motion, or even stress/anxiety.',
    causes:[{level:'mild',text:'Motion sickness, mild food intolerance, morning sickness'},{level:'moderate',text:'Stomach flu/food poisoning, migraine, early pregnancy'},{level:'severe',text:'Intestinal obstruction, appendicitis, severe infection, head injury'}],
    whenToSeeDoctor:'See a doctor if vomiting persists beyond 24 hours, contains blood, or comes with severe abdominal pain, a stiff neck, or confusion.',
    homeRemedies:['Sip small amounts of clear fluids or ORS frequently','Ginger tea or ginger candy can ease nausea','Bland food (the BRAT diet — banana, rice, applesauce, toast) once tolerated','Rest and avoid strong smells or heavy meals'],
    specialist:'General Physician; Gastroenterologist for recurring episodes',
    possibleDiseases:["Gastroenteritis","Food poisoning","Migraine","Pregnancy-related nausea"],differentialDiagnosis:["Gastroenteritis \u2014 vomiting with diarrhea and mild fever","Migraine-related \u2014 vomiting with headache and light sensitivity","Pregnancy \u2014 nausea/vomiting mainly in the morning, in someone who could be pregnant"],confirmatoryDiagnosis:"Clinical assessment; blood tests and abdominal imaging if vomiting is persistent, severe, or accompanied by pain.",redFlags:['Vomiting blood or dark, coffee-ground material','Severe abdominal pain with vomiting','Signs of dehydration','Vomiting after a head injury','Vomiting with a stiff neck and fever']},
  {key:'skin_rash', match:/rash|itching|itchy skin|hives/i, icon:'fa-solid fa-hand-dots', title:'Skin Rash / Itching', severity:'mild',
    basicReason:'Skin rashes are the skin\'s reaction to irritation, infection, allergy, or an underlying condition — the pattern and spread often help identify the trigger.',
    causes:[{level:'mild',text:'Dry skin, mild allergic reaction, insect bite, heat rash'},{level:'moderate',text:'Eczema, fungal infection, contact dermatitis, hives'},{level:'severe',text:'Severe allergic reaction, drug reaction, chickenpox/measles, autoimmune skin disease'}],
    whenToSeeDoctor:'See a doctor if the rash spreads rapidly, blisters, is very painful, or comes with fever, or if it doesn\'t improve within a week of home care.',
    homeRemedies:['Keep the area clean and dry; avoid scratching','A cool compress or plain moisturizer to soothe itching','Avoid the suspected trigger (new soap, food, fabric)','Loose, breathable clothing'],
    specialist:'General Physician; Dermatologist (skin specialist) for persistent or unclear rashes',
    possibleDiseases:["Contact dermatitis","Eczema","Fungal skin infection","Chickenpox","Drug reaction"],differentialDiagnosis:["Contact dermatitis \u2014 rash limited to the area touching an irritant or allergen","Fungal infection \u2014 ring-shaped, itchy, well-defined patches","Chickenpox \u2014 widespread itchy blisters with fever","Drug reaction \u2014 rash appearing soon after starting a new medication"],confirmatoryDiagnosis:"Usually diagnosed by visual examination; skin scraping, culture, or biopsy in unclear or persistent cases.",redFlags:['Swelling of the face, lips, or throat','Difficulty breathing alongside the rash','Rash with high fever','Rapidly spreading rash','Skin that looks infected (pus, warmth, red streaking)']},
  {key:'joint_pain', match:/joint pain|arthritis|knee pain|swollen joint|knee (is )?(swollen|hurt|painful)|ankle pain|elbow pain|shoulder pain|wrist pain/i, icon:'fa-solid fa-bone', title:'Joint Pain', severity:'mild',
    basicReason:'Joint pain often comes from wear-and-tear, overuse, or inflammation in the tissue that cushions and lubricates the joint.',
    causes:[{level:'mild',text:'Overuse, minor sprain, mild inflammation'},{level:'moderate',text:'Osteoarthritis, tendinitis, gout'},{level:'severe',text:'Rheumatoid arthritis, joint infection (septic arthritis), fracture'}],
    whenToSeeDoctor:'See a doctor if a joint is significantly swollen, red, hot to the touch, or if pain persists beyond a couple of weeks or limits movement.',
    homeRemedies:['Rest the joint and avoid aggravating activity','Ice for acute swelling; warmth for stiffness','Gentle range-of-motion exercises once pain eases','An OTC anti-inflammatory as directed on the label'],
    specialist:'General Physician; Orthopedist or Rheumatologist for ongoing joint issues',
    possibleDiseases:["Osteoarthritis","Rheumatoid arthritis","Gout","Septic arthritis"],differentialDiagnosis:["Osteoarthritis \u2014 gradual pain worsened by activity, common with age","Rheumatoid arthritis \u2014 symmetric joint pain with morning stiffness","Gout \u2014 sudden, intense pain and redness, often in the big toe","Septic arthritis \u2014 hot, swollen joint with fever, needs urgent care"],confirmatoryDiagnosis:"Joint examination, blood tests (uric acid, inflammatory markers), and joint X-ray or fluid analysis if infection is suspected.",redFlags:['Joint that is hot, red, and very swollen','Fever with joint pain','Inability to move or bear weight on the joint','Joint pain after a significant injury']},
  {key:'fatigue', match:/fatigue|tired all the time|weakness|exhaustion|low energy/i, icon:'fa-solid fa-battery-quarter', title:'Fatigue / Weakness', severity:'mild',
    basicReason:'Persistent tiredness usually reflects the body working harder than normal — from poor sleep, stress, or nutritional gaps to an underlying medical condition.',
    causes:[{level:'mild',text:'Poor sleep, stress, dehydration, a demanding schedule'},{level:'moderate',text:'Iron-deficiency anemia, thyroid imbalance, vitamin D/B12 deficiency'},{level:'severe',text:'Diabetes, heart or lung disease, chronic infection, depression'}],
    whenToSeeDoctor:'See a doctor if fatigue persists for more than 2 weeks despite rest, or comes with weight change, breathlessness, or low mood.',
    homeRemedies:['Prioritize 7-9 hours of consistent sleep','Balanced meals with enough iron and protein','Regular light exercise (even a daily walk helps energy)','Stay well hydrated and limit late caffeine'],
    specialist:'General Physician; can refer to Endocrinologist or other specialist based on blood-test findings',
    possibleDiseases:["Iron-deficiency anemia","Hypothyroidism","Vitamin D/B12 deficiency","Depression","Diabetes"],differentialDiagnosis:["Anemia \u2014 fatigue with pale skin and breathlessness on exertion","Hypothyroidism \u2014 fatigue with weight gain and cold intolerance","Depression \u2014 fatigue with low mood and loss of interest","Diabetes \u2014 fatigue with excess thirst and urination"],confirmatoryDiagnosis:"Blood tests \u2014 CBC, thyroid function, blood sugar, and vitamin D/B12 levels \u2014 help identify the exact cause.",redFlags:['Fatigue with unexplained weight loss','Fatigue with chest pain or breathlessness','Fainting or near-fainting episodes','Persistent low mood alongside the tiredness']},
  {key:'dizziness', match:/dizzy|dizziness|vertigo|light ?headed/i, icon:'fa-solid fa-compass-drafting', title:'Dizziness / Vertigo', severity:'moderate',
    basicReason:'Dizziness can come from the inner ear (balance system), low blood pressure/sugar, dehydration, or — less often — the brain or heart, which is why sudden or severe episodes are checked carefully.',
    causes:[{level:'mild',text:'Dehydration, standing up too fast, skipped meals'},{level:'moderate',text:'Inner-ear imbalance (labyrinthitis/BPPV), low blood pressure, anemia'},{level:'severe',text:'Stroke, heart rhythm problem, severe drop in blood pressure'}],
    whenToSeeDoctor:'See a doctor if dizziness is frequent, severe, or comes with fainting, chest pain, slurred speech, or one-sided weakness.',
    homeRemedies:['Sit or lie down immediately when dizzy to avoid falls','Hydrate and eat regular, balanced meals','Rise slowly from sitting/lying positions','Avoid sudden head movements if inner-ear related'],
    specialist:'General Physician; ENT for inner-ear causes, Neurologist or Cardiologist if severe/recurring',
    possibleDiseases:["Benign paroxysmal positional vertigo (BPPV)","Low blood pressure","Anemia","Inner-ear infection","Stroke (rare but urgent)"],differentialDiagnosis:["BPPV \u2014 brief spinning triggered by head movement","Low blood pressure/dehydration \u2014 dizziness on standing up","Inner-ear infection \u2014 persistent vertigo with nausea, possibly hearing changes","Stroke \u2014 sudden dizziness with slurred speech or one-sided weakness (emergency)"],confirmatoryDiagnosis:"Blood pressure check, blood tests, and balance/ear tests; urgent brain imaging if stroke is suspected.",redFlags:['Sudden dizziness with slurred speech or facial drooping','Dizziness with chest pain or palpitations','Fainting/loss of consciousness','Dizziness after a head injury']},
  {key:'breathlessness', match:/shortness of breath|breathless|can'?t breathe|can ?not breathe|difficulty breathing|trouble breathing/i, icon:'fa-solid fa-lungs-virus', title:'Shortness of Breath', severity:'severe',
    basicReason:'Breathlessness means the body isn\'t moving enough oxygen in or carbon dioxide out — the cause can be as simple as anxiety or as urgent as a heart or lung emergency.',
    causes:[{level:'mild',text:'Anxiety, poor fitness, mild asthma'},{level:'moderate',text:'Chest infection, moderate asthma/COPD flare, anemia'},{level:'severe',text:'Heart failure, pulmonary embolism (blood clot in the lung), severe asthma attack, pneumonia'}],
    whenToSeeDoctor:'Any new or worsening breathlessness deserves prompt medical evaluation — don\'t assume it will pass on its own.',
    homeRemedies:['Sit upright and try slow, controlled breathing to stay calm','Use a prescribed inhaler if you have one for asthma','Loosen tight clothing','These ease symptoms only — breathlessness still needs a professional check'],
    specialist:'Emergency Physician first for sudden/severe cases; Pulmonologist or Cardiologist for follow-up',
    possibleDiseases:["Asthma","Chest infection / pneumonia","Anemia","Heart failure","Pulmonary embolism"],differentialDiagnosis:["Asthma \u2014 breathlessness with wheeze, often triggered by allergens or exercise","Pneumonia \u2014 breathlessness with fever and cough","Heart failure \u2014 breathlessness worse when lying down, with leg swelling","Pulmonary embolism \u2014 sudden breathlessness with chest pain, often after immobility"],confirmatoryDiagnosis:"Pulse oximetry, chest X-ray, ECG, and blood tests; CT pulmonary angiogram or echocardiogram if a clot or heart cause is suspected.",redFlags:['Breathlessness at rest or that stops you mid-sentence','Bluish lips, tongue, or fingertips','Breathlessness with chest pain','Breathlessness with swelling in the legs']},
  {key:'uti', match:/burning (while |when )?urinat|painful urination|uti\b|urine infection|burn(s|ing)? when i (pee|urinate)|pain(ful)? when i pee/i, icon:'fa-solid fa-droplet', title:'Burning Urination / UTI', severity:'moderate',
    basicReason:'A burning sensation while urinating is usually the bladder or urethra lining reacting to a bacterial infection or irritation.',
    causes:[{level:'mild',text:'Mild irritation, dehydration, harsh soap/hygiene products'},{level:'moderate',text:'Urinary tract infection (UTI), bladder infection'},{level:'severe',text:'Kidney infection (pyelonephritis), sexually transmitted infection'}],
    whenToSeeDoctor:'See a doctor if burning persists beyond a day or two, or comes with fever, back pain, or blood in the urine — UTIs generally need antibiotics from a doctor.',
    homeRemedies:['Drink plenty of water to flush the urinary tract','Urinate frequently and avoid holding it in','Avoid caffeine and alcohol until it settles','Practice good hygiene (wipe front to back)'],
    specialist:'General Physician; Urologist or Gynecologist for recurring infections',
    possibleDiseases:["Urinary tract infection (cystitis)","Kidney infection (pyelonephritis)","Sexually transmitted infection"],differentialDiagnosis:["Cystitis (bladder infection) \u2014 burning urination with frequency, no fever","Pyelonephritis (kidney infection) \u2014 burning urination with fever and back/side pain","STI \u2014 similar symptoms with a recent new sexual exposure"],confirmatoryDiagnosis:"Urine routine/microscopy and urine culture; blood tests and ultrasound if a kidney infection is suspected.",redFlags:['Fever and chills with urinary symptoms','Pain in the back or side (possible kidney involvement)','Blood in the urine','Symptoms during pregnancy']},
  {key:'ear_pain', match:/ear ?ache|ear pain|earache/i, icon:'fa-solid fa-ear-listen', title:'Ear Pain', severity:'mild',
    basicReason:'Ear pain most often comes from infection or pressure buildup in the outer or middle ear, sometimes linked to a cold or water exposure.',
    causes:[{level:'mild',text:'Water trapped in the ear, mild wax buildup, air pressure change (flying)'},{level:'moderate',text:'Middle-ear infection (otitis media), swimmer\'s ear (otitis externa)'},{level:'severe',text:'Ruptured eardrum, mastoiditis (infection spreading to bone behind the ear)'}],
    whenToSeeDoctor:'See a doctor if pain is severe, lasts more than 2 days, or comes with fluid drainage, hearing loss, or fever.',
    homeRemedies:['A warm compress against the ear for comfort','Keep the ear dry; avoid inserting anything into it','An OTC pain reliever as directed on the label','Chewing gum or swallowing can help with pressure-related pain'],
    specialist:'General Physician; ENT specialist for recurring or severe ear issues',
    possibleDiseases:["Otitis media (middle-ear infection)","Otitis externa (swimmer's ear)","Earwax blockage","Ruptured eardrum"],differentialDiagnosis:["Otitis media \u2014 pain with fever, common after a cold, muffled hearing","Otitis externa \u2014 pain worsened by touching/pulling the ear, often after water exposure","Earwax blockage \u2014 dull fullness without fever"],confirmatoryDiagnosis:"Ear examination (otoscopy) by a doctor; hearing test if hearing loss is present.",redFlags:['Fluid or blood draining from the ear','Sudden hearing loss','Severe swelling behind the ear','High fever with ear pain (especially in children)']},
  {key:'toothache', match:/tooth ?ache|dental pain|tooth pain/i, icon:'fa-solid fa-tooth', title:'Toothache', severity:'mild',
    basicReason:'Tooth pain usually signals irritation or infection of the nerve inside the tooth or the surrounding gum tissue.',
    causes:[{level:'mild',text:'Tooth sensitivity, minor gum irritation, food stuck between teeth'},{level:'moderate',text:'Cavity (tooth decay), gum disease (gingivitis)'},{level:'severe',text:'Dental abscess, deep infection that can spread to the jaw or face'}],
    whenToSeeDoctor:'See a dentist if pain is persistent, throbbing, or comes with facial swelling, fever, or a bad taste from pus — these need prompt dental care.',
    homeRemedies:['Rinse with warm salt water','Gently floss to remove any trapped food','An OTC pain reliever as directed on the label until you can see a dentist','Avoid very hot, cold, or sugary food on the affected tooth'],
    specialist:'Dentist; Oral & Maxillofacial specialist for severe infections',
    possibleDiseases:["Dental cavity","Gingivitis","Dental abscess"],differentialDiagnosis:["Cavity \u2014 sharp pain triggered by hot, cold, or sweet food","Gingivitis \u2014 gum pain/bleeding without deep tooth pain","Dental abscess \u2014 throbbing pain with facial swelling and possible fever"],confirmatoryDiagnosis:"Dental examination and dental X-ray to locate decay, infection, or an abscess.",redFlags:['Facial or jaw swelling','Fever with tooth pain','Difficulty swallowing or opening the mouth','Pus or a foul taste near the tooth']},
  {key:'eye_pain', match:/eye pain|red eye|eye redness|itchy eyes/i, icon:'fa-solid fa-eye', title:'Eye Redness / Pain', severity:'mild',
    basicReason:'Red or painful eyes are usually due to irritation, dryness, or infection of the surface of the eye, though some causes involve deeper eye structures.',
    causes:[{level:'mild',text:'Dryness, minor irritation, allergies, tiredness'},{level:'moderate',text:'Conjunctivitis ("pink eye"), stye, mild eye infection'},{level:'severe',text:'Corneal injury/ulcer, acute glaucoma, uveitis (deep eye inflammation)'}],
    whenToSeeDoctor:'See a doctor if there\'s significant pain, vision change, light sensitivity, or if redness doesn\'t improve within a couple of days.',
    homeRemedies:['Avoid rubbing the eyes','A clean, cool compress for irritation','Lubricating (artificial tear) drops for dryness','Good hand hygiene, and avoid sharing towels if infection is suspected'],
    specialist:'General Physician; Ophthalmologist (eye specialist) for pain, vision changes, or non-improving redness',
    possibleDiseases:["Conjunctivitis (pink eye)","Dry eye","Stye","Corneal abrasion","Acute glaucoma"],differentialDiagnosis:["Conjunctivitis \u2014 redness with discharge, mildly contagious","Dry eye \u2014 irritation without discharge, worse by evening","Corneal injury \u2014 pain after eye trauma or a foreign-body sensation","Acute glaucoma \u2014 severe pain with halos around lights and blurred vision (emergency)"],confirmatoryDiagnosis:"Eye examination by an ophthalmologist; eye-pressure measurement if glaucoma is suspected.",redFlags:['Sudden vision loss or blurring','Severe eye pain','Injury to the eye','Halos around lights with eye pain (possible glaucoma)']},
  {key:'anxiety', match:/anxious|anxiety|panic attack|stressed|can'?t stop worrying/i, icon:'fa-solid fa-brain', title:'Anxiety / Stress', severity:'moderate',
    basicReason:'Anxiety is the body\'s stress-response system activating even without immediate danger, producing both mental worry and physical symptoms like a racing heart or tight chest.',
    causes:[{level:'mild',text:'Situational stress, an upcoming event, poor sleep'},{level:'moderate',text:'Generalized anxiety, panic attacks, burnout'},{level:'severe',text:'Underlying anxiety disorder, panic disorder, or an anxiety symptom overlapping with a physical condition (e.g., thyroid, heart) that needs to be ruled out'}],
    whenToSeeDoctor:'Reach out to a professional if anxiety is frequent, hard to control, or is interfering with daily life, sleep, or relationships.',
    homeRemedies:['Slow, deep breathing (e.g., inhale 4 counts, hold 4, exhale 6)','Grounding techniques — naming things you can see/hear/touch','Regular physical activity and consistent sleep','Limiting caffeine, which can worsen anxious feelings'],
    specialist:'General Physician for an initial check; Psychiatrist or Psychologist/Counselor for ongoing support',
    possibleDiseases:["Generalized anxiety disorder","Panic disorder","Situational stress","Thyroid disorder (overlapping symptoms)"],differentialDiagnosis:["Situational stress \u2014 anxiety tied to a specific event, resolves once it passes","Generalized anxiety disorder \u2014 persistent worry most days for 6+ months","Panic disorder \u2014 sudden intense episodes with racing heart and chest tightness","Thyroid disorder \u2014 anxiety-like symptoms with weight change or tremor (needs a blood test to rule out)"],confirmatoryDiagnosis:"Clinical evaluation by a mental health professional; thyroid function test to rule out a physical cause if indicated.",redFlags:['Chest pain or a racing heart that doesn\'t settle (get it checked to rule out cardiac causes)','Thoughts of self-harm — see the note below','Panic attacks that are frequent and severe','Anxiety paired with physical symptoms you can\'t explain']},
  {key:'allergic_reaction', match:/allerg(y|ic)|hives|swelling after eating|reaction to/i, icon:'fa-solid fa-hand-dots', title:'Allergic Reaction', severity:'moderate',
    basicReason:'An allergic reaction happens when the immune system overreacts to something normally harmless (food, medicine, insect sting, pollen), releasing chemicals like histamine that cause the symptoms.',
    causes:[{level:'mild',text:'Mild pollen/dust allergy, minor food sensitivity'},{level:'moderate',text:'Hives, localized swelling, moderate food or medication allergy'},{level:'severe',text:'Anaphylaxis — a severe, whole-body allergic reaction'}],
    whenToSeeDoctor:'See a doctor for recurring or worsening reactions to identify and avoid the trigger, and get emergency care immediately for any signs of a severe reaction.',
    homeRemedies:['Remove or avoid the suspected trigger right away','An OTC antihistamine as directed on the label for mild symptoms','A cool compress for localized itching/swelling','Keep track of what triggered it to share with a doctor'],
    specialist:'General Physician; Allergist/Immunologist for recurring or unclear allergies',
    possibleDiseases:["Localized allergic reaction","Hives (urticaria)","Anaphylaxis"],differentialDiagnosis:["Mild allergic reaction \u2014 localized itching/redness without breathing difficulty","Hives \u2014 widespread itchy welts that may come and go","Anaphylaxis \u2014 rapid swelling and breathing difficulty (life-threatening emergency)"],confirmatoryDiagnosis:"Usually diagnosed clinically; allergy testing (skin prick or blood IgE) once stable, to identify the specific trigger.",redFlags:['Swelling of the lips, tongue, or throat','Difficulty breathing or wheezing','Dizziness or fainting after exposure','Widespread hives with breathing trouble — use an epinephrine auto-injector if prescribed and call for emergency help immediately']},
  {key:'constipation', match:/constipat/i, icon:'fa-solid fa-toilet', title:'Constipation', severity:'mild',
    basicReason:'Constipation happens when stool moves too slowly through the intestines, usually from low fiber/fluid intake, low activity, or ignoring the urge to go.',
    causes:[{level:'mild',text:'Low fiber or fluid intake, low physical activity, travel/routine change'},{level:'moderate',text:'Certain medications, irritable bowel syndrome (IBS)'},{level:'severe',text:'Bowel obstruction, colorectal disease — especially with new symptoms in older adults'}],
    whenToSeeDoctor:'See a doctor if constipation lasts more than 2-3 weeks, or comes with severe pain, blood in stool, or unexplained weight loss.',
    homeRemedies:['Increase fiber — fruits, vegetables, whole grains','Drink more water throughout the day','Regular physical activity','Don\'t delay the urge to have a bowel movement'],
    specialist:'General Physician; Gastroenterologist for persistent or severe cases',
    possibleDiseases:["Functional/dietary constipation","Irritable bowel syndrome","Hypothyroidism","Bowel obstruction (rare)"],differentialDiagnosis:["Functional/dietary constipation \u2014 related to low fiber or fluid intake","IBS \u2014 constipation alternating with normal or loose stools, with abdominal discomfort","Bowel obstruction \u2014 severe pain, bloating, inability to pass gas or stool (emergency)"],confirmatoryDiagnosis:"Clinical evaluation; abdominal X-ray or further tests if obstruction or an underlying condition is suspected.",redFlags:['Severe abdominal pain or bloating','Blood in the stool','Inability to pass stool or gas at all','Unexplained weight loss']},
  {key:'period_pain', match:/period pain|period cramp|menstrual cramp|menstrual pain|cramps during period/i, icon:'fa-solid fa-venus', title:'Menstrual Cramps', severity:'mild',
    basicReason:'Menstrual cramps happen when the uterus contracts to shed its lining, and hormone-like substances (prostaglandins) drive both the contractions and the pain.',
    causes:[{level:'mild',text:'Typical menstrual cramping'},{level:'moderate',text:'More intense prostaglandin activity, mild hormonal imbalance'},{level:'severe',text:'Endometriosis, fibroids, pelvic inflammatory disease'}],
    whenToSeeDoctor:'See a doctor if cramps are severe enough to disrupt daily life, worsen over time, or come with heavy bleeding or pain outside of your period.',
    homeRemedies:['A heating pad or warm compress on the lower abdomen','Gentle exercise or stretching','An OTC pain reliever as directed on the label','Adequate rest and hydration'],
    specialist:'Gynecologist, especially if pain is severe or worsening',
    possibleDiseases:["Primary dysmenorrhea","Endometriosis","Uterine fibroids","Pelvic inflammatory disease"],differentialDiagnosis:["Primary dysmenorrhea \u2014 typical cramping limited to the period","Endometriosis \u2014 worsening pain over time, sometimes with pain during sex or bowel movements","Fibroids \u2014 pain with heavy or prolonged bleeding","Pelvic inflammatory disease \u2014 pelvic pain with fever and unusual discharge"],confirmatoryDiagnosis:"Pelvic examination and pelvic ultrasound; further tests if endometriosis or fibroids are suspected.",redFlags:['Pain severe enough to prevent normal activity every cycle','Very heavy bleeding (soaking a pad/tampon hourly)','Pain outside of your period','Fever with pelvic pain']},
];
// Emergency keywords that override normal symptom matching with an urgent SOS prompt.
const EMERGENCY_PATTERNS = [
  /can'?t breathe|can ?not breathe|not breathing|choking/i,
  /unconscious|unresponsive|passed out/i,
  /severe bleeding|heavy bleeding|won'?t stop bleeding/i,
  /face (is )?droop|slurred speech|can'?t move (my )?(arm|leg|side)/i,
  /heart attack|stroke/i,
];
// Handled separately and gently — this is never treated as a routine "symptom".
const CRISIS_PATTERNS = /suicid|kill myself|end my life|want to die|self[- ]?harm/i;

// ----------------------------------------------------------------------
// CORE AI ENGINE — universal backend (Cloudflare Worker), no per-user keys
// ----------------------------------------------------------------------
// The symptom checker's live reports are the core feature, not an optional
// add-on, and they now work identically for every visitor with zero setup.
// All three provider keys (Gemini, Groq, OpenRouter) live ONLY on a small
// Cloudflare Worker backend — see /arogyabot-worker/worker.js in this
// project. That Worker races all three providers (Promise.any) and, for
// Gemini, first grounds the answer in live Google Search results before
// structuring it into JSON — so answers reflect current information, not
// just the model's training data. This page just calls that one backend
// endpoint; no key is ever stored in this file or in the browser.
// The offline SYMPTOM_KB remains the automatic fallback if the backend is
// unreachable or every provider it tries fails.
//
// SETUP (one-time, by you — not per visitor):
//   1. cd arogyabot-worker && wrangler login
//   2. wrangler secret put GEMINI_API_KEY       (repeat for GROQ_API_KEY, OPENROUTER_API_KEY — at least one required)
//   3. wrangler deploy
//   4. paste the printed https://xxxx.workers.dev URL below
/* AI_BACKEND_URL → moved to js/config/app-config.js */ // <-- set this after deploying arogyabot-worker
const AI_BACKEND_STORAGE = 'arogyabot_backend_url_override'; // optional per-browser override, for testing a different deployment
function getAIBackendUrl(){
  try{ const override = (localStorage.getItem(AI_BACKEND_STORAGE)||'').trim(); if(override) return override; }catch(e){}
  return AI_BACKEND_URL;
}
function aiBackendConfigured(){
  const u = getAIBackendUrl();
  return !!u && u.indexOf('PASTE-YOUR-WORKER-URL') === -1;
}
// Legacy alias kept for old call sites — true once a real backend URL is set.
function getAIKey(){ return aiBackendConfigured() ? '1' : ''; }
function openAISettingsModal(){
  const configured = aiBackendConfigured();
  const overrideVal = (function(){ try{ return localStorage.getItem(AI_BACKEND_STORAGE)||''; }catch(e){ return ''; } })();
  const html = `<button class="modal-close-x" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
  <h3>Core AI Engine</h3>
  <p class="modal-sub">Live AI answers are powered by a shared backend, so nothing needs to be pasted here to use it — it's on for every visitor automatically. Google Search grounding keeps Gemini's answers current; Groq and OpenRouter back it up if Gemini is ever rate-limited.</p>
  <div class="conflict-box" style="margin-bottom:16px;">
    <strong>Status:</strong> ${configured ? '<span class="status-tag status-ok">Connected</span> — reports are generated live.' : '<span class="status-tag status-danger">Not set up yet</span> — the app owner needs to deploy the Cloudflare Worker in <code>/arogyabot-worker</code> and set AI_BACKEND_URL. Until then, everyone gets the built-in offline knowledge base.'}
  </div>
  <div class="form-group"><label>Backend URL override (advanced / testing only)</label><input type="text" class="form-control" id="ai-backend-override" placeholder="https://your-worker.workers.dev" value="${overrideVal}"></div>
  <p style="font-size:.74rem;color:var(--text-muted);margin:-6px 0 16px;">Leave blank to use the built-in AI_BACKEND_URL that ships with this app.</p>
  <div style="display:flex;gap:10px;">
    <button class="btn" onclick="saveAISettings()" style="flex:1;"><i class="fa-solid fa-check"></i> Save</button>
    ${overrideVal ? `<button class="btn btn-secondary" onclick="clearAISettings()">Clear override</button>` : ''}
  </div>`;
  openModal(html);
}
function saveAISettings(){
  const v = document.getElementById('ai-backend-override').value.trim();
  try{ if(v) localStorage.setItem(AI_BACKEND_STORAGE, v); else localStorage.removeItem(AI_BACKEND_STORAGE); }catch(e){}
  closeModal();
  showToast(aiBackendConfigured() ? 'AI engine on' : 'AI engine off', aiBackendConfigured() ? 'Reports will be generated live.' : 'Back to the built-in offline knowledge base.', 'success');
  if(currentView==='p-chat') renderCurrentView('p-chat');
}
function clearAISettings(){
  try{ localStorage.removeItem(AI_BACKEND_STORAGE); }catch(e){}
  closeModal();
  showToast('Override cleared', 'Using the built-in backend URL that ships with this app.', 'success');
  if(currentView==='p-chat') renderCurrentView('p-chat');
}
const AI_TIMEOUT_MS = 25000;
async function withAICallTimeout(fn){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), AI_TIMEOUT_MS);
  try{ return await fn(controller.signal); } finally { clearTimeout(timer); }
}
// Normalize the backend's response defensively, in case of partial/odd payloads.
function normalizeAIReport(parsed){
  return {
    icon: 'fa-solid fa-wand-magic-sparkles',
    provider: parsed.provider || 'ai',
    title: parsed.title || 'Symptom Report',
    severity: ['mild','moderate','severe'].includes(parsed.severity) ? parsed.severity : 'moderate',
    basicReason: parsed.basicReason || 'No summary returned — please try rephrasing.',
    causes: Array.isArray(parsed.causes) && parsed.causes.length ? parsed.causes.map(c=>({level: ['mild','moderate','severe'].includes(c.level)?c.level:'moderate', text: c.text||''})) : [{level:'moderate', text:'Not enough detail returned — consult a doctor for evaluation.'}],
    possibleDiseases: Array.isArray(parsed.possibleDiseases) && parsed.possibleDiseases.length ? parsed.possibleDiseases : ['Not enough detail returned to name specific conditions'],
    differentialDiagnosis: Array.isArray(parsed.differentialDiagnosis) && parsed.differentialDiagnosis.length ? parsed.differentialDiagnosis : ['A doctor can narrow this down after a physical exam and your full history'],
    confirmatoryDiagnosis: parsed.confirmatoryDiagnosis || 'A doctor will recommend specific tests/exams to confirm the exact cause.',
    whenToSeeDoctor: parsed.whenToSeeDoctor || 'If symptoms persist or worsen, consult a doctor.',
    homeRemedies: Array.isArray(parsed.homeRemedies) && parsed.homeRemedies.length ? parsed.homeRemedies : ['Rest and stay hydrated','Monitor your symptoms and consult a doctor if they worsen'],
    specialist: parsed.specialist || 'General Physician',
    redFlags: Array.isArray(parsed.redFlags) && parsed.redFlags.length ? parsed.redFlags : ['Rapidly worsening symptoms','Difficulty breathing','Severe pain']
  };
}
// Single call to your own backend — it holds the keys, races the providers,
// and (for Gemini) grounds the answer in live Google Search results first.
async function fetchAISymptomReport(text){
  if(!aiBackendConfigured()) throw new Error('AI backend not configured — deploy arogyabot-worker and set AI_BACKEND_URL');
  const resp = await withAICallTimeout(signal => fetch(getAIBackendUrl().replace(/\/$/,'') + '/api/symptom-report', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text}), signal
  }));
  const data = await resp.json().catch(()=>null);
  if(!resp.ok) throw new Error((data && data.error) || `Backend error ${resp.status}`);
  if(!data) throw new Error('Empty response from backend');
  return normalizeAIReport(data);
}

function severityMeta(level){
  return { mild:{label:'Mild', cls:'status-ok'}, moderate:{label:'Moderate', cls:'status-warn'}, severe:{label:'Severe — seek care promptly', cls:'status-danger'} }[level] || {label:'Info', cls:'status-info'};
}
function renderSymptomCard(entry, source){
  const sev = severityMeta(entry.severity);
  const PROVIDER_LABELS = { 'gemini-grounded':'Gemini + Google Search', gemini:'Google Gemini', groq:'Groq', openrouter:'OpenRouter' };
  const providerLabel = PROVIDER_LABELS[entry.provider] || 'AI';
  const sourceTag = source==='ai'
    ? `<span class="status-tag status-info" title="Generated live by ${providerLabel}"><i class="fa-solid fa-wand-magic-sparkles"></i> ${providerLabel}</span>`
    : `<span class="status-tag status-muted" title="Built-in offline knowledge base"><i class="fa-solid fa-database"></i> Local</span>`;
  return `<div class="chat-bubble bot symptom-card">
    <div class="sym-head">
      <div class="sym-head-icon"><i class="${entry.icon}"></i></div>
      <div class="sym-head-title">${entry.title}</div>
      <span class="status-tag ${sev.cls}">${sev.label}</span>
      ${sourceTag}
    </div>
    <div class="sym-body">
      <div class="sym-section"><h5><i class="fa-solid fa-circle-info"></i> Why this happens</h5><p>${entry.basicReason}</p></div>
      <div class="sym-section"><h5><i class="fa-solid fa-layer-group"></i> Possible causes — mild to severe</h5>
        <ul class="sym-cause-list">${entry.causes.map(c=>`<li><span class="sym-cause-dot ${c.level}"></span><span><strong style="text-transform:capitalize;">${c.level}:</strong> ${c.text}</span></li>`).join('')}</ul>
      </div>
      ${entry.possibleDiseases ? `<div class="sym-section"><h5><i class="fa-solid fa-disease"></i> Possible disease names</h5><div style="display:flex;flex-wrap:wrap;gap:6px;">${entry.possibleDiseases.map(d=>`<span class="sym-specialist-tag">${d}</span>`).join('')}</div></div>` : ''}
      ${entry.differentialDiagnosis ? `<div class="sym-section"><h5><i class="fa-solid fa-list-check"></i> Differential diagnosis</h5><ul class="sym-remedy-list">${entry.differentialDiagnosis.map(d=>`<li>${d}</li>`).join('')}</ul></div>` : ''}
      ${entry.confirmatoryDiagnosis ? `<div class="sym-section"><h5><i class="fa-solid fa-vial-circle-check"></i> Confirmatory diagnosis</h5><div class="sym-callout doctor">${entry.confirmatoryDiagnosis}<div style="margin-top:6px;font-size:.72rem;color:var(--text-muted);font-style:italic;">Educational information only — a licensed doctor must confirm any actual diagnosis.</div></div></div>` : ''}
      <div class="sym-section"><h5><i class="fa-solid fa-user-doctor"></i> When to see a doctor</h5><div class="sym-callout doctor">${entry.whenToSeeDoctor}</div></div>
      <div class="sym-section"><h5><i class="fa-solid fa-house-medical-flag"></i> Home remedies / self-care</h5><ul class="sym-remedy-list">${entry.homeRemedies.map(r=>`<li>${r}</li>`).join('')}</ul></div>
      <div class="sym-section"><h5><i class="fa-solid fa-user-nurse"></i> Specialist to consult</h5><span class="sym-specialist-tag"><i class="fa-solid fa-hospital-user"></i> ${entry.specialist}</span></div>
      <div class="sym-section"><h5 style="color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Red flags — seek emergency care if you notice</h5>
        <div class="sym-callout redflag"><ul>${entry.redFlags.map(f=>`<li>${f}</li>`).join('')}</ul></div>
      </div>
    </div>
  </div>`;
}
function renderEmergencyAlert(){
  return `<div class="chat-bubble bot emergency-alert">
    <h5><i class="fa-solid fa-triangle-exclamation"></i> This sounds like a medical emergency</h5>
    <p>Please don't wait on a chat reply — trigger Emergency SOS now, or call your local emergency number immediately. It broadcasts to the nearest hospitals, ambulances, and police at once.</p>
    <button class="btn btn-danger btn-sm" onclick="renderCurrentView('p-sos')"><i class="fa-solid fa-bell"></i> Open Emergency SOS</button>
  </div>`;
}
function renderCrisisSupport(){
  return `<div class="chat-bubble bot emergency-alert">
    <h5><i class="fa-solid fa-heart"></i> You matter, and support is available right now</h5>
    <p>If you're in immediate danger, please call your local emergency number or use Emergency SOS below. You can also reach a crisis helpline to talk to someone right now — in India, KIRAN is available 24/7 at 1800-599-0019. You don't have to go through this alone.</p>
    <button class="btn btn-danger btn-sm" onclick="renderCurrentView('p-sos')"><i class="fa-solid fa-bell"></i> Open Emergency SOS</button>
  </div>`;
}
function renderFallbackCard(){
  return `<div class="chat-bubble bot symptom-card">
    <div class="sym-head"><div class="sym-head-icon"><i class="fa-solid fa-notes-medical"></i></div><div class="sym-head-title">Not sure yet — a bit more detail helps</div></div>
    <div class="sym-body">
      <div class="sym-section"><p>I couldn't confidently match that to a specific symptom in my offline knowledge base yet. Try describing it more specifically — e.g. "sharp pain in my lower right stomach" or "burning when I urinate" — tap a quick prompt below, or turn on AI Settings above for broader coverage.</p></div>
      <div class="sym-section"><h5><i class="fa-solid fa-user-doctor"></i> General guidance</h5><div class="sym-callout doctor">If a symptom is new, persistent (more than a few days), or worsening, it's always reasonable to consult a doctor via Telemedicine rather than wait it out.</div></div>
    </div>
  </div>`;
}
