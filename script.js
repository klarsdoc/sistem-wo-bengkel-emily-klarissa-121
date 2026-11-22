const STATUS_OPTIONS = ["Menunggu", "Dalam proses", "Siap diambil", "Selesai", "Dibatalkan"];
const state = { customers: [], vehicles: [], work_orders: [], page: "dashboard", modal: null, pendingDelete: null };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const money = (value) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
const shortDate = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
const statusClass = (status) => ({ Menunggu: "status-menunggu", "Dalam proses": "status-proses", "Siap diambil": "status-siap", Selesai: "status-selesai", Dibatalkan: "status-dibatalkan" })[status] || "status-menunggu";
const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const showToast = (message, type = "success") => {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  $("#toast-region").append(toast);
  window.setTimeout(() => toast.remove(), 3900);
};

async function api(resource, options = {}) {
  let response;
  try {
    response = await fetch(`/api/${resource}${options.query || ""}`, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json" },
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
  } catch {
    throw new Error("Tidak dapat terhubung ke server. Pastikan app.js masih berjalan.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Permintaan gagal (${response.status}).`);
  return payload;
}

async function loadData(notify = false) {
  try {
    const [customers, vehicles, workOrders] = await Promise.all([
      api("customers"), api("vehicles"), api("work_orders", { query: "?select=*,customers(id,name,phone),vehicles(id,brand,model,license_plate)" })
    ]);
    state.customers = customers;
    state.vehicles = vehicles;
    state.work_orders = workOrders;
    renderAll();
    if (notify) showToast("Data berhasil diperbarui.");
  } catch (error) {
    showToast(error.message, "error");
  }
}

function renderAll() {
  renderDashboard();
  renderOrders();
  renderCustomers();
  renderVehicles();
  $("#nav-order-count").textContent = state.work_orders.length;
  $("#stat-customers").textContent = state.customers.length;
  $("#quick-customer-count").textContent = state.customers.length;
  $("#quick-vehicle-count").textContent = state.vehicles.length;
}

function orderCustomer(order) {
  return order.customers?.name || state.customers.find((item) => item.id === order.customer_id)?.name || "Pelanggan dihapus";
}

function orderVehicle(order) {
  const vehicle = order.vehicles || state.vehicles.find((item) => item.id === order.vehicle_id);
  return vehicle ? `${vehicle.brand} ${vehicle.model} · ${vehicle.license_plate}` : "Kendaraan dihapus";
}

function orderRow(order, includeCost = false) {
  const name = orderCustomer(order);
  return `<tr>
    <td><span class="order-code">${escapeHtml(order.order_number)}</span></td>
    <td><div class="person-cell"><span class="person-avatar">${escapeHtml(initials(name))}</span><span class="person-name"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(orderVehicle(order))}</small></span></div></td>
    <td><span class="complaint" title="${escapeHtml(order.complaint)}">${escapeHtml(order.complaint)}</span></td>
    <td>${escapeHtml(shortDate(order.created_at))}</td>
    <td><span class="status-pill ${statusClass(order.status)}">${escapeHtml(order.status)}</span></td>
    ${includeCost ? `<td>${escapeHtml(money(order.estimated_cost))}</td>` : ""}
    <td><div class="row-actions"><button class="action-button" data-action="edit" data-type="work_orders" data-id="${escapeHtml(order.id)}" title="Edit" aria-label="Edit work order">✎</button><button class="action-button" data-action="delete" data-type="work_orders" data-id="${escapeHtml(order.id)}" title="Hapus" aria-label="Hapus work order">×</button></div></td>
  </tr>`;
}

function renderDashboard() {
  const orders = [...state.work_orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  $("#stat-total").textContent = orders.length;
  $("#stat-progress").textContent = orders.filter((item) => item.status === "Dalam proses").length;
  $("#stat-ready").textContent = orders.filter((item) => item.status === "Siap diambil").length;
  $("#dashboard-orders").innerHTML = orders.slice(0, 5).map((item) => orderRow(item)).join("");
  $("#dashboard-empty").classList.toggle("hidden", orders.length !== 0);
  $(".content-card:has(#dashboard-orders) .table-wrap").classList.toggle("hidden", orders.length === 0);
}

function renderOrders() {
  const search = ($("#order-search")?.value || "").trim().toLowerCase();
  const filter = $("#order-filter")?.value || "";
  const orders = [...state.work_orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const filtered = orders.filter((item) => `${item.order_number} ${orderCustomer(item)} ${orderVehicle(item)} ${item.complaint}`.toLowerCase().includes(search) && (!filter || item.status === filter));
  $("#orders-table").innerHTML = filtered.map((item) => orderRow(item, true)).join("");
  $("#order-result-count").textContent = filtered.length;
  const empty = $("#orders-empty");
  empty.classList.toggle("hidden", filtered.length !== 0);
  $("#orders-empty-title").textContent = orders.length ? "Tidak ada hasil yang cocok" : "Belum ada work order";
  $("#orders-empty-copy").textContent = orders.length ? "Coba ubah kata kunci atau filter status." : "Buat order baru untuk mencatat pekerjaan servis.";
  empty.querySelector("[data-action='new-order']").classList.toggle("hidden", orders.length !== 0);
  $(".listing-card:has(#orders-table) .table-wrap").classList.toggle("hidden", filtered.length === 0);
}

function renderCustomers() {
  const search = ($("#customer-search")?.value || "").trim().toLowerCase();
  const customers = state.customers.filter((item) => `${item.name} ${item.phone} ${item.email || ""} ${item.address || ""}`.toLowerCase().includes(search));
  $("#customers-table").innerHTML = customers.map((customer) => `<tr>
    <td><div class="person-cell"><span class="person-avatar">${escapeHtml(initials(customer.name))}</span><span class="person-name"><strong>${escapeHtml(customer.name)}</strong><small>Pelanggan bengkel</small></span></div></td>
    <td class="phone-cell">${escapeHtml(customer.phone)}</td><td class="email-cell">${escapeHtml(customer.email || "—")}</td><td>${escapeHtml(customer.address || "—")}</td><td>${escapeHtml(shortDate(customer.created_at))}</td>
    <td><div class="row-actions"><button class="action-button" data-action="edit" data-type="customers" data-id="${escapeHtml(customer.id)}" title="Edit" aria-label="Edit pelanggan">✎</button><button class="action-button" data-action="delete" data-type="customers" data-id="${escapeHtml(customer.id)}" title="Hapus" aria-label="Hapus pelanggan">×</button></div></td>
  </tr>`).join("");
  $("#customer-result-count").textContent = customers.length;
  $("#customers-empty").classList.toggle("hidden", customers.length !== 0);
  $(".listing-card:has(#customers-table) .table-wrap").classList.toggle("hidden", customers.length === 0);
}

function renderVehicles() {
  const search = ($("#vehicle-search")?.value || "").trim().toLowerCase();
  const vehicles = state.vehicles.filter((item) => `${item.brand} ${item.model} ${item.license_plate} ${item.customers?.name || ""}`.toLowerCase().includes(search));
  $("#vehicles-table").innerHTML = vehicles.map((vehicle) => {
    const owner = vehicle.customers?.name || state.customers.find((item) => item.id === vehicle.customer_id)?.name || "Pelanggan dihapus";
    return `<tr><td><div class="vehicle-cell"><span class="vehicle-icon-cell">◈</span><span><strong>${escapeHtml(vehicle.brand)} ${escapeHtml(vehicle.model)}</strong><small>${escapeHtml(vehicle.transmission || "Kendaraan pelanggan")}</small></span></div></td><td><span class="order-code">${escapeHtml(vehicle.license_plate)}</span></td><td>${escapeHtml(owner)}</td><td>${escapeHtml(vehicle.year || "—")}</td><td>${escapeHtml(vehicle.color || "—")}</td><td><div class="row-actions"><button class="action-button" data-action="edit" data-type="vehicles" data-id="${escapeHtml(vehicle.id)}" title="Edit" aria-label="Edit kendaraan">✎</button><button class="action-button" data-action="delete" data-type="vehicles" data-id="${escapeHtml(vehicle.id)}" title="Hapus" aria-label="Hapus kendaraan">×</button></div></td></tr>`;
  }).join("");
  $("#vehicle-result-count").textContent = vehicles.length;
  $("#vehicles-empty").classList.toggle("hidden", vehicles.length !== 0);
  $(".listing-card:has(#vehicles-table) .table-wrap").classList.toggle("hidden", vehicles.length === 0);
}

function setPage(page) {
  state.page = page;
  $$(".page-view").forEach((view) => view.classList.toggle("hidden", view.id !== `${page}-page`));
  $$(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.page === page));
  $("#breadcrumb-current").textContent = ({ dashboard: "Ringkasan", orders: "Work order", customers: "Pelanggan", vehicles: "Kendaraan" })[page];
}

function field(label, name, options = {}) {
  const required = options.required ? "required" : "";
  const requiredMark = options.required ? ' <em>*</em>' : "";
  const full = options.full ? " full" : "";
  let control;
  if (options.select) {
    control = `<select name="${name}" ${required}><option value="">Pilih ${label.toLowerCase()}</option>${options.select.map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join("")}</select>`;
  } else if (options.textarea) {
    control = `<textarea name="${name}" placeholder="${escapeHtml(options.placeholder || "")}" ${required} ${options.maxlength ? `maxlength="${options.maxlength}"` : ""}></textarea>`;
  } else {
    control = `<input name="${name}" type="${options.type || "text"}" placeholder="${escapeHtml(options.placeholder || "")}" ${required} ${options.maxlength ? `maxlength="${options.maxlength}"` : ""} ${options.min !== undefined ? `min="${options.min}"` : ""} ${options.max !== undefined ? `max="${options.max}"` : ""} ${options.step ? `step="${options.step}"` : ""}>`;
  }
  return `<div class="form-field${full}"><label>${label}${requiredMark}</label>${control}</div>`;
}

function openForm(type, record = null) {
  if (type === "vehicles" && state.customers.length === 0) {
    showToast("Tambahkan data pelanggan terlebih dahulu.", "error");
    setPage("customers");
    return;
  }
  if (type === "work_orders" && (state.customers.length === 0 || state.vehicles.length === 0)) {
    showToast("Tambahkan pelanggan dan kendaraan sebelum membuat work order.", "error");
    setPage(state.customers.length === 0 ? "customers" : "vehicles");
    return;
  }
  const titleMap = { work_orders: record ? "Edit work order" : "Buat work order", customers: record ? "Edit pelanggan" : "Tambah pelanggan", vehicles: record ? "Edit kendaraan" : "Tambah kendaraan" };
  const fields = {
    customers: `<div class="form-grid">${field("Nama lengkap", "name", { required: true, placeholder: "Contoh: Andi Pratama", maxlength: 120, full: true })}${field("Nomor telepon", "phone", { required: true, type: "tel", placeholder: "08xxxxxxxxxx", maxlength: 30 })}${field("Email", "email", { type: "email", placeholder: "nama@email.com", maxlength: 254 })}${field("Alamat", "address", { textarea: true, placeholder: "Alamat pelanggan", maxlength: 500, full: true })}</div>`,
    vehicles: `<div class="form-grid">${field("Pemilik kendaraan", "customer_id", { required: true, select: state.customers.map((item) => ({ value: item.id, label: `${item.name} · ${item.phone}` })), full: true })}${field("Merek", "brand", { required: true, placeholder: "Contoh: Honda", maxlength: 60 })}${field("Model", "model", { required: true, placeholder: "Contoh: Vario 160", maxlength: 80 })}${field("Nomor polisi", "license_plate", { required: true, placeholder: "B 1234 XYZ", maxlength: 20 })}${field("Tahun", "year", { type: "number", min: 1950, max: new Date().getFullYear() + 1, placeholder: "2024" })}${field("Warna", "color", { placeholder: "Hitam", maxlength: 40 })}${field("Jenis transmisi", "transmission", { placeholder: "Matic / Manual", maxlength: 30 })}</div>`,
    work_orders: `<div class="form-grid">${field("Pelanggan", "customer_id", { required: true, select: state.customers.map((item) => ({ value: item.id, label: `${item.name} · ${item.phone}` })), full: true })}${field("Kendaraan", "vehicle_id", { required: true, select: state.vehicles.map((item) => ({ value: item.id, label: `${item.license_plate} · ${item.brand} ${item.model}` })), full: true })}${field("Keluhan pelanggan", "complaint", { required: true, textarea: true, placeholder: "Jelaskan keluhan atau kebutuhan servis...", maxlength: 2000, full: true })}${field("Status pekerjaan", "status", { select: STATUS_OPTIONS.map((item) => ({ value: item, label: item })) })}${field("Estimasi biaya (Rp)", "estimated_cost", { type: "number", min: 0, step: "1000", placeholder: "0" })}</div>`
  };
  state.modal = { type, id: record?.id || null, record };
  $("#form-eyebrow").textContent = type === "work_orders" ? "OPERASIONAL BENGKEL" : "DATA BENGKEL";
  $("#form-title").textContent = titleMap[type];
  $("#form-submit").innerHTML = `${record ? "Simpan perubahan" : "Simpan data"} <span>→</span>`;
  $("#form-fields").innerHTML = fields[type];
  if (record) {
    for (const [key, value] of Object.entries(record)) {
      const input = $("#entity-form").elements.namedItem(key);
      if (input) input.value = value ?? "";
    }
  } else if (type === "work_orders") {
    $("#entity-form").elements.namedItem("status").value = "Menunggu";
  }
  if (type === "work_orders") {
    const customerSelect = $("#entity-form").elements.namedItem("customer_id");
    const vehicleSelect = $("#entity-form").elements.namedItem("vehicle_id");
    customerSelect.addEventListener("change", () => {
      const oldValue = vehicleSelect.value;
      const vehicles = state.vehicles.filter((vehicle) => vehicle.customer_id === customerSelect.value);
      vehicleSelect.innerHTML = `<option value="">Pilih kendaraan</option>${vehicles.map((vehicle) => `<option value="${escapeHtml(vehicle.id)}">${escapeHtml(vehicle.license_plate)} · ${escapeHtml(vehicle.brand)} ${escapeHtml(vehicle.model)}</option>`).join("")}`;
      if (vehicles.some((vehicle) => vehicle.id === oldValue)) vehicleSelect.value = oldValue;
    });
    customerSelect.dispatchEvent(new Event("change"));
    if (record) vehicleSelect.value = record.vehicle_id;
  }
  $("#form-dialog").showModal();
}

async function submitForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity() || !state.modal) return;
  const { type, id } = state.modal;
  const data = Object.fromEntries(new FormData(form).entries());
  if (type === "work_orders") data.estimated_cost = Number(data.estimated_cost || 0);
  if (type === "vehicles") data.year = data.year ? Number(data.year) : null;
  if (type === "customers") data.email = data.email.trim() || null;
  for (const key of Object.keys(data)) if (typeof data[key] === "string") data[key] = data[key].trim();
  const submit = $("#form-submit");
  submit.disabled = true;
  submit.textContent = "Menyimpan...";
  try {
    await api(type, { method: id ? "PATCH" : "POST", query: id ? `?id=${encodeURIComponent(id)}` : "", body: data });
    $("#form-dialog").close();
    showToast(id ? "Perubahan berhasil disimpan." : "Data baru berhasil ditambahkan.");
    await loadData();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    submit.disabled = false;
    submit.innerHTML = `${id ? "Simpan perubahan" : "Simpan data"} <span>→</span>`;
  }
}

function askDelete(type, id) {
  const collections = { customers: state.customers, vehicles: state.vehicles, work_orders: state.work_orders };
  const record = collections[type].find((item) => item.id === id);
  if (!record) return;
  state.pendingDelete = { type, id };
  const label = type === "work_orders" ? record.order_number : type === "customers" ? record.name : `${record.brand} ${record.model} (${record.license_plate})`;
  $("#confirm-copy").textContent = `Data "${label}" akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`;
  $("#confirm-dialog").showModal();
}

async function deleteRecord() {
  if (!state.pendingDelete) return;
  const { type, id } = state.pendingDelete;
  const button = $("#confirm-delete");
  button.disabled = true;
  button.textContent = "Menghapus...";
  try {
    await api(type, { method: "DELETE", query: `?id=${encodeURIComponent(id)}` });
    $("#confirm-dialog").close();
    showToast("Data berhasil dihapus.");
    state.pendingDelete = null;
    await loadData();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Ya, hapus";
  }
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-page]");
  if (nav) return setPage(nav.dataset.page);
  const go = event.target.closest("[data-go]");
  if (go) return setPage(go.dataset.go);
  const create = event.target.closest("[data-action^='new-']");
  if (create) return openForm(create.dataset.action.slice(4) === "order" ? "work_orders" : create.dataset.action.slice(4) === "customer" ? "customers" : "vehicles");
  const action = event.target.closest("[data-action='edit'], [data-action='delete']");
  if (!action) return;
  if (action.dataset.action === "delete") return askDelete(action.dataset.type, action.dataset.id);
  const record = state[action.dataset.type].find((item) => item.id === action.dataset.id);
  if (record) openForm(action.dataset.type, record);
});
$("#entity-form").addEventListener("submit", submitForm);
$("#dialog-close").addEventListener("click", () => $("#form-dialog").close());
$("#dialog-cancel").addEventListener("click", () => $("#form-dialog").close());
$("#confirm-cancel").addEventListener("click", () => { $("#confirm-dialog").close(); state.pendingDelete = null; });
$("#confirm-delete").addEventListener("click", deleteRecord);
$("#refresh-button").addEventListener("click", () => loadData(true));
$("#order-search").addEventListener("input", renderOrders);
$("#order-filter").addEventListener("change", renderOrders);
$("#customer-search").addEventListener("input", renderCustomers);
$("#vehicle-search").addEventListener("input", renderVehicles);
$("#today-date").textContent = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
loadData();
