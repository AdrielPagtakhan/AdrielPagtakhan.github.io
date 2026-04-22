
import imageCompression from "https://cdn.jsdelivr.net/npm/browser-image-compression@2.0.2/dist/browser-image-compression.mjs";
import { auth, db } from "./firebase.js";
import { signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, getDocs, addDoc, deleteDoc,
  updateDoc, setDoc, orderBy, query, serverTimestamp, onSnapshot, where }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { storage } from "./firebase.js";
import { ref as storageRef, uploadString, getDownloadURL }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

let selectedProductId    = null;
let selectedOrderId      = null;
let allOrders            = [];
let currentChatSessionId = null;
let _chatUnsubscribe     = null;  // live chat listener
let _inboxUnsubscribe    = null;  // live inbox listener

const ALL_SIZES = ["S","M","L","XL","1XL","2XL","3XL","4XL","5XL","6XL","7XL"];
let addImages   = [];
let editImages  = [];

// Image adjust state
let _cropCanvas = null, _cropCtx = null, _cropImage = null, _cropMode = null;
let _cropBrightness = 100, _cropContrast = 100, _cropSaturation = 100, _cropScale = 1, _cropRotate = 0;

const stiData = {
  college: { label:"College Course", list:["BSIT","BSAIS","BSCS","BSBA","BSHM","BSTM","BSCpE","BACOMM","BMMA"] },
  shs:     { label:"SHS Strand",     list:["STEM","HUMSS","ABM","Tourism Operations","Culinary Arts","Digital Arts","IT in Mobile App","GAS"] },
  jhs:     { label:"JHS Grade",      list:["Grade 7","Grade 8","Grade 9","Grade 10"] }
};

// ── AUTH ──
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = "index.html"; return; }
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists() || snap.data().role !== "admin") {
      alert("Access Denied. Admin only.");
      window.location.href = "menu.html";
      return;
    }
    const data = snap.data();
    const emailEl  = document.getElementById("sidebarEmail");
    const settEl   = document.getElementById("settingsEmail");
    const nameEl   = document.getElementById("adminDisplayName");
    const emailEl2 = document.getElementById("adminDisplayEmail");
    if (emailEl)  emailEl.innerText = user.email;
    if (settEl)   settEl.value      = user.email;
    if (nameEl)   nameEl.innerText  = data.username || "Administrator";
    if (emailEl2) emailEl2.innerText = user.email;
    setAdminAvatar(data.avatarUrl || "");
  } catch(e) { console.error("Auth guard:", e); }
});

// ── DOM READY ──
window.addEventListener("DOMContentLoaded", () => {
  // Hamburger
  const menuBtn = document.getElementById("menuBtn");
  const sidebar = document.getElementById("adminSidebar");
  const overlay = document.getElementById("adminOverlay");
  menuBtn?.addEventListener("click", () => { sidebar?.classList.toggle("active"); overlay?.classList.toggle("active"); });
  overlay?.addEventListener("click", () => { sidebar?.classList.remove("active"); overlay?.classList.remove("active"); });
  document.querySelectorAll(".sidebar li").forEach(li => {
    li.addEventListener("click", () => {
      if (window.innerWidth <= 900) { sidebar?.classList.remove("active"); overlay?.classList.remove("active"); }
    });
  });

  // Tabs
  document.getElementById("tabProducts")?.addEventListener("click",      () => switchTab("products"));
  document.getElementById("tabOrders")?.addEventListener("click",        () => switchTab("orders"));
  document.getElementById("tabAnalytics")?.addEventListener("click",     () => switchTab("analytics"));
  document.getElementById("tabSettings")?.addEventListener("click",      () => switchTab("settings"));
  document.getElementById("tabChat")?.addEventListener("click",          () => switchTab("chat"));

  // Logout
  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    signOut(auth).then(() => { window.location.href = "index.html"; });
  });

  // Product form
  document.getElementById("addProductBtn")?.addEventListener("click", addProduct);
  document.getElementById("levelSelect")?.addEventListener("change", e => populatePrograms(e.target.value, "programSelect", "programLabel"));
  document.getElementById("editLevelSelect")?.addEventListener("change", e => populatePrograms(e.target.value, "editProgramSelect"));

  buildSizePriceGrid("addSizePriceGrid", "add");
  buildSizePriceGrid("editSizePriceGrid", "edit");

  // Peripheral toggle — Add form
  document.querySelectorAll('input[name="itemType"]').forEach(radio => {
    radio.addEventListener("change", e => togglePeripheralMode(e.target.value === "peripheral", "add"));
  });

  // Peripheral toggle — Edit modal
  document.getElementById("editTypeSelect")?.addEventListener("change", e => {
    togglePeripheralMode(e.target.value === "peripheral", "edit");
  });

  // Limited offer toggles
  document.getElementById("addIsLimited")?.addEventListener("change", e => {
    document.getElementById("addLimitedDateWrap").style.display = e.target.checked ? "block" : "none";
  });
  document.getElementById("editIsLimited")?.addEventListener("change", e => {
    document.getElementById("editLimitedDateWrap").style.display = e.target.checked ? "block" : "none";
  });

  // Image uploads with camera support
  setupImageInput("productImageFiles", "add");
  setupImageInput("editImageFiles", "edit");

  // Product modal
  document.getElementById("closeModal")?.addEventListener("click",    closeProductModal);
  document.getElementById("saveProduct")?.addEventListener("click",   saveProduct);
  document.getElementById("deleteProduct")?.addEventListener("click", deleteProduct);

  // Sale price toggle in edit modal
  document.getElementById("editSalePriceToggle")?.addEventListener("change", e => {
    const wrap = document.getElementById("editSalePriceWrap");
    if (wrap) wrap.style.display = e.target.checked ? "block" : "none";
  });

  // Image adjust modal
  document.getElementById("closeImageAdjust")?.addEventListener("click", () => {
    document.getElementById("imageAdjustModal").style.display = "none";
  });
  document.getElementById("applyImageAdjust")?.addEventListener("click", applyImageAdjust);
  document.getElementById("adjBrightness")?.addEventListener("input", updateImageAdjustPreview);
  document.getElementById("adjContrast")?.addEventListener("input", updateImageAdjustPreview);
  document.getElementById("adjSaturation")?.addEventListener("input", updateImageAdjustPreview);
  document.getElementById("adjScale")?.addEventListener("input", updateImageAdjustPreview);
  document.getElementById("adjRotate")?.addEventListener("input", updateImageAdjustPreview);
  document.getElementById("adjResetBtn")?.addEventListener("click", resetImageAdjust);

  // Order modal
  document.getElementById("closeOrderModal")?.addEventListener("click", () => {
    document.getElementById("orderModal").style.display = "none";
  });
  document.getElementById("saveOrderBtn")?.addEventListener("click", saveOrderStatus);

  // Filters
  document.getElementById("orderFilterStatus")?.addEventListener("change", filterOrders);
  document.getElementById("orderSearchInput")?.addEventListener("input",   filterOrders);

  // Coupon
  document.getElementById("saveCouponBtn")?.addEventListener("click", saveCoupon);

  // Shipping + Store settings
  document.getElementById("saveShippingBtn")?.addEventListener("click", saveShipping);
  document.getElementById("saveStoreNameBtn")?.addEventListener("click", saveStoreName);
  document.getElementById("saveMaintenanceBtn")?.addEventListener("click", saveMaintenanceMode);

  // Announcements
  document.getElementById("saveAnnounceBtn")?.addEventListener("click", saveAnnouncement);

  // Admin profile photo
  document.getElementById("adminPhotoFile")?.addEventListener("change", e => {
    const file = e.target.files[0]; if (!file) return;
    compressAndRead(file).then(b64 => {
      setAdminAvatar(b64);
      document.getElementById("saveAdminPhotoBtn").style.display = "block";
      document.getElementById("saveAdminPhotoBtn")._pendingB64 = b64;
    });
    e.target.value = "";
  });
  document.getElementById("saveAdminPhotoBtn")?.addEventListener("click", saveAdminPhoto);

  // Live chat
  document.getElementById("adminChatSend")?.addEventListener("click", () => sendAdminReply());
  document.getElementById("adminMediaBtn")?.addEventListener("click", () => document.getElementById("adminMediaInput")?.click());
  document.getElementById("adminMediaInput")?.addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) handleAdminMediaUpload(file);
    e.target.value = "";
  });
  document.getElementById("adminChatInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAdminReply(); }
  });

  // Start live inbox listener
  startLiveInboxListener();

  loadProducts();
  loadShippingSettings();
});

//  TAB SWITCHING 
function switchTab(tab) {
  const sections = {
    products:"productsSection", orders:"ordersSection", analytics:"analyticsSection",
    settings:"settingsSection", chat:"chatSection"
  };
  const titles = {
    products:"Product Manager", orders:"Order Management", analytics:"Store Analytics",
    settings:"System Settings", chat:"Customer Chat"
  };
  const tabIds = {
    products:"tabProducts", orders:"tabOrders", analytics:"tabAnalytics",
    settings:"tabSettings", chat:"tabChat"
  };
  Object.values(sections).forEach(id => { const el = document.getElementById(id); if (el) el.style.display = "none"; });
  Object.values(tabIds).forEach(id => document.getElementById(id)?.classList.remove("active"));
  const sec = document.getElementById(sections[tab]);
  if (sec) sec.style.display = "block";
  document.getElementById(tabIds[tab])?.classList.add("active");
  const titleEl = document.getElementById("mainTitle");
  if (titleEl) titleEl.innerText = titles[tab] || tab;

  if (tab === "products")  loadProducts();
  if (tab === "orders")    loadOrders();
  if (tab === "analytics") loadAnalytics();
  if (tab === "settings")  { loadShippingSettings(); loadStoreSettings(); }
  if (tab === "chat")      loadChatInbox();
}

// ── Tool Modals (Announcements, Coupons) ──
window.openToolModal = function(type) {
  const el = document.getElementById(type === "announcements" ? "announcementsSection" : "couponsSection");
  if (!el) return;
  el.style.display = "flex";
  document.body.style.overflow = "hidden";
  if (type === "announcements") { loadAnnouncements(); }
  if (type === "coupons")       loadCoupons();
};
window.closeToolModal = function(type) {
  const el = document.getElementById(type === "announcements" ? "announcementsSection" : "couponsSection");
  if (el) el.style.display = "none";
  document.body.style.overflow = "";
};
window.switchToolTab = function(btn, containerId, panelId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll(".tool-tab-panel").forEach(p => p.style.display = "none");
  btn.closest(".tool-modal-body").querySelectorAll(".tool-tab").forEach(t => t.classList.remove("active"));
  const panel = document.getElementById(panelId);
  if (panel) panel.style.display = "block";
  btn.classList.add("active");
};

//  UTILITIES
async function compressAndRead(file) {
  const isImage = file.type.startsWith("image/");
  if (!isImage) {
    
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
    console.warn("Image compression failed, falling back to original:", err);
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }
}


function readFileAsBase64(file, callback) {
  compressAndRead(file).then(callback).catch(() => {
    
    const r = new FileReader();
    r.onload = e => callback(e.target.result);
    r.readAsDataURL(file);
  });
}

// IMAGE INPUT SETUP 
function setupImageInput(inputId, mode) {
  const input = document.getElementById(inputId);
  if (!input) return;
  // Add capture attribute for camera on mobile
  input.setAttribute("capture", "environment");
  input.addEventListener("change", e => {
    handleMultiImageFiles(Array.from(e.target.files), mode);
    e.target.value = "";
  });
}

// IMAGE ADJUST MODAL 
function openImageAdjust(b64, mode, index) {
  _cropMode  = mode;
  _cropImage = b64;
  _cropBrightness = 100; _cropContrast = 100; _cropSaturation = 100;
  _cropScale = 1; _cropRotate = 0;
  document.getElementById("adjBrightness").value  = 100;
  document.getElementById("adjContrast").value    = 100;
  document.getElementById("adjSaturation").value  = 100;
  document.getElementById("adjScale").value       = 100;
  document.getElementById("adjRotate").value      = 0;
  document.getElementById("adjBrightnessVal").innerText  = "100%";
  document.getElementById("adjContrastVal").innerText    = "100%";
  document.getElementById("adjSaturationVal").innerText  = "100%";
  document.getElementById("adjScaleVal").innerText       = "100%";
  document.getElementById("adjRotateVal").innerText      = "0°";
  document.getElementById("imageAdjustModal").dataset.imgIndex = index;
  document.getElementById("imageAdjustModal").style.display = "flex";

  const img = new Image();
  img.onload = () => {
    _cropImage = img;
    updateImageAdjustPreview();
  };
  img.src = b64;
}

function updateImageAdjustPreview() {
  const brightness  = document.getElementById("adjBrightness")?.value  || 100;
  const contrast    = document.getElementById("adjContrast")?.value    || 100;
  const saturation  = document.getElementById("adjSaturation")?.value  || 100;
  const scale       = document.getElementById("adjScale")?.value       || 100;
  const rotate      = document.getElementById("adjRotate")?.value      || 0;
  document.getElementById("adjBrightnessVal").innerText  = brightness + "%";
  document.getElementById("adjContrastVal").innerText    = contrast + "%";
  document.getElementById("adjSaturationVal").innerText  = saturation + "%";
  document.getElementById("adjScaleVal").innerText       = scale + "%";
  document.getElementById("adjRotateVal").innerText      = rotate + "°";

  const canvas  = document.getElementById("adjCanvas");
  if (!canvas || !_cropImage) return;
  const ctx     = canvas.getContext("2d");
  const s       = parseFloat(scale) / 100;
  const r       = parseFloat(rotate) * Math.PI / 180;
  const w       = _cropImage.naturalWidth || _cropImage.width  || 400;
  const h       = _cropImage.naturalHeight || _cropImage.height || 300;
  canvas.width  = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(r);
  ctx.scale(s, s);
  ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
  ctx.drawImage(_cropImage, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function resetImageAdjust() {
  ["adjBrightness","adjContrast","adjSaturation","adjScale","adjRotate"].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.value = [100,100,100,100,0][i];
  });
  updateImageAdjustPreview();
}

function applyImageAdjust() {
  const canvas = document.getElementById("adjCanvas");
  if (!canvas) return;
  
  const MAX_DIM = 1200;
  let exportCanvas = canvas;
  if (canvas.width > MAX_DIM || canvas.height > MAX_DIM) {
    const ratio = Math.min(MAX_DIM / canvas.width, MAX_DIM / canvas.height);
    exportCanvas = document.createElement("canvas");
    exportCanvas.width  = Math.round(canvas.width  * ratio);
    exportCanvas.height = Math.round(canvas.height * ratio);
    exportCanvas.getContext("2d").drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
  }
  const b64     = exportCanvas.toDataURL("image/jpeg", 0.82);
  const index   = parseInt(document.getElementById("imageAdjustModal").dataset.imgIndex) || 0;
  const imgsArr = _cropMode === "add" ? addImages : editImages;
  if (index >= 0 && index < imgsArr.length) {
    imgsArr[index] = b64;
    renderImagePreviews(_cropMode);
  }
  document.getElementById("imageAdjustModal").style.display = "none";
}

//  ADMIN AVATAR 
function setAdminAvatar(url) {
  const letterEl  = document.getElementById("sidebarAvatarLetter");
  const imgEl     = document.getElementById("sidebarAvatarImg");
  const previewEl = document.getElementById("adminAvatarImg");
  const initEl    = document.getElementById("adminAvatarInitial");
  const email     = document.getElementById("sidebarEmail")?.innerText || "A";
  const letter    = email[0].toUpperCase();
  if (url && url.length > 10) {
    if (imgEl)     { imgEl.src = url; imgEl.style.display = "block"; }
    if (letterEl)  letterEl.style.display = "none";
    if (previewEl) { previewEl.src = url; previewEl.style.display = "block"; }
    if (initEl)    initEl.style.display = "none";
  } else {
    if (imgEl)     imgEl.style.display = "none";
    if (letterEl)  { letterEl.innerText = letter; letterEl.style.display = "flex"; }
    if (previewEl) previewEl.style.display = "none";
    if (initEl)    { initEl.innerText = letter; initEl.style.display = "flex"; }
  }
}

async function saveAdminPhoto() {
  const btn = document.getElementById("saveAdminPhotoBtn");
  const b64 = btn?._pendingB64;
  if (!b64) return;
  const user = auth.currentUser;
  if (!user) return;
  btn.disabled = true; btn.innerText = "Saving…";
  try {
    await updateDoc(doc(db, "users", user.uid), { avatarUrl: b64, updatedAt: new Date() });
    setAdminAvatar(b64);
    showAdminToast("✅ Profile photo updated!");
    btn.style.display = "none";
    delete btn._pendingB64;
  } catch(e) {
    showAdminToast("Failed to save photo.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span class="material-icons" style="font-size:16px;vertical-align:middle;">save</span> Save Profile Photo`;
  }
}

function showAdminToast(message, type = "success") {
  const color = type === "success" ? "#00C87A" : "#FF3B3B";
  let toast = document.getElementById("adminToast");
  if (!toast) return;
  toast.innerText = message;
  toast.style.borderLeft = `4px solid ${color}`;
  toast.style.opacity = "1";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = "0"; }, 3200);
}
window.showAdminToast = showAdminToast;

// Expose Firebase helpers for inline admin scripts (bundle creator, etc.)
window._db         = db;
window._getDocs    = getDocs;
window._collection = collection;
window._getDoc     = getDoc;
window._doc        = doc;
window._addDoc     = addDoc;
// ── Bundle save helper (called from admin.html inline script) ──
// Data is clean (no base64) — imageUrl is taken from existing products already in Storage
async function _cbSaveBundle(data) {
  await addDoc(collection(db, 'products'), data);
  loadProducts();
}
window._cbSaveBundle = _cbSaveBundle;


//  PROGRAMS 
function populatePrograms(level, selectId, labelId) {
  const data   = stiData[level];
  const select = document.getElementById(selectId);
  const label  = document.getElementById(labelId);
  if (!data || !select) return;
  if (label) label.innerText = data.label;
  select.innerHTML = `<option value="" disabled selected>— Select ${data.label} —</option>`;
  data.list.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item.toLowerCase().replace(/\s+/g, "-");
    opt.textContent = item;
    select.appendChild(opt);
  });
}

// USERS 
// PRODUCTS LOAD 
async function loadProducts() {
  const container = document.getElementById("productList");
  if (!container) return;
  container.innerHTML = `<p class="loading-text">Loading inventory...</p>`;
  try {
    const snap = await getDocs(collection(db, "products"));
    const countEl = document.getElementById("productCount");
    if (countEl) countEl.innerText = `${snap.size} items`;
    container.innerHTML = "";
    if (snap.empty) {
      container.innerHTML = `<p class="loading-text">No products yet.</p>`;
      if (typeof window.updateHubStats === "function") window.updateHubStats(0, 0, 0);
      return;
    }
    let inStockCount = 0, lowStockCount = 0;
    snap.forEach(d => {
      const p    = d.data();
      const card = document.createElement("div");
      card.className = "product-card";
      card.dataset.productId = d.id;
      card.dataset.level = p.level || "";
      card.dataset.type = p.type || "";
      card.dataset.productName = p.name || "";
      card.dataset.productImg  = (Array.isArray(p.images) && p.images[0]) ? p.images[0] : (p.imageUrl || "");
      const totalStock = Object.values(p.stock || {}).reduce((a, b) => a + Number(b), 0);
      const stockColor = totalStock === 0 ? "var(--red)" : totalStock <= 5 ? "#f0ad4e" : "var(--green)";
      const hasSale = p.salePrice && p.salePrice < p.price;
      const isLimCard = p.isLimited || false;
      const limEnd = isLimCard && p.limitedUntil ? (p.limitedUntil.toDate ? p.limitedUntil.toDate() : new Date(p.limitedUntil)) : null;
      const limExpired = limEnd && limEnd.getTime() < Date.now();
      card.innerHTML = `
        <img src="${p.imageUrl || ''}" alt="${p.name}" onerror="this.src='https://placehold.co/180x130/f0f2f7/adb5bd?text=No+Image'">
        <div class="card-info">
          <h3>${p.name}</h3>
          <p>₱${Number(p.price).toLocaleString()}${hasSale ? ` <span style="color:var(--red);font-size:.72rem;">→ ₱${p.salePrice.toLocaleString()}</span>` : ''}</p>
          <p style="font-size:.72rem;color:${stockColor};font-weight:700;margin-top:2px;">Stock: ${totalStock} units</p>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">
            ${hasSale ? `<span style="background:#FF3B3B;color:#fff;font-size:.65rem;font-weight:700;padding:2px 7px;border-radius:10px;">SALE</span>` : ''}
            ${isLimCard ? `<span style="background:${limExpired?'#aaa':'#ff6b35'};color:#fff;font-size:.65rem;font-weight:700;padding:2px 7px;border-radius:10px;">${limExpired?'⏰ EXPIRED':'⏳ LIMITED'}</span>` : ''}
          </div>
        </div>`;
      const totalStockCheck = Object.values(p.stock || {}).reduce((a, b) => a + Number(b), 0);
      if (totalStockCheck > 5) inStockCount++;
      else if (totalStockCheck <= 5) lowStockCount++;
      card.addEventListener("click", () => openEditModal(d.id, p));
      container.appendChild(card);
    });
    if (typeof window.updateHubStats === "function") {
      window.updateHubStats(snap.size, inStockCount, lowStockCount);
    }
  } catch (err) {
    container.innerHTML = `<p class="loading-text">Error loading products.</p>`;
  }
}

// SIZE-PRICE GRID
function buildSizePriceGrid(containerId, mode) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  const header = grid.querySelector(".size-price-header");
  grid.innerHTML = "";
  if (header) grid.appendChild(header);
  ALL_SIZES.forEach(size => {
    const row = document.createElement("div");
    row.className = "size-price-row";
    row.dataset.size = size;
    row.innerHTML = `
      <span class="size-label">${size}</span>
      <input type="number" class="sp-stock" placeholder="0" min="0" value="0">
      <input type="number" class="sp-price" placeholder="Price" min="0" step="0.01">
      <input type="checkbox" class="sp-active" checked>`;
    grid.appendChild(row);
  });
}

function getSizePriceData(containerId) {
  const grid = document.getElementById(containerId);
  if (!grid) return { stock: {}, prices: {} };
  const stock = {}, prices = {};
  grid.querySelectorAll(".size-price-row").forEach(row => {
    const size   = row.dataset.size;
    const active = row.querySelector(".sp-active")?.checked;
    if (!active) return;
    const qty   = parseInt(row.querySelector(".sp-stock")?.value) || 0;
    const price = parseFloat(row.querySelector(".sp-price")?.value) || 0;
    stock[size]  = qty;
    prices[size] = price;
  });
  return { stock, prices };
}

function setSizePriceData(containerId, stockData, pricesData) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  grid.querySelectorAll(".size-price-row").forEach(row => {
    const size  = row.dataset.size;
    const qty   = stockData?.[size] ?? 0;
    const price = pricesData?.[size] ?? 0;
    const active = qty > 0 || price > 0;
    const stockEl  = row.querySelector(".sp-stock");
    const priceEl  = row.querySelector(".sp-price");
    const activeEl = row.querySelector(".sp-active");
    if (stockEl)  stockEl.value  = qty;
    if (priceEl)  priceEl.value  = price || "";
    if (activeEl) activeEl.checked = active;
  });
}

// ── MULTI-IMAGE HELPERS ──
async function handleMultiImageFiles(files, mode) {
  const imagesArr = mode === "add" ? addImages : editImages;
  // Show a quick loading indicator on the preview container
  const previewEl = document.getElementById(mode === "add" ? "addImagePreviews" : "editImagePreviews");
  if (previewEl) {
    const loader = document.createElement("div");
    loader.id = "imgCompressLoader";
    loader.style.cssText = "padding:10px;font-size:.82rem;color:#666;";
    loader.textContent = `⏳ Compressing ${files.length} image${files.length > 1 ? "s" : ""}…`;
    previewEl.appendChild(loader);
  }
  const results = await Promise.all(files.map(f => compressAndRead(f)));
  // Remove loader
  document.getElementById("imgCompressLoader")?.remove();
  results.forEach(b64 => imagesArr.push(b64));
  renderImagePreviews(mode);
}

function renderImagePreviews(mode) {
  const imagesArr = mode === "add" ? addImages : editImages;
  const previewEl = document.getElementById(mode === "add" ? "addImagePreviews" : "editImagePreviews");
  const mainPreview = document.getElementById("editPreviewImg");
  if (!previewEl) return;
  previewEl.innerHTML = "";
  imagesArr.forEach((b64, i) => {
    const wrap = document.createElement("div");
    wrap.className = `multi-img-thumb${i === 0 ? " is-main" : ""}`;
    wrap.innerHTML = `
      <img src="${b64}" alt="img${i}">
      ${i === 0 ? '<div class="thumb-main-badge">MAIN</div>' : ""}
      <div class="thumb-actions">
        <button class="thumb-edit" data-idx="${i}" title="Adjust image">✏️</button>
        <button class="thumb-remove" data-idx="${i}" title="Remove">✕</button>
      </div>`;
    wrap.querySelector(".thumb-remove").addEventListener("click", () => {
      imagesArr.splice(i, 1);
      renderImagePreviews(mode);
    });
    wrap.querySelector(".thumb-edit").addEventListener("click", () => {
      openImageAdjust(b64, mode, i);
    });
    previewEl.appendChild(wrap);
  });
  if (mode === "edit" && mainPreview && imagesArr.length > 0) {
    mainPreview.src = imagesArr[0];
  }
}

// ── PERIPHERAL / SIZED TOGGLE ──
function togglePeripheralMode(isPeripheral, mode) {
  if (mode === "add") {
    const sized = document.getElementById("addSizedSection");
    const peri  = document.getElementById("addPeripheralSection");
    if (sized) sized.style.display = isPeripheral ? "none" : "block";
    if (peri)  peri.style.display  = isPeripheral ? "block" : "none";
  } else {
    const sized = document.getElementById("editSizedSection");
    const peri  = document.getElementById("editPeripheralSection");
    if (sized) sized.style.display = isPeripheral ? "none" : "block";
    if (peri)  peri.style.display  = isPeripheral ? "block" : "none";
  }
}

// ── ADD PRODUCT ──
async function addProduct() {
  const name        = document.getElementById("productName")?.value.trim();
  const description = document.getElementById("productDescription")?.value.trim();
  const level       = document.getElementById("levelSelect")?.value;
  const program     = document.getElementById("programSelect")?.value;
  const type        = document.querySelector('input[name="itemType"]:checked')?.value || document.getElementById("typeSelect")?.value || "uniform";
  if (!name || !level || !program) { showAdminToast("Please fill in Name, Level, and Program.", "error"); return; }
  if (addImages.length === 0) { showAdminToast("Please upload at least one product image.", "error"); return; }

  const isPeripheral = type === "peripheral";
  let stock, prices, basePrice;

  if (isPeripheral) {
    const qty   = parseInt(document.getElementById("peripheralStock")?.value) || 0;
    const price = parseFloat(document.getElementById("peripheralPrice")?.value) || 0;
    if (price <= 0) { showAdminToast("Please enter a price for this item.", "error"); return; }
    stock = { "one-size": qty };
    prices = { "one-size": price };
    basePrice = price;
  } else {
    const sp = getSizePriceData("addSizePriceGrid");
    stock = sp.stock; prices = sp.prices;
    const priceValues = Object.values(prices).filter(p => p > 0);
    basePrice = priceValues.length ? Math.min(...priceValues) : 0;
  }

  const addIsLimited = document.getElementById("addIsLimited")?.checked || false;
  const addLimitedUntilVal = document.getElementById("addLimitedUntil")?.value;
  const addLimitedUntil = addIsLimited && addLimitedUntilVal ? new Date(addLimitedUntilVal) : null;

  const btn = document.getElementById("addProductBtn");
  btn.disabled = true; btn.innerText = "Creating...";

  const data = {
    name, description, level, program, type, stock,
    prices, price: basePrice,
    imageUrl: addImages[0] || "",
    images: addImages,
    createdAt: new Date(),
    salePrice: null,
    isLimited: addIsLimited,
    limitedUntil: addLimitedUntil
  };

  try {
    await addDoc(collection(db, "products"), data);
    ["productName","productDescription"].forEach(id => { const el=document.getElementById(id);if(el)el.value=""; });
    addImages = [];
    renderImagePreviews("add");
    buildSizePriceGrid("addSizePriceGrid", "add");
    const lvl=document.getElementById("levelSelect");if(lvl)lvl.value="";
    const prg=document.getElementById("programSelect");if(prg)prg.innerHTML=`<option value="" disabled selected>Choose Level First</option>`;
    // Reset peripheral fields
    const pStk = document.getElementById("peripheralStock"); if (pStk) pStk.value = "0";
    const pPrc = document.getElementById("peripheralPrice"); if (pPrc) pPrc.value = "";
    // Reset limited offer fields
    const limCk = document.getElementById("addIsLimited"); if (limCk) limCk.checked = false;
    const limWp = document.getElementById("addLimitedDateWrap"); if (limWp) limWp.style.display = "none";
    const limDt = document.getElementById("addLimitedUntil"); if (limDt) limDt.value = "";
    // Reset type radio back to uniform
    const uniRadio = document.getElementById("typeUniform"); if (uniRadio) { uniRadio.checked = true; togglePeripheralMode(false, "add"); }
    showAdminToast("✅ Product created successfully!");
    loadProducts();
  } catch (err) {
    showAdminToast("Failed to create product.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span class="material-icons">rocket_launch</span> Publish Product`;
  }
}

// ── EDIT MODAL ──
function openEditModal(id, product) {
  selectedProductId = id;
  document.getElementById("editName").value        = product.name || "";
  document.getElementById("editDescription").value = product.description || "";

  editImages = Array.isArray(product.images) && product.images.length
    ? [...product.images]
    : (product.imageUrl ? [product.imageUrl] : []);
  renderImagePreviews("edit");

  const previewImg = document.getElementById("editPreviewImg");
  if (previewImg) previewImg.src = editImages[0] || "https://placehold.co/200x150/f0f2f7/adb5bd?text=Preview";

  const levelSel = document.getElementById("editLevelSelect");
  if (levelSel) { levelSel.value = product.level || "college"; populatePrograms(product.level || "college", "editProgramSelect"); }
  setTimeout(() => { const p=document.getElementById("editProgramSelect");if(p)p.value=product.program||""; }, 50);
  const typeSel = document.getElementById("editTypeSelect");
  if (typeSel) typeSel.value = product.type || "uniform";

  // Sale price
  const saleToggle = document.getElementById("editSalePriceToggle");
  const saleWrap   = document.getElementById("editSalePriceWrap");
  const saleInput  = document.getElementById("editSalePrice");
  if (saleToggle && saleInput && saleWrap) {
    const hasSale = product.salePrice && product.salePrice < product.price;
    saleToggle.checked = !!hasSale;
    saleInput.value    = hasSale ? product.salePrice : "";
    saleWrap.style.display = hasSale ? "block" : "none";
  }

  // Peripheral vs sized toggle
  const isPeri = (product.type || "uniform") === "peripheral";
  togglePeripheralMode(isPeri, "edit");
  if (isPeri) {
    const pStk = document.getElementById("editPeripheralStock");
    const pPrc = document.getElementById("editPeripheralPrice");
    if (pStk) pStk.value = product.stock?.["one-size"] ?? 0;
    if (pPrc) pPrc.value = product.prices?.["one-size"] ?? product.price ?? "";
  } else {
    buildSizePriceGrid("editSizePriceGrid", "edit");
    setTimeout(() => setSizePriceData("editSizePriceGrid", product.stock || {}, product.prices || {}), 30);
  }

  // Limited offer fields
  const editIsLimCk = document.getElementById("editIsLimited");
  const editLimWrap = document.getElementById("editLimitedDateWrap");
  const editLimDate = document.getElementById("editLimitedUntil");
  const isLim = product.isLimited || false;
  if (editIsLimCk) editIsLimCk.checked = isLim;
  if (editLimWrap) editLimWrap.style.display = isLim ? "block" : "none";
  if (editLimDate && product.limitedUntil) {
    const d = product.limitedUntil.toDate ? product.limitedUntil.toDate() : new Date(product.limitedUntil);
    editLimDate.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  } else if (editLimDate) {
    editLimDate.value = "";
  }

  document.getElementById("productModal").style.display = "flex";
}

function closeProductModal() {
  document.getElementById("productModal").style.display = "none";
  selectedProductId = null;
}

// ── SAVE PRODUCT ──
async function saveProduct() {
  if (!selectedProductId) return;
  const btn = document.getElementById("saveProduct");
  btn.disabled = true; btn.innerText = "Saving...";

  const editType = document.getElementById("editTypeSelect")?.value || "uniform";
  const editIsPeri = editType === "peripheral";
  let stock, prices, basePrice;

  if (editIsPeri) {
    const qty   = parseInt(document.getElementById("editPeripheralStock")?.value) || 0;
    const price = parseFloat(document.getElementById("editPeripheralPrice")?.value) || 0;
    stock = { "one-size": qty };
    prices = { "one-size": price };
    basePrice = price;
  } else {
    const sp = getSizePriceData("editSizePriceGrid");
    stock = sp.stock; prices = sp.prices;
    const priceValues = Object.values(prices).filter(p => p > 0);
    basePrice = priceValues.length ? Math.min(...priceValues) : 0;
  }

  const saleToggle = document.getElementById("editSalePriceToggle");
  const saleInput  = document.getElementById("editSalePrice");
  const salePrice  = saleToggle?.checked && saleInput?.value
    ? parseFloat(saleInput.value) : null;

  const editIsLimited = document.getElementById("editIsLimited")?.checked || false;
  const editLimitedUntilVal = document.getElementById("editLimitedUntil")?.value;
  const editLimitedUntil = editIsLimited && editLimitedUntilVal ? new Date(editLimitedUntilVal) : null;

  const updates = {
    name:        document.getElementById("editName")?.value.trim(),
    description: document.getElementById("editDescription")?.value.trim(),
    level:       document.getElementById("editLevelSelect")?.value,
    program:     document.getElementById("editProgramSelect")?.value,
    type:        editType,
    stock, prices, price: basePrice,
    salePrice: salePrice || null,
    isLimited: editIsLimited,
    limitedUntil: editLimitedUntil,
    images:   editImages,
    imageUrl: editImages[0] || "",
    updatedAt: new Date()
  };

  try {
    await updateDoc(doc(db, "products", selectedProductId), updates);
    showAdminToast("✅ Product updated!");
    closeProductModal();
    loadProducts();
  } catch (err) {
    showAdminToast("Failed to save changes.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span class="material-icons" style="font-size:16px;vertical-align:middle;">save</span> Update Changes`;
  }
}

// ── DELETE PRODUCT ──
async function deleteProduct() {
  if (!selectedProductId || !confirm("⚠️ Delete this product? This cannot be undone.")) return;
  try {
    await deleteDoc(doc(db, "products", selectedProductId));
    closeProductModal();
    loadProducts();
    showAdminToast("Product deleted.");
  } catch (err) {
    showAdminToast("Failed to delete.", "error");
  }
}

// ── ORDERS LOAD ──
async function loadOrders() {
  const container = document.getElementById("orderList");
  if (!container) return;
  container.innerHTML = `<p class="loading-text">Fetching orders...</p>`;
  try {
    const snap = await getDocs(collection(db, "orders"));
    const countEl = document.getElementById("orderCount");
    if (countEl) countEl.innerText = `${snap.size} orders`;
    allOrders = [];
    snap.forEach(d => allOrders.push({ id: d.id, ...d.data() }));
    allOrders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    renderOrders(allOrders);
    if (typeof _ohRefreshStats === 'function') _ohRefreshStats();
  } catch (err) {
    container.innerHTML = `<p class="loading-text">Error loading orders.</p>`;
  }
}

function filterOrders() {
  const status = document.getElementById("orderFilterStatus")?.value || "";
  const search = document.getElementById("orderSearchInput")?.value.toLowerCase() || "";
  let filtered = allOrders;
  if (status) filtered = filtered.filter(o => o.status === status);
  if (search) filtered = filtered.filter(o =>
    o.userEmail?.toLowerCase().includes(search) ||
    o.id.toLowerCase().includes(search) ||
    o.customerName?.toLowerCase().includes(search)
  );
  renderOrders(filtered);
}

function renderOrders(orders) {
  const container = document.getElementById("orderList");
  if (!container) return;
  container.innerHTML = "";
  if (!orders.length) { container.innerHTML = `<p class="loading-text">No orders found.</p>`; return; }
  orders.forEach(order => {
    const status   = order.status || "Pending";
    const badgeCls = `badge-${status.toLowerCase()}`;
    const items    = (order.items || []).map(i => `${i.name} (${i.size?.toUpperCase()}) ×${i.quantity}`).join(", ");
    const date     = order.createdAt?.toDate?.()
      ? new Date(order.createdAt.toDate()).toLocaleDateString("en-PH", { month:"short",day:"numeric",year:"numeric" }) : "—";
    const payBadge = order.paymentStatus === "pending_verification"
      ? `<span style="font-size:.7rem;background:#FFF3CD;color:#856404;padding:2px 7px;border-radius:6px;font-weight:700;">Verify Payment</span>` : "";
    const card = document.createElement("div");
    card.className = "order-card-admin";
    card.innerHTML = `
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap;">
          <strong style="font-size:.9rem;">Order #${order.id.substring(0,8).toUpperCase()}</strong>
          <span class="order-badge ${badgeCls}">${status}</span>
          ${payBadge}
          <span style="font-size:.75rem;color:var(--muted);">📅 ${date}</span>
        </div>
        <p style="font-size:.8rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px;">${items}</p>
        <div style="display:flex;gap:12px;font-size:.78rem;color:var(--muted);flex-wrap:wrap;">
          <span>👤 ${order.userEmail || 'Unknown'}</span>
          <span>💰 ₱${Number(order.totalAmount || 0).toLocaleString()}</span>
          <span>📦 ${order.method === 'delivery' ? 'Home Delivery' : 'On-site Pick-up'}</span>
          ${order.refNumber ? `<span>🔑 ${order.refNumber}</span>` : ''}
        </div>
      </div>
      <button class="process-btn">Process</button>`;
    card.querySelector(".process-btn").addEventListener("click", () => openOrderModal(order.id, order));
    container.appendChild(card);
  });
}

// ── ORDER MODAL ──
function openOrderModal(id, order) {
  selectedOrderId = id;
  const idEl = document.getElementById("modalOrderId");
  if (idEl) idEl.innerText = `Order #${id.substring(0,8).toUpperCase()}`;
  const customerEl = document.getElementById("orderCustomerInfo");
  if (customerEl) customerEl.innerHTML = `
    <span>👤 ${order.customerName || order.userEmail || 'Unknown'}</span> ·
    <span>${order.method === 'delivery' ? '🚚 Delivery' : '🏫 Pick-up'}</span> ·
    <span>💳 ${order.payment?.toUpperCase() || 'COD'}</span>
    ${order.refNumber ? `<br><span>🔑 Ref: ${order.refNumber}</span>` : ''}
    ${order.address && order.method === 'delivery' ? `<br><span>📍 ${order.address}</span>` : ''}`;
  const previewEl = document.getElementById("orderItemsPreview");
  if (previewEl) {
    previewEl.innerHTML = (order.items || []).map(i => `
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);">
        <span style="font-size:.83rem;">${i.name} (${i.size?.toUpperCase()}) × ${i.quantity}</span>
        <span style="font-weight:700;color:var(--blue);font-size:.83rem;">₱${(i.price*i.quantity).toLocaleString()}</span>
      </div>`).join("") + `
      <div style="display:flex;justify-content:space-between;margin-top:8px;font-weight:700;font-size:.9rem;">
        <span>Total</span><span style="color:var(--blue);">₱${Number(order.totalAmount||0).toLocaleString()}</span>
      </div>`;
  }
  const mapWrap = document.getElementById("adminOrderMapWrap");
  if (mapWrap) {
    if (order.method === "delivery" && order.deliveryLatLng) {
      const { lat, lng } = order.deliveryLatLng;
      mapWrap.style.display = "block";
      mapWrap.innerHTML = `<iframe src="https://www.google.com/maps/embed/v1/place?key=AIzaSyBjb36R5_7TrBXbIXvnJdWuAQYYbYtThRo&q=${lat},${lng}&zoom=15" style="width:100%;height:180px;border:none;border-radius:10px;" allowfullscreen loading="lazy"></iframe>`;
    } else { mapWrap.style.display = "none"; }
  }
  document.getElementById("orderStatusSelect").value = order.status || "Pending";
  document.getElementById("orderTrackingInput").value  = order.tracking || "";
  document.getElementById("orderModal").style.display = "flex";
}

async function saveOrderStatus() {
  if (!selectedOrderId) return;
  const btn = document.getElementById("saveOrderBtn");
  btn.disabled = true; btn.innerText = "Saving...";
  try {
    const newStatus = document.getElementById("orderStatusSelect").value;
    const updates = { status: newStatus, tracking: document.getElementById("orderTrackingInput").value, updatedAt: new Date() };
    if (newStatus === "Approved") updates.paymentStatus = "verified";
    await updateDoc(doc(db, "orders", selectedOrderId), updates);
    showAdminToast("✅ Order updated!");
    document.getElementById("orderModal").style.display = "none";
    selectedOrderId = null;
    loadOrders();
  } catch (err) {
    showAdminToast("Failed to update order.", "error");
  } finally {
    btn.disabled = false; btn.innerText = "Save Changes";
  }
}

// ── ANALYTICS (Chart.js powered) ──
let _charts = {}; // keep chart instances to destroy before redraw

function destroyChart(id) {
  if (_charts[id]) { try { _charts[id].destroy(); } catch(e){} delete _charts[id]; }
}

async function loadAnalytics() {
  const logEl = document.getElementById("analyticsLog");
  if (logEl) logEl.innerHTML = `<p class="loading-text">Crunching numbers...</p>`;
  try {
    const [productSnap, orderSnap, userSnap] = await Promise.all([
      getDocs(collection(db,"products")),
      getDocs(collection(db,"orders")),
      getDocs(collection(db,"users"))
    ]);

    let totalRevenue = 0, pendingCount = 0, deliveredCount = 0, cancelledCount = 0, processingCount = 0;
    const statusCounts = {Pending:0, Approved:0, Processing:0, Shipped:0, Delivered:0, Cancelled:0};
    const revenueByDay = {};
    const topProducts  = {};
    const paymentCounts = {};
    const dayOfWeekCounts = {Sun:0,Mon:0,Tue:0,Wed:0,Thu:0,Fri:0,Sat:0};
    const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    let deliveryCount = 0, pickupCount = 0;
    let totalOrderValue = 0, orderValueCount = 0;

    orderSnap.forEach(d => {
      const o = d.data();
      const s = o.status || "Pending";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
      if (s === "Pending")    pendingCount++;
      if (s === "Processing") processingCount++;
      if (s === "Delivered")  { deliveredCount++; totalRevenue += (o.totalAmount || 0); }
      if (s === "Cancelled")  cancelledCount++;
      // Revenue by day (last 7)
      if (o.createdAt?.toDate) {
        const dt = new Date(o.createdAt.toDate());
        const key = dt.toLocaleDateString("en-PH", { month:"short", day:"numeric" });
        if (s !== "Cancelled") {
          revenueByDay[key] = (revenueByDay[key] || 0) + (o.totalAmount || 0);
        }
        dayOfWeekCounts[dayNames[dt.getDay()]]++;
      }
      // Payment methods
      const pm = o.payment || "cod";
      paymentCounts[pm] = (paymentCounts[pm] || 0) + 1;
      // Delivery vs pickup
      if (o.method === "delivery") deliveryCount++; else pickupCount++;
      // Avg order value
      if (s !== "Cancelled" && o.totalAmount > 0) {
        totalOrderValue += o.totalAmount; orderValueCount++;
      }
      // Top products
      (o.items || []).forEach(item => {
        topProducts[item.name] = (topProducts[item.name] || 0) + item.quantity;
      });
    });

    const customers = userSnap.docs.filter(d => d.data().role !== "admin").length;
    const avgOrder = orderValueCount > 0 ? Math.round(totalOrderValue / orderValueCount) : 0;
    const cancelRate = orderSnap.size > 0 ? Math.round((cancelledCount / orderSnap.size) * 100) : 0;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    set("statTotalProducts", productSnap.size);
    set("statTotalOrders",   orderSnap.size);
    set("statPendingOrders", pendingCount);
    set("statRevenue",       `₱${totalRevenue.toLocaleString()}`);
    set("statTotalCustomers", customers);
    set("statDeliveredOrders", deliveredCount);
    set("statAvgOrder", `₱${avgOrder.toLocaleString()}`);
    set("statCancelRate", `${cancelRate}%`);

    // Prepare Chart.js default font
    if (window.Chart) {
      Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
      Chart.defaults.font.size = 12;
    }

    const last7 = buildLast7Days();
    const revData = last7.map(k => revenueByDay[k] || 0);

    // ── CHART 1: Orders by Status (Bar) ──
    destroyChart("statusChart");
    const sc = document.getElementById("statusChart");
    if (sc && window.Chart) {
      _charts["statusChart"] = new Chart(sc, {
        type: "bar",
        data: {
          labels: Object.keys(statusCounts).filter(k => statusCounts[k] > 0),
          datasets: [{
            data: Object.values(statusCounts).filter(v => v > 0),
            backgroundColor: ["#f0ad4e","#17a2b8","#007bff","#6f42c1","#28a745","#dc3545"],
            borderRadius: 8, borderSkipped: false
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => items[0].label + " Orders" } } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: "rgba(0,0,0,.05)" } }, x: { grid: { display: false } } }
        }
      });
    }

    // ── CHART 2: Revenue Last 7 Days (Line) ──
    destroyChart("revenueChart");
    const rc = document.getElementById("revenueChart");
    if (rc && window.Chart) {
      _charts["revenueChart"] = new Chart(rc, {
        type: "line",
        data: {
          labels: last7,
          datasets: [{
            data: revData,
            borderColor: "#0057B8",
            backgroundColor: "rgba(0,87,184,.12)",
            fill: true, tension: 0.4,
            pointBackgroundColor: "#0057B8",
            pointRadius: 5, pointHoverRadius: 7,
            borderWidth: 2.5
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `₱${ctx.parsed.y.toLocaleString()}` } } },
          scales: {
            y: { beginAtZero: true, grid: { color: "rgba(0,0,0,.05)" }, ticks: { callback: v => "₱" + (v>=1000?(v/1000).toFixed(1)+"k":v) } },
            x: { grid: { display: false } }
          }
        }
      });
    }

    // ── CHART 3: Top 5 Products (Horizontal Bar) ──
    destroyChart("topProductsChart");
    const tp = document.getElementById("topProductsChart");
    const sorted = Object.entries(topProducts).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if (tp && window.Chart && sorted.length) {
      _charts["topProductsChart"] = new Chart(tp, {
        type: "bar",
        data: {
          labels: sorted.map(([n]) => n.length > 22 ? n.slice(0,22)+"…" : n),
          datasets: [{ data: sorted.map(([,v]) => v), backgroundColor: "#FFD600", borderRadius: 6, borderSkipped: false }]
        },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: "rgba(0,0,0,.05)" } },
            y: { grid: { display: false } }
          }
        }
      });
    } else if (tp && !sorted.length) {
      tp.parentElement.innerHTML += `<p style="color:var(--muted);font-size:.82rem;padding:8px 0;">No sales data yet.</p>`;
    }

    // ── CHART 4: Payment Methods (Doughnut) ──
    destroyChart("paymentChart");
    const pc = document.getElementById("paymentChart");
    const pmLabels = { cod:"Cash", gcash:"GCash", maya:"Maya", paypal:"PayPal" };
    const pmColors = { cod:"#00C87A", gcash:"#0057B8", maya:"#FF9500", paypal:"#003087" };
    if (pc && window.Chart && Object.keys(paymentCounts).length) {
      _charts["paymentChart"] = new Chart(pc, {
        type: "doughnut",
        data: {
          labels: Object.keys(paymentCounts).map(k => pmLabels[k] || k),
          datasets: [{
            data: Object.values(paymentCounts),
            backgroundColor: Object.keys(paymentCounts).map(k => pmColors[k] || "#ccc"),
            borderWidth: 2, borderColor: "#fff"
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          cutout: "65%",
          plugins: { legend: { position: "bottom", labels: { padding: 12, font: { weight: "700" } } } }
        }
      });
    }

    // ── CHART 5: Orders by Day of Week (Radar / Bar) ──
    destroyChart("dowChart");
    const dc = document.getElementById("dowChart");
    if (dc && window.Chart) {
      _charts["dowChart"] = new Chart(dc, {
        type: "bar",
        data: {
          labels: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],
          datasets: [{
            data: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => dayOfWeekCounts[d]),
            backgroundColor: ["#e3f2fd","#bbdefb","#90caf9","#64b5f6","#42a5f5","#1e88e5","#1565c0"],
            borderRadius: 8, borderSkipped: false
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: "rgba(0,0,0,.05)" } },
            x: { grid: { display: false } }
          }
        }
      });
    }

    // ── CHART 6: Delivery vs Pickup (Doughnut) ──
    destroyChart("fulfillmentChart");
    const fc = document.getElementById("fulfillmentChart");
    if (fc && window.Chart && (deliveryCount + pickupCount) > 0) {
      _charts["fulfillmentChart"] = new Chart(fc, {
        type: "doughnut",
        data: {
          labels: ["Home Delivery","On-site Pick-up"],
          datasets: [{ data: [deliveryCount, pickupCount], backgroundColor: ["#0057B8","#FFD600"], borderWidth: 2, borderColor: "#fff" }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "65%",
          plugins: { legend: { position: "bottom", labels: { padding: 12, font: { weight: "700" } } } }
        }
      });
    }

    // ── Low Stock Alerts ──
    const lowStock = [];
    productSnap.forEach(d => {
      const p = d.data();
      const t = Object.values(p.stock || {}).reduce((a,b)=>a+Number(b),0);
      if (t <= 5) lowStock.push({ name: p.name, total: t });
    });

    if (logEl) {
      logEl.innerHTML = [
        { icon:"check_circle", cls:"success", msg:`System operational. ${productSnap.size} products · ${orderSnap.size} orders · ${customers} customers.` },
        { icon:"payments", cls:"info", msg:`Total delivered revenue: ₱${totalRevenue.toLocaleString()} · Avg order value: ₱${avgOrder.toLocaleString()}` },
        { icon:"pending_actions", cls:"warn", msg:`${pendingCount} pending · ${processingCount} processing · ${deliveredCount} delivered · ${cancelledCount} cancelled (${cancelRate}% rate)` },
        { icon:"local_shipping", cls:"info", msg:`Fulfillment: ${deliveryCount} deliveries · ${pickupCount} pickups` },
        ...(lowStock.length
          ? [{ icon:"warning", cls:"danger", msg:`⚠️ Low stock: ${lowStock.map(p=>`${p.name} (${p.total} left)`).join(", ")}` }]
          : [{ icon:"inventory_2", cls:"success", msg:"All products have healthy stock levels." }])
      ].map(i => `<div class="log-item log-${i.cls}"><span class="material-icons">${i.icon}</span><p>${i.msg}</p></div>`).join("");
    }
  } catch (err) {
    console.error("Analytics error:", err);
    if (logEl) logEl.innerHTML = `<p class="loading-text">Error loading analytics.</p>`;
  }
}

function buildLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toLocaleDateString("en-PH", { month:"short", day:"numeric" }));
  }
  return days;
}

function renderBarChart(containerId, data, colorMap) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const total = Object.values(data).reduce((a,b)=>a+b,0) || 1;
  const max   = Math.max(...Object.values(data), 1);
  el.innerHTML = Object.entries(data).map(([label, count]) => `
    <div style="display:flex;flex-direction:column;align-items:center;gap:5px;flex:1;min-width:60px;max-width:90px;">
      <span style="font-size:.75rem;font-weight:800;color:var(--text);">${count}</span>
      <div style="width:100%;height:${Math.max(16, Math.round((count/max)*100))}px;background:${colorMap[label]||'#ddd'};border-radius:6px 6px 0 0;transition:height .5s;"></div>
      <span style="font-size:.64rem;font-weight:600;color:var(--muted);text-align:center;">${label}</span>
    </div>`).join("");
}

function renderLineChart(containerId, data, color) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const entries = Object.entries(data);
  const max = Math.max(...entries.map(e=>e[1]), 1);
  el.innerHTML = entries.map(([label, val]) => `
    <div style="display:flex;flex-direction:column;align-items:center;gap:5px;flex:1;min-width:44px;">
      <span style="font-size:.65rem;font-weight:700;color:var(--text);">₱${val>=1000?(val/1000).toFixed(1)+'k':val}</span>
      <div style="width:100%;height:${Math.max(8, Math.round((val/max)*90))}px;background:${color};border-radius:5px 5px 0 0;opacity:.85;transition:height .5s;"></div>
      <span style="font-size:.6rem;color:var(--muted);text-align:center;">${label}</span>
    </div>`).join("");
}

function renderHorizontalBar(containerId, data, color) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const max = Math.max(...Object.values(data), 1);
  if (!Object.keys(data).length) { el.innerHTML = `<p style="color:var(--muted);font-size:.82rem;padding:12px 0;">No sales data yet.</p>`; return; }
  el.innerHTML = Object.entries(data).map(([name, qty]) => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      <span style="font-size:.76rem;color:var(--text);font-weight:600;width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;">${name}</span>
      <div style="flex:1;background:var(--border);border-radius:6px;height:14px;overflow:hidden;">
        <div style="width:${Math.round((qty/max)*100)}%;height:100%;background:${color};border-radius:6px;transition:width .5s;"></div>
      </div>
      <span style="font-size:.72rem;font-weight:700;color:var(--text);min-width:28px;text-align:right;">${qty}</span>
    </div>`).join("");
}

// ── COUPONS ──
async function loadCoupons() {
  const listEl = document.getElementById("couponList");
  if (!listEl) return;
  listEl.innerHTML = `<p style="color:var(--muted);font-size:.85rem;">Loading...</p>`;
  try {
    const snap = await getDocs(collection(db, "coupons"));
    if (snap.empty) { listEl.innerHTML = `<p style="color:var(--muted);font-size:.85rem;">No coupons yet.</p>`; return; }
    listEl.innerHTML = "";
    snap.forEach(d => {
      const c = d.data();
      const label  = c.type === "percent" ? `${c.value}% off` : `₱${c.value} off`;
      const expiry = c.expiresAt ? new Date(c.expiresAt.seconds ? c.expiresAt.seconds*1000 : c.expiresAt).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"}) : null;
      const now    = new Date();
      const isExpired = c.expiresAt && new Date(c.expiresAt.seconds ? c.expiresAt.seconds*1000 : c.expiresAt) < now;
      const usageText = c.maxUses ? ` · ${c.usedCount||0}/${c.maxUses} uses` : "";
      const item = document.createElement("div");
      item.className = "coupon-item";
      item.innerHTML = `
        <div>
          <span class="coupon-code">${d.id}</span>
          <span style="font-size:.75rem;color:var(--muted);margin-left:8px;">${label}${usageText}</span>
          ${expiry ? `<span style="font-size:.7rem;color:${isExpired?'var(--red)':'var(--muted)'};display:block;margin-top:2px;">${isExpired?'⛔ Expired':'⏰ Expires'}: ${expiry}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:.72rem;padding:2px 8px;border-radius:20px;background:${c.active&&!isExpired?'#E6FFF5':'#F8D7DA'};color:${c.active&&!isExpired?'var(--green)':'var(--red)'};font-weight:700;">${c.active&&!isExpired?'Active':'Inactive'}</span>
          <button class="coupon-delete" title="Delete"><span class="material-icons" style="font-size:18px;">delete</span></button>
        </div>`;
      item.querySelector(".coupon-delete").addEventListener("click", () => deleteCoupon(d.id));
      listEl.appendChild(item);
    });
  } catch (err) {
    listEl.innerHTML = `<p style="color:var(--muted);font-size:.85rem;">Error loading coupons.</p>`;
  }
}

async function saveCoupon() {
  const code     = document.getElementById("couponCode")?.value.trim().toUpperCase();
  const type     = document.getElementById("couponType")?.value;
  const value    = parseFloat(document.getElementById("couponValue")?.value);
  const active   = document.getElementById("couponActive")?.checked;
  const maxUses  = parseInt(document.getElementById("couponMaxUses")?.value) || null;
  const expiryDate = document.getElementById("couponExpiry")?.value;
  const expiryTime = document.getElementById("couponExpiryTime")?.value || "23:59";
  if (!code || !value || isNaN(value)) { showAdminToast("Please fill in Code and Value.", "error"); return; }
  const btn = document.getElementById("saveCouponBtn");
  btn.disabled = true; btn.innerText = "Saving...";
  const data = { type, value, active, createdAt: new Date(), usedCount: 0 };
  if (maxUses) data.maxUses = maxUses;
  if (expiryDate) data.expiresAt = new Date(`${expiryDate}T${expiryTime}`);
  try {
    await setDoc(doc(db, "coupons", code), data);
    ["couponCode","couponValue","couponMaxUses","couponExpiry","couponExpiryTime"].forEach(id=>{
      const el=document.getElementById(id);if(el)el.value="";
    });
    showAdminToast("✅ Coupon saved!"); loadCoupons();
  } catch (err) { showAdminToast("Failed to save coupon.", "error"); }
  finally { btn.disabled=false; btn.innerHTML=`<span class="material-icons" style="font-size:16px;vertical-align:middle;">save</span> Save Coupon`; }
}

async function deleteCoupon(id) {
  if (!confirm(`Delete coupon "${id}"?`)) return;
  try { await deleteDoc(doc(db,"coupons",id)); showAdminToast("Coupon deleted."); loadCoupons(); }
  catch (err) { showAdminToast("Failed.", "error"); }
}

// ── SHIPPING ──
async function loadShippingSettings() {
  try {
    const snap = await getDoc(doc(db, "settings", "store"));
    if (snap.exists()) {
      const d = snap.data();
      const _f = (id, val) => { const el=document.getElementById(id); if(el) el.value=val; };
      const _c = (id, val) => { const el=document.getElementById(id); if(el) el.checked=!!val; };
      _f("shippingFeeInput",  d.shippingFee??80);
      _f("storeNameInput",    d.storeName||"UniCheck School Official Store");
      _f("maxOrderQtyInput",  d.maxOrderQty||99);
      _f("orderCutoffTime",   d.orderCutoffTime||"17:00");
      _f("cancelWindowInput", d.cancelWindowHours||24);
      _f("refundWindowInput", d.refundWindowDays||7);
      _c("maintenanceModeToggle", d.maintenanceMode);
      _c("allowOrdersToggle",     d.allowOrders!==false);
      _c("showOutOfStockToggle",  d.showOutOfStock!==false);
      _c("allowExchangeToggle",   d.allowExchange!==false);
      // Admin display name
      const dn=document.getElementById("adminDisplayNameInput");
      const adm=document.getElementById("adminDisplayName");
      if(dn) dn.value=d.adminDisplayName||"Administrator";
      if(adm) adm.innerText=d.adminDisplayName||"Administrator";
    }
  } catch (e) {}
}

async function saveShipping() {
  const fee = parseFloat(document.getElementById("shippingFeeInput")?.value);
  if (isNaN(fee)||fee<0) { showAdminToast("Please enter a valid shipping fee.","error"); return; }
  const cutoff = document.getElementById("orderCutoffTime")?.value || "17:00";
  const btn=document.getElementById("saveShippingBtn"); btn.disabled=true;
  btn.innerHTML=`<span class="material-icons" style="font-size:16px;animation:spin .7s linear infinite;">autorenew</span> Saving...`;
  try {
    await setDoc(doc(db,"settings","store"),{shippingFee:fee, orderCutoffTime:cutoff},{merge:true});
    showAdminToast(`✅ Shipping settings saved!`);
  }
  catch(err){ showAdminToast("Failed to save.","error"); }
  finally { btn.disabled=false; btn.innerHTML=`<span class="material-icons">save</span> Save Shipping Settings`; }
}

async function loadStoreSettings() {
  await loadShippingSettings();
}

async function saveStoreName() {
  const name = document.getElementById("storeNameInput")?.value.trim();
  if (!name) { showAdminToast("Store name cannot be empty.","error"); return; }
  const btn=document.getElementById("saveStoreNameBtn"); btn.disabled=true;
  try { await setDoc(doc(db,"settings","store"),{storeName:name},{merge:true}); showAdminToast("✅ Store name saved!"); }
  catch(e){ showAdminToast("Failed.","error"); }
  finally { btn.disabled=false; btn.innerText="Save"; }
}

async function saveMaintenanceMode() {
  const on  = document.getElementById("maintenanceModeToggle")?.checked;
  const ao  = document.getElementById("allowOrdersToggle")?.checked;
  const oos = document.getElementById("showOutOfStockToggle")?.checked;
  const btn = document.getElementById("saveMaintenanceBtn"); btn.disabled=true;
  btn.innerHTML=`<span class="material-icons" style="font-size:16px;animation:spin .7s linear infinite;">autorenew</span> Saving...`;
  try {
    await setDoc(doc(db,"settings","store"),{
      maintenanceMode:!!on, allowOrders:!!ao, showOutOfStock:!!oos
    },{merge:true});
    showAdminToast(`✅ Store controls saved!`);
  } catch(e){ showAdminToast("Failed.","error"); }
  finally { btn.disabled=false; btn.innerHTML=`<span class="material-icons">save</span> Save Store Controls`; }
}

async function saveMaxOrderQty() {
  const qty = parseInt(document.getElementById("maxOrderQtyInput")?.value);
  if (isNaN(qty)||qty<1) { showAdminToast("Enter a valid quantity.","error"); return; }
  try { await setDoc(doc(db,"settings","store"),{maxOrderQty:qty},{merge:true}); showAdminToast("✅ Max order qty saved!"); }
  catch(e){ showAdminToast("Failed.","error"); }
}
async function savePolicySettings() {
  const cancelHrs  = parseInt(document.getElementById("cancelWindowInput")?.value)||24;
  const refundDays = parseInt(document.getElementById("refundWindowInput")?.value)||7;
  const allowEx    = document.getElementById("allowExchangeToggle")?.checked;
  try {
    await setDoc(doc(db,"settings","store"),{
      cancelWindowHours: cancelHrs,
      refundWindowDays: refundDays,
      allowExchange: !!allowEx
    },{merge:true});
    showAdminToast("✅ Order policy saved!");
  } catch(e){ showAdminToast("Failed.","error"); }
}
window.savePolicySettings = savePolicySettings;

async function saveAdminDisplayName() {
  const name = document.getElementById("adminDisplayNameInput")?.value.trim();
  if (!name) { showAdminToast("Enter a display name.","error"); return; }
  try {
    await setDoc(doc(db,"settings","store"),{adminDisplayName:name},{merge:true});
    const adm = document.getElementById("adminDisplayName");
    const sidebarName = document.querySelector(".sidebar-user-info p");
    if (adm) adm.innerText = name;
    if (sidebarName) sidebarName.innerText = name;
    showAdminToast("✅ Display name updated!");
  } catch(e){ showAdminToast("Failed.","error"); }
}
window.saveAdminDisplayName = saveAdminDisplayName;

window.saveMaxOrderQty = saveMaxOrderQty;

// ── ANNOUNCEMENTS ──
async function loadAnnouncements() {
  const listEl = document.getElementById("announceAdminList");
  if (!listEl) return;
  listEl.innerHTML = `<p style="color:var(--muted);font-size:.85rem;">Loading...</p>`;
  try {
    const snap = await getDocs(collection(db, "announcements"));
    if (snap.empty) { listEl.innerHTML=`<p style="color:var(--muted);font-size:.85rem;">No announcements yet.</p>`; return; }
    const items = [];
    snap.forEach(d => items.push({ id:d.id, ...d.data() }));
    items.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    listEl.innerHTML = "";
    items.forEach(a => {
      const item = document.createElement("div");
      item.className = "coupon-item";
      item.style.cssText = "flex-direction:column;align-items:flex-start;gap:4px;";
      item.innerHTML = `
        <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
          <strong style="font-size:.88rem;">${a.title||'Untitled'}</strong>
          <button class="coupon-delete" title="Delete"><span class="material-icons" style="font-size:17px;">delete</span></button>
        </div>
        <span style="font-size:.75rem;color:var(--muted);">${a.tag||'info'} · ${a.body||''}</span>`;
      item.querySelector(".coupon-delete").addEventListener("click", () => deleteAnnouncement(a.id));
      listEl.appendChild(item);
    });
  } catch(e) { listEl.innerHTML=`<p style="color:var(--muted);font-size:.85rem;">Error.</p>`; }
}

async function saveAnnouncement() {
  const title=document.getElementById("announceTitle")?.value.trim();
  const tag=document.getElementById("announceType")?.value;
  const body=document.getElementById("announceMsg")?.value.trim();
  if (!title||!body){ showAdminToast("Fill in Title and Message.","error"); return; }
  const btn=document.getElementById("saveAnnounceBtn"); btn.disabled=true; btn.innerText="Posting...";
  try {
    await addDoc(collection(db,"announcements"),{title,tag,body,createdAt:new Date()});
    document.getElementById("announceTitle").value="";
    document.getElementById("announceMsg").value="";
    showAdminToast("✅ Announcement posted!"); loadAnnouncements();
  } catch(e){ showAdminToast("Failed to post.","error"); }
  finally{ btn.disabled=false; btn.innerHTML=`<span class="material-icons" style="font-size:16px;vertical-align:middle;">send</span> Post Announcement`; }
}

async function deleteAnnouncement(id) {
  if (!confirm("Delete this announcement?")) return;
  try { await deleteDoc(doc(db,"announcements",id)); showAdminToast("Deleted."); loadAnnouncements(); }
  catch(e){ showAdminToast("Failed.","error"); }
}

// ── PICKUP NOTIFICATIONS ──

// ── Stores all inbox items for client-side filter ──
let _allInboxItems = [];

// ── Live Inbox Listener (real-time updates via onSnapshot) ──
function startLiveInboxListener() {
  if (_inboxUnsubscribe) _inboxUnsubscribe();
  const inboxQuery = query(collection(db, "chats"), orderBy("lastAt", "desc"));
  _inboxUnsubscribe = onSnapshot(inboxQuery, snap => {
    renderInboxFromSnap(snap);
    // Update unread badge in sidebar
    let unread = 0;
    snap.forEach(d => { if (d.data().hasUnread) unread++; });
    const badge = document.getElementById("chatUnreadBadge");
    if (badge) {
      badge.textContent = unread;
      badge.style.display = unread > 0 ? "inline-flex" : "none";
    }
  }, err => {
    console.error("Chat inbox listener error:", err);
    const listEl = document.getElementById("chatInboxList");
    if (listEl) listEl.innerHTML = `<div style="color:var(--muted);font-size:.82rem;padding:16px;text-align:center;">
      <span class="material-icons" style="display:block;font-size:2rem;opacity:.3;margin-bottom:8px;">error_outline</span>
      Could not load chats.<br><span style="font-size:.75rem;">Check Firestore rules for chats collection.</span>
    </div>`;
  });
}

// ── Render inbox from a Firestore snapshot ──
function renderInboxFromSnap(snap) {
  _allInboxItems = [];
  snap.forEach(d => _allInboxItems.push({ id: d.id, ...d.data() }));
  renderInboxItems(_allInboxItems);
}

function renderInboxItems(items) {
  const listEl = document.getElementById("chatInboxList");
  if (!listEl) return;

  if (!items.length) {
    listEl.innerHTML = `<div style="text-align:center;padding:40px 16px;color:var(--muted);">
      <span class="material-icons" style="font-size:2.4rem;display:block;opacity:.25;margin-bottom:10px;">chat_bubble_outline</span>
      <p style="font-size:.84rem;font-weight:600;">No conversations yet</p>
      <p style="font-size:.75rem;margin-top:4px;">Students will appear here once they send a message</p>
    </div>`;
    return;
  }

  listEl.innerHTML = "";
  items.forEach(chat => {
    const name    = chat.username || chat.userEmail?.split("@")[0] || "Student";
    const preview = chat.lastMessage || "No messages yet";
    const hasUnread = !!chat.hasUnread;
    const avatarUrl = chat.avatarUrl || "";
    const timeStr = chat.lastAt?.toDate
      ? (() => {
          const d = new Date(chat.lastAt.toDate());
          const now = new Date();
          const diffMs = now - d;
          const diffMins = Math.floor(diffMs / 60000);
          const diffHrs  = Math.floor(diffMs / 3600000);
          const diffDays = Math.floor(diffMs / 86400000);
          if (diffMins < 1)   return "now";
          if (diffMins < 60)  return `${diffMins}m`;
          if (diffHrs  < 24)  return `${diffHrs}h`;
          if (diffDays < 7)   return `${diffDays}d`;
          return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
        })()
      : "";

    const isActive = window._activeChatId === chat.id;

    const item = document.createElement("div");
    item.className = `chat-inbox-item${hasUnread ? " has-unread" : ""}${isActive ? " active" : ""}`;
    item.dataset.sessionId = chat.id;
    item.innerHTML = `
      <div class="chat-inbox-avatar">
        ${avatarUrl
          ? `<img src="${avatarUrl}" alt="" onerror="this.style.display='none'">`
          : `<span>${name[0].toUpperCase()}</span>`}
      </div>
      <div class="chat-inbox-body">
        <div class="chat-inbox-meta">
          <span class="chat-inbox-user">${name}</span>
          <span class="chat-inbox-time">${timeStr}</span>
        </div>
        <div class="chat-inbox-preview">${preview}</div>
      </div>
      ${hasUnread ? `<div class="fm-unread-dot"></div>` : ""}`;

    item.addEventListener("click", () => {
      openChatSession(chat.id, name, chat.userEmail || "", avatarUrl);
    });
    listEl.appendChild(item);
  });
}

// ── Client-side inbox search/filter ──
window.fmFilterInbox = function(query) {
  const q = (query || "").toLowerCase().trim();
  if (!q) { renderInboxItems(_allInboxItems); return; }
  const filtered = _allInboxItems.filter(c => {
    const name = (c.username || c.userEmail || "").toLowerCase();
    const preview = (c.lastMessage || "").toLowerCase();
    return name.includes(q) || preview.includes(q);
  });
  renderInboxItems(filtered);
};

// ── Mobile panel navigation ──
window.fmShowInbox = function() {
  document.getElementById("fmShell")?.classList.remove("fm-chat-open") ||
  document.querySelector(".fm-shell")?.classList.remove("fm-chat-open");
};
window.fmShowChat = function() {
  document.getElementById("fmShell")?.classList.add("fm-chat-open") ||
  document.querySelector(".fm-shell")?.classList.add("fm-chat-open");
};

// ── Expose openChatSession to window so HTML onclick can call it ──
window.openChatSession = openChatSession;

async function loadChatInbox() {
  const listEl = document.getElementById("chatInboxList");
  if (!listEl) return;
  listEl.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted);font-size:.82rem;">Loading…</div>`;
  // The live listener will populate it; just trigger a re-render
  try {
    const snap = await getDocs(collection(db, "chats"));
    renderInboxFromSnap(snap);
  } catch(e) {
    listEl.innerHTML = `<div style="color:var(--muted);font-size:.82rem;padding:12px;">Error loading chats.</div>`;
  }
}

async function openChatSession(sessionId, userName, userEmail, avatarUrl) {
  window._activeChatId     = sessionId;
  window._activeChatAvatar = avatarUrl || "";
  currentChatSessionId     = sessionId;

  const nameEl    = document.getElementById("chatWithUser");
  const subEl     = document.getElementById("chatWithSub");
  const headerAvEl= document.getElementById("chatUserAvatarLetter");
  if (nameEl) nameEl.innerText = userName || "Customer";
  if (subEl)  subEl.innerText  = userEmail || "";
  if (headerAvEl) {
    if (avatarUrl) {
      headerAvEl.innerHTML = `<img src="${avatarUrl}" alt="">`;
    } else {
      headerAvEl.innerHTML = (userName||"U")[0].toUpperCase();
    }
  }
  document.getElementById("adminChatWindow").style.display = "flex";
  document.getElementById("chatEmptyState").style.display  = "none";
  // Slide to chat panel on mobile
  window.fmShowChat && window.fmShowChat();
  document.getElementById("adminChatInput")?.focus();

  try { await updateDoc(doc(db,"chats",sessionId),{hasUnread:false}); } catch(e){}

  // ── Start live message listener for this session ──
  if (_chatUnsubscribe) _chatUnsubscribe();
  const msgQuery = query(collection(db,"chats",sessionId,"messages"), orderBy("createdAt","asc"));
  _chatUnsubscribe = onSnapshot(msgQuery, snap => {
    renderChatMessages(snap);
  });

  loadChatInbox();
}

function renderChatMessages(snap) {
  const messagesEl = document.getElementById("adminChatMessages");
  if (!messagesEl) return;
  const wasAtBottom = messagesEl.scrollHeight - messagesEl.scrollTop <= messagesEl.clientHeight + 60;
  messagesEl.innerHTML = "";

  const adminImg = document.getElementById("sidebarAvatarImg");
  const adminSrc = adminImg?.style.display !== "none" ? adminImg?.src : "";

  let prevSender = null;

  const allMsgs = [];
  snap.forEach(d => allMsgs.push(d.data()));

  allMsgs.forEach((m, idx) => {
    const isAdmin = m.sender === "admin";
    const sender  = isAdmin ? "admin" : (m.userId || "user");
    const timeStr = m.createdAt?.toDate
      ? new Date(m.createdAt.toDate()).toLocaleTimeString("en-PH",{hour:"numeric",minute:"2-digit",hour12:true})
      : "";

    const prevSender2 = idx > 0 ? (allMsgs[idx-1].sender==="admin" ? "admin" : (allMsgs[idx-1].userId||"user")) : null;
    const nextSender2 = idx < allMsgs.length-1 ? (allMsgs[idx+1].sender==="admin" ? "admin" : (allMsgs[idx+1].userId||"user")) : null;
    const sameAsPrev = sender === prevSender2;
    const sameAsNext = sender === nextSender2;

    let groupClass = "";
    if (sameAsPrev && sameAsNext) groupClass = " mid-in-group";
    else if (!sameAsPrev && sameAsNext) groupClass = " first-in-group";
    else if (sameAsPrev && !sameAsNext) groupClass = " last-in-group";

    const row = document.createElement("div");
    row.className = `msngr-msg-row${isAdmin?" sent":""}${sameAsPrev?" no-avatar":""}${groupClass}`;
    prevSender = sender;

    // Avatar
    let avatarHtml = "";
    if (!isAdmin) {
      const userAvatar = m.avatarUrl || window._activeChatAvatar || "";
      avatarHtml = `<div class="msngr-msg-avatar">${
        userAvatar
          ? `<img src="${userAvatar}" alt="">`
          : (m.username||"U")[0].toUpperCase()
      }</div>`;
    }

    // Bubble content
    const hasMedia = !!m.mediaUrl;
    const hasText  = !!(m.text && m.text.trim());

    let bubbleClass = "msngr-bubble";
    let bubbleInner = "";

    if (hasMedia) {
      if (hasText) {
        // Media + text: wrap media inside bubble with text below
        bubbleClass += " has-text-below";
        if (m.mediaType === "video") {
          bubbleInner = `<video src="${m.mediaUrl}" controls></video>
            <div class="msngr-bubble-text-inner">${m.text}</div>`;
        } else {
          bubbleInner = `<img src="${m.mediaUrl}" onclick="openAdminMediaLightbox('${m.mediaUrl}','image')" loading="lazy" alt="">
            <div class="msngr-bubble-text-inner">${m.text}</div>`;
        }
      } else {
        // Media only: clean bubble no padding
        bubbleClass += " is-media";
        if (m.mediaType === "video") {
          bubbleInner = `<video src="${m.mediaUrl}" controls></video>`;
        } else {
          bubbleInner = `<img src="${m.mediaUrl}" onclick="openAdminMediaLightbox('${m.mediaUrl}','image')" loading="lazy" alt="">`;
        }
      }
    } else {
      bubbleInner = m.text || "📎 Media";
    }

    row.innerHTML = `
      ${avatarHtml}
      <div class="msngr-bubble-wrap">
        <div class="${bubbleClass}">${bubbleInner}</div>
        <div class="msngr-msg-meta">${isAdmin?"You (Admin)":(m.username||"Customer")} · ${timeStr}</div>
      </div>`;
    messagesEl.appendChild(row);
  });

  if (wasAtBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
}

window.openAdminMediaLightbox = function(src, type) {
  let lb = document.getElementById("adminMediaLightbox");
  if (!lb) {
    lb = document.createElement("div");
    lb.id = "adminMediaLightbox";
    lb.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;";
    lb.onclick = () => lb.remove();
    document.body.appendChild(lb);
  }
  lb.innerHTML = "";
  if (type === "video") {
    const v = document.createElement("video");
    v.src = src; v.controls = true;
    v.style.cssText = "max-width:90vw;max-height:90vh;border-radius:12px;";
    lb.appendChild(v);
  } else {
    const img = document.createElement("img");
    img.src = src;
    img.style.cssText = "max-width:90vw;max-height:90vh;border-radius:12px;object-fit:contain;";
    lb.appendChild(img);
  }
  lb.style.display = "flex";
};

async function sendAdminReply(mediaUrl=null, mediaType=null) {
  if (!currentChatSessionId) return;
  const input = document.getElementById("adminChatInput");
  const text  = input?.value.trim();
  if (!text && !mediaUrl) return;
  if (input) input.value = "";
  try {
    const user = auth.currentUser;
    const msgData = {
      text: text || "",
      sender: "admin",
      userId: user?.uid,
      username: "Admin",
      createdAt: serverTimestamp(),
      read: false
    };
    if (mediaUrl) { msgData.mediaUrl = mediaUrl; msgData.mediaType = mediaType || "image"; }
    await addDoc(collection(db, "chats", currentChatSessionId, "messages"), msgData);
    await updateDoc(doc(db, "chats", currentChatSessionId), {
      lastMessage: mediaUrl ? "📎 Media" : text,
      lastAt: serverTimestamp(),
      hasUnread: false
    });
  } catch(e) { showAdminToast("Failed to send.", "error"); }
}

// Admin media upload handler
async function handleAdminMediaUpload(file) {
  if (!currentChatSessionId) return;
  if (!file) return;
  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");
  if (!isImage && !isVideo) { showAdminToast("Only images/videos allowed.", "error"); return; }
  if (file.size > 10 * 1024 * 1024) { showAdminToast("File too large (max 10MB).", "error"); return; }
  // Show optimistic preview via Blob URL (instant, no base64 delay)
  const blobUrl = URL.createObjectURL(file);
  const messagesEl = document.getElementById("adminChatMessages");
  if (messagesEl) {
    const row = document.createElement("div");
    row.className = "msngr-msg-row sent";
    const mediaPart = isVideo
      ? `<video src="${blobUrl}" controls></video>`
      : `<img src="${blobUrl}" loading="lazy" alt="">`;
    row.innerHTML = `<div class="msngr-bubble-wrap">
      <div class="msngr-bubble is-media">${mediaPart}</div>
      <div class="msngr-msg-meta" style="text-align:right;">You (Admin) · sending…</div>
    </div>`;
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  // Compress then save to Firestore
  const b64 = await compressAndRead(file);
  const mediaType2 = isVideo ? "video" : "image";
  await sendAdminReply(b64, mediaType2);
  URL.revokeObjectURL(blobUrl);
}
window.handleAdminMediaUpload = handleAdminMediaUpload;

// Reset chat (delete all messages)
async function resetChatSession(sessionId) {
  if (!sessionId) return;
  if (!confirm("Reset this conversation? All messages will be permanently deleted.")) return;
  try {
    const msgSnap = await getDocs(collection(db, "chats", sessionId, "messages"));
    const delPromises = [];
    msgSnap.forEach(d => delPromises.push(deleteDoc(doc(db, "chats", sessionId, "messages", d.id))));
    await Promise.all(delPromises);
    await updateDoc(doc(db, "chats", sessionId), { lastMessage: "", lastAt: serverTimestamp(), hasUnread: false });
    // Clear chat window
    const messagesEl = document.getElementById("adminChatMessages");
    if (messagesEl) messagesEl.innerHTML = "";
    showAdminToast("✅ Conversation reset.");
  } catch(e) {
    console.error(e);
    showAdminToast("Failed to reset chat.", "error");
  }
}
window.resetChatSession = resetChatSession;

// ── ADMIN LOAD REVIEWS (exposed for admin.html reviews modal) ──
window.adminLoadReviews = async function() {
  // Fetch all reviews
  const reviewSnap = await getDocs(query(collection(db, "reviews"), orderBy("createdAt", "desc")));
  if (reviewSnap.empty) return [];

  // Fetch all products once to build a name lookup map
  const productSnap = await getDocs(collection(db, "products"));
  const productMap = {};
  productSnap.forEach(d => { productMap[d.id] = d.data().name || "Unknown Product"; });

  const reviews = [];
  reviewSnap.forEach(d => {
    const r = d.data();
    reviews.push({
      id: d.id,
      productId:   r.productId   || "",
      productName: productMap[r.productId] || "Unknown Product",
      userId:      r.userId      || "",
      userName:    r.username    || r.userEmail || "Anonymous",
      rating:      r.rating      || 0,
      comment:     r.comment     || "",
      createdAt:   r.createdAt   || null,
      status:      r.status      || "published",
    });
  });
  return reviews;
};

// ═══════════════════════════════════════════════════
//  ORDER HUB – 5 Modal System
// ═══════════════════════════════════════════════════

let _ohSelectedOrder = null; // currently selected order for split-panel modals

// ── Open / Close ─────────────────────────────────
function openOrderHub(type) {
  const id = { pending:'ohModalPending', fulfillment:'ohModalFulfillment',
                payment:'ohModalPayment', returns:'ohModalReturns' }[type];
  if (!id) return;
  document.getElementById(id).classList.add('open');
  _ohSelectedOrder = null;
  if (type === 'pending')     ohLoadPending();
  if (type === 'fulfillment') ohLoadFulfillment();
  if (type === 'payment')     ohLoadPayment();
  if (type === 'returns')     ohLoadReturns();
}

function closeOhModal(type) {
  const id = { pending:'ohModalPending', fulfillment:'ohModalFulfillment',
                payment:'ohModalPayment', returns:'ohModalReturns' }[type];
  if (id) document.getElementById(id).classList.remove('open');
}

// ── Shared helpers ────────────────────────────────
function ohFmtDate(ts) {
  if (!ts?.toDate) return '—';
  return new Date(ts.toDate()).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});
}
function ohFmtItems(items=[]) {
  return (items).map(i=>`${i.quantity}× ${i.name} (${(i.size||'').toUpperCase()})`).join(', ');
}

// _ohRefreshStats is called at the end of the original loadOrders above

function _ohRefreshStats() {
  const pending    = allOrders.filter(o=>o.status==='Pending').length;
  const approved   = allOrders.filter(o=>o.status==='Approved').length;
  const delivered  = allOrders.filter(o=>o.status==='Delivered').length;
  const payVer     = allOrders.filter(o=>o.paymentStatus==='pending_verification').length;
  const returns    = allOrders.filter(o=>o.status==='Return'||o.status==='Exchange'||o.status==='Refund'||o.status==='Refunded').length;

  _setText('ohStatTotal',      allOrders.length);
  _setText('ohStatPending',    pending);
  _setText('ohStatProcessing', approved);
  _setText('ohStatDelivered',  delivered);
  _setText('ohBadgePending',      pending);
  _setText('ohBadgeFulfillment',  approved);
  _setText('ohBadgePayment',      payVer);
  _setText('ohBadgeReturns',      returns);
  _setText('ohBadgeAll',          allOrders.length);
}
function _setText(id,v){ const el=document.getElementById(id); if(el) el.innerText=v; }

// ── Modal 1 : Pending Approval ────────────────────
async function ohLoadPending() {
  const el = document.getElementById('ohPendingList');
  el.innerHTML = '<p class="oh-empty">Loading…</p>';
  try {
    const snap = await getDocs(query(collection(db,'orders'), where('status','==','Pending')));
    const orders = []; snap.forEach(d=>orders.push({id:d.id,...d.data()}));
    orders.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    if(!orders.length){ el.innerHTML='<p class="oh-empty">✅ No pending orders!</p>'; return; }
    el.innerHTML='';
    orders.forEach(o=>{
      const isPaid = !['gcash','maya','paypal'].includes((o.payment||'').toLowerCase());
      const payBadge = isPaid
        ? `<span style="font-size:.7rem;background:#D1FAE5;color:#065F46;padding:2px 7px;border-radius:5px;font-weight:700;">💵 ${(o.payment||'COD').toUpperCase()}</span>`
        : `<span style="font-size:.7rem;background:#FEF3C7;color:#92400E;padding:2px 7px;border-radius:5px;font-weight:700;">⏳ ${(o.payment||'').toUpperCase()} – Pending Verification</span>`;
      const row = document.createElement('div');
      row.className='oh-order-row';
      row.innerHTML=`
        <div class="oh-order-row-id">Order #${o.id.substring(0,8).toUpperCase()} ${payBadge}</div>
        <div class="oh-order-row-meta">👤 ${o.customerName||o.userEmail||'—'} · 📅 ${ohFmtDate(o.createdAt)}</div>
        <div class="oh-order-row-meta" style="margin:2px 0;color:var(--text);">${ohFmtItems(o.items)}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;gap:6px;flex-wrap:wrap;">
          <span class="oh-order-row-amount">₱${Number(o.totalAmount||0).toLocaleString()}</span>
          <div style="display:flex;gap:6px;">
            ${isPaid
              ? `<button class="oh-btn oh-btn--approve" style="padding:6px 14px;font-size:.78rem;" data-action="approve">
                   <span class="material-icons" style="font-size:15px;">check</span> Confirm & Approve
                 </button>`
              : `<button class="oh-btn" style="padding:6px 14px;font-size:.78rem;background:#F59E0B;color:#fff;" data-action="verify">
                   <span class="material-icons" style="font-size:15px;">receipt_long</span> Confirm – Needs Payment Check
                 </button>`
            }
            <button class="oh-btn oh-btn--reject" style="padding:6px 10px;font-size:.78rem;" data-action="cancel">
              <span class="material-icons" style="font-size:15px;">close</span>
            </button>
          </div>
        </div>`;

      // Approve / move to Processing (COD or already paid)
      row.querySelector('[data-action="approve"]')?.addEventListener('click', async(e)=>{
        e.stopPropagation();
        const btn=e.currentTarget; btn.disabled=true; btn.innerText='Saving…';
        try {
          await updateDoc(doc(db,'orders',o.id),{
            status:'Approved', paymentStatus:'paid', updatedAt:new Date()
          });
          showAdminToast('✅ Order approved!');
          ohLoadPending(); loadOrders();
        } catch(err){ showAdminToast('Error: '+err.message,'error'); btn.disabled=false; }
      });

      // Confirm receipt but route to Payment Verification (GCash/Maya/PayPal)
      row.querySelector('[data-action="verify"]')?.addEventListener('click', async(e)=>{
        e.stopPropagation();
        const btn=e.currentTarget; btn.disabled=true; btn.innerText='Saving…';
        try {
          // Keep status Pending, just flag it as acknowledged so it shows in Payment Verification
          await updateDoc(doc(db,'orders',o.id),{
            status:'Pending', paymentStatus:'pending_verification', adminAcknowledged:true, updatedAt:new Date()
          });
          showAdminToast('📋 Order flagged – go to Payment Verification to confirm payment.');
          ohLoadPending(); loadOrders();
        } catch(err){ showAdminToast('Error: '+err.message,'error'); btn.disabled=false; }
      });

      // Cancel / reject order
      row.querySelector('[data-action="cancel"]')?.addEventListener('click', async(e)=>{
        e.stopPropagation();
        if(!confirm('Cancel this order? Stock will be restored.')) return;
        try {
          await updateDoc(doc(db,'orders',o.id),{status:'Cancelled',updatedAt:new Date()});
          // Restore stock
          for(const item of (o.items||[])){
            try {
              const pSnap=await getDoc(doc(db,'products',item.id));
              if(pSnap.exists()){
                const stock=pSnap.data().stock||{};
                const sk=stock[item.size]!==undefined?item.size:item.size?.toUpperCase();
                await updateDoc(doc(db,'products',item.id),{[`stock.${sk}`]:(parseInt(stock[sk])||0)+item.quantity});
              }
            } catch(_){}
          }
          showAdminToast('🚫 Order cancelled and stock restored.');
          ohLoadPending(); loadOrders();
        } catch(err){ showAdminToast('Error: '+err.message,'error'); }
      });

      el.appendChild(row);
    });
  } catch(e){ el.innerHTML='<p class="oh-empty">Error loading orders.</p>'; console.error(e); }
}

// ── Modal 2 : Fulfillment & Packing ──────────────
// Only shows Approved orders (payment cleared). "Mark Ready" writes a real
// announcement to Firestore so the student sees it in the app.
async function ohLoadFulfillment() {
  const listEl = document.getElementById('ohFulfillmentList');
  listEl.innerHTML='<p class="oh-empty">Loading…</p>';
  document.getElementById('ohFulfillmentDetail').style.display='none';
  document.getElementById('ohFulPlaceholder').style.display='flex';
  try {
    const snap = await getDocs(query(collection(db,'orders'),where('status','==','Approved')));
    const orders=[]; snap.forEach(d=>orders.push({id:d.id,...d.data()}));
    orders.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    if(!orders.length){ listEl.innerHTML='<p class="oh-empty">No approved orders to pack.<br><span style="font-size:.75rem;">Approve orders via New Order Requests first.</span></p>'; return; }
    listEl.innerHTML='';
    orders.forEach(o=>{
      const row=document.createElement('div');
      row.className='oh-order-row';
      row.innerHTML=`
        <div class="oh-order-row-id">Order #${o.id.substring(0,8).toUpperCase()}</div>
        <div class="oh-order-row-meta">👤 ${o.customerName||o.userEmail||'—'}</div>
        <div class="oh-order-row-meta">📦 ${o.method==='delivery'?'Home Delivery':'On-site Pick-up'}</div>
        <div class="oh-order-row-amount">₱${Number(o.totalAmount||0).toLocaleString()}</div>`;
      row.addEventListener('click',()=>ohShowFulDetail(o, row));
      listEl.appendChild(row);
    });
  } catch(e){ listEl.innerHTML='<p class="oh-empty">Error loading.</p>'; console.error(e); }
}

function ohShowFulDetail(o, rowEl) {
  _ohSelectedOrder=o;
  document.querySelectorAll('#ohFulfillmentList .oh-order-row').forEach(r=>r.classList.remove('selected'));
  rowEl.classList.add('selected');
  document.getElementById('ohFulPlaceholder').style.display='none';
  const detail=document.getElementById('ohFulfillmentDetail');
  detail.style.display='block';
  document.getElementById('ohFulTitle').innerHTML=`
    <strong>#${o.id.substring(0,8).toUpperCase()}</strong> · ${o.customerName||o.userEmail||'—'}
    <br><span style="font-size:.75rem;font-weight:400;color:var(--muted);">
      💳 ${(o.payment||'COD').toUpperCase()} · 📦 ${o.method==='delivery'?'Home Delivery':'On-site Pick-up'}
      ${o.address?'· 📍 '+o.address:''}
    </span>`;
  const cl=document.getElementById('ohFulChecklist'); cl.innerHTML='';
  (o.items||[]).forEach(item=>{
    const div=document.createElement('div'); div.className='oh-check-item';
    div.innerHTML=`<input type="checkbox"><span>${item.quantity}× <strong>${item.name}</strong> — Size ${(item.size||'').toUpperCase()} · ₱${(item.price*item.quantity).toLocaleString()}</span>`;
    div.querySelector('input').addEventListener('change',function(){ div.classList.toggle('checked',this.checked); });
    cl.appendChild(div);
  });
  // Show total
  cl.innerHTML+=`<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-size:.85rem;font-weight:700;">
    <span>Order Total</span><span style="color:var(--blue);">₱${Number(o.totalAmount||0).toLocaleString()}</span></div>`;
}

async function ohMarkReady() {
  if(!_ohSelectedOrder) return;
  const o=_ohSelectedOrder;
  const btn=document.querySelector('#ohFulfillmentDetail .oh-btn--ready');
  if(btn){ btn.disabled=true; btn.innerText='Notifying…'; }
  try {
    // 1. Update order status to Ready for Pickup
    await updateDoc(doc(db,'orders',o.id),{status:'Ready for Pickup', updatedAt:new Date()});

    // 2. Write a personal notification into /notifications/{userId}/items/
    const notifTitle = `📦 Your order is ready! — #${o.id.substring(0,8).toUpperCase()}`;
    const notifBody  = `Hi ${o.customerName||'there'}! Your order has been packed and is ready for ${o.method==='delivery'?'delivery':'pickup at the school campus'}.\n\nOrder: ${ohFmtItems(o.items)}\nTotal: ₱${Number(o.totalAmount||0).toLocaleString()}\n\nPlease bring your digital invoice QR code when claiming. Thank you!`;
    if (o.userId) {
      await addDoc(collection(db,'notifications',o.userId,'items'),{
        title: notifTitle,
        body: notifBody,
        tag: 'order_ready',
        orderId: o.id,
        createdAt: new Date(),
        read: false
      });
    }

    showAdminToast('🔔 Student notified — order marked as Ready for Pickup!');
    ohLoadFulfillment(); loadOrders();
  } catch(e){ showAdminToast('Error: '+e.message,'error'); console.error(e); }
  finally { if(btn){ btn.disabled=false; btn.innerHTML='<span class="material-icons">notifications_active</span> Notify & Mark Ready'; } }
}

function ohPrintReceipt() {
  if(!_ohSelectedOrder) return;
  const o=_ohSelectedOrder;
  const win=window.open('','_blank','width=420,height=640');
  const rows=(o.items||[]).map(i=>`
    <tr>
      <td>${i.name} (${(i.size||'').toUpperCase()})</td>
      <td style="text-align:center;">×${i.quantity}</td>
      <td style="text-align:right;">₱${(i.price*i.quantity).toLocaleString()}</td>
    </tr>`).join('');
  win.document.write(`<!DOCTYPE html><html><head><title>Claim Slip – #${o.id.substring(0,8).toUpperCase()}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:28px;font-size:13px;color:#111;}
      h2{margin:0 0 2px;font-size:16px;}
      .sub{font-size:11px;color:#666;margin-bottom:14px;}
      hr{border:none;border-top:1px dashed #ccc;margin:12px 0;}
      table{width:100%;border-collapse:collapse;}
      th{font-size:10px;text-transform:uppercase;color:#999;text-align:left;padding-bottom:6px;}
      th:last-child,td:last-child{text-align:right;}
      th:nth-child(2),td:nth-child(2){text-align:center;}
      td{padding:5px 0;border-bottom:1px solid #f0f0f0;font-size:12px;}
      .total{font-weight:bold;font-size:13px;}
      .footer{font-size:10px;color:#999;margin-top:16px;text-align:center;}
    </style>
    </head><body>
    <h2>UniCheck — Claim Slip</h2>
    <div class="sub">Order #${o.id.substring(0,8).toUpperCase()} · ${ohFmtDate(o.createdAt)}</div>
    <div style="font-size:12px;margin-bottom:12px;">
      <strong>Customer:</strong> ${o.customerName||o.userEmail||'—'}<br>
      <strong>Payment:</strong> ${(o.payment||'COD').toUpperCase()}${o.refNumber?` · Ref: ${o.refNumber}`:''}<br>
      <strong>Method:</strong> ${o.method==='delivery'?'Home Delivery':'On-site Pick-up'}
    </div>
    <hr>
    <table>
      <thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="total"><td colspan="2">Total</td><td>₱${Number(o.totalAmount||0).toLocaleString()}</td></tr>
      </tfoot>
    </table>
    <hr>
    <div class="footer">Present this slip when claiming your order. Thank you!</div>
    </body></html>`);
  win.document.close(); win.print();
}

// ── Modal 3 : Payment Verification ───────────────
// Shows only orders with paymentStatus === 'pending_verification'.
// No image — shows ref number, order info, and payment method.
// Approve → sets paymentStatus:'verified', status:'Approved' (moves to Fulfillment queue).
// Reject  → sets paymentStatus:'rejected', status:'Cancelled', restores stock.
async function ohLoadPayment() {
  const listEl=document.getElementById('ohPaymentList');
  listEl.innerHTML='<p class="oh-empty">Loading…</p>';
  document.getElementById('ohPaymentDetail').style.display='none';
  document.getElementById('ohPayPlaceholder').style.display='flex';
  try {
    const snap=await getDocs(query(collection(db,'orders'),where('paymentStatus','==','pending_verification')));
    const orders=[]; snap.forEach(d=>orders.push({id:d.id,...d.data()}));
    orders.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    if(!orders.length){ listEl.innerHTML='<p class="oh-empty">✅ No payments to verify!</p>'; return; }
    listEl.innerHTML='';
    orders.forEach(o=>{
      const row=document.createElement('div');
      row.className='oh-order-row';
      row.innerHTML=`
        <div class="oh-order-row-id">Order #${o.id.substring(0,8).toUpperCase()}</div>
        <div class="oh-order-row-meta">👤 ${o.customerName||o.userEmail||'—'}</div>
        <div class="oh-order-row-meta">💳 ${(o.payment||'').toUpperCase()} · 📅 ${ohFmtDate(o.createdAt)}</div>
        <div class="oh-order-row-amount">₱${Number(o.totalAmount||0).toLocaleString()}</div>`;
      row.addEventListener('click',()=>ohShowPayDetail(o,row));
      listEl.appendChild(row);
    });
  } catch(e){ listEl.innerHTML='<p class="oh-empty">Error loading.</p>'; console.error(e); }
}

function ohShowPayDetail(o,rowEl) {
  _ohSelectedOrder=o;
  document.querySelectorAll('#ohPaymentList .oh-order-row').forEach(r=>r.classList.remove('selected'));
  rowEl.classList.add('selected');
  document.getElementById('ohPayPlaceholder').style.display='none';
  const detail=document.getElementById('ohPaymentDetail'); detail.style.display='block';

  // Title
  document.getElementById('ohPayTitle').innerHTML=
    `<strong>#${o.id.substring(0,8).toUpperCase()}</strong> · ${o.customerName||o.userEmail||'—'}`;

  // Hide image elements entirely — we only use ref number
  const img=document.getElementById('ohProofImg');
  const none=document.getElementById('ohProofNone');
  if(img) img.style.display='none';
  if(none) none.style.display='none';

  // Reference number
  document.getElementById('ohRefBox').innerHTML=o.refNumber
    ? `<span style="font-size:1rem;letter-spacing:.08em;">${o.refNumber}</span>`
    : `<span style="color:var(--muted);font-style:italic;">No reference number provided</span>`;

  // Show full order info below ref box
  let infoEl=document.getElementById('ohPayOrderInfo');
  if(!infoEl){
    infoEl=document.createElement('div');
    infoEl.id='ohPayOrderInfo';
    infoEl.style.cssText='margin-top:12px;background:var(--bg);border:1.5px solid var(--border);border-radius:10px;padding:12px 14px;font-size:.83rem;';
    document.getElementById('ohRefBox').parentElement.after(infoEl);
  }
  const itemRows=(o.items||[]).map(i=>`
    <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);">
      <span>${i.quantity}× ${i.name} (${(i.size||'').toUpperCase()})</span>
      <span style="font-weight:700;color:var(--blue);">₱${(i.price*i.quantity).toLocaleString()}</span>
    </div>`).join('');
  infoEl.innerHTML=`
    <div style="margin-bottom:8px;font-weight:700;color:var(--text);">Order Details</div>
    ${itemRows}
    <div style="display:flex;justify-content:space-between;margin-top:8px;font-weight:700;">
      <span>Total</span><span style="color:var(--blue);">₱${Number(o.totalAmount||0).toLocaleString()}</span>
    </div>
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-size:.78rem;color:var(--muted);display:flex;flex-wrap:wrap;gap:8px;">
      <span>💳 ${(o.payment||'').toUpperCase()}</span>
      <span>📅 ${ohFmtDate(o.createdAt)}</span>
      <span>📦 ${o.method==='delivery'?'Home Delivery':'On-site Pick-up'}</span>
      <span>📧 ${o.userEmail||'—'}</span>
    </div>`;
}

async function ohApprovePayment() {
  if(!_ohSelectedOrder) return;
  const o=_ohSelectedOrder;
  try {
    // Approve: mark payment verified, move order to Approved (ready for fulfillment)
    await updateDoc(doc(db,'orders',o.id),{
      paymentStatus:'verified', status:'Approved', updatedAt:new Date()
    });
    // Notify the student via personal notifications subcollection
    if (o.userId) {
      await addDoc(collection(db,'notifications',o.userId,'items'),{
        title:`✅ Payment Verified — Order #${o.id.substring(0,8).toUpperCase()}`,
        body:`Hi ${o.customerName||'there'}! Your ${(o.payment||'').toUpperCase()} payment of ₱${Number(o.totalAmount||0).toLocaleString()} has been verified. Your order is now being prepared. We'll notify you when it's ready for ${o.method==='delivery'?'delivery':'pickup'}!`,
        tag:'payment_verified',
        orderId:o.id,
        createdAt:new Date(),
        read:false
      });
    }
    showAdminToast('✅ Payment approved! Student notified.');
    ohLoadPayment(); loadOrders();
  } catch(e){ showAdminToast('Error: '+e.message,'error'); console.error(e); }
}

async function ohRejectPayment() {
  if(!_ohSelectedOrder) return;
  const o=_ohSelectedOrder;
  if(!confirm('Reject this payment?\n\nThe order will be cancelled and stock will be restored.')) return;
  try {
    // Cancel order & reject payment
    await updateDoc(doc(db,'orders',o.id),{
      paymentStatus:'rejected', status:'Cancelled', updatedAt:new Date()
    });
    // Restore stock
    for(const item of (o.items||[])){
      try{
        const pSnap=await getDoc(doc(db,'products',item.id));
        if(pSnap.exists()){
          const stock=pSnap.data().stock||{};
          const sk=stock[item.size]!==undefined?item.size:item.size?.toUpperCase();
          await updateDoc(doc(db,'products',item.id),{[`stock.${sk}`]:(parseInt(stock[sk])||0)+item.quantity});
        }
      }catch(_){}
    }
    // Notify the student via personal notifications subcollection
    if (o.userId) {
      await addDoc(collection(db,'notifications',o.userId,'items'),{
        title:`❌ Payment Not Verified — Order #${o.id.substring(0,8).toUpperCase()}`,
        body:`Hi ${o.customerName||'there'}, unfortunately we could not verify your ${(o.payment||'').toUpperCase()} payment (Ref: ${o.refNumber||'N/A'}) for Order #${o.id.substring(0,8).toUpperCase()}. The order has been cancelled. Please contact us or place a new order. We're sorry for the inconvenience.`,
        tag:'payment_rejected',
        orderId:o.id,
        createdAt:new Date(),
        read:false
      });
    }
    showAdminToast('❌ Payment rejected. Student notified, stock restored.');
    ohLoadPayment(); loadOrders();
  } catch(e){ showAdminToast('Error: '+e.message,'error'); console.error(e); }
}

// ── Modal 4 : Returns & Exchanges ─────────────────
// Filters: status === 'Cancelled' with returnReason, or status === 'Return'/'Exchange'
async function ohLoadReturns() {
  const listEl=document.getElementById('ohReturnsList');
  listEl.innerHTML='<p class="oh-empty">Loading…</p>';
  document.getElementById('ohReturnsDetail').style.display='none';
  document.getElementById('ohRetPlaceholder').style.display='flex';
  try {
    const snap=await getDocs(query(collection(db,'orders'),where('status','in',['Return','Exchange','Refund'])));
    const orders=[]; snap.forEach(d=>orders.push({id:d.id,...d.data()}));
    orders.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    if(!orders.length){ listEl.innerHTML='<p class="oh-empty">No return, exchange, or refund requests.</p>'; return; }
    listEl.innerHTML='';
    orders.forEach(o=>{
      const isRefund = o.status==='Refund';
      const tagBg = isRefund?'#FEE2E2':'#F3E8FF';
      const tagColor = isRefund?'#991B1B':'#7E22CE';
      const row=document.createElement('div'); row.className='oh-order-row';
      row.innerHTML=`
        <div class="oh-order-row-id">Order #${o.id.substring(0,8).toUpperCase()}
          <span style="font-size:.7rem;padding:2px 7px;border-radius:5px;font-weight:700;background:${tagBg};color:${tagColor};margin-left:6px;">${o.status}</span>
        </div>
        <div class="oh-order-row-meta">👤 ${o.customerName||o.userEmail||'—'} · 📅 ${ohFmtDate(o.createdAt)}</div>
        <div class="oh-order-row-meta" style="color:#92400E;">⚠ ${o.refundReason||o.returnReason||'No reason given'}</div>`;
      row.addEventListener('click',()=>ohShowRetDetail(o,row));
      listEl.appendChild(row);
    });
  } catch(e){ listEl.innerHTML='<p class="oh-empty">Error loading.</p>'; console.error(e); }
}

function ohShowRetDetail(o,rowEl) {
  _ohSelectedOrder=o;
  document.querySelectorAll('#ohReturnsList .oh-order-row').forEach(r=>r.classList.remove('selected'));
  rowEl.classList.add('selected');
  document.getElementById('ohRetPlaceholder').style.display='none';
  const detail=document.getElementById('ohReturnsDetail'); detail.style.display='block';
  const isRefund = o.status==='Refund';
  document.getElementById('ohRetTitle').innerHTML=
    `Order <strong>#${o.id.substring(0,8).toUpperCase()}</strong> · ${o.customerName||o.userEmail||'—'} <span style="font-size:.7rem;padding:2px 8px;border-radius:6px;font-weight:700;background:${isRefund?'#FEE2E2':'#F3E8FF'};color:${isRefund?'#991B1B':'#7E22CE'};margin-left:6px;">${o.status}</span>`;
  const reasonText = o.refundReason||o.returnReason||'Not specified';
  document.getElementById('ohRetReason').innerHTML=
    `<strong>${isRefund?'Refund Reason':'Return/Exchange Reason'}:</strong> ${reasonText}
     ${o.refundDetails&&o.refundReason?`<br><span style="font-size:.79rem;color:#92400E;margin-top:4px;display:block;">${o.refundDetails}</span>`:''}
     ${o.exchangeSize?`<br><strong>Requested size:</strong> ${o.exchangeSize.toUpperCase()}`:''}
     ${o.refundRequestedAt?`<br><span style="font-size:.72rem;color:var(--muted);">Requested: ${new Date(o.refundRequestedAt.seconds?o.refundRequestedAt.seconds*1000:o.refundRequestedAt).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}</span>`:''}`;
  
  // Show photo evidence if exists
  const swapSection = document.getElementById('ohSwapItems').closest('.oh-swap-section');
  let imgEl = document.getElementById('ohRefundImageSection');
  if (!imgEl) {
    imgEl = document.createElement('div');
    imgEl.id = 'ohRefundImageSection';
    swapSection.parentNode.insertBefore(imgEl, swapSection);
  }
  if (o.refundImageUrl) {
    imgEl.innerHTML = `
      <div style="margin-bottom:12px;">
        <p style="font-size:.72rem;font-weight:800;color:var(--muted);letter-spacing:.05em;text-transform:uppercase;margin-bottom:7px;">Photo Evidence</p>
        <img src="${o.refundImageUrl}" alt="Refund evidence" style="max-width:100%;border-radius:10px;border:1.5px solid var(--border);cursor:pointer;" onclick="window.open('${o.refundImageUrl}','_blank')">
        <p style="font-size:.69rem;color:var(--muted);margin-top:4px;">Click to view full size</p>
      </div>`;
  } else { imgEl.innerHTML = ''; }

  const swap=document.getElementById('ohSwapItems'); swap.innerHTML='';
  if (isRefund) {
    // For refund, show items and a refund action button (replacing exchange button)
    (o.items||[]).forEach(item=>{
      swap.innerHTML+=`
        <div class="oh-swap-row">
          <span>${item.quantity}× <strong>${item.name}</strong> (${(item.size||'').toUpperCase()})</span>
          <span style="color:var(--blue);font-weight:700;">₱${(item.price*item.quantity).toLocaleString()}</span>
        </div>`;
    });
    // Replace the exchange button with refund action buttons
    let actionArea = document.getElementById('ohRetActionArea');
    if (!actionArea) {
      actionArea = document.createElement('div');
      actionArea.id = 'ohRetActionArea';
      document.getElementById('ohReturnsDetail').appendChild(actionArea);
    }
    actionArea.innerHTML = `
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="oh-btn" style="flex:1;background:#D1FAE5;color:#065F46;border:none;" onclick="ohApproveRefund()">
          <span class="material-icons" style="font-size:16px;">check_circle</span> Approve Refund
        </button>
        <button class="oh-btn" style="flex:1;background:#FEE2E2;color:#991B1B;border:none;" onclick="ohDeclineRefund()">
          <span class="material-icons" style="font-size:16px;">cancel</span> Decline
        </button>
      </div>`;
  } else {
    (o.items||[]).forEach(item=>{
      const newSize=(o.exchangeSize||item.size||'?').toUpperCase();
      const oldSize=(item.size||'?').toUpperCase();
      swap.innerHTML+=`
        <div class="oh-swap-row">
          <span>${item.quantity}× <strong>${item.name}</strong></span>
          <div style="display:flex;gap:6px;align-items:center;">
            <span class="oh-swap-tag oh-swap-tag--in">+Return ${oldSize} to stock</span>
            ${newSize!==oldSize?`<span class="oh-swap-tag oh-swap-tag--out">−Issue ${newSize} from stock</span>`:''}
          </div>
        </div>`;
    });
    const actionArea = document.getElementById('ohRetActionArea');
    if (actionArea) actionArea.innerHTML = '';
  }
}

async function ohApproveRefund() {
  if(!_ohSelectedOrder) return;
  const o=_ohSelectedOrder;
  if(!confirm(`Approve refund for Order #${o.id.substring(0,8).toUpperCase()}?\n\nThis will mark the order as Refunded and notify the student.`)) return;
  try {
    await updateDoc(doc(db,'orders',o.id),{status:'Refunded', updatedAt:new Date()});
    if(o.userId) {
      await addDoc(collection(db,'notifications',o.userId,'items'),{
        title:`💰 Refund Approved — Order #${o.id.substring(0,8).toUpperCase()}`,
        body:`Hi ${o.customerName||'there'}! Your refund request has been approved. Our team will process your refund shortly. Please contact the admin for further details.`,
        tag:'refund_approved',
        orderId:o.id,
        createdAt:new Date(),
        read:false
      });
    }
    showAdminToast('✅ Refund approved and student notified!');
    ohLoadReturns(); loadOrders();
  } catch(e){ showAdminToast('Error: '+e.message,'error'); }
}

async function ohDeclineRefund() {
  if(!_ohSelectedOrder) return;
  const o=_ohSelectedOrder;
  if(!confirm(`Decline refund for Order #${o.id.substring(0,8).toUpperCase()}?\n\nThis will mark the order as Delivered again and notify the student.`)) return;
  try {
    await updateDoc(doc(db,'orders',o.id),{status:'Delivered', refundDeclined:true, updatedAt:new Date()});
    if(o.userId) {
      await addDoc(collection(db,'notifications',o.userId,'items'),{
        title:`❌ Refund Declined — Order #${o.id.substring(0,8).toUpperCase()}`,
        body:`Hi ${o.customerName||'there'}! Unfortunately, your refund request could not be approved. Please contact the campus store for more details.`,
        tag:'refund_declined',
        orderId:o.id,
        createdAt:new Date(),
        read:false
      });
    }
    showAdminToast('Refund declined. Student has been notified.','warning');
    ohLoadReturns(); loadOrders();
  } catch(e){ showAdminToast('Error: '+e.message,'error'); }
}

async function ohProcessExchange() {
  if(!_ohSelectedOrder) return;
  const o=_ohSelectedOrder;
  if(!confirm('Confirm exchange?\n\nStock will be updated: old size returned, new size deducted.')) return;
  try {
    await updateDoc(doc(db,'orders',o.id),{status:'Exchanged', updatedAt:new Date()});
    // Adjust stock using the correct 'stock' field (matches app.js)
    for(const item of (o.items||[])){
      try{
        const pSnap=await getDoc(doc(db,'products',item.id));
        if(!pSnap.exists()) continue;
        const stock=pSnap.data().stock||{};
        const oldSk=stock[item.size]!==undefined?item.size:item.size?.toUpperCase();
        const newSize=o.exchangeSize||item.size;
        const newSk=stock[newSize]!==undefined?newSize:newSize?.toUpperCase();
        const updates={};
        // Return old size back to stock
        updates[`stock.${oldSk}`]=(parseInt(stock[oldSk])||0)+(item.quantity||1);
        // Deduct new size only if different
        if(newSk!==oldSk){
          updates[`stock.${newSk}`]=Math.max(0,(parseInt(stock[newSk])||0)-(item.quantity||1));
        }
        await updateDoc(doc(db,'products',item.id),updates);
      }catch(_){}
    }
    // Notify student via personal notifications subcollection
    if (o.userId) {
      await addDoc(collection(db,'notifications',o.userId,'items'),{
        title:`🔄 Exchange Processed — Order #${o.id.substring(0,8).toUpperCase()}`,
        body:`Hi ${o.customerName||'there'}! Your exchange request has been approved. ${o.exchangeSize?`Your new size (${o.exchangeSize.toUpperCase()}) is being prepared.`:''} We'll notify you when it's ready for pickup!`,
        tag:'exchange_processed',
        orderId:o.id,
        createdAt:new Date(),
        read:false
      });
    }
    showAdminToast('🔄 Exchange confirmed, stock updated, student notified!');
    ohLoadReturns(); loadOrders();
  } catch(e){ showAdminToast('Error: '+e.message,'error'); console.error(e); }
}

// ── Expose Order Hub functions to global scope (required for onclick in module scripts) ──
window.openOrderHub    = openOrderHub;
window.closeOhModal    = closeOhModal;
window.ohMarkReady     = ohMarkReady;
window.ohPrintReceipt  = ohPrintReceipt;
window.ohApprovePayment= ohApprovePayment;
window.ohRejectPayment = ohRejectPayment;
window.ohProcessExchange = ohProcessExchange;
window.ohApproveRefund = ohApproveRefund;
window.ohDeclineRefund = ohDeclineRefund;

// ═══════════════════════════════════════════════════
//  ORDER HUB – Modal 6: All Orders
// ═══════════════════════════════════════════════════

// Hook into openOrderHub
const _ohOpenOriginal = window.openOrderHub;
window.openOrderHub = function(type) {
  if (type === 'allorders') {
    document.getElementById('ohModalAllOrders').classList.add('open');
    document.getElementById('ohAllStatusFilter').value = '';
    document.getElementById('ohAllSearch').value = '';
    ohRenderAllOrders();
    return;
  }
  _ohOpenOriginal(type);
};

// Hook into closeOhModal
const _ohCloseOriginal = window.closeOhModal;
window.closeOhModal = function(type) {
  if (type === 'allorders') {
    document.getElementById('ohModalAllOrders').classList.remove('open');
    return;
  }
  _ohCloseOriginal(type);
};

function ohStatusClass(status) {
  const map = {
    'Pending':'pending','Processing':'processing','Approved':'approved',
    'Ready for Pickup':'ready','Shipped':'shipped','Delivered':'delivered',
    'Cancelled':'cancelled','Return':'return','Exchange':'exchange','Refund':'refund','Refunded':'refunded'
  };
  return 'oh-all-status--' + (map[status] || 'pending');
}

function ohRenderAllOrders() {
  const container = document.getElementById('ohAllOrdersList');
  if (!container) return;

  const statusFilter = document.getElementById('ohAllStatusFilter')?.value || '';
  const search = (document.getElementById('ohAllSearch')?.value || '').toLowerCase();

  let filtered = allOrders;
  if (statusFilter) filtered = filtered.filter(o => o.status === statusFilter);
  if (search) filtered = filtered.filter(o =>
    (o.userEmail||'').toLowerCase().includes(search) ||
    (o.customerName||'').toLowerCase().includes(search) ||
    o.id.toLowerCase().includes(search) ||
    (o.studentId||'').toLowerCase().includes(search)
  );

  if (!filtered.length) {
    container.innerHTML = `<p class="oh-all-empty">No orders match your filter.</p>`;
    _setText('ohBadgeAll', allOrders.length);
    return;
  }

  container.innerHTML = '';
  filtered.forEach(o => {
    const status = o.status || 'Pending';
    const date = ohFmtDate(o.createdAt);
    const itemSummary = (o.items||[]).map(i=>`${i.quantity}× ${i.name} (${(i.size||'').toUpperCase()})`).join(', ');
    const imgUrl = o.items?.[0]?.imageUrl || '';

    const card = document.createElement('div');
    card.className = 'oh-all-grid-card';
    card.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:11px;margin-bottom:9px;">
        ${imgUrl ? `<img src="${imgUrl}" onerror="this.style.display='none'" style="width:44px;height:44px;border-radius:9px;object-fit:cover;flex-shrink:0;border:1.5px solid var(--border);">` : `<div style="width:44px;height:44px;border-radius:9px;background:var(--bg);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span class="material-icons" style="font-size:1.2rem;color:var(--muted);">inventory_2</span></div>`}
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:3px;">
            <span style="font-weight:800;font-size:.83rem;font-family:var(--font-head);">#${o.id.substring(0,8).toUpperCase()}</span>
            <span class="oh-all-status ${ohStatusClass(status)}" style="font-size:.67rem;">${status}</span>
          </div>
          <div style="font-size:.78rem;font-weight:600;color:var(--text);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${o.customerName || o.userEmail || '—'}</div>
          <div style="font-size:.72rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${itemSummary}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid var(--border);">
        <span style="font-size:.73rem;color:var(--muted);">📅 ${date}</span>
        <span style="font-weight:800;color:var(--blue);font-size:.83rem;">₱${Number(o.totalAmount||0).toLocaleString()}</span>
      </div>`;

    card.addEventListener('click', () => ohShowAllDetail(o));
    container.appendChild(card);
  });

  _setText('ohBadgeAll', allOrders.length);
}

function ohShowAllDetail(o) {
  const overlay = document.getElementById('ohAllDetailOverlay');
  const detail = document.getElementById('ohAllDetail');
  overlay.style.display = 'flex';

  const status = o.status || 'Pending';
  const payStatus = o.paymentStatus || '—';
  const itemRows = (o.items||[]).map(i => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
      <div>
        <div style="font-size:.85rem;font-weight:600;">${i.name}</div>
        <div style="font-size:.75rem;color:var(--muted);">Size: ${(i.size||'—').toUpperCase()} &nbsp;·&nbsp; Qty: ${i.quantity}</div>
      </div>
      <span style="font-weight:700;color:var(--blue);font-size:.85rem;">₱${(i.price*i.quantity).toLocaleString()}</span>
    </div>`).join('');

  detail.innerHTML = `
    <!-- Header -->
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;gap:10px;">
      <div>
        <div style="font-family:var(--font-head);font-size:1.05rem;font-weight:800;margin-bottom:4px;">
          Order #${o.id.substring(0,8).toUpperCase()}
        </div>
        <div style="font-size:.75rem;color:var(--muted);">📅 ${ohFmtDate(o.createdAt)}</div>
      </div>
      <span class="oh-all-status ${ohStatusClass(status)}" style="font-size:.75rem;">${status}</span>
    </div>

    <!-- Customer Info -->
    <div style="background:var(--bg);border:1.5px solid var(--border);border-radius:11px;padding:13px 15px;margin-bottom:12px;">
      <div style="font-size:.72rem;font-weight:800;color:var(--muted);letter-spacing:.05em;text-transform:uppercase;margin-bottom:8px;">Customer</div>
      <div style="font-size:.87rem;font-weight:700;margin-bottom:4px;">👤 ${o.customerName || '—'}</div>
      <div style="font-size:.78rem;color:var(--muted);margin-bottom:3px;">📧 ${o.userEmail || '—'}</div>
      <div style="font-size:.78rem;color:var(--muted);margin-bottom:3px;">📦 ${o.method === 'delivery' ? '🚚 Home Delivery' : '🏫 On-site Pick-up'}</div>
      ${o.address ? `<div style="font-size:.78rem;color:var(--muted);">📍 ${o.address}</div>` : ''}
    </div>

    <!-- Payment Info -->
    <div style="background:var(--bg);border:1.5px solid var(--border);border-radius:11px;padding:13px 15px;margin-bottom:12px;">
      <div style="font-size:.72rem;font-weight:800;color:var(--muted);letter-spacing:.05em;text-transform:uppercase;margin-bottom:8px;">Payment</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:.82rem;">
        <span>💳 <strong>${(o.payment||'COD').toUpperCase()}</strong></span>
        <span>Status: <strong>${payStatus.replace(/_/g,' ')}</strong></span>
        ${o.refNumber ? `<span>🔑 Ref: <strong>${o.refNumber}</strong></span>` : ''}
        ${o.couponCode ? `<span>🎟 Coupon: <strong>${o.couponCode}</strong></span>` : ''}
      </div>
    </div>

    <!-- Items -->
    <div style="background:var(--bg);border:1.5px solid var(--border);border-radius:11px;padding:13px 15px;margin-bottom:12px;">
      <div style="font-size:.72rem;font-weight:800;color:var(--muted);letter-spacing:.05em;text-transform:uppercase;margin-bottom:8px;">Items Ordered</div>
      ${itemRows}
      <div style="display:flex;justify-content:space-between;padding-top:10px;margin-top:2px;font-weight:800;font-size:.9rem;">
        <span>Order Total</span>
        <span style="color:var(--blue);">₱${Number(o.totalAmount||0).toLocaleString()}</span>
      </div>
      ${o.discount ? `<div style="font-size:.75rem;color:var(--green);margin-top:2px;">✂ Discount applied: −₱${Number(o.discount).toLocaleString()}</div>` : ''}
      ${o.shippingFee ? `<div style="font-size:.75rem;color:var(--muted);margin-top:2px;">🚚 Shipping fee: ₱${Number(o.shippingFee).toLocaleString()}</div>` : ''}
    </div>

    <!-- Tracking / Notes -->
    ${o.tracking ? `
    <div style="background:var(--bg);border:1.5px solid var(--border);border-radius:11px;padding:13px 15px;margin-bottom:12px;">
      <div style="font-size:.72rem;font-weight:800;color:var(--muted);letter-spacing:.05em;text-transform:uppercase;margin-bottom:6px;">Tracking Note</div>
      <div style="font-size:.83rem;">📍 ${o.tracking}</div>
    </div>` : ''}

    ${o.returnReason ? `
    <div style="background:#FEF3C7;border:1.5px solid #FCD34D;border-radius:11px;padding:13px 15px;margin-bottom:12px;">
      <div style="font-size:.72rem;font-weight:800;color:#92400E;letter-spacing:.05em;text-transform:uppercase;margin-bottom:6px;">Return / Exchange Reason</div>
      <div style="font-size:.83rem;color:#92400E;">⚠ ${o.returnReason}</div>
      ${o.exchangeSize ? `<div style="font-size:.78rem;color:#92400E;margin-top:4px;">Requested size: <strong>${o.exchangeSize.toUpperCase()}</strong></div>` : ''}
    </div>` : ''}`;
}

// ohBadgeAll is updated inside _ohRefreshStats (defined earlier)

window.ohRenderAllOrders = ohRenderAllOrders;

