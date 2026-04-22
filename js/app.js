// UNICHECK app.js v12 

import imageCompression from "https://cdn.jsdelivr.net/npm/browser-image-compression@2.0.2/dist/browser-image-compression.mjs";
import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut, deleteUser, EmailAuthProvider, reauthenticateWithCredential }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, getDoc, query, where, addDoc, deleteDoc,
  doc, updateDoc, setDoc, serverTimestamp, orderBy, limit }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

//  Cart helpers (per-user keys prevent cart bleed between accounts) 
function cartKey(uid){ return uid ? `uniCheckCart_${uid}` : null; }
function loadCartForUser(uid){ try{ return JSON.parse(localStorage.getItem(cartKey(uid)))||[]; }catch(e){ return []; } }
function saveCart(){ if(currentUser) localStorage.setItem(cartKey(currentUser.uid), JSON.stringify(cart)); }

// State 
let userLoggedIn=false,currentUser=null,currentSelectedProduct=null,
    currentSelectedSize=null,currentQuantity=1,
    cart=[],
    currentLevel="home",appliedCoupon=null,
    shippingFee=0,shippingFeeDelivery=80,orderIdToCancel=null,
    userProfile={},deliveryMapInstance=null,deliveryMarker=null,
    deliveryLatLng=null,selectedRating=0,currentReviewProductId=null,
    chatSessionId=null,favorites=[],_refundOrderId=null;
const ALL_SIZES=["S","M","L","XL","1XL","2XL","3XL","4XL","5XL","6XL","7XL"];

// Settings 
// Store-wide settings from Firestore (set by admin)
let storeSettings={
  shippingFee:80,maintenanceMode:false,allowOrders:true,showOutOfStock:true,
  maxOrderQty:99,cancelWindowHours:24,refundWindowDays:7,allowExchange:true,
  storeName:"UniCheck School Official Store",orderCutoffTime:"17:00"
};

let settings=JSON.parse(localStorage.getItem("ucSettings"))||{
  darkMode:false,orderAlerts:true,promos:true,announcements:true,
  compact:false,showEmail:true,showStock:true,saveCart:true,autoFill:true
};
function saveSettings(){localStorage.setItem("ucSettings",JSON.stringify(settings));}
function applySettings(){
  document.documentElement.setAttribute("data-theme",settings.darkMode?"dark":"light");
  const grid=document.getElementById("productGrid");
  if(grid) grid.classList.toggle("compact",settings.compact);
  const emailEl=document.getElementById("userEmailDisplay");
  if(emailEl) emailEl.style.display=settings.showEmail?"":"none";
  if(currentUser){
    const ab=document.getElementById("announcementsBtn");
    if(ab) ab.style.display=settings.announcements?"":"none";
  }
  const toggleMap={darkModeToggle:"darkMode",orderAlertsToggle:"orderAlerts",promoToggle:"promos",
    announceToggle:"announcements",compactToggle:"compact",showEmailToggle:"showEmail",
    showStockToggle:"showStock",saveCartToggle:"saveCart",autoFillToggle:"autoFill"};
  Object.entries(toggleMap).forEach(([id,key])=>{
    const el=document.getElementById(id);if(el) el.checked=settings[key];
  });
}

// QR images 
const QR_IMAGES={
  gcash:"assets/qr_gcash.png",
  maya:"assets/qr_maya.png",
  paypal:"assets/qr_paypal.png"
};

const banners={college:"/assets/images/college_ads.png",shs:"/assets/images/ads4.png",jhs:"/assets/images/ads5.png"};
const filterConfig={
  college:{title:"College Shop",label:"Course",options:["BSIT","BSAIS","BSCS","BSBA","BSHM","BSTM","BSCpE","BACOMM","BMMA"]},
  shs:{title:"SHS Shop",label:"Strand",options:["STEM","ABM","HUMSS","ICT","GAS","Culinary Arts","Digital Arts","IT in Mobile App","Tourism Operations"]},
  jhs:{title:"JHS Shop",label:null,options:[]}
};

//  STI Branch Data — Full Philippines Network
const STI_BRANCHES={
  alabang:      {name:"STI Alabang",           address:"Alabang-Zapote Rd, Muntinlupa City",       lat:14.4081,lng:121.0409,hours:"Mon–Sat 8AM–5PM"},
  alaminos:     {name:"STI Alaminos",          address:"Alaminos, Pangasinan",                      lat:16.1566,lng:119.9816,hours:"Mon–Sat 8AM–5PM"},
  angeles:      {name:"STI Angeles",           address:"McArthur Hwy, Angeles City, Pampanga",     lat:15.1450,lng:120.5887,hours:"Mon–Sat 8AM–5PM"},
  westnegros:   {name:"STI Bacolod – WNU",     address:"La Salle Ave, Bacolod City",               lat:10.6765,lng:122.9509,hours:"Mon–Sat 8AM–5PM"},
  bacoor:       {name:"STI Bacoor",            address:"Molino Blvd, Bacoor, Cavite",              lat:14.4342,lng:120.9741,hours:"Mon–Sat 8AM–5PM"},
  baguio:       {name:"STI Baguio",            address:"Harrison Rd, Baguio City",                 lat:16.4098,lng:120.5960,hours:"Mon–Sat 8AM–5PM"},
  balagtas:     {name:"STI Balagtas",          address:"McArthur Hwy, Balagtas, Bulacan",          lat:14.8158,lng:120.9051,hours:"Mon–Sat 8AM–5PM"},
  balayan:      {name:"STI Balayan",           address:"Rizal St, Balayan, Batangas",              lat:13.9374,lng:120.7266,hours:"Mon–Sat 8AM–5PM"},
  baliuag:      {name:"STI Baliuag",           address:"Dona Remedios Trinidad Hwy, Baliuag",      lat:14.9538,lng:120.8976,hours:"Mon–Sat 8AM–5PM"},
  batangas:     {name:"STI Batangas",          address:"P. Burgos St, Batangas City",              lat:13.7565,lng:121.0583,hours:"Mon–Sat 8AM–5PM"},
  cdo:          {name:"STI Cagayan de Oro",    address:"Osmeña St, Cagayan de Oro City",           lat:8.4822,lng:124.6472,hours:"Mon–Sat 8AM–5PM"},
  calamba:      {name:"STI Calamba",           address:"National Hwy, Calamba City, Laguna",       lat:14.2116,lng:121.1588,hours:"Mon–Sat 8AM–5PM"},
  calbayog:     {name:"STI Calbayog",          address:"Nijaga Park Area, Calbayog City",          lat:12.0736,lng:124.6052,hours:"Mon–Sat 8AM–5PM"},
  caloocan:     {name:"STI Caloocan",          address:"A. Mabini St, Caloocan City",              lat:14.6507,lng:120.9722,hours:"Mon–Sat 8AM–5PM"},
  carmona:      {name:"STI Carmona",           address:"Gov. Drive, Carmona, Cavite",              lat:14.3158,lng:121.0577,hours:"Mon–Sat 8AM–5PM"},
  cauayan:      {name:"STI Cauayan",           address:"Cauayan City, Isabela",                    lat:16.9292,lng:121.7721,hours:"Mon–Sat 8AM–5PM"},
  cotabato:     {name:"STI Cotabato",          address:"Quezon Ave, Cotabato City",                lat:7.2083,lng:124.2310,hours:"Mon–Sat 8AM–5PM"},
  cubao:        {name:"STI Cubao",             address:"Aurora Blvd, Cubao, Quezon City",          lat:14.6218,lng:121.0504,hours:"Mon–Sat 8AM–5PM"},
  dagupan:      {name:"STI Dagupan",           address:"Perez Blvd, Dagupan City, Pangasinan",     lat:16.0433,lng:120.3331,hours:"Mon–Sat 8AM–5PM"},
  dasmarinas:   {name:"STI Dasmariñas",        address:"Aguinaldo Hwy, Dasmariñas, Cavite",        lat:14.3294,lng:120.9367,hours:"Mon–Sat 8AM–5PM"},
  davao:        {name:"STI Davao",             address:"J.P. Laurel Ave, Davao City",              lat:7.0700,lng:125.6128,hours:"Mon–Sat 8AM–5PM"},
  dumaguete:    {name:"STI Dumaguete",         address:"Perdices St, Dumaguete City",              lat:9.3068,lng:123.3054,hours:"Mon–Sat 8AM–5PM"},
  fairview:     {name:"STI Fairview",          address:"Quirino Hwy, Fairview, Quezon City",       lat:14.7282,lng:121.0562,hours:"Mon–Sat 8AM–5PM"},
  gensan:       {name:"STI General Santos",    address:"Santiago Blvd, General Santos City",       lat:6.1128,lng:125.1717,hours:"Mon–Sat 8AM–5PM"},
  globalcity:   {name:"STI Global City",       address:"32nd St, Bonifacio Global City, Taguig",   lat:14.5503,lng:121.0492,hours:"Mon–Sat 8AM–5PM"},
  iligan:       {name:"STI Iligan",            address:"Quezon Ave, Iligan City",                  lat:8.2280,lng:124.2452,hours:"Mon–Sat 8AM–5PM"},
  kalibo:       {name:"STI Kalibo",            address:"Martyrs St, Kalibo, Aklan",                lat:11.7067,lng:122.3639,hours:"Mon–Sat 8AM–5PM"},
  koronadal:    {name:"STI Koronadal",         address:"General Santos Drive, Koronadal City",     lat:6.5035,lng:124.8417,hours:"Mon–Sat 8AM–5PM"},
  laoag:        {name:"STI Laoag",             address:"Rizal St, Laoag City, Ilocos Norte",       lat:18.1964,lng:120.5936,hours:"Mon–Sat 8AM–5PM"},
  laspinas:     {name:"STI Las Piñas",         address:"Alabang-Zapote Rd, Las Piñas City",        lat:14.4453,lng:120.9933,hours:"Mon–Sat 8AM–5PM"},
  legazpi:      {name:"STI Legazpi",           address:"Rizal St, Legazpi City, Albay",            lat:13.1391,lng:123.7438,hours:"Mon–Sat 8AM–5PM"},
  lipa:         {name:"STI Lipa",              address:"C.M. Recto Ave, Lipa City, Batangas",      lat:13.9411,lng:121.1634,hours:"Mon–Sat 8AM–5PM"},
  lucena:       {name:"STI Lucena",            address:"Quezon Ave, Lucena City",                  lat:13.9302,lng:121.6170,hours:"Mon–Sat 8AM–5PM"},
  maasin:       {name:"STI Maasin",            address:"Maasin City, Southern Leyte",              lat:10.1322,lng:124.8457,hours:"Mon–Sat 8AM–5PM"},
  malaybalay:   {name:"STI Malaybalay",        address:"Fortich St, Malaybalay City, Bukidnon",    lat:8.1574,lng:125.1282,hours:"Mon–Sat 8AM–5PM"},
  malolos:      {name:"STI Malolos",           address:"McArthur Hwy, Malolos City, Bulacan",      lat:14.8527,lng:120.8112,hours:"Mon–Sat 8AM–5PM"},
  marikina:     {name:"STI Marikina",          address:"J.P. Rizal Ave, Marikina City",            lat:14.6507,lng:121.1029,hours:"Mon–Sat 8AM–5PM"},
  meycauayan:   {name:"STI Meycauayan",        address:"McArthur Hwy, Meycauayan, Bulacan",        lat:14.7351,lng:120.9600,hours:"Mon–Sat 8AM–5PM"},
  munoz:        {name:"STI Munoz-EDSA",        address:"EDSA cor. Munoz Ave, Quezon City",         lat:14.6537,lng:121.0017,hours:"Mon–Sat 8AM–5PM"},
  naga:         {name:"STI Naga",              address:"Elias Angeles St, Naga City",              lat:13.6218,lng:123.1942,hours:"Mon–Sat 8AM–5PM"},
  novaliches:   {name:"STI Novaliches",        address:"Quirino Hwy, Novaliches, Quezon City",     lat:14.7073,lng:121.0326,hours:"Mon–Sat 8AM–5PM"},
  ormoc:        {name:"STI Ormoc",             address:"Aviles St, Ormoc City, Leyte",             lat:11.0064,lng:124.6077,hours:"Mon–Sat 8AM–5PM"},
  ortigascainta:{name:"STI Ortigas-Cainta",    address:"Ortigas Ave Ext, Cainta, Rizal",           lat:14.5795,lng:121.1175,hours:"Mon–Sat 8AM–5PM"},
  pasayedsa:    {name:"STI Pasay-EDSA",        address:"EDSA, Pasay City",                         lat:14.5388,lng:121.0006,hours:"Mon–Sat 8AM–5PM"},
  puertoprincesa:{name:"STI Puerto Princesa",  address:"Rizal Ave, Puerto Princesa, Palawan",      lat:9.7398,lng:118.7353,hours:"Mon–Sat 8AM–5PM"},
  rosario:      {name:"STI Rosario",           address:"Rosario, Cavite",                          lat:14.4152,lng:120.8520,hours:"Mon–Sat 8AM–5PM"},
  sanfernando:  {name:"STI San Fernando",      address:"McArthur Hwy, San Fernando, Pampanga",     lat:15.0289,lng:120.6902,hours:"Mon–Sat 8AM–5PM"},
  sjdelmonte:   {name:"STI San Jose Del Monte",address:"Quirino Hwy, SJDM, Bulacan",              lat:14.8130,lng:121.0455,hours:"Mon–Sat 8AM–5PM"},
  sanjose:      {name:"STI San Jose Nueva Ecija",address:"Maharlika Hwy, San Jose City",          lat:15.7949,lng:121.0948,hours:"Mon–Sat 8AM–5PM"},
  stisanpablo:  {name:"STI San Pablo",         address:"Rizal Ave, San Pablo City, Laguna",        lat:14.0685,lng:121.3247,hours:"Mon–Sat 8AM–5PM"},
  santarosa:    {name:"STI Santa Rosa",        address:"National Hwy, Santa Rosa City, Laguna",    lat:14.3122,lng:121.1114,hours:"Mon–Sat 8AM–5PM"},
  stacruz:      {name:"STI Sta. Cruz",         address:"Bonifacio St, Sta. Cruz, Laguna",          lat:14.2786,lng:121.4178,hours:"Mon–Sat 8AM–5PM"},
  stamaria:     {name:"STI Sta. Maria",        address:"McArthur Hwy, Sta. Maria, Bulacan",        lat:14.8174,lng:120.9613,hours:"Mon–Sat 8AM–5PM"},
  stamesa:      {name:"STI Sta. Mesa",         address:"Nagtahan St, Sta. Mesa, Manila",           lat:14.5994,lng:121.0046,hours:"Mon–Sat 8AM–5PM"},
  surigao:      {name:"STI Surigao",           address:"Rizal St, Surigao City",                   lat:9.7832,lng:125.4957,hours:"Mon–Sat 8AM–5PM"},
  tacurong:     {name:"STI Tacurong",          address:"Tacurong City, Sultan Kudarat",             lat:6.6928,lng:124.6762,hours:"Mon–Sat 8AM–5PM"},
  tagaytay:     {name:"STI Tagaytay",          address:"Tagaytay-Nasugbu Hwy, Tagaytay City",      lat:14.1153,lng:120.9621,hours:"Mon–Sat 8AM–5PM"},
  tagum:        {name:"STI Tagum",             address:"Lapu-Lapu St, Tagum City, Davao del Norte",lat:7.4479,lng:125.8076,hours:"Mon–Sat 8AM–5PM"},
  tanauan:      {name:"STI Tanauan",           address:"JP Laurel Hwy, Tanauan City, Batangas",    lat:14.0862,lng:121.1497,hours:"Mon–Sat 8AM–5PM"},
  tanay:        {name:"STI Tanay",             address:"Imelda Ave, Tanay, Rizal",                 lat:14.4961,lng:121.2872,hours:"Mon–Sat 8AM–5PM"},
  tarlac:       {name:"STI Tarlac",            address:"MacArthur Hwy, Tarlac City",               lat:15.4755,lng:120.5963,hours:"Mon–Sat 8AM–5PM"},
  valencia:     {name:"STI Valencia",          address:"Sayre Hwy, Valencia City, Bukidnon",       lat:7.9062,lng:125.0934,hours:"Mon–Sat 8AM–5PM"},
  vigan:        {name:"STI Vigan",             address:"Quezon Ave, Vigan City, Ilocos Sur",       lat:17.5747,lng:120.3869,hours:"Mon–Sat 8AM–5PM"},
};
let branchMapInstance=null,branchMarkers=[],selectedBranchKey="";

window.initGoogleMaps=function(){
  // Auto-init whichever map is currently visible
  const bDiv=document.getElementById("branchMapDiv");
  const dDiv=document.getElementById("deliveryMapDiv");
  if(bDiv&&bDiv.offsetParent!==null) initBranchMap();
  if(dDiv&&dDiv.offsetParent!==null) initDeliveryMap();
};

function initBranchMap(){
  const mapDiv=document.getElementById("branchMapDiv");
  if(!mapDiv||!window.google) return;
  if(branchMapInstance){ google.maps.event.trigger(branchMapInstance,"resize"); return; }
  const center={lat:12.8797,lng:121.7740}; // Center of Philippines
  branchMapInstance=new google.maps.Map(mapDiv,{
    center,zoom:6,
    mapTypeControl:false,streetViewControl:false,fullscreenControl:false,
    styles:[
      {featureType:"poi",elementType:"labels",stylers:[{visibility:"off"}]},
      {featureType:"transit",elementType:"labels",stylers:[{visibility:"off"}]}
    ]
  });
  // Place pins for all STI branches
  Object.entries(STI_BRANCHES).forEach(([key,branch])=>{
    const marker=new google.maps.Marker({
      position:{lat:branch.lat,lng:branch.lng},
      map:branchMapInstance,
      title:branch.name,
      icon:{
        url:"https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
        scaledSize:new google.maps.Size(40,40)
      }
    });
    const infoWin=new google.maps.InfoWindow({
      content:`<div style="font-family:sans-serif;padding:4px 2px;min-width:180px;">
        <strong style="font-size:.85rem;color:#0057B8;">${branch.name}</strong><br>
        <span style="font-size:.75rem;color:#555;">${branch.address}</span><br>
        <span style="font-size:.72rem;color:#888;margin-top:3px;display:block;">🕐 ${branch.hours}</span>
        <button onclick="window._selectBranchFromMap('${key}')" style="margin-top:7px;background:#0057B8;color:#fff;border:none;border-radius:7px;padding:5px 12px;font-size:.75rem;font-weight:700;cursor:pointer;width:100%;">Select this branch</button>
      </div>`
    });
    marker.addListener("click",()=>{
      branchMarkers.forEach(m=>m.iw?.close());
      infoWin.open(branchMapInstance,marker);
    });
    marker._key=key; marker.iw=infoWin;
    branchMarkers.push(marker);
  });
  // Select branch from map info window
  window._selectBranchFromMap=function(key){
    const sel=document.getElementById("branchSelect");
    if(sel){sel.value=key;}
    selectBranch(key);
    branchMarkers.forEach(m=>m.iw?.close());
  };
}

function selectBranch(key){
  selectedBranchKey=key;
  const branch=STI_BRANCHES[key];
  const infoEl=document.getElementById("branchMapInfo");
  const textEl=document.getElementById("branchMapInfoText");
  if(!branch||!infoEl||!textEl){ if(infoEl) infoEl.style.display="none"; return; }
  textEl.innerHTML=`<strong>${branch.name}</strong><br><span>${branch.address}</span><br><small>🕐 ${branch.hours}</small>`;
  infoEl.style.display="flex";
  // Pan map to branch
  if(branchMapInstance){
    branchMapInstance.panTo({lat:branch.lat,lng:branch.lng});
    branchMapInstance.setZoom(15);
    branchMarkers.forEach(m=>{
      if(m._key===key){
        m.setIcon({url:"https://maps.google.com/mapfiles/ms/icons/yellow-dot.png",scaledSize:new google.maps.Size(44,44)});
      } else {
        m.setIcon({url:"https://maps.google.com/mapfiles/ms/icons/blue-dot.png",scaledSize:new google.maps.Size(36,36)});
      }
    });
  }
}

function initDeliveryMap(){
  const mapDiv=document.getElementById("deliveryMapDiv");
  if(!mapDiv||deliveryMapInstance||!window.google) return;
  const center={lat:14.5547,lng:120.9978};
  deliveryMapInstance=new google.maps.Map(mapDiv,{
    center,zoom:14,
    styles:[{featureType:"poi",elementType:"labels",stylers:[{visibility:"off"}]}],
    mapTypeControl:false,streetViewControl:false,fullscreenControl:false
  });
  deliveryMapInstance.addListener("click",e=>{
    const lat=e.latLng.lat(),lng=e.latLng.lng();
    deliveryLatLng={lat,lng};
    if(deliveryMarker) deliveryMarker.setMap(null);
    deliveryMarker=new google.maps.Marker({position:{lat,lng},map:deliveryMapInstance,title:"Delivery Location",icon:{url:"https://maps.google.com/mapfiles/ms/icons/red-dot.png"}});
    const coordEl=document.getElementById("mapCoordsDisplay");
    if(coordEl){coordEl.style.display="block";coordEl.innerText=`📍 Pinned: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;}
    if(window.google){
      const geocoder=new google.maps.Geocoder();
      geocoder.geocode({location:{lat,lng}},(results,status)=>{
        if(status==="OK"&&results[0]){
          const addrEl=document.getElementById("custAddress");
          if(addrEl) addrEl.value=results[0].formatted_address;
        }
      });
    }
  });
}

// AUTH 
onAuthStateChanged(auth,user=>{
  userLoggedIn=!!user;currentUser=user||null;
  const loginBtn=document.getElementById("loginBtn");
  const userDropdown=document.getElementById("userDropdown");
  const emailDisplay=document.getElementById("userEmailDisplay");
  if(user){
    // ── Email verification guard ──
    if(!user.emailVerified){
      // Sign them out and bounce back to login with a notice
      signOut(auth).then(()=>{
        window.location.href="index.html?unverified=1";
      });
      return;
    }

    if(loginBtn) loginBtn.style.display="none";
    if(userDropdown) userDropdown.style.display="inline-block";
    if(emailDisplay) emailDisplay.innerText=user.email;
   
    cart = loadCartForUser(user.uid);

    startCouponListener(user.uid);
    loadUserProfile(user.uid);
    loadFavorites(user.uid);
    checkAnnouncements();
    if(settings.announcements){const bw=document.getElementById("notifBellWrap");if(bw) bw.style.display="";}
  
    chatSessionId=`chat_${user.uid}`;
  } else {
    if(loginBtn) loginBtn.style.display="inline-block";
    if(userDropdown) userDropdown.style.display="none";
    cart=[];
  }
  updateCartBadge();
});

// DOM READY 
window.addEventListener("DOMContentLoaded",async()=>{
  applySettings();
  await loadShippingSettings();

  const hamburger=document.getElementById("hamburgerBtn");
  const navLinksList=document.getElementById("navLinks");
  const menuOverlay=document.getElementById("menuOverlay");
  const toggleMenu=()=>{
    hamburger?.classList.toggle("active");
    navLinksList?.classList.toggle("active");
    menuOverlay?.classList.toggle("active");
    document.body.classList.toggle("no-scroll");
  };
  hamburger?.addEventListener("click",toggleMenu);
  menuOverlay?.addEventListener("click",toggleMenu);
  document.querySelectorAll(".nav-links a").forEach(link=>{
    link.addEventListener("click",e=>{
      e.preventDefault();
      document.querySelectorAll(".nav-links a").forEach(l=>l.classList.remove("active"));
      link.classList.add("active");
      showSection(link.dataset.section||"home");
      if(navLinksList?.classList.contains("active")) toggleMenu();
    });
  });
  window.showSection=showSection;

  initCarousel("carouselSlide",".carousel-dots");
  initRecSlider();

  // Cart
  document.getElementById("cartBtn")?.addEventListener("click",e=>{e.preventDefault();openCartModal();});
  document.getElementById("closeCart")?.addEventListener("click",()=>{document.getElementById("cartModal").style.display="none";document.body.style.overflow="";});
  document.getElementById("closeModal")?.addEventListener("click",closeProductModal);

  // Size & qty 
  document.getElementById("sizeOptions")?.addEventListener("click",e=>{
    const btn=e.target.closest(".size-btn");
    if(!btn||btn.classList.contains("out-of-stock")) return;
    document.getElementById("sizeError").style.display="none";
    document.querySelectorAll(".size-btn").forEach(b=>b.classList.remove("selected"));
    btn.classList.add("selected");
    currentSelectedSize=btn.dataset.size;
    if(currentSelectedProduct){
      const prices=currentSelectedProduct.prices||{};
      const sp=prices[currentSelectedSize];
      const priceEl=document.getElementById("modalPrice");
      if(priceEl&&sp>0) priceEl.innerText=`₱${Number(sp).toLocaleString()}`;
    }
  });
  document.getElementById("qtyIncrease")?.addEventListener("click",()=>{currentQuantity++;document.getElementById("qtyDisplay").innerText=currentQuantity;});
  document.getElementById("qtyDecrease")?.addEventListener("click",()=>{if(currentQuantity>1){currentQuantity--;document.getElementById("qtyDisplay").innerText=currentQuantity;}});
  document.getElementById("buyNowBtn")?.addEventListener("click",()=>handlePurchase("buy"));
  document.getElementById("addToCartBtn")?.addEventListener("click",()=>handlePurchase("cart"));

  // Favorites
  document.getElementById("favoriteBtn")?.addEventListener("click",toggleFavorite);
  document.getElementById("favoritesBtn")?.addEventListener("click",openFavoritesModal);
  document.getElementById("closeFavoritesModal")?.addEventListener("click",()=>{document.getElementById("favoritesModal").style.display="none";document.body.style.overflow="";});

  // Coupon
  document.getElementById("applyCouponBtn")?.addEventListener("click",applyCoupon);

  // Cart → Checkout
  document.getElementById("checkoutBtn")?.addEventListener("click",openCheckout);

  // Close checkout
  document.getElementById("closeCheckout")?.addEventListener("click",()=>{
    document.getElementById("checkoutModal").style.display="none";
    document.body.style.overflow="";
  });

  // Claiming method cards
  document.querySelectorAll(".claiming-card").forEach(card=>{
    card.addEventListener("click",()=>{
      document.querySelectorAll(".claiming-card").forEach(c=>c.classList.remove("selected"));
      card.classList.add("selected");
      const val=card.querySelector("input[type=radio]").value;
      // sync hidden select for legacy JS
      const sel=document.getElementById("deliveryMethod");
      if(sel) sel.value=val;
      const isDelivery=val==="delivery";
      document.getElementById("addressSection").style.display=isDelivery?"block":"none";
      document.getElementById("onsiteBranchSection").style.display=isDelivery?"none":"block";
      shippingFee=isDelivery?shippingFeeDelivery:0;
      updateCheckoutTotals();
      if(isDelivery){ setTimeout(()=>initDeliveryMap(),300); }
      else { setTimeout(()=>initBranchMap(),300); }
    });
  });

  // Legacy deliveryMethod select (fallback)
  document.getElementById("deliveryMethod")?.addEventListener("change",e=>{
    const isD=e.target.value==="delivery";
    document.getElementById("addressSection").style.display=isD?"block":"none";
    document.getElementById("onsiteBranchSection").style.display=isD?"none":"block";
    shippingFee=isD?shippingFeeDelivery:0;
    updateCheckoutTotals();
    if(isD){setTimeout(()=>initDeliveryMap(),300);}
    else{setTimeout(()=>initBranchMap(),300);}
  });

  // Branch selector
  document.getElementById("branchSelect")?.addEventListener("change",e=>{
    selectBranch(e.target.value);
  });

  // Step navigation
  document.getElementById("goToPaymentBtn")?.addEventListener("click",()=>{
    const name=document.getElementById("custName")?.value.trim();
    const method=document.getElementById("deliveryMethod")?.value;
    const branch=document.getElementById("branchSelect")?.value;
    if(!name){ alert("Please enter your full name."); return; }
    if(method==="onsite"&&!branch){ alert("Please select your STI campus branch."); return; }
    if(method==="delivery"&&!document.getElementById("custAddress")?.value.trim()){ alert("Please enter your delivery address."); return; }
    // advance stepper
    document.getElementById("ckPanel1").style.display="none";
    document.getElementById("ckPanel2").style.display="block";
    document.getElementById("ckStep1").classList.remove("active");
    document.getElementById("ckStep1").classList.add("done");
    document.getElementById("ckStep2").classList.add("active");
  });

  document.getElementById("backToDetailsBtn")?.addEventListener("click",()=>{
    document.getElementById("ckPanel2").style.display="none";
    document.getElementById("ckPanel1").style.display="block";
    document.getElementById("ckStep2").classList.remove("active");
    document.getElementById("ckStep1").classList.remove("done");
    document.getElementById("ckStep1").classList.add("active");
  });

  // Place order from summary button (mirrors form submit)
  document.getElementById("placeOrderSummaryBtn")?.addEventListener("click",()=>{
    const form=document.getElementById("checkoutForm");
    if(form) form.requestSubmit ? form.requestSubmit() : form.submit();
  });

  // Payment QR flow
  document.querySelectorAll(".payment-option").forEach(opt=>{
    opt.addEventListener("click",()=>{
      document.querySelectorAll(".payment-option").forEach(o=>o.classList.remove("selected"));
      opt.classList.add("selected");
      const val=opt.querySelector("input[type=radio]").value;
      updatePaymentQR(val);
    });
  });
  document.getElementById("checkoutForm")?.addEventListener("submit",placeOrder);

  // Reference number input
  document.getElementById("refNumberInput")?.addEventListener("input",e=>{
    const ref=e.target.value.trim();
    const verifiedEl=document.getElementById("refVerifiedMsg");
    if(verifiedEl) verifiedEl.style.display=ref.length>=6?"block":"none";
  });

  // Tracking
  document.getElementById("trackBtn")?.addEventListener("click",e=>{e.preventDefault();openTrackModal();});
  document.getElementById("closeTrackModal")?.addEventListener("click",()=>{document.getElementById("trackModal").style.display="none";document.body.style.overflow="";});

  // Order History
  document.getElementById("orderHistoryBtn")?.addEventListener("click",e=>{e.preventDefault();openOrderHistoryModal();});
  document.getElementById("closeOrderHistoryModal")?.addEventListener("click",()=>{document.getElementById("orderHistoryModal").style.display="none";});

  // Invoice
  document.getElementById("closeInvoiceModal")?.addEventListener("click",()=>{document.getElementById("invoiceModal").style.display="none";});
  document.getElementById("printInvoiceBtn")?.addEventListener("click",printInvoice);

  // Notifications dropdown
  initNotifDropdown();
  document.getElementById("footerAnnouncementsBtn")?.addEventListener("click",e=>{
    e.preventDefault();
    const btn=document.getElementById("announcementsBtn");
    if(btn) btn.click();
  });

  // Footer quick links
  document.getElementById("footerTrackBtn")?.addEventListener("click",e=>{e.preventDefault();openTrackModal();});

  // Account
  document.getElementById("accountBtn")?.addEventListener("click",e=>{e.preventDefault();openAccountModal();});
  document.getElementById("closeAccountModal")?.addEventListener("click",()=>{document.getElementById("accountModal").style.display="none";document.body.style.overflow="";document.body.classList.remove("no-scroll");});
  document.getElementById("saveAccountBtn")?.addEventListener("click",saveAccountChanges);
  document.getElementById("acctAvatarFile")?.addEventListener("change",async e=>{
    const file=e.target.files[0];if(!file) return;
    showToast("Compressing photo…");
    const b64=await compressAndRead(file);
    userProfile.avatarUrl=b64;setAvatarDisplay(b64);showToast("Photo selected! Click Save to apply.");
  });

  // Delete account
  document.getElementById("deleteAccountBtn")?.addEventListener("click",()=>{
    document.getElementById("accountModal").style.display="none";
    document.getElementById("deletePasswordInput").value="";
    document.getElementById("deleteAccountMsg").innerText="";
    document.getElementById("accountModal").style.display="none";document.body.style.overflow="";document.getElementById("deleteAccountModal").style.display="flex";
  });
  document.getElementById("confirmDeleteAccountBtn")?.addEventListener("click",confirmDeleteAccount);

  // Cancel
  document.getElementById("closeCancelModal")?.addEventListener("click",()=>{document.getElementById("cancelModal").style.display="none";orderIdToCancel=null;});
  document.getElementById("closeRefundModal")?.addEventListener("click",()=>{document.getElementById("refundModal").style.display="none";document.body.style.overflow="";_refundOrderId=null;});
  document.getElementById("confirmCancelBtn")?.addEventListener("click",executeCancel);

  // Settings
  document.getElementById("settingsBtn")?.addEventListener("click",e=>{e.preventDefault();applySettings();document.getElementById("settingsModal").style.display="flex";document.body.style.overflow="hidden";});
  document.getElementById("closeSettingsModal")?.addEventListener("click",()=>{document.getElementById("settingsModal").style.display="none";document.body.style.overflow="";});
  const bindToggle=(id,key)=>{
    const el=document.getElementById(id);if(!el) return;
    el.checked=settings[key];
    el.addEventListener("change",()=>{settings[key]=el.checked;saveSettings();applySettings();});
  };
  bindToggle("darkModeToggle","darkMode");bindToggle("orderAlertsToggle","orderAlerts");
  bindToggle("promoToggle","promos");bindToggle("announceToggle","announcements");
  bindToggle("compactToggle","compact");bindToggle("showEmailToggle","showEmail");
  bindToggle("showStockToggle","showStock");bindToggle("saveCartToggle","saveCart");
  bindToggle("autoFillToggle","autoFill");
  document.getElementById("clearCartBtn")?.addEventListener("click",()=>{
    if(!confirm("Clear your entire cart?")) return;
    cart=[];
    if(currentUser) localStorage.removeItem(cartKey(currentUser.uid));updateCartBadge();showToast("Cart cleared.");
  });
  document.getElementById("clearDataBtn")?.addEventListener("click",()=>{
    if(!confirm("Reset all preferences?")) return;
    localStorage.removeItem("ucSettings");
    settings={darkMode:false,orderAlerts:true,promos:true,announcements:true,compact:false,showEmail:true,showStock:true,saveCart:true,autoFill:true};
    saveSettings();applySettings();showToast("Preferences reset.");
  });

  // Rating modal
  document.querySelectorAll(".star-input").forEach(star=>{
    star.addEventListener("mouseover",()=>highlightStars(parseInt(star.dataset.val)));
    star.addEventListener("mouseout",()=>highlightStars(selectedRating));
    star.addEventListener("click",()=>{selectedRating=parseInt(star.dataset.val);highlightStars(selectedRating);});
  });
  document.getElementById("submitReviewBtn")?.addEventListener("click",submitReview);

  // Logout
  document.getElementById("logoutBtn")?.addEventListener("click",e=>{e.preventDefault();signOut(auth).then(()=>{window.location.href="index.html";});});

  // Chatbot
  initChatbot();

  showSection("home");
  loadHomeData();
  updateCartBadge();
});

// SHIPPING 
async function loadShippingSettings(){
  try{
    const s=await getDoc(doc(db,"settings","store"));
    if(s.exists()){
      const d=s.data();
      shippingFeeDelivery            = d.shippingFee??80;
      storeSettings.shippingFee      = d.shippingFee??80;
      storeSettings.maintenanceMode  = d.maintenanceMode===true;
      storeSettings.allowOrders      = d.allowOrders!==false;
      storeSettings.showOutOfStock   = d.showOutOfStock!==false;
      storeSettings.maxOrderQty      = d.maxOrderQty||99;
      storeSettings.cancelWindowHours= d.cancelWindowHours||24;
      storeSettings.refundWindowDays = d.refundWindowDays||7;
      storeSettings.allowExchange    = d.allowExchange!==false;
      storeSettings.storeName        = d.storeName||"UniCheck School Official Store";
      storeSettings.orderCutoffTime  = d.orderCutoffTime||"17:00";
      applyStoreSettings();
    }
  }catch(e){}
}

function applyStoreSettings(){
  // Maintenance banner
  let banner=document.getElementById("maintenanceBanner");
  if(storeSettings.maintenanceMode){
    if(!banner){
      banner=document.createElement("div");
      banner.id="maintenanceBanner";
      banner.style.cssText="position:fixed;top:0;left:0;right:0;z-index:9999;background:#D97706;color:#fff;text-align:center;padding:10px 16px;font-weight:700;font-size:.88rem;display:flex;align-items:center;justify-content:center;gap:8px;";
      banner.innerHTML='<span class="material-icons" style="font-size:16px;">construction</span> Store is under maintenance. Orders are temporarily unavailable.';
      document.body.prepend(banner);
    }
  } else { if(banner) banner.remove(); }
  // Store name in title
  if(storeSettings.storeName) document.title=storeSettings.storeName+" | Merchandise";
  // Cut-off time warning
  const now=new Date();
  const parts=(storeSettings.orderCutoffTime||"17:00").split(":");
  const cutoff=new Date(now);cutoff.setHours(Number(parts[0]),Number(parts[1]||0),0,0);
  let cutWarn=document.getElementById("cutoffWarn");
  if(now>cutoff){
    if(!cutWarn){
      cutWarn=document.createElement("div");cutWarn.id="cutoffWarn";
      cutWarn.style.cssText="background:#FFF3CD;color:#856404;text-align:center;padding:6px 12px;font-size:.78rem;font-weight:600;position:relative;z-index:100;";
      cutWarn.textContent="Orders placed after "+storeSettings.orderCutoffTime+" will be processed the next business day.";
      const nav=document.querySelector("nav")||document.querySelector("header");
      if(nav) nav.after(cutWarn); else document.body.prepend(cutWarn);
    }
  } else { if(cutWarn) cutWarn.remove(); }
}

//  HOME DATA 

//  DASHBOARD INIT 
function initDashboard(){
 
  const h=new Date().getHours();
  const greet=h<12?"Good morning ☀️":h<17?"Good afternoon 👋":"Good evening 🌙";
  const grEl=document.getElementById("dashGreeting");
  if(grEl) grEl.innerText=greet;
  const nameEl=document.getElementById("dashUserName");
  if(nameEl&&userProfile.username) nameEl.innerText=userProfile.username;
  else if(nameEl&&currentUser) nameEl.innerText=currentUser.email?.split("@")[0]||"Student";
  updateDashStats();
}
function updateDashStats(){
  const cartEl=document.getElementById("dscCartCount");
  const total=cart.reduce((a,i)=>a+i.quantity,0);
  if(cartEl) cartEl.innerText=total>0?`${total} item${total>1?"s":""}  in bag`:"Empty bag";
}

async function loadHomeData(){
  try{
    const snap=await getDocs(collection(db,"products"));
    const products=[];snap.forEach(d=>products.push({id:d.id,...d.data()}));
    renderRecommended(products);renderLimitedOffers(products);
  }catch(e){}

  if(currentUser){
    try{
      const oSnap=await getDocs(query(collection(db,"orders"),where("userId","==",currentUser.uid)));
      const activeOrders=[];
      oSnap.forEach(d=>{const s=d.data().status;if(s!=="Delivered"&&s!=="Cancelled")activeOrders.push(d);});
      const el=document.getElementById("dscOrderCount");
      if(el) el.innerText=activeOrders.length>0?`${activeOrders.length} active`:"No active orders";
    }catch(e){}
  }
}

//  REC SLIDER 
function initRecSlider(){
  const track=document.getElementById("recommendedGrid");
  const prevBtn=document.getElementById("recPrev");
  const nextBtn=document.getElementById("recNext");
  if(!track||!prevBtn||!nextBtn) return;
  let offset=0;
  const step=()=>{
    const cards=track.querySelectorAll(".rec-card");
    if(!cards.length) return 214;
    return cards[0].offsetWidth+14;
  };
  prevBtn.addEventListener("click",()=>{
    offset=Math.max(0,offset-step());
    track.style.transform=`translateX(-${offset}px)`;
  });
  nextBtn.addEventListener("click",()=>{
    const maxOffset=Math.max(0,track.scrollWidth-track.parentElement.offsetWidth+28);
    offset=Math.min(maxOffset,offset+step());
    track.style.transform=`translateX(-${offset}px)`;
  });
}
function renderRecommended(products){
  const grid=document.getElementById("recommendedGrid");if(!grid) return;
  if(!products.length){grid.innerHTML=`<p style="color:var(--muted);">No products yet.</p>`;return;}
  grid.innerHTML=products.slice(0,12).map(p=>{
    const salePrice=p.salePrice&&p.salePrice<p.price?p.salePrice:null;
    const discPct=salePrice?Math.round((1-salePrice/p.price)*100):0;
    const levelLabel=(p.level||'').toUpperCase();
    return `<div class="rec-card" onclick="openProductModal('${p.id}')">
      <div class="rec-card-img-wrap">
        <img src="${p.imageUrl||''}" onerror="this.src='https://placehold.co/200x148/f0f2f7/adb5bd?text=No+Image'">
        ${salePrice?`<span class="rec-card-sale-dot">-${discPct}%</span>`:''}
      </div>
      <div class="rec-card-body">
        ${levelLabel?`<div class="rec-card-level">${levelLabel}</div>`:''}
        <h4>${p.name}</h4>
        <div class="rec-card-price-row">
          <p>₱${Number(salePrice||p.price).toLocaleString()}</p>
          ${salePrice?`<span class="rec-card-orig">₱${p.price.toLocaleString()}</span>`:''}
        </div>
      </div>
    </div>`;
  }).join("");
}
// LIMITED OFFERS
const _limTimers=[];
function _clearLimTimers(){_limTimers.forEach(t=>clearInterval(t));_limTimers.length=0;}

function renderLimitedOffers(products){
  const grid=document.getElementById("specialOffersGrid");
  const section=document.getElementById("limitedOffersSection");
  if(!grid) return;
  _clearLimTimers();
  const now=Date.now();
  const items=products.filter(p=>{
    if(!p.isLimited) return false;
    if(!p.limitedUntil) return true;
    const end=p.limitedUntil.toDate?p.limitedUntil.toDate():new Date(p.limitedUntil);
    return end.getTime()>now;
  });
  if(!items.length){
    if(section) section.style.display="none";
    return;
  }
  if(section) section.style.display="";
  grid.innerHTML=items.map(p=>{
    const hasSale=p.salePrice&&p.salePrice<p.price;
    const discPct=hasSale?Math.round((1-p.salePrice/p.price)*100):0;
    const displayPrice=hasSale?p.salePrice:p.price;
    const imgSrc=Array.isArray(p.images)&&p.images.length?p.images[0]:(p.imageUrl||'');
    const hasEnd=!!p.limitedUntil;
    return `<div class="offer-card" onclick="openProductModal('${p.id}')">
      <span class="offer-badge-strip hot">⏳ Limited</span>
      ${hasSale?`<span class="offer-discount-ribbon">-${discPct}%</span>`:""}
      <div class="offer-img"><img src="${imgSrc}" onerror="this.src='https://placehold.co/280x180/f0f2f7/adb5bd?text=Product'" loading="lazy"></div>
      <div class="offer-body">
        <h4>${p.name}</h4>
        <p>${p.description||"Official Item"}</p>
        <div class="offer-price-row">
          <span class="offer-price">₱${Number(displayPrice).toLocaleString()}</span>
          ${hasSale?`<span class="offer-original">₱${Number(p.price).toLocaleString()}</span><span class="offer-discount">-${discPct}%</span>`:""}
        </div>
        ${hasEnd
          ?`<div class="limited-countdown" id="lcd-${p.id}"><span class="material-icons" style="font-size:13px;vertical-align:middle;">timer</span> <span class="lcd-text">--:--:--</span></div>`
          :`<div class="limited-countdown limited-no-expiry"><span class="material-icons" style="font-size:13px;vertical-align:middle;">all_inclusive</span> While supplies last</div>`
        }
      </div>
    </div>`;
  }).join("");

  items.forEach(p=>{
    if(!p.limitedUntil) return;
    const endMs=p.limitedUntil.toDate?p.limitedUntil.toDate().getTime():new Date(p.limitedUntil).getTime();
    const el=document.getElementById("lcd-"+p.id);
    if(!el) return;
    const txt=el.querySelector(".lcd-text");
    function tick(){
      const diff=endMs-Date.now();
      if(diff<=0){
        if(txt) txt.textContent="Expired";
        el.classList.add("lcd-expired");
        setTimeout(()=>renderLimitedOffers(products.filter(x=>x.id!==p.id)),1500);
        return;
      }
      const dd=Math.floor(diff/86400000);
      const hh=Math.floor((diff%86400000)/3600000);
      const mm=Math.floor((diff%3600000)/60000);
      const ss=Math.floor((diff%60000)/1000);
      if(txt) txt.textContent=dd>0
        ?`${dd}d ${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`
        :`${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
    }
    tick();
    _limTimers.push(setInterval(tick,1000));
  });
}
window.openProductModal=async function(id){
  try{const s=await getDoc(doc(db,"products",id));if(s.exists()) openModal(s.id,s.data());}catch(e){}
};

//  SECTION 
// Section order for direction detection
const SECTION_ORDER = ["home","college","shs","jhs"];

function showSection(target){
  const prevLevel = currentLevel;
  currentLevel = target;

  const homeEl   = document.getElementById("homeSection");
  const storeEl  = document.getElementById("storeSection");
  const activeEl = target === "home" ? homeEl : storeEl;
  const hiddenEl = target === "home" ? storeEl : homeEl;

  // Determine slide direction: going right (+) or left (−)
  const prevIdx = SECTION_ORDER.indexOf(prevLevel);
  const nextIdx = SECTION_ORDER.indexOf(target);
  const goingRight = nextIdx > prevIdx;

  // If same element is already showing, no transition needed
  if(activeEl === hiddenEl || activeEl.style.display !== "none"){
    // Still update store content if needed
    if(target !== "home"){
      const banner=document.getElementById("storeBanner");
      if(banner&&banners[target]) banner.src=banners[target];
      buildSidebar(target); loadProducts(target);
    }
    return;
  }

  // Prep incoming element (off-screen)
  activeEl.style.display = "block";
  activeEl.style.transform = goingRight ? "translateX(48px)" : "translateX(-48px)";
  activeEl.style.opacity = "0";
  activeEl.style.transition = "none";
  activeEl.style.pointerEvents = "none";
  void activeEl.offsetWidth; // force reflow

  // Animate out the old element
  hiddenEl.style.transition = "transform 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease";
  hiddenEl.style.transform = goingRight ? "translateX(-48px)" : "translateX(48px)";
  hiddenEl.style.opacity = "0";

  // Animate in the new element
  activeEl.style.transition = "transform 0.36s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.3s ease";
  activeEl.style.transform = "translateX(0)";
  activeEl.style.opacity = "1";
  activeEl.style.pointerEvents = "";

  // After transition: hide old, clean up
  setTimeout(()=>{
    hiddenEl.style.display = "none";
    hiddenEl.style.transform = "";
    hiddenEl.style.opacity = "";
    hiddenEl.style.transition = "";
    activeEl.style.transform = "";
    activeEl.style.opacity = "";
    activeEl.style.transition = "";
  }, 360);

  if(target !== "home"){
    const banner=document.getElementById("storeBanner");
    if(banner&&banners[target]) banner.src=banners[target];
    buildSidebar(target); loadProducts(target);
  }
}

//  SIDEBAR 
function buildSidebar(level){
  const sidebar=document.getElementById("storeSidebar");
  const cfg=filterConfig[level];if(!sidebar||!cfg) return;
  sidebar.innerHTML=`
    <h3>${cfg.title}</h3>
    <div class="search-box"><input type="text" id="searchInput" placeholder="Search products..."><span class="material-icons">search</span></div>
    <span class="filter-label">Sort by Price</span>
    <select class="filter-dropdown" id="priceSortSelect"><option value="">Default</option><option value="asc">Low → High</option><option value="desc">High → Low</option></select>
    ${cfg.options.length?`<span class="filter-label">${cfg.label}</span>
    <div class="filter-chip-row" id="programChips">
      <span class="filter-chip active" data-prog="">All</span>
      ${cfg.options.map(o=>`<span class="filter-chip" data-prog="${o.toLowerCase().replace(/\s+/g,'-')}">${o}</span>`).join('')}
    </div>`:''}
    <span class="filter-label">Type</span>
    <div class="filter-chip-row" id="typeChips">
      <span class="filter-chip active" data-type="">All</span>
      <span class="filter-chip" data-type="uniform">Uniform</span>
      <span class="filter-chip" data-type="peripheral">Accessories</span>
    </div>
    <div class="filter-chip-row" style="margin-top:4px;">
      <span class="filter-chip" id="onSaleChip" data-sale="0">On Sale</span>
    </div>`;
  document.getElementById("searchInput")?.addEventListener("input",()=>loadProducts(level));
  document.getElementById("priceSortSelect")?.addEventListener("change",()=>loadProducts(level));
  document.getElementById("onSaleChip")?.addEventListener("click",e=>{
    e.target.dataset.sale=e.target.dataset.sale==="1"?"0":"1";
    e.target.classList.toggle("active",e.target.dataset.sale==="1");
    loadProducts(level);
  });
  sidebar.querySelectorAll("#programChips .filter-chip").forEach(c=>{
    c.addEventListener("click",()=>{sidebar.querySelectorAll("#programChips .filter-chip").forEach(x=>x.classList.remove("active"));c.classList.add("active");loadProducts(level);});
  });
  sidebar.querySelectorAll("#typeChips .filter-chip").forEach(c=>{
    c.addEventListener("click",()=>{sidebar.querySelectorAll("#typeChips .filter-chip").forEach(x=>x.classList.remove("active"));c.classList.add("active");loadProducts(level);});
  });
}

//  PRODUCTS 
async function loadProducts(level){
  const grid=document.getElementById("productGrid");if(!grid) return;
  if(settings.compact) grid.classList.add("compact");else grid.classList.remove("compact");
  grid.innerHTML=`<div style="text-align:center;padding:52px 20px;color:var(--muted);grid-column:1/-1;"><span class="material-icons" style="font-size:2rem;display:block;margin-bottom:9px;animation:spin 1s linear infinite;color:var(--blue);">autorenew</span>Loading products...</div>`;
  try{
    const search=document.getElementById("searchInput")?.value.toLowerCase()||"";
    const sort=document.getElementById("priceSortSelect")?.value||"";
    const prog=document.querySelector("#programChips .filter-chip.active")?.dataset.prog||"";
    const typeFilter=document.querySelector("#typeChips .filter-chip.active")?.dataset.type||"";
    const onSale=document.getElementById("onSaleChip")?.dataset.sale==="1";
    const snap=await getDocs(collection(db,"products"));
    let products=[];snap.forEach(d=>{const p=d.data();if(p.level===level) products.push({id:d.id,...p});});
    if(search) products=products.filter(p=>p.name?.toLowerCase().includes(search)||p.description?.toLowerCase().includes(search));
    if(prog) products=products.filter(p=>p.program===prog);
    if(typeFilter) products=products.filter(p=>p.type===typeFilter);
    if(onSale) products=products.filter(p=>p.salePrice&&p.salePrice<p.price);
    if(!storeSettings.showOutOfStock){
      products=products.filter(p=>{
        const tot=Object.values(p.stock||{}).reduce((a,b)=>a+Number(b),0);
        return tot>0||p.type==="peripheral";
      });
    }
    if(sort==="asc") products.sort((a,b)=>(a.salePrice||a.price)-(b.salePrice||b.price));
    if(sort==="desc") products.sort((a,b)=>(b.salePrice||b.price)-(a.salePrice||a.price));
    grid.innerHTML="";
    if(!products.length){grid.innerHTML=`<div class="empty-products"><span class="material-icons">inventory_2</span><p>No products found.</p></div>`;return;}
    products.forEach(p=>{
      const stock=p.stock||{};const sizes=["S","M","L","XL"];
      const totalStock=Object.values(stock).reduce((a,b)=>a+Number(b),0);
      const lowStock=totalStock>0&&totalStock<=5,outOfStock=totalStock===0;
      const hasSale=p.salePrice&&p.salePrice<p.price;
      const discPct=hasSale?Math.round((1-p.salePrice/p.price)*100):0;
      const stockChips=settings.showStock?sizes.map(s=>{
        const qty=parseInt(stock[s]||0);
        const cls=qty===0?"out":qty<=3?"low":"available";
        return `<span class="stock-size-chip ${cls}">${s}:${qty}</span>`;
      }).join(""):"";
      const card=document.createElement("div");card.className="product-card";card.style.position="relative";
      card.innerHTML=`
        ${hasSale?`<span class="sale-badge">-${discPct}%</span>`:''}
        ${lowStock&&!outOfStock?`<span class="low-stock-badge">Low Stock</span>`:''}
        ${outOfStock?`<span class="low-stock-badge" style="background:var(--red)">Out of Stock</span>`:''}
        <img src="${p.imageUrl||''}" alt="${p.name}" onerror="this.src='https://placehold.co/220x170/f0f2f7/adb5bd?text=No+Image'">
        <div class="card-info">
          <p class="card-level">${p.level?.toUpperCase()||''} · ${p.program?.toUpperCase()||''}</p>
          <h3>${p.name}</h3>
          <p>${hasSale
            ?`<span class="sale-price">₱${p.salePrice.toLocaleString()}</span> <span class="original-price">₱${p.price.toLocaleString()}</span>`
            :`₱${Number(p.price).toLocaleString()}`}</p>
          ${p.type!=="peripheral"&&stockChips?`<div class="card-stock-sizes">${stockChips}</div>`:''}
        </div>`;
      card.addEventListener("click",()=>openModal(p.id,p));grid.appendChild(card);
    });
  }catch(e){grid.innerHTML=`<div class="empty-products"><p>Error loading products.</p></div>`;}
}

//  PRODUCT MODAL 
async function openModal(id,product){
  currentSelectedProduct={id,...product};currentSelectedSize=null;currentQuantity=1;

  //  Name & description 
  document.getElementById("modalName").innerText=product.name||"";
  document.getElementById("modalDescription").innerText=product.description||"No description available.";
  document.getElementById("qtyDisplay").innerText="1";
  document.getElementById("sizeError").style.display="none";

  //  Image gallery 
  const images=Array.isArray(product.images)&&product.images.length?product.images:(product.imageUrl?[product.imageUrl]:[]);
  const mainImg=document.getElementById("modalImageMain");
  const thumbsEl=document.getElementById("modalGalleryThumbs");
  if(mainImg) mainImg.src=images[0]||"https://placehold.co/400x320/f0f2f7/adb5bd?text=No+Image";
  if(thumbsEl){
    thumbsEl.innerHTML="";
    if(images.length>1){
      images.forEach((url,i)=>{
        const th=document.createElement("div");
        th.className=`gallery-thumb${i===0?" active":""}`;
        th.innerHTML=`<img src="${url}" alt="img${i}">`;
        th.addEventListener("click",()=>{
          if(mainImg) mainImg.src=url;
          thumbsEl.querySelectorAll(".gallery-thumb").forEach(t=>t.classList.remove("active"));
          th.classList.add("active");
        });
        thumbsEl.appendChild(th);
      });
    }
  }

  //  Price  (please wag nyo galawin ang hirap nito ayusin)
  const prices=product.prices||{};
  const activePrices=ALL_SIZES.map(s=>prices[s]).filter(p=>p>0);
  const basePrice=activePrices.length?Math.min(...activePrices):(product.price||0);
  const priceEl=document.getElementById("modalPrice");
  if(priceEl) priceEl.innerText=`₱${Number(basePrice).toLocaleString()}`;
  const origEl=document.getElementById("modalOriginalPrice");
  const saleEl=document.getElementById("modalSaleLabel");
  if(origEl) origEl.style.display="none";
  if(saleEl) saleEl.style.display="none";

  //  Size buttons 
  const isPeripheral=product.type==="peripheral";
  const sizeArea=document.getElementById("sizeSelectionArea");
  if(sizeArea) sizeArea.style.display=isPeripheral?"none":"block";
  if(isPeripheral) currentSelectedSize="one-size";

  const sizeOpts=document.getElementById("sizeOptions");
  if(sizeOpts){
    const stock=product.stock||{};
    sizeOpts.innerHTML="";
    let totalStock=0;
    ALL_SIZES.forEach(s=>{
      if(!(s in stock)&&!(s in prices)) return; 
      const qty=parseInt(stock[s]||0);
      const sp=prices[s]||0;
      totalStock+=qty;
      const btn=document.createElement("button");
      btn.className="size-btn"+(qty===0?" out-of-stock":"");
      btn.dataset.size=s;
      btn.innerHTML=`${s}<span class="size-stock-count">${qty===0?"Out":`${qty}`}</span>${sp>0?`<span class="size-price-tag">₱${Number(sp).toLocaleString()}</span>`:""}`;
      sizeOpts.appendChild(btn);
    });
    const ss=document.getElementById("sizeStockStatus");
    if(ss) ss.innerText=totalStock===0?"⚠️ Currently out of stock":"";
  }

  //  Favorite state 
  updateFavoriteBtn(id);

  //  Ratings 
  await loadProductRatings(id);
  currentReviewProductId=id;
  document.getElementById("reviewProductName").innerText=product.name||"";
  document.getElementById("productModal").style.display="flex";
  document.body.style.overflow="hidden";
}
function closeProductModal(){document.getElementById("productModal").style.display="none";document.body.style.overflow="";}

//  RATINGS 
async function loadProductRatings(productId){
  try{
    const snap=await getDocs(query(collection(db,"reviews"),where("productId","==",productId)));
    const reviews=[];snap.forEach(d=>reviews.push({id:d.id,...d.data()}));
    if(!reviews.length){
      document.getElementById("modalAvgStars").innerText="☆☆☆☆☆";
      document.getElementById("modalAvgScore").innerText="";
      document.getElementById("modalRatingCount").innerText="No reviews yet";
      document.getElementById("reviewList").innerHTML=`<p style="color:var(--muted);font-size:.82rem;padding:8px 0;">No reviews yet. Be the first!</p>`;
      return;
    }
    const avg=(reviews.reduce((a,r)=>a+r.rating,0)/reviews.length).toFixed(1);
    const stars="★".repeat(Math.round(avg))+"☆".repeat(5-Math.round(avg));
    document.getElementById("modalAvgStars").innerText=stars;
    document.getElementById("modalAvgScore").innerText=avg;
    document.getElementById("modalRatingCount").innerText=`(${reviews.length} review${reviews.length>1?"s":""})`;
    reviews.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    const listEl=document.getElementById("reviewList");
    listEl.innerHTML=reviews.map(r=>{
      const starStr="★".repeat(r.rating)+"☆".repeat(5-r.rating);
      const date=r.createdAt?.toDate?new Date(r.createdAt.toDate()).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"}):"";
      return `<div class="review-item">
        <div class="review-header">
          <span class="review-user">${r.username||"Student"}</span>
          <span class="review-stars">${starStr}</span>
        </div>
        ${r.comment?`<p class="review-text">"${r.comment}"</p>`:''}
        <p class="review-date">${date}</p>
      </div>`;
    }).join("");
  }catch(e){}
}
window.openReviewForm=function(){
  if(!userLoggedIn){showToast("Please login to write a review.","error");return;}
  selectedRating=0;highlightStars(0);
  document.getElementById("reviewComment").value="";
  document.getElementById("reviewMsg").innerText="";
  document.getElementById("reviewModal").style.display="flex";
};
function highlightStars(val){
  document.querySelectorAll(".star-input").forEach(s=>{
    s.classList.toggle("active",parseInt(s.dataset.val)<=val);
  });
}
async function submitReview(){
  if(!currentUser){showToast("Please login.","error");return;}
  if(selectedRating===0){document.getElementById("reviewMsg").innerText="Please select a star rating.";document.getElementById("reviewMsg").style.color="var(--red)";return;}
  const comment=document.getElementById("reviewComment").value.trim();
  const btn=document.getElementById("submitReviewBtn");
  btn.disabled=true;btn.innerText="Submitting...";
  try{
    // Check if user already reviewed this product
    const existing=await getDocs(query(collection(db,"reviews"),where("productId","==",currentReviewProductId),where("userId","==",currentUser.uid)));
    if(!existing.empty){
      // Update existing
      await updateDoc(doc(db,"reviews",existing.docs[0].id),{rating:selectedRating,comment,updatedAt:new Date()});
    }else{
      await addDoc(collection(db,"reviews"),{
        productId:currentReviewProductId,userId:currentUser.uid,
        username:userProfile.username||currentUser.email?.split("@")[0]||"Student",
        rating:selectedRating,comment,createdAt:serverTimestamp()
      });
    }
    // Update product avgRating
    const snap=await getDocs(query(collection(db,"reviews"),where("productId","==",currentReviewProductId)));
    const ratings=[];snap.forEach(d=>ratings.push(d.data().rating));
    const avg=ratings.reduce((a,b)=>a+b,0)/ratings.length;
    await updateDoc(doc(db,"products",currentReviewProductId),{avgRating:parseFloat(avg.toFixed(1)),reviewCount:ratings.length});
    document.getElementById("reviewMsg").innerText="✓ Review submitted!";document.getElementById("reviewMsg").style.color="var(--green)";
    showToast("Review submitted! ✓");
    setTimeout(()=>{document.getElementById("reviewModal").style.display="none";loadProductRatings(currentReviewProductId);},1200);
  }catch(e){document.getElementById("reviewMsg").innerText="Failed to submit. Try again.";document.getElementById("reviewMsg").style.color="var(--red)";}
  finally{btn.disabled=false;btn.innerText="Submit Review";}
}

//  PURCHASE 
function handlePurchase(action){
  if(!userLoggedIn){showToast("Please login to shop!","error");return;}
  if(storeSettings.maintenanceMode){showToast("Store is under maintenance. Please try again later.","error");return;}
  if(!storeSettings.allowOrders){showToast("New orders are temporarily paused. Please check back soon.","error");return;}
  if(!currentSelectedProduct) return;
  const isPeripheral=currentSelectedProduct.type==="peripheral";
  if(!isPeripheral&&!currentSelectedSize){document.getElementById("sizeError").style.display="block";return;}
  const prices=currentSelectedProduct.prices||{};
  const sizePrice=currentSelectedSize&&prices[currentSelectedSize]>0?prices[currentSelectedSize]:null;
  const effectivePrice=sizePrice||(currentSelectedProduct.salePrice&&currentSelectedProduct.salePrice<currentSelectedProduct.price
    ?currentSelectedProduct.salePrice:currentSelectedProduct.price);
  const item={id:currentSelectedProduct.id,name:currentSelectedProduct.name,
    price:effectivePrice,originalPrice:currentSelectedProduct.price,
    imageUrl:currentSelectedProduct.imageUrl||"",size:currentSelectedSize||"one-size",
    quantity:currentQuantity,level:currentSelectedProduct.level,program:currentSelectedProduct.program};
  const maxQty=storeSettings.maxOrderQty||99;
  if(item.quantity>maxQty){showToast("Max "+maxQty+" per item allowed.","error");return;}
  if(action==="cart"){
    const ex=cart.find(c=>c.id===item.id&&c.size===item.size);
    if(ex&&ex.quantity+item.quantity>maxQty){showToast("Max "+maxQty+" of this item in your bag.","error");return;}
    if(ex) ex.quantity+=item.quantity;else cart.push(item);
    saveCart();
    updateCartBadge();closeProductModal();showToast(`${item.name} added to bag! 🛍️`);
  }else{
    const ex=cart.find(c=>c.id===item.id&&c.size===item.size);
    if(ex) ex.quantity+=item.quantity;else cart.push(item);
    saveCart();
    updateCartBadge();closeProductModal();openCheckout();
  }
}

//  CART 
function updateCartBadge(){
  const total=cart.reduce((a,i)=>a+i.quantity,0);
  const badge=document.getElementById("cartCount");if(!badge) return;
  badge.style.display=total>0?"flex":"none";if(total>0) badge.innerText=total;
  updateDashStats();
}
function openCartModal(){document.getElementById("cartModal").style.display="flex";document.body.style.overflow="hidden";renderCart();}
function renderCart(){
  const container=document.getElementById("cartContainer");if(!container) return;
  // Update item count in header
  const countEl=document.getElementById("cartItemCount");
  const total=cart.reduce((a,i)=>a+i.quantity,0);
  if(countEl) countEl.innerText=total===0?"Your bag is empty":`${total} item${total!==1?"s":""} in your bag`;
  if(!cart.length){
    container.innerHTML=`<div class="cart-empty-state"><span class="material-icons">shopping_bag</span><p>Your bag is empty</p><span>Browse our store to add items</span></div>`;
    updateCartSummary();return;
  }
  container.innerHTML=cart.map((item,i)=>`
    <div class="cart-item">
      <img src="${item.imageUrl}" onerror="this.src='https://placehold.co/64x64/f0f2f7/adb5bd?text=?'">
      <div class="cart-item-info">
        <h4>${item.name}</h4>
        <p class="cart-item-meta">Size: ${item.size?.toUpperCase()} · ₱${Number(item.price).toLocaleString()} each</p>
        <div class="cart-item-controls">
          <button class="cart-qty-btn" onclick="changeCartQty(${i},-1)">−</button>
          <span class="cart-qty-display">${item.quantity}</span>
          <button class="cart-qty-btn" onclick="changeCartQty(${i},1)">+</button>
          <button class="cart-remove" onclick="removeCartItem(${i})"><span class="material-icons" style="font-size:16px;">delete</span></button>
        </div>
      </div>
      <span class="cart-item-price">₱${(item.price*item.quantity).toLocaleString()}</span>
    </div>`).join("");
  updateCartSummary();
}
window.changeCartQty=function(i,d){
  const maxQty=storeSettings.maxOrderQty||99;
  const newQty=cart[i].quantity+d;
  if(newQty>maxQty){showToast("Max "+maxQty+" per item.","error");return;}
  cart[i].quantity=Math.max(1,newQty);
  saveCart();updateCartBadge();renderCart();
};
window.removeCartItem=function(i){cart.splice(i,1);saveCart();updateCartBadge();renderCart();};
function updateCartSummary(){
  const subtotal=cart.reduce((a,i)=>a+i.price*i.quantity,0);
  const discount=calcDiscount(subtotal);const total=Math.max(0,subtotal-discount);
  const setEl=(id,val)=>{const el=document.getElementById(id);if(el) el.innerText=val;};
  setEl("summarySubtotal",`₱${subtotal.toLocaleString()}`);setEl("summaryTotal",`₱${total.toLocaleString()}`);
  const dr=document.getElementById("discountRow");
  if(dr){dr.style.display=discount>0?"flex":"none";setEl("summaryDiscount",`−₱${discount.toLocaleString()}`);}
}
async function applyCoupon(){
  const code=document.getElementById("couponInput")?.value.trim().toUpperCase();
  const msgEl=document.getElementById("couponMsg");
  if(!code){if(msgEl){msgEl.innerText="Enter a promo code.";msgEl.style.color="var(--red)";}return;}
  try{
    const snap=await getDoc(doc(db,"coupons",code));
    if(!snap.exists()||!snap.data().active){if(msgEl){msgEl.innerText="Invalid or expired code.";msgEl.style.color="var(--red)";}appliedCoupon=null;updateCartSummary();updateCheckoutTotals();return;}
    appliedCoupon={code,...snap.data()};
    const label=appliedCoupon.type==="percent"?`${appliedCoupon.value}% off`:`₱${appliedCoupon.value} off`;
    if(msgEl){msgEl.innerText=`✓ Code "${code}" applied: ${label}`;msgEl.style.color="var(--green)";}
    updateCartSummary();
    updateCheckoutTotals();
    // Also update QR display amount
    const activePayment=document.querySelector(".payment-option.selected input[type=radio]")?.value||"cod";
    if(["gcash","maya","paypal"].includes(activePayment)) updatePaymentQR(activePayment);
  }catch(e){if(msgEl){msgEl.innerText="Error checking code.";msgEl.style.color="var(--red)";}}
}
function calcDiscount(subtotal){
  if(!appliedCoupon) return 0;
  if(appliedCoupon.type==="percent") return Math.round(subtotal*appliedCoupon.value/100);
  if(appliedCoupon.type==="fixed") return Math.min(appliedCoupon.value,subtotal);
  return 0;
}

// PAYMENT QR FLOW 
function updatePaymentQR(method){
  const qrBox=document.getElementById("paymentQrBox");
  const qrImg=document.getElementById("paymentQrImage");
  const instrEl=document.getElementById("qrInstructionText");
  const gcashEl=document.getElementById("gcashDetails"); // legacy, not used
  if(["gcash","maya","paypal"].includes(method)){
    qrBox.classList.add("visible");
    qrImg.src=QR_IMAGES[method];
    const subtotal=cart.reduce((a,i)=>a+i.price*i.quantity,0);
    const discount=calcDiscount(subtotal);const shipping=shippingFee;
    const total=Math.max(0,subtotal-discount+shipping);
    document.getElementById("qrAmountDisplay").innerText=`₱${total.toLocaleString()}`;
    instrEl.innerText=`Step 1: Scan the ${method.toUpperCase()} QR code and pay the exact amount.`;
  }else{
    qrBox.classList.remove("visible");
  }
}

//  CHECKOUT 
function openCheckout(){
  if(!cart.length){showToast("Your bag is empty!","error");return;}
  if(!userLoggedIn){showToast("Please login to checkout!","error");return;}
  document.getElementById("cartModal").style.display="none";
  const couponMsgEl=document.getElementById("couponMsg");
  const couponInputEl=document.getElementById("couponInput");
  if(appliedCoupon && couponMsgEl && couponInputEl){
    couponInputEl.value=appliedCoupon.code;
    const label=appliedCoupon.type==="percent"?`${appliedCoupon.value}% off`:`₱${appliedCoupon.value} off`;
    couponMsgEl.innerText=`✓ Code "${appliedCoupon.code}" applied: ${label}`;
    couponMsgEl.style.color="var(--green)";
  } else if(couponMsgEl){ couponMsgEl.innerText=""; }
  updateCheckoutTotals();
  // Auto-fill name
  if(settings.autoFill&&userProfile.username){
    const nameEl=document.getElementById("custName");
    if(nameEl&&!nameEl.value) nameEl.value=userProfile.username;
  }
  // Reset stepper to step 1
  document.getElementById("ckPanel1").style.display="block";
  document.getElementById("ckPanel2").style.display="none";
  ["ckStep1","ckStep2","ckStep3"].forEach(id=>{
    document.getElementById(id)?.classList.remove("active","done");
  });
  document.getElementById("ckStep1")?.classList.add("active");
  // Default: onsite — show branch section
  document.getElementById("onsiteBranchSection").style.display="block";
  document.getElementById("addressSection").style.display="none";
  // Reset claiming cards
  document.querySelectorAll(".claiming-card").forEach(c=>c.classList.remove("selected"));
  document.querySelector(".claiming-card[id='claimOnsite']")?.classList.add("selected");
  document.getElementById("deliveryMethod").value="onsite";
  // Reset payment QR
  updatePaymentQR("cod");
  // Summary items
  const summaryEl=document.getElementById("checkoutSummaryItems");
  if(summaryEl) summaryEl.innerHTML=cart.map(i=>`
    <div class="checkout-summary-item">
      <div class="csi-info"><p class="csi-name">${i.name}</p><p class="csi-meta">${i.size?.toUpperCase()} · ×${i.quantity}</p></div>
      <span class="csi-price">₱${(i.price*i.quantity).toLocaleString()}</span>
    </div>`).join("");
  document.getElementById("checkoutModal").style.display="flex";
  document.body.style.overflow="hidden";
  // Init branch map after render
  setTimeout(()=>initBranchMap(),400);
}
function updateCheckoutTotals(){
  const subtotal=cart.reduce((a,i)=>a+i.price*i.quantity,0);
  const discount=calcDiscount(subtotal);const shipping=shippingFee;const total=Math.max(0,subtotal-discount+shipping);
  const setEl=(id,val)=>{const el=document.getElementById(id);if(el) el.innerText=val;};
  setEl("checkoutSubtotal",`₱${subtotal.toLocaleString()}`);
  setEl("checkoutShippingLabel",shipping>0?`₱${shipping.toLocaleString()}`:"Free");
  setEl("checkoutTotal",`₱${total.toLocaleString()}`);
  // Update QR amount too
  document.getElementById("qrAmountDisplay")&&(document.getElementById("qrAmountDisplay").innerText=`₱${total.toLocaleString()}`);
  const dr=document.getElementById("checkoutDiscountRow");
  if(dr){dr.style.display=discount>0?"flex":"none";setEl("checkoutDiscountLabel",`−₱${discount.toLocaleString()}`);}
}

//  PLACE ORDER 
async function placeOrder(e){
  e.preventDefault();
  const btn=document.getElementById("placeOrderSummaryBtn");
  if(btn&&btn.disabled) return;
  if(storeSettings.maintenanceMode){showToast("Store is under maintenance.","error");return;}
  if(!storeSettings.allowOrders){showToast("New orders are temporarily paused.","error");return;}
  if(btn){btn.disabled=true;btn.innerHTML='<span class="material-icons" style="font-size:16px;animation:spin 1s linear infinite">autorenew</span> Placing Order…';}

  try{
    const user=auth.currentUser;
    if(!user){showToast("Session expired. Please login again.","error");return;}

    const name=document.getElementById("custName").value.trim();
    const method=document.getElementById("deliveryMethod").value;
    const address=document.getElementById("custAddress")?.value.trim()||"";
    const payment=document.querySelector(".payment-option.selected input[type=radio]")?.value||"cod";
    const refNumber=document.getElementById("refNumberInput")?.value.trim()||"";
    const subtotal=cart.reduce((a,i)=>a+i.price*i.quantity,0);
    const discount=calcDiscount(subtotal);const shipping=shippingFee;
    const total=Math.max(0,subtotal-discount+shipping);
    // Branch info for onsite orders
    const branchKey=document.getElementById("branchSelect")?.value||"";
    const branchData=STI_BRANCHES[branchKey]||null;
    const pickupAddress=branchData?`${branchData.name} — ${branchData.address}`:"School Campus Pick-up";

    // Validate QR payment reference
    if(["gcash","maya","paypal"].includes(payment)&&refNumber.length<6){
      showToast("Please enter a valid reference number (min 6 characters).","error");
      return;
    }

    // Check stock
    for(const item of cart){
      const snap=await getDoc(doc(db,"products",item.id));
      if(!snap.exists()) throw new Error(`Product "${item.name}" not found.`);
      const stock=snap.data().stock||{};
      const sizeKey=stock[item.size]!==undefined?item.size:item.size?.toUpperCase();
      if((parseInt(stock[sizeKey])||0)<item.quantity) throw new Error(`Not enough stock for ${item.name} (${item.size?.toUpperCase()}).`);
    }

    // Create order
    const orderData={
      userId:user.uid,userEmail:user.email,customerName:name,method,
      address:method==="delivery"?address:pickupAddress,
      branchKey:method==="onsite"?branchKey:null,
      deliveryLatLng:method==="delivery"?(deliveryLatLng||null):(branchData?{lat:branchData.lat,lng:branchData.lng}:null),
      payment,refNumber,items:cart,subtotal,discount,
      shippingFee:shipping,totalAmount:total,
      couponCode:appliedCoupon?.code||null,
      paymentStatus:["gcash","maya","paypal"].includes(payment)?"pending_verification":"paid",
      status:"Pending",tracking:"",createdAt:serverTimestamp()
    };
    const orderRef=await addDoc(collection(db,"orders"),orderData);

    // Deduct stock
    for(const item of cart){
      const snap=await getDoc(doc(db,"products",item.id));
      if(snap.exists()){
        const stock=snap.data().stock||{};
        const sizeKey=stock[item.size]!==undefined?item.size:item.size?.toUpperCase();
        await updateDoc(doc(db,"products",item.id),{
          [`stock.${sizeKey}`]:Math.max(0,(parseInt(stock[sizeKey])||0)-item.quantity)
        });
      }
    }

    const placedItems=[...cart],placedTotal=total,orderId=orderRef.id;

    // Clear state
    cart=[];appliedCoupon=null;deliveryLatLng=null;
    // cart cleared above; saveCart() already removed via empty array
    if(currentUser) localStorage.removeItem(cartKey(currentUser.uid));
    renderCart();updateCartBadge();

    // Send chat message to admin if QR payment
    if(["gcash","maya","paypal"].includes(payment)&&refNumber){
      await sendChatToAdmin(`Hi! I just placed order #${orderId.substring(0,8).toUpperCase()} and paid via ${payment.toUpperCase()}. Reference number: ${refNumber}. Amount: ₱${total.toLocaleString()}. Please verify my payment. Thank you!`);
    }

    document.getElementById("checkoutModal").style.display="none";document.body.style.overflow="";
    showToast("Order placed! 🎉 Check My Orders to track it.");
    setTimeout(()=>showInvoice({id:orderId,customerName:name,items:placedItems,subtotal,discount,shippingFee:shipping,totalAmount:placedTotal,payment,method,refNumber}),500);

  }catch(err){
    console.error("Order error:",err);
    showToast(err.message||"Failed to place order. Please try again.","error");
  }finally{
    const btn=document.getElementById("placeOrderSummaryBtn");
    if(btn){btn.disabled=false;btn.innerHTML='<span class="material-icons" style="font-size:18px;">check_circle</span> Place Order';}
  }
}

//  INVOICE 
function showInvoice(order){
  const modal=document.getElementById("invoiceModal");if(!modal) return;
  const shortId=order.id.substring(0,8).toUpperCase();
  const now=new Date().toLocaleDateString("en-PH",{year:"numeric",month:"long",day:"numeric"});
  document.getElementById("invoiceOrderId").innerText=`#${shortId}`;
  document.getElementById("invoiceDate").innerText=now;
  document.getElementById("invoiceCustomer").innerText=order.customerName||"—";
  document.getElementById("invoiceStatus").innerText="Pending";
  document.getElementById("invoicePayment").innerText=`${(order.payment||"cod").toUpperCase()}${order.refNumber?` (Ref: ${order.refNumber})`:""}`;
  const itemsEl=document.getElementById("invoiceItemsList");
  if(itemsEl) itemsEl.innerHTML=(order.items||[]).map(i=>`<div class="invoice-item-row"><span>${i.name} (${i.size?.toUpperCase()}) ×${i.quantity}</span><span>₱${(i.price*i.quantity).toLocaleString()}</span></div>`).join("");
  const totalsEl=document.getElementById("invoiceTotalsArea");
  if(totalsEl) totalsEl.innerHTML=`
    <div class="invoice-total-row"><span>Subtotal</span><span>₱${order.subtotal?.toLocaleString()}</span></div>
    ${order.discount>0?`<div class="invoice-total-row" style="color:var(--green)"><span>Discount</span><span>−₱${order.discount?.toLocaleString()}</span></div>`:''}
    <div class="invoice-total-row"><span>Shipping</span><span>${order.shippingFee>0?`₱${order.shippingFee.toLocaleString()}`:'Free'}</span></div>
    <div class="invoice-total-row grand"><span>Total</span><span>₱${order.totalAmount?.toLocaleString()}</span></div>`;
  const qrEl=document.getElementById("invoiceQrCanvas");
  if(qrEl){qrEl.innerHTML="";if(window.QRCode){try{new window.QRCode(qrEl,{text:`UNICHECK:${order.id}|AMT:${order.totalAmount}|${now}`,width:78,height:78,colorDark:"#003a80",colorLight:"#ffffff"});}catch(e){}}}
  modal.style.display="flex";
}
function printInvoice(){
  const content=document.getElementById("invoicePrintContent");if(!content) return;
  const printWin=window.open("","_blank","width=600,height=800");
  printWin.document.write(`<!DOCTYPE html><html><head><title>UniCheck Receipt</title>
  <style>body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#0D1B2E;font-size:13px}
  .hdr{background:#003a80;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0}
  .hdr h2{font-size:1.1rem;margin:0}.hdr p{font-size:.72rem;opacity:.72;margin:2px 0 0}
  .body{padding:16px 0}.meta{display:flex;justify-content:space-between;margin-bottom:14px}
  .meta p{color:#5E6E87;font-size:.73rem;margin-bottom:1px}.meta strong{font-size:.82rem}
  .items{border-top:1px solid #E2E6EF;padding-top:11px;margin-bottom:11px}
  .row{display:flex;justify-content:space-between;padding:3px 0;font-size:.8rem}
  .totals{border-top:1px solid #E2E6EF;padding-top:9px}
  .grand{font-weight:800;font-size:.88rem;border-top:2px solid #0D1B2E;padding-top:6px;margin-top:3px}
  .footer{text-align:center;margin-top:16px;font-size:.7rem;color:#5E6E87;border-top:1px solid #E2E6EF;padding-top:11px}
  canvas,img{max-width:78px;max-height:78px}</style></head>
  <body><div class="hdr"><h2>UniCheck — Digital Invoice</h2><p>STI Official Merchandise Receipt</p></div>
  <div class="body">${content.innerHTML}</div>
  <div class="footer"><p>Thank you for shopping at UniCheck! Keep this for your records.</p></div>
  </body></html>`);
  printWin.document.close();printWin.focus();setTimeout(()=>{printWin.print();},600);
}
window.showOrderInvoice=function(order){showInvoice(order);};

//  TRACKING 
async function openTrackModal(){
  const user=auth.currentUser;
  if(!user){showToast("Please login to view orders!","error");return;}
  const modal=document.getElementById("trackModal");
  const listEl=document.getElementById("userOrderList");
  modal.style.display="flex";document.body.style.overflow="hidden";
  listEl.innerHTML=`<div style="text-align:center;padding:34px;color:var(--muted);"><span class="material-icons" style="font-size:2rem;animation:spin 1s linear infinite;display:block;margin-bottom:9px;color:var(--blue);">autorenew</span>Loading orders...</div>`;
  try{
    const q=query(collection(db,"orders"),where("userId","==",user.uid));
    const snap=await getDocs(q);
    if(snap.empty){listEl.innerHTML=`<div class="empty-msg"><span class="material-icons" style="font-size:2.6rem;opacity:.2;display:block;margin-bottom:9px;">receipt_long</span>No orders yet. Start shopping!</div>`;return;}
    listEl.innerHTML="";
    const orders=[];snap.forEach(d=>orders.push({id:d.id,...d.data()}));
    orders.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    orders.forEach(order=>{
      const status=order.status||"Pending";
      const imgUrl=order.items?.[0]?.imageUrl||"https://placehold.co/58x58/f0f2f7/adb5bd?text=?";
      const canCancel=status.toLowerCase()==="pending";
      const steps=["Pending","Approved","Processing","Shipped","Delivered"];
      const curIdx=steps.findIndex(s=>s.toLowerCase()===status.toLowerCase());
      const isCancelled=status.toLowerCase()==="cancelled";
      const timelineHtml=!isCancelled?steps.map((step,i)=>{
        const done=i<curIdx,current=i===curIdx;
        return `<div class="timeline-step"><div class="timeline-dot ${done?'done':current?'current':''}">${done?'✓':''}</div><div><p class="timeline-label">${step}</p>${current&&order.tracking?`<p class="timeline-sub">${order.tracking}</p>`:''}</div></div>`;
      }).join(""):`<div style="color:var(--red);font-size:.81rem;padding:6px 0;">❌ Order was cancelled.</div>`;
      const showMap=["shipped","delivered"].includes(status.toLowerCase());
      // Use Google Maps with actual coords if available
      const lat=order.deliveryLatLng?.lat||14.5547;const lng=order.deliveryLatLng?.lng||120.9978;
      const mapHtml=showMap?`<div class="tracking-map-container"><iframe src="https://www.google.com/maps/embed/v1/place?key=AIzaSyBjb36R5_7TrBXbIXvnJdWuAQYYbYtThRo&q=${lat},${lng}&zoom=15" allowfullscreen="" loading="lazy"></iframe></div><p style="font-size:.69rem;color:var(--muted);margin-top:4px;">📍 ${order.method==="delivery"?"Delivery location":"Facility location (STI Campus)"}</p>`:'';
      const orderDate=order.createdAt?.toDate?.()
        ?new Date(order.createdAt.toDate()).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"}):"—";
      const itemsSummary=(order.items||[]).map(i=>`${i.name} (${i.size?.toUpperCase()}) × ${i.quantity}`).join(", ");
      const card=document.createElement("div");card.className="order-view-card";
      const safeOrder=JSON.stringify({...order,id:order.id,deliveryLatLng:null}).replace(/</g,"&lt;").replace(/'/g,"\\'");
      card.innerHTML=`
        <div class="order-card-flex">
          <img class="track-prod-img" src="${imgUrl}" onerror="this.src='https://placehold.co/58x58/f0f2f7/adb5bd?text=?'">
          <div class="order-text-details">
            <div class="order-id-row"><span>Order #${order.id.substring(0,8).toUpperCase()}</span><span class="status-pill ${status.toLowerCase()}">${status}</span>
              ${order.paymentStatus==="pending_verification"?`<span style="font-size:.63rem;background:#FFF3CD;color:#856404;padding:2px 6px;border-radius:6px;font-weight:700;">Payment Pending</span>`:''}
            </div>
            <p style="font-size:.75rem;color:var(--muted);margin-top:3px;">${itemsSummary}</p>
            <p style="font-size:.71rem;color:var(--muted);margin-top:2px;">📅 ${orderDate} · ${order.method==="delivery"?"🚚 Delivery":"🏫 Pick-up"}</p>
            <p style="font-weight:800;color:var(--blue);font-size:.87rem;margin-top:3px;">₱${Number(order.totalAmount||0).toLocaleString()}</p>
          </div>
        </div>
        <div class="order-timeline" style="margin-top:12px;">${timelineHtml}</div>
        ${showMap?mapHtml:''}
        <div style="display:flex;gap:7px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);flex-wrap:wrap;">
          <button class="invoice-btn" onclick='showOrderInvoice(${safeOrder})' style="flex:1;"><span class="material-icons" style="font-size:14px;">receipt</span> Invoice</button>
          ${status.toLowerCase()==="delivered"?`<button class="invoice-btn" onclick="openReviewForOrder('${order.id}','${order.items?.[0]?.id||''}','${order.items?.[0]?.name?.replace(/'/g,"\\'")||''}')" style="flex:1;"><span class="material-icons" style="font-size:14px;">rate_review</span> Rate</button><button class="invoice-btn" onclick="openRefundModal('${order.id}')" style="flex:1;background:linear-gradient(135deg,#C2410C18,#EA580C10);color:#C2410C;border-color:#C2410C44;"><span class="material-icons" style="font-size:14px;">assignment_return</span> Refund</button>`:''}
          ${canCancel?`<button class="cancel-order-btn" onclick="initCancelOrder('${order.id}')">Cancel</button>`:''}
        </div>`;
      listEl.appendChild(card);
    });
  }catch(e){listEl.innerHTML=`<p style="color:var(--muted);padding:16px;">Error loading orders.</p>`;}
}
window.openReviewForOrder=function(orderId,productId,productName){
  currentReviewProductId=productId;
  document.getElementById("reviewProductName").innerText=productName||"Product";
  selectedRating=0;highlightStars(0);
  document.getElementById("reviewComment").value="";
  document.getElementById("reviewMsg").innerText="";
  document.getElementById("reviewModal").style.display="flex";
};
window.initCancelOrder=function(id){orderIdToCancel=id;document.getElementById("cancelModal").style.display="flex";};
async function executeCancel(){
  if(!orderIdToCancel) return;
  try{
    const orderRef=doc(db,"orders",orderIdToCancel);
    const orderSnap=await getDoc(orderRef);
    if(orderSnap.exists()){
      const createdAt=orderSnap.data().createdAt?.toDate?.();
      if(createdAt&&storeSettings.cancelWindowHours>0){
        const windowMs=storeSettings.cancelWindowHours*3600000;
        if(Date.now()-createdAt.getTime()>windowMs){
          showToast("Orders can only be cancelled within "+storeSettings.cancelWindowHours+" hour(s) of placing.","error");
          document.getElementById("cancelModal").style.display="none";orderIdToCancel=null;return;
        }
      }
      for(const item of orderSnap.data().items||[]){
        const snap=await getDoc(doc(db,"products",item.id));
        if(snap.exists()){
          const stock=snap.data().stock||{};
          const sizeKey=stock[item.size]!==undefined?item.size:item.size?.toUpperCase();
          await updateDoc(doc(db,"products",item.id),{[`stock.${sizeKey}`]:(parseInt(stock[sizeKey])||0)+item.quantity});
        }
      }
    }
    await updateDoc(orderRef,{status:"Cancelled",updatedAt:new Date()});
    document.getElementById("cancelModal").style.display="none";orderIdToCancel=null;
    showToast("Order cancelled. ✓");openTrackModal();
  }catch(e){showToast("Failed to cancel.","error");}
}

// ── ORDER HISTORY (Delivered orders) ──
async function openOrderHistoryModal(){
  if(!currentUser){showToast("Please login.","error");return;}
  const modal=document.getElementById("orderHistoryModal");
  const listEl=document.getElementById("orderHistoryList");
  modal.style.display="flex";document.body.style.overflow="hidden";
  listEl.innerHTML=`<div style="text-align:center;padding:34px;color:var(--muted);">Loading history...</div>`;
  try{
    const q=query(collection(db,"orders"),where("userId","==",currentUser.uid));
    const snap=await getDocs(q);
    const completed=[];
    snap.forEach(d=>{const o=d.data();if(o.status==="Delivered") completed.push({id:d.id,...o});});
    completed.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    if(!completed.length){listEl.innerHTML=`<div class="empty-msg"><span class="material-icons" style="font-size:2.6rem;opacity:.2;display:block;margin-bottom:9px;">history</span>No completed orders yet.</div>`;return;}
    listEl.innerHTML="";
    // Store items by order id to avoid inline JSON in onclick attributes
    window._reorderMap=window._reorderMap||{};
    completed.forEach(order=>{
      window._reorderMap[order.id]=order.items||[];
      const el=document.createElement("div");el.className="history-card";
      const itemsSummary=(order.items||[]).map(i=>i.name).join(", ");
      const imgUrl=order.items?.[0]?.imageUrl||"https://placehold.co/52x52/f0f2f7/adb5bd?text=?";
      el.innerHTML=`<div class="history-card-flex">
        <img class="history-img" src="${imgUrl}" onerror="this.src='https://placehold.co/52x52/f0f2f7/adb5bd?text=?'">
        <div class="history-info">
          <h4>${itemsSummary}</h4>
          <p>₱${Number(order.totalAmount||0).toLocaleString()} · ${order.items?.length||0} item(s)</p>
          <p style="font-size:.7rem;margin-top:2px;">✅ Delivered</p>
        </div>
        <button class="history-reorder-btn" data-orderid="${order.id}">Reorder</button>
      </div>`;
      el.querySelector(".history-reorder-btn").addEventListener("click",()=>reorderItems(order.id));
      listEl.appendChild(el);
    });
  }catch(e){listEl.innerHTML=`<p style="color:var(--muted);padding:16px;">Error loading history.</p>`;}
}
window.reorderItems=function(orderId){
  try{
    const items=(window._reorderMap&&window._reorderMap[orderId])||[];
    if(!items.length){showToast("No items found for this order.","error");return;}
    items.forEach(item=>{
      const ex=cart.find(c=>c.id===item.id&&c.size===item.size);
      if(ex) ex.quantity+=item.quantity;else cart.push({...item});
    });
    saveCart();
    updateCartBadge();
    document.getElementById("orderHistoryModal").style.display="none";
    showToast("Items added to your bag! 🛍️");
    setTimeout(()=>openCartModal(),300);
  }catch(e){showToast("Could not add items to bag.","error");}
};

// ── REFUND REQUEST ──
window.openRefundModal = async function(orderId) {
  if (!currentUser) { showToast("Please login.", "error"); return; }
  _refundOrderId = orderId;
  const modal = document.getElementById("refundModal");
  const infoEl = document.getElementById("refundOrderInfo");
  // Reset form
  document.getElementById("refundReason").value = "";
  document.getElementById("refundDetails").value = "";
  document.getElementById("refundSubmitMsg").innerText = "";
  clearRefundImage();
  infoEl.innerHTML = `<span style="color:var(--muted);font-size:.82rem;">Loading order info…</span>`;
  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
  try {
    const snap = await getDoc(doc(db, "orders", orderId));
    if (!snap.exists()) { infoEl.innerHTML = `<span style="color:var(--red);">Order not found.</span>`; return; }
    const o = snap.data();
    const itemsSummary = (o.items||[]).map(i => `${i.quantity}× ${i.name} (${(i.size||'').toUpperCase()})`).join(", ");
    const date = o.createdAt?.toDate ? new Date(o.createdAt.toDate()).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"}) : "—";
    infoEl.innerHTML = `
      <div style="font-size:.72rem;font-weight:800;color:var(--muted);letter-spacing:.04em;text-transform:uppercase;margin-bottom:7px;">Order Details</div>
      <div style="font-size:.87rem;font-weight:700;margin-bottom:3px;">Order #${orderId.substring(0,8).toUpperCase()}</div>
      <div style="font-size:.79rem;color:var(--muted);margin-bottom:2px;">📅 ${date}</div>
      <div style="font-size:.79rem;color:var(--muted);">${itemsSummary}</div>
      <div style="font-weight:800;color:var(--blue);font-size:.85rem;margin-top:5px;">₱${Number(o.totalAmount||0).toLocaleString()}</div>`;
  } catch(e) { infoEl.innerHTML = `<span style="color:var(--red);">Could not load order.</span>`; }
};

window.previewRefundImage = function(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast("Image must be under 5MB.", "error"); input.value = ""; return; }
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById("refundImagePreview").src = e.target.result;
    document.getElementById("refundImagePreviewWrap").style.display = "block";
    document.getElementById("refundImgLabelText").innerText = file.name;
  };
  reader.readAsDataURL(file);
};

window.clearRefundImage = function() {
  document.getElementById("refundImageFile").value = "";
  document.getElementById("refundImagePreview").src = "";
  document.getElementById("refundImagePreviewWrap").style.display = "none";
  document.getElementById("refundImgLabelText").innerText = "Tap to attach a photo (jpg, png, max 5MB)";
};

window.submitRefundRequest = async function() {
  if (!currentUser || !_refundOrderId) return;
  const reason = document.getElementById("refundReason").value.trim();
  const details = document.getElementById("refundDetails").value.trim();
  const msgEl = document.getElementById("refundSubmitMsg");
  const btn = document.getElementById("submitRefundBtn");

  if (!reason) { msgEl.style.color = "var(--red)"; msgEl.innerText = "Please select a reason."; return; }
  if (!details || details.length < 10) { msgEl.style.color = "var(--red)"; msgEl.innerText = "Please describe the issue (min 10 characters)."; return; }

  btn.disabled = true;
  btn.innerHTML = `<span class="material-icons" style="font-size:16px;animation:spin 1s linear infinite;">autorenew</span> Submitting…`;
  msgEl.innerText = "";

  try {
    // Upload image if provided
    let refundImageUrl = null;
    const imgFile = document.getElementById("refundImageFile").files[0];
    if (imgFile) {
      // Store as base64 in Firestore (no Firebase Storage required)
      refundImageUrl = document.getElementById("refundImagePreview").src;
    }

    // Update order status to "Refund" and store refund data
    await updateDoc(doc(db, "orders", _refundOrderId), {
      status: "Refund",
      refundReason: reason + (details ? " — " + details : ""),
      refundDetails: details,
      refundImageUrl: refundImageUrl || null,
      refundRequestedAt: new Date(),
      updatedAt: new Date()
    });

    // Notify admin via announcements or just rely on order status change
    msgEl.style.color = "var(--green)";
    msgEl.innerText = "✓ Refund request submitted! Our team will review it within 2–3 business days.";
    btn.innerHTML = `<span class="material-icons" style="font-size:18px;">check_circle</span> Request Submitted`;
    btn.style.background = "var(--green)";

    setTimeout(() => {
      document.getElementById("refundModal").style.display = "none";
      document.body.style.overflow = "";
      _refundOrderId = null;
      openTrackModal(); // Refresh orders list
    }, 2200);
  } catch(e) {
    msgEl.style.color = "var(--red)";
    msgEl.innerText = "Failed to submit. Please try again.";
    btn.disabled = false;
    btn.innerHTML = `<span class="material-icons" style="font-size:18px;">send</span> Submit Refund Request`;
    btn.style.background = "";
  }
};


// ── ANNOUNCEMENTS & NOTIFICATIONS ──
// Two separate sources, merged for display:
// ── NOTIFICATION SYSTEM (dropdown, persistent read/dismiss via localStorage) ──
// Sources: /announcements (general) + /notifications/{uid}/items (personal)

function _notifReadKey(uid)     { return `notif_read_${uid}`; }
function _notifDismissKey(uid)  { return `notif_dismiss_${uid}`; }

function _getReadSet(uid)       { try{return new Set(JSON.parse(localStorage.getItem(_notifReadKey(uid))||"[]"));}catch(e){return new Set();} }
function _getDismissSet(uid)    { try{return new Set(JSON.parse(localStorage.getItem(_notifDismissKey(uid))||"[]"));}catch(e){return new Set();} }
function _saveReadSet(uid,s)    { localStorage.setItem(_notifReadKey(uid), JSON.stringify([...s])); }
function _saveDismissSet(uid,s) { localStorage.setItem(_notifDismissKey(uid), JSON.stringify([...s])); }

async function _fetchAllNotifs() {
  const uid = currentUser?.uid || "";
  if (!uid) return [];
  try {
    const [generalSnap, personalSnap] = await Promise.all([
      getDocs(collection(db, "announcements")),
      getDocs(collection(db, "notifications", uid, "items"))
    ]);
    const items = [];
    generalSnap.forEach(d => items.push({id:d.id, _source:"general", ...d.data()}));
    personalSnap.forEach(d => items.push({id:d.id, _source:"personal", ...d.data()}));
    items.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
    return items;
  } catch(e) { return []; }
}

async function checkAnnouncements(){
  const uid = currentUser?.uid; if(!uid) return;
  const badge = document.getElementById("announceBadge");
  const bellWrap = document.getElementById("notifBellWrap");
  const dismissed = _getDismissSet(uid);
  const read      = _getReadSet(uid);
  try{
    const items = await _fetchAllNotifs();
    const unread = items.filter(d => !dismissed.has(d.id) && !read.has(d.id)).length;
    if(badge){
      badge.textContent = unread > 9 ? "9+" : (unread || "");
      badge.style.display = unread > 0 && settings.announcements ? "flex" : "none";
    }
    if(bellWrap && settings.announcements) bellWrap.style.display = "";
    // Update quick-stat count
    const dscEl = document.getElementById("dscAnnCount");
    if(dscEl) dscEl.textContent = unread > 0 ? `${unread} unread` : "All read";
  }catch(e){}
}

async function loadNotifDropdown(){
  const listEl = document.getElementById("notifList");
  const uid = currentUser?.uid; if(!listEl || !uid) return;
  listEl.innerHTML = `<div class="notif-empty"><span class="material-icons" style="font-size:1.5rem;display:block;margin-bottom:6px;opacity:.3;animation:spin .9s linear infinite;">autorenew</span>Loading…</div>`;
  const dismissed = _getDismissSet(uid);
  const read      = _getReadSet(uid);
  try{
    const items = (await _fetchAllNotifs()).filter(d => !dismissed.has(d.id));
    if(!items.length){
      listEl.innerHTML = `<div class="notif-empty"><span class="material-icons" style="font-size:2rem;display:block;margin-bottom:7px;opacity:.22;">notifications_none</span>You're all caught up!</div>`;
      return;
    }
    listEl.innerHTML = "";
    const tagMeta = {
      info:              {emoji:"📢", color:"#0057B8", bg:"#EFF6FF"},
      sale:              {emoji:"🏷️", color:"#856404", bg:"#FFF3CD"},
      restock:           {emoji:"📦", color:"#059669", bg:"#D1FAE5"},
      pickup:            {emoji:"🗓️", color:"#7C3AED", bg:"#EDE9FE"},
      order_ready:       {emoji:"✅", color:"#059669", bg:"#D1FAE5"},
      payment_verified:  {emoji:"✅", color:"#059669", bg:"#D1FAE5"},
      payment_rejected:  {emoji:"❌", color:"#DC2626", bg:"#FEE2E2"},
      exchange_processed:{emoji:"🔄", color:"#0057B8", bg:"#EFF6FF"},
      warning:           {emoji:"⚠️", color:"#D97706", bg:"#FEF3C7"},
    };
    items.forEach(item => {
      const isRead = read.has(item.id);
      const tag = item.tag || "info";
      const meta = tagMeta[tag] || tagMeta.info;
      const date = item.createdAt?.toDate
        ? new Date(item.createdAt.toDate()).toLocaleDateString("en-PH",{month:"short",day:"numeric"})
        : "";
      const el = document.createElement("div");
      el.className = `notif-item${isRead ? "" : " notif-unread"}`;
      el.dataset.id = item.id;
      el.innerHTML = `
        <div class="notif-item-icon" style="background:${meta.bg};color:${meta.color};">${meta.emoji}</div>
        <div class="notif-item-body">
          ${!isRead ? `<span class="notif-unread-dot"></span>` : ""}
          <p class="notif-item-title">${item.title || "Notification"}</p>
          <p class="notif-item-text">${(item.body||"").replace(/\n/g,"<br>")}</p>
          <p class="notif-item-date">${date}</p>
        </div>
        <div class="notif-item-actions">
          ${!isRead ? `<button class="notif-read-btn" data-id="${item.id}" title="Mark as read"><span class="material-icons">done</span></button>` : ""}
          <button class="notif-dismiss-btn" data-id="${item.id}" title="Remove"><span class="material-icons">close</span></button>
        </div>`;
      // Mark as read
      el.querySelector(".notif-read-btn")?.addEventListener("click", async e => {
        e.stopPropagation();
        const r = _getReadSet(uid); r.add(item.id); _saveReadSet(uid, r);
        await loadNotifDropdown(); await checkAnnouncements();
      });
      // Dismiss (remove permanently)
      el.querySelector(".notif-dismiss-btn").addEventListener("click", async e => {
        e.stopPropagation();
        const d2 = _getDismissSet(uid); d2.add(item.id); _saveDismissSet(uid, d2);
        const r2 = _getReadSet(uid); r2.add(item.id); _saveReadSet(uid, r2);
        el.style.opacity = "0"; el.style.transform = "translateX(12px)";
        el.style.transition = "opacity .22s, transform .22s";
        setTimeout(async () => { el.remove(); await checkAnnouncements(); }, 220);
      });
      listEl.appendChild(el);
    });
  }catch(e){
    listEl.innerHTML = `<div class="notif-empty">Error loading notifications.</div>`;
  }
}

async function markAllNotifsRead(){
  const uid = currentUser?.uid; if(!uid) return;
  const items = await _fetchAllNotifs();
  const r = _getReadSet(uid);
  items.forEach(d => r.add(d.id));
  _saveReadSet(uid, r);
  await loadNotifDropdown();
  await checkAnnouncements();
}

function initNotifDropdown(){
  const bellBtn  = document.getElementById("announcementsBtn");
  const dropdown = document.getElementById("notifDropdown");
  const markAll  = document.getElementById("notifMarkAllBtn");
  if(!bellBtn || !dropdown) return;

  bellBtn.addEventListener("click", e => {
    e.preventDefault(); e.stopPropagation();
    const open = dropdown.classList.contains("open");
    dropdown.classList.toggle("open", !open);
    if(!open) loadNotifDropdown();
  });
  markAll?.addEventListener("click", e => { e.stopPropagation(); markAllNotifsRead(); });
  document.addEventListener("click", e => {
    if(!document.getElementById("notifBellWrap")?.contains(e.target)){
      dropdown.classList.remove("open");
    }
  });
}

// Legacy compat stubs
window.dismissAnnouncement = async function(id){
  const uid = currentUser?.uid; if(!uid) return;
  const d2 = _getDismissSet(uid); d2.add(id); _saveDismissSet(uid, d2);
  await checkAnnouncements();
};
async function openAnnouncementsModal(){ initNotifDropdown(); }

let _couponUnsub=null;
function startCouponListener(uid){
  if(_couponUnsub){_couponUnsub();_couponUnsub=null;}
  const seenKey=`seenCoupons_${uid}`;
  const seen=new Set(JSON.parse(localStorage.getItem(seenKey)||"[]"));
  let isFirst=true;
  const {onSnapshot:_onSnap}=window.__firestoreOnSnapshot||{};
  
  import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js").then(({onSnapshot,collection:col})=>{
    _couponUnsub=onSnapshot(col(db,"coupons"),snap=>{
      if(isFirst){
        snap.forEach(d=>seen.add(d.id));
        localStorage.setItem(seenKey,JSON.stringify([...seen]));
        isFirst=false;return;
      }
      snap.docChanges().forEach(change=>{
        if(change.type==="added"){
          const id=change.doc.id;
          const data=change.doc.data();
          if(!seen.has(id)&&data.active!==false){
            seen.add(id);
            localStorage.setItem(seenKey,JSON.stringify([...seen]));
            showToast(`🎟️ New coupon available: use code "${id}" at checkout!`,"success");
          }
        }
      });
    });
  });
}


//  USER PROFILE 
async function loadUserProfile(uid){
  try{
    const snap=await getDoc(doc(db,"users",uid));
    if(!snap.exists()) return;
    const d=snap.data();userProfile={...d};
    const name=d.username||d.email?.split("@")[0]||"User";
    const dn=document.getElementById("userDisplayName");if(dn) dn.innerText=name;
    const emailEl=document.getElementById("userEmailDisplay");if(emailEl) emailEl.innerText=d.email||"";
    const di=document.getElementById("dropdownAvatarInitial");if(di) di.innerText=name[0].toUpperCase();
    const dimg=document.getElementById("dropdownAvatarImg");
    if(dimg&&d.avatarUrl){dimg.src=d.avatarUrl;dimg.style.display="block";if(di) di.style.display="none";}
    const navIcon=document.getElementById("navAvatarIcon");const navImg=document.getElementById("navAvatarImg");
    if(navImg&&navIcon&&d.avatarUrl){navImg.src=d.avatarUrl;navImg.style.display="block";navIcon.style.display="none";}
    setAvatarDisplay(d.avatarUrl);
    const setInput=(id,val)=>{const el=document.getElementById(id);if(el) el.value=val||"";};
    setInput("editUsername",d.username);setInput("editPhone",d.phone);
    setInput("editAge",d.age);setInput("editAddress",d.address);setInput("editCampus",d.campus||d.city||"");
    const gSel=document.getElementById("editGender");if(gSel) gSel.value=d.gender||"";
    const setEl=(id,val)=>{const el=document.getElementById(id);if(el) el.innerText=val||"—";};
    setEl("acctDisplayName",name);setEl("acctEmail",d.email);
    setEl("acctRole",d.role==="admin"?"Administrator":"Student");
    const initEl=document.getElementById("acctAvatarInitial");if(initEl) initEl.innerText=name[0].toUpperCase();
  }catch(e){}
}
function setAvatarDisplay(url){
  const wrap=document.getElementById("acctAvatarWrap");
  const img=document.getElementById("acctAvatarImg");
  const initial=document.getElementById("acctAvatarInitial");
  if(!wrap) return;
  if(url&&url.length>10){
    if(img){img.src=url;img.style.display="block";}
    if(initial) initial.style.display="none";
  }else{
    if(img) img.style.display="none";
    if(initial){initial.style.display="flex";initial.innerText=(userProfile.email?.[0]||"?").toUpperCase();}
  }
}
function openAccountModal(){
  if(currentUser) loadUserProfile(currentUser.uid);
  document.getElementById("accountModal").style.display="flex";document.body.style.overflow="hidden";document.body.classList.add("no-scroll");
}
async function saveAccountChanges(){
  if(!currentUser){showToast("Not logged in.","error");return;}
  const btn=document.getElementById("saveAccountBtn");
  const msgEl=document.getElementById("acctSaveMsg");
  btn.disabled=true;btn.innerText="Saving...";
  const username=document.getElementById("editUsername").value.trim();
  const phone=document.getElementById("editPhone").value.trim();
  const age=document.getElementById("editAge").value;
  const gender=document.getElementById("editGender").value;
  const address=document.getElementById("editAddress").value.trim();
  const avatarUrl=userProfile.avatarUrl||"";
  try{
    await updateDoc(doc(db,"users",currentUser.uid),{username,phone,age:age?parseInt(age):null,gender,address,avatarUrl,updatedAt:new Date()});
    userProfile={...userProfile,username,phone,age,gender,address,avatarUrl};
    const name=username||currentUser.email?.split("@")[0]||"User";
    const dn=document.getElementById("userDisplayName");if(dn) dn.innerText=name;
    const an=document.getElementById("acctDisplayName");if(an) an.innerText=name;
    const di=document.getElementById("dropdownAvatarInitial");if(di){di.innerText=name[0].toUpperCase();}
    if(avatarUrl&&avatarUrl.length>10){
      const dimg=document.getElementById("dropdownAvatarImg");
      if(dimg){dimg.src=avatarUrl;dimg.style.display="block";if(di) di.style.display="none";}
      const navImg=document.getElementById("navAvatarImg");const navIcon=document.getElementById("navAvatarIcon");
      if(navImg&&navIcon){navImg.src=avatarUrl;navImg.style.display="block";navIcon.style.display="none";}
    }
    if(msgEl){msgEl.innerText="✓ Profile updated!";msgEl.style.color="var(--green)";}
    showToast("Profile saved! ✓");
  }catch(e){
    if(msgEl){msgEl.innerText="Failed to save. Try again.";msgEl.style.color="var(--red)";}
    showToast("Failed to save.","error");
  }finally{btn.disabled=false;btn.innerText="Save Changes";}
}

//  DELETE ACCOUNT 
async function confirmDeleteAccount(){
  const password=document.getElementById("deletePasswordInput").value;
  const msgEl=document.getElementById("deleteAccountMsg");
  const btn=document.getElementById("confirmDeleteAccountBtn");
  if(!password){msgEl.innerText="Please enter your password.";return;}
  btn.disabled=true;btn.innerText="Deleting...";
  try{
    const user=auth.currentUser;
    const credential=EmailAuthProvider.credential(user.email,password);
    await reauthenticateWithCredential(user,credential);
    // Delete Firestore user doc
    await deleteDoc(doc(db,"users",user.uid));
    // Delete Firebase Auth user
    await deleteUser(user);
    showToast("Account deleted successfully.");
    setTimeout(()=>{window.location.href="index.html";},1500);
  }catch(err){
    msgEl.innerText=err.code==="auth/wrong-password"?"Incorrect password. Please try again.":"Failed to delete account. Try again.";
    btn.disabled=false;btn.innerText="Yes, Delete";
  }
}

//  FAVORITES 
async function loadFavorites(uid){
  if(!uid) return;
  try{
    const snap=await getDocs(collection(db,"favorites",uid,"items"));
    favorites=[];
    snap.forEach(d=>favorites.push({id:d.id,...d.data()}));
  }catch(e){console.warn("loadFavorites:",e);}
}
function updateFavoriteBtn(productId){
  const btn=document.getElementById("favoriteBtn");
  const icon=document.getElementById("favoriteIcon");
  if(!btn||!icon) return;
  const isFav=favorites.some(f=>f.id===productId);
  icon.innerText=isFav?"favorite":"favorite_border";
  icon.style.color=isFav?"#e44":"var(--muted)";
}
async function toggleFavorite(){
  if(!currentUser){showToast("Please login to save favorites.","error");return;}
  const p=currentSelectedProduct;if(!p) return;
  const isFav=favorites.some(f=>f.id===p.id);
  const ref=doc(db,"favorites",currentUser.uid,"items",p.id);
  try{
    if(isFav){
      await deleteDoc(ref);
      favorites=favorites.filter(f=>f.id!==p.id);
      showToast("Removed from favorites.");
    }else{
      const fData={name:p.name,imageUrl:p.imageUrl||"",price:p.price,level:p.level,savedAt:serverTimestamp()};
      await setDoc(ref,fData);
      favorites.push({id:p.id,...fData});
      showToast("Added to favorites! ❤️");
    }
    updateFavoriteBtn(p.id);
  }catch(e){showToast("Failed to update favorites.","error");}
}
async function openFavoritesModal(){
  if(!currentUser){showToast("Please login to view favorites.","error");return;}
  const modal=document.getElementById("favoritesModal");
  const listEl=document.getElementById("favoritesList");
  modal.style.display="flex";document.body.style.overflow="hidden";
  listEl.innerHTML=`<div style="text-align:center;padding:34px;color:var(--muted);">Loading...</div>`;
  await loadFavorites(currentUser.uid);
  if(!favorites.length){
    listEl.innerHTML=`<div class="empty-msg"><span class="material-icons" style="font-size:2.6rem;opacity:.2;display:block;margin-bottom:9px;">favorite_border</span>No favorites yet.</div>`;
    return;
  }
  listEl.innerHTML="";
  favorites.forEach(fav=>{
    const el=document.createElement("div");el.className="history-card";
    el.innerHTML=`<div class="history-card-flex">
      <img class="history-img" src="${fav.imageUrl||""}" onerror="this.src='https://placehold.co/52x52/f0f2f7/adb5bd?text=?'">
      <div class="history-info">
        <h4>${fav.name||"Product"}</h4>
        <p style="color:var(--blue);font-weight:700;">₱${Number(fav.price||0).toLocaleString()}</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <button class="history-reorder-btn" data-id="${fav.id}">View</button>
        <button class="history-reorder-btn" data-unfav="${fav.id}" style="background:none;border:1.5px solid #e44;color:#e44;">Remove</button>
      </div>
    </div>`;
    el.querySelector("[data-id]").addEventListener("click",async()=>{
      modal.style.display="none";document.body.style.overflow="";
      try{const s=await getDoc(doc(db,"products",fav.id));if(s.exists())openModal(s.id,s.data());}catch(e){}
    });
    el.querySelector("[data-unfav]").addEventListener("click",async()=>{
      try{
        await deleteDoc(doc(db,"favorites",currentUser.uid,"items",fav.id));
        favorites=favorites.filter(f=>f.id!==fav.id);
        showToast("Removed from favorites.");
        openFavoritesModal();
      }catch(e){showToast("Failed.","error");}
    });
    listEl.appendChild(el);
  });
}

//  CHAT
async function sendChatToAdmin(text, mediaUrl=null, mediaType=null){
  if(!currentUser||!chatSessionId){
    console.warn("Chat: no user or session, skipping Firestore write");
    return;
  }
  try{
    const msgData={
      text:text||"",sender:"user",userId:currentUser.uid,
      userEmail:currentUser.email,
      username:userProfile.username||currentUser.email?.split("@")[0],
      avatarUrl:userProfile.avatarUrl||"",
      createdAt:serverTimestamp(),read:false
    };
    if(mediaUrl){ msgData.mediaUrl=mediaUrl; msgData.mediaType=mediaType||"image"; }
    await addDoc(collection(db,"chats",chatSessionId,"messages"), msgData);
    await setDoc(doc(db,"chats",chatSessionId),{
      userId:currentUser.uid,userEmail:currentUser.email,
      username:userProfile.username||currentUser.email?.split("@")[0],
      avatarUrl:userProfile.avatarUrl||"",
      lastMessage:mediaUrl?"📎 Media":text,lastAt:serverTimestamp(),hasUnread:true
    },{merge:true});
  }catch(e){
    console.error("Chat Firestore error:",e);
  }
}

// IMAGE COMPRESSION UTILITY 
async function compressAndRead(file) {
  if (!file.type.startsWith("image/")) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.7,
      maxWidthOrHeight: 1200,
      useWebWorker: true,
      fileType: "image/jpeg",
      initialQuality: 0.82,
    });
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsDataURL(compressed);
    });
  } catch (err) {
    console.warn("Image compression failed, using original:", err);
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }
}
// Alias for existing callers
const fileToBase64 = compressAndRead;

// Open media lightbox
window.openMediaLightbox=function(src,type){
  let lb=document.getElementById("mediaLightbox");
  if(!lb){
    lb=document.createElement("div");
    lb.id="mediaLightbox";
    lb.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;";
    lb.onclick=()=>lb.remove();
    document.body.appendChild(lb);
  }
  lb.innerHTML="";
  if(type==="video"){
    const v=document.createElement("video");
    v.src=src;v.controls=true;v.style.cssText="max-width:90vw;max-height:90vh;border-radius:12px;";
    lb.appendChild(v);
  } else {
    const img=document.createElement("img");
    img.src=src;img.style.cssText="max-width:90vw;max-height:90vh;border-radius:12px;object-fit:contain;";
    lb.appendChild(img);
  }
  lb.style.display="flex";
};

const botReplies={
  "order":"You can track your orders by clicking 'My Orders' in the top-right menu after logging in.",
  "cancel":"Orders can only be cancelled while in 'Pending' status. Go to My Orders and click 'Cancel'.",
  "size":"We offer sizes S, M, L, and XL. Stock availability is shown on each product.",
  "payment":"We accept Cash on Claim, GCash, Maya, and PayPal. QR-based payments require a reference number.",
  "delivery":"Delivery fees are set by the campus admin. On-site pick-up is always free!",
  "uniform":"We carry official STI uniforms for College, SHS, and JHS students.",
  "stock":"Real-time stock is shown on each product. Sizes with 0 are out of stock.",
  "promo":"Check Announcements for promo codes! Enter them in the cart before checking out.",
  "invoice":"A digital invoice with QR code is generated automatically after placing your order.",
  "refund":"All sales are final. For concerns, contact the campus administrator.",
  "hello":"Hello! 👋 How can I help you today? I'll also forward your message to our admin.",
  "hi":"Hi there! 😊 What can I help you with?",
  "thanks":"You're welcome! Is there anything else I can help you with?",
  "help":"You can ask me about: orders, sizing, payment, delivery, uniforms, or promo codes."
};
function getBotReply(msg){
  const lower=msg.toLowerCase();
  for(const[key,val] of Object.entries(botReplies)){if(lower.includes(key)) return val;}
  return "I've forwarded your message to our admin team. They'll respond here shortly. Thank you for your patience!";
}

function initChatbot(){
  const fab=document.getElementById("chatbotFab");
  const panel=document.getElementById("chatbotPanel");
  const closeBtn=document.getElementById("chatbotClose");
  const input=document.getElementById("chatbotInput");
  const sendBtn=document.getElementById("chatbotSend");
  const messages=document.getElementById("chatbotMessages");
  // Media upload button
  const mediaBtn=document.getElementById("chatMediaBtn");
  const mediaInput=document.getElementById("chatMediaInput");
  mediaBtn?.addEventListener("click",()=>mediaInput?.click());
  mediaInput?.addEventListener("change",async e=>{
    const file=e.target.files[0];if(!file) return;
    const isVideo=file.type.startsWith("video/");
    const isImage=file.type.startsWith("image/");
    if(!isImage&&!isVideo){showToast("Only images and videos allowed.","error");return;}
    if(file.size>10*1024*1024){showToast("File too large (max 10MB).","error");return;}
    // Use Blob URL for instant local preview (no base64 needed for display)
    const blobUrl=URL.createObjectURL(file);
    const prev=document.createElement("div");prev.className="chat-msg user";
    if(isVideo){
      prev.innerHTML=`<video src="${blobUrl}" controls style="max-width:200px;max-height:140px;border-radius:8px;display:block;"></video><span style="font-size:.65rem;opacity:.7;margin-top:3px;display:block;">You</span>`;
    } else {
      prev.innerHTML=`<img src="${blobUrl}" style="max-width:200px;max-height:140px;border-radius:8px;cursor:pointer;display:block;" onclick="openMediaLightbox('${blobUrl}','image')"><span style="font-size:.65rem;opacity:.7;margin-top:3px;display:block;">You</span>`;
    }
    messages?.appendChild(prev);messages.scrollTop=messages.scrollHeight;
    // Compress before storing in Firestore
    const b64=await compressAndRead(file);
    const mediaType=isVideo?"video":"image";
    await sendChatToAdmin("",b64,mediaType);
    URL.revokeObjectURL(blobUrl);
    mediaInput.value="";
  });
  let pollInterval=null;

  const startPolling=()=>{
    if(pollInterval) clearInterval(pollInterval);
    pollInterval=setInterval(()=>{if(!panel?.classList.contains("hidden")) loadAdminReplies();},4000);
  };
  const stopPolling=()=>{if(pollInterval){clearInterval(pollInterval);pollInterval=null;}};

  fab?.addEventListener("click",()=>{
    panel?.classList.toggle("hidden");
    if(!panel?.classList.contains("hidden")){
      input?.focus();
      loadAdminReplies();
      startPolling();
    } else {
      stopPolling();
    }
  });
  closeBtn?.addEventListener("click",()=>{panel?.classList.add("hidden");stopPolling();});

  const sendMessage=async()=>{
    const text=input?.value.trim();if(!text) return;
    if(!currentUser||!chatSessionId){
      addChatMsg("⚠️ Please log in to send messages to admin.","bot");
      return;
    }
    addChatMsg(text,"user");input.value="";
    // Save to Firestore
    const saved=await sendChatToAdmin(text);
    setTimeout(()=>{
      const typing=document.createElement("div");typing.className="chat-typing";typing.innerText="UniCheck is typing...";messages?.appendChild(typing);messages.scrollTop=messages.scrollHeight;
      setTimeout(()=>{typing.remove();addChatMsg(getBotReply(text),"bot");},900);
    },200);
  };
  sendBtn?.addEventListener("click",sendMessage);
  input?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}});
}
async function loadAdminReplies(){
  if(!chatSessionId||!currentUser) return;
  try{
    const snap=await getDocs(query(collection(db,"chats",chatSessionId,"messages"),orderBy("createdAt","asc"),limit(50)));
    const messages=document.getElementById("chatbotMessages");
    if(!messages||snap.empty) return;
    // Only add admin messages not already shown
    snap.forEach(d=>{
      const m=d.data();
      if(m.sender==="admin"){
        const existing=messages.querySelector(`[data-msgid="${d.id}"]`);
        if(!existing){
          const div=document.createElement("div");div.className="chat-msg bot";div.dataset.msgid=d.id;
          let mediaHtml="";
          if(m.mediaUrl){
            if(m.mediaType==="video"){
              mediaHtml=`<video src="${m.mediaUrl}" controls style="max-width:200px;max-height:160px;border-radius:10px;display:block;margin-bottom:${m.text?"4px":"0"};"></video>`;
            } else {
              mediaHtml=`<img src="${m.mediaUrl}" alt="Image" style="max-width:200px;max-height:160px;border-radius:10px;display:block;cursor:pointer;margin-bottom:${m.text?"4px":"0"};" onclick="openMediaLightbox('${m.mediaUrl}','image')">`;
            }
          }
          div.innerHTML=`<strong style="font-size:.7rem;color:var(--blue);display:block;margin-bottom:2px;">Admin</strong>${mediaHtml}${m.text||""}`;
          messages.appendChild(div);messages.scrollTop=messages.scrollHeight;
        }
      }
    });
  }catch(e){}
}
function addChatMsg(text,type){
  const messages=document.getElementById("chatbotMessages");if(!messages) return;
  const div=document.createElement("div");div.className=`chat-msg ${type}`;div.innerText=text;
  messages.appendChild(div);messages.scrollTop=messages.scrollHeight;
}

// ── FOOTER MODALS ──
window.openFooterModal=function(type){
  const modal=document.getElementById("footerModal");
  const titleEl=document.getElementById("footerModalTitle");
  const bodyEl=document.getElementById("footerModalBody");
  const content={
    about:{title:"About UniCheck",body:`<p style="margin-bottom:12px;">UniCheck is the official digital merchandise platform for STI students. Built to streamline the purchase of academic prowear, uniforms, and campus merchandise.</p><p style="margin-bottom:12px;"><strong>Our Mission:</strong> Make it easier for STI students to access official school apparel through a fast, secure, and modern online platform.</p><p><strong>Contact:</strong> Approach the merchandise counter at your STI campus or use the live chat.</p>`},
    contact:{title:"Contact Us",body:`<p style="margin-bottom:12px;"><strong>Campus Store Hours:</strong><br>Monday – Friday: 8:00 AM – 5:00 PM<br>Saturday: 8:00 AM – 12:00 PM</p><p style="margin-bottom:12px;"><strong>Email:</strong> merchandise@sti.edu.ph</p><p>For technical support, use the Live Chat button on this page.</p>`},
    terms:{title:"Terms & Conditions",body:`<p style="margin-bottom:12px;"><strong>1. Eligibility.</strong> UniCheck is exclusively for enrolled STI students with a *.sti.edu.ph email address.</p><p style="margin-bottom:12px;"><strong>2. Purchases.</strong> All sales are final. Orders may only be cancelled while in "Pending" status.</p><p style="margin-bottom:12px;"><strong>3. Pricing.</strong> Prices are in Philippine Pesos (₱) and subject to change without notice.</p><p><strong>4. QR Payments.</strong> Reference numbers must be entered accurately. Admin will verify before processing.</p>`},
    privacy:{title:"Privacy Policy",body:`<p style="margin-bottom:12px;"><strong>Data We Collect:</strong> STI email, name, phone, address, campus, and order history.</p><p style="margin-bottom:12px;"><strong>How We Use It:</strong> Solely for order processing, account management, and order communications.</p><p><strong>Storage:</strong> All data is stored securely in Google Firebase. We do not sell personal data.</p>`},
    returns:{title:"Return Policy",body:`<p style="margin-bottom:12px;">All merchandise sales are <strong>final</strong>. We do not accept returns or exchanges unless:</p><ul style="margin-left:16px;margin-bottom:12px;"><li style="margin-bottom:6px;">The item received is defective</li><li style="margin-bottom:6px;">The wrong item was shipped</li><li>The size is incorrect due to a store error</li></ul><p>For return requests, contact the campus merchandise counter within 3 days of receiving your order.</p>`},
    credits:{title:"Credits & Team",body:`
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;">
          <img src="assets/logo-icon.png" alt="UniCheck" style="height:40px;" onerror="this.style.display='none'">
          <span style="font-weight:800;font-size:1.2rem;color:var(--blue,#003a80);">Unicheck</span>
        </div>
        <p style="font-size:.8rem;color:var(--muted);">UniCheck v4.9 · STI Official Merchandise Platform</p>
        <p style="font-size:.78rem;color:var(--muted);margin-top:4px;">Made with ❤️ for STI students</p>
      </div>
      <p style="font-weight:800;font-size:.92rem;margin-bottom:14px;color:var(--text,#0d1b2a);letter-spacing:.5px;text-transform:uppercase;">👨‍💻 Development Team</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">

        <div style="background:var(--bg2,#f5f7fa);border-radius:14px;padding:16px;border-left:4px solid #003a80;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#003a80,#0057B8);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:1rem;flex-shrink:0;">M1</div>
            <div><p style="font-weight:800;font-size:.88rem;margin:0;">Member Name 1</p><span style="font-size:.75rem;color:var(--blue,#003a80);font-weight:700;background:rgba(0,58,128,.08);padding:2px 8px;border-radius:20px;">Lead Developer</span></div>
          </div>
          <p style="font-size:.78rem;color:var(--muted);margin:0 0 8px;">Full-stack development, Firebase integration, UI/UX architecture and design system.</p>
          <p style="font-size:.76rem;color:var(--text);font-style:italic;border-top:1px solid rgba(0,0,0,.06);padding-top:8px;margin:0;">"Your placeholder quote goes here."</p>
        </div>

        <div style="background:var(--bg2,#f5f7fa);border-radius:14px;padding:16px;border-left:4px solid #FFD600;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#FFD600,#f0b800);display:flex;align-items:center;justify-content:center;color:#003a80;font-weight:800;font-size:1rem;flex-shrink:0;">M2</div>
            <div><p style="font-weight:800;font-size:.88rem;margin:0;">Member Name 2</p><span style="font-size:.75rem;color:#b08800;font-weight:700;background:rgba(255,214,0,.15);padding:2px 8px;border-radius:20px;">Project Manager</span></div>
          </div>
          <p style="font-size:.78rem;color:var(--muted);margin:0 0 8px;">Planning, requirements gathering, timeline management, and quality assurance.</p>
          <p style="font-size:.76rem;color:var(--text);font-style:italic;border-top:1px solid rgba(0,0,0,.06);padding-top:8px;margin:0;">"Your placeholder quote goes here."</p>
        </div>

        <div style="background:var(--bg2,#f5f7fa);border-radius:14px;padding:16px;border-left:4px solid #00C87A;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#00C87A,#00a563);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:1rem;flex-shrink:0;">M3</div>
            <div><p style="font-weight:800;font-size:.88rem;margin:0;">Member Name 3</p><span style="font-size:.75rem;color:#007a4a;font-weight:700;background:rgba(0,200,122,.1);padding:2px 8px;border-radius:20px;">UI/UX Designer</span></div>
          </div>
          <p style="font-size:.78rem;color:var(--muted);margin:0 0 8px;">Interface design, user experience flows, prototyping, and visual identity.</p>
          <p style="font-size:.76rem;color:var(--text);font-style:italic;border-top:1px solid rgba(0,0,0,.06);padding-top:8px;margin:0;">"Your placeholder quote goes here."</p>
        </div>

        <div style="background:var(--bg2,#f5f7fa);border-radius:14px;padding:16px;border-left:4px solid #FF6B35;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#FF6B35,#e85520);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:1rem;flex-shrink:0;">M4</div>
            <div><p style="font-weight:800;font-size:.88rem;margin:0;">Member Name 4</p><span style="font-size:.75rem;color:#b84000;font-weight:700;background:rgba(255,107,53,.1);padding:2px 8px;border-radius:20px;">Backend Developer</span></div>
          </div>
          <p style="font-size:.78rem;color:var(--muted);margin:0 0 8px;">Database architecture, Firestore rules, server-side logic, and API integrations.</p>
          <p style="font-size:.76rem;color:var(--text);font-style:italic;border-top:1px solid rgba(0,0,0,.06);padding-top:8px;margin:0;">"Your placeholder quote goes here."</p>
        </div>

        <div style="background:var(--bg2,#f5f7fa);border-radius:14px;padding:16px;border-left:4px solid #9B59B6;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#9B59B6,#7d3f9a);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:1rem;flex-shrink:0;">M5</div>
            <div><p style="font-weight:800;font-size:.88rem;margin:0;">Member Name 5</p><span style="font-size:.75rem;color:#6c3483;font-weight:700;background:rgba(155,89,182,.1);padding:2px 8px;border-radius:20px;">QA Tester</span></div>
          </div>
          <p style="font-size:.78rem;color:var(--muted);margin:0 0 8px;">Testing, bug reporting, user acceptance testing, and documentation.</p>
          <p style="font-size:.76rem;color:var(--text);font-style:italic;border-top:1px solid rgba(0,0,0,.06);padding-top:8px;margin:0;">"Your placeholder quote goes here."</p>
        </div>

        <div style="background:var(--bg2,#f5f7fa);border-radius:14px;padding:16px;border-left:4px solid #E74C3C;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#E74C3C,#c0392b);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:1rem;flex-shrink:0;">M6</div>
            <div><p style="font-weight:800;font-size:.88rem;margin:0;">Member Name 6</p><span style="font-size:.75rem;color:#922b21;font-weight:700;background:rgba(231,76,60,.1);padding:2px 8px;border-radius:20px;">Content & Marketing</span></div>
          </div>
          <p style="font-size:.78rem;color:var(--muted);margin:0 0 8px;">Content strategy, product photography coordination, and social media assets.</p>
          <p style="font-size:.76rem;color:var(--text);font-style:italic;border-top:1px solid rgba(0,0,0,.06);padding-top:8px;margin:0;">"Your placeholder quote goes here."</p>
        </div>

      </div>
      <p style="font-weight:800;font-size:.88rem;margin-bottom:10px;color:var(--text);">🛠️ Built With</p>
      <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:16px;">
        <span style="background:var(--blue-light,rgba(0,58,128,.08));color:var(--blue,#003a80);padding:4px 10px;border-radius:20px;font-size:.78rem;font-weight:700;">Firebase Firestore</span>
        <span style="background:var(--blue-light,rgba(0,58,128,.08));color:var(--blue,#003a80);padding:4px 10px;border-radius:20px;font-size:.78rem;font-weight:700;">Firebase Auth</span>
        <span style="background:var(--blue-light,rgba(0,58,128,.08));color:var(--blue,#003a80);padding:4px 10px;border-radius:20px;font-size:.78rem;font-weight:700;">Vanilla JS (ES Modules)</span>
        <span style="background:var(--blue-light,rgba(0,58,128,.08));color:var(--blue,#003a80);padding:4px 10px;border-radius:20px;font-size:.78rem;font-weight:700;">Google Maps API</span>
        <span style="background:var(--blue-light,rgba(0,58,128,.08));color:var(--blue,#003a80);padding:4px 10px;border-radius:20px;font-size:.78rem;font-weight:700;">QRCode.js</span>
        <span style="background:var(--blue-light,rgba(0,58,128,.08));color:var(--blue,#003a80);padding:4px 10px;border-radius:20px;font-size:.78rem;font-weight:700;">Material Icons</span>
      </div>
      <p style="font-size:.78rem;color:var(--muted);text-align:center;margin:0;">© 2026 UniCheck · STI Official Merchandise Platform</p>`}
  };
  const c=content[type];if(!c) return;
  titleEl.innerText=c.title;bodyEl.innerHTML=c.body;modal.style.display="flex";
};

//  TOAST 
function showToast(message="Done!",type="success"){
  const toast=document.getElementById("toast-notification");if(!toast) return;
  const icon=toast.querySelector(".material-icons");const text=toast.querySelector("p");
  if(icon){icon.style.color=type==="error"?"var(--red)":"var(--green)";icon.innerText=type==="error"?"error":"check_circle";}
  if(text) text.innerText=message;
  toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),3500);
}

//  CAROUSEL 
function initCarousel(slideId,dotsSelector){
  const slide=document.getElementById(slideId);if(!slide) return;
  const images=slide.querySelectorAll("img");const dots=document.querySelectorAll(`${dotsSelector} .dot`);
  let idx=0;
  const go=()=>{slide.style.transform=`translateX(${-100*idx}%)`;dots.forEach((d,i)=>d.classList.toggle("active",i===idx));};
  let timer=setInterval(()=>{idx=(idx+1)%images.length;go();},4500);
  dots.forEach((dot,i)=>{dot.addEventListener("click",()=>{clearInterval(timer);idx=i;go();timer=setInterval(()=>{idx=(idx+1)%images.length;go();},4500);});});
}
const ss=document.createElement("style");
ss.innerText="@keyframes spin{100%{transform:rotate(360deg)}}";
document.head.appendChild(ss);
