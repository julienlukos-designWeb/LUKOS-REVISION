/* =====================================================================
   LUKOS-REVISION — Application (DAP · DQEG · CAT-1/CAT-2 INFANTERIE · CAT-1/CAT-2 BNSP)
   Conçu par Julien Dath Yanghane SENE (LUKOS)
   Sécurité : aucune donnée n'est insérée dans la page sans échappement,
   aucun gestionnaire d'événement « inline », toutes les écritures passent
   par des fonctions serveur (RPC) qui revérifient les droits.
   ===================================================================== */
"use strict";
(function () {
  const C = window.LUKOS_CONFIG || {};
  const app = document.getElementById("app");
  const topnav = document.getElementById("topnav");
  const bottomnav = document.getElementById("bottomnav");

  /* ------------------------------------------------------------------ */
  /* Outils                                                             */
  /* ------------------------------------------------------------------ */
  const esc = (s) => String(s ?? "").replace(/[&<>"'`]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[m]));
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’‘`´]/g, "'").toLowerCase();
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const fmtDate = (d) => d ? new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";
  const fmtXof = (n) => Number(n || 0).toLocaleString("fr-FR") + " FCFA";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function toast(text, type) {
    const box = document.getElementById("toasts");
    const el = document.createElement("div");
    el.className = "toast" + (type ? " " + type : "");
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }
  function errText(e) {
    const m = String((e && (e.message || e.error_description)) || e || "");
    if (/Failed to fetch|NetworkError|network/i.test(m)) return "Connexion Internet indisponible. Réessaie.";
    if (/JWT|token/i.test(m)) return "Session expirée. Reconnecte-toi.";
    if (/permission denied|row-level security/i.test(m)) return "Action non autorisée.";
    return m.length > 200 ? "Une erreur est survenue." : (m || "Une erreur est survenue.");
  }
  function phoneNormalize(raw) {
    const d = String(raw || "").replace(/\D/g, "");
    const n = d.startsWith("221") ? d.slice(3) : d;
    return /^(70|75|76|77|78)\d{7}$/.test(n) ? "+221" + n : null;
  }
  const authEmail = (phone) => phone.replace(/\D/g, "") + "@auth.lukos.sn";
  const phonePretty = (p) => { const d = String(p || "").replace(/\D/g, "").replace(/^221/, ""); return d.length === 9 ? d.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, "$1 $2 $3 $4") : (p || "—"); };

  /* Mise en forme d'une réponse : lignes « • » => liste, « | » => tableau. */
  function formatAnswer(text, hl) {
    const mark = (s) => { let h = esc(s); if (hl) { const re = new RegExp("(" + hl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi"); h = h.replace(re, "<mark>$1</mark>"); } return h; };
    const lines = String(text || "").split(/\n/);
    let html = "", inList = false, inTable = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (/^[•\-–]\s*/.test(line)) {
        if (inTable) { html += "</table>"; inTable = false; }
        if (!inList) { html += "<ul>"; inList = true; }
        html += "<li>" + mark(line.replace(/^[•\-–]\s*/, "")) + "</li>";
      } else if (line.includes(" | ")) {
        if (inList) { html += "</ul>"; inList = false; }
        if (!inTable) { html += '<table class="t">'; inTable = true; }
        html += "<tr>" + line.split(" | ").map((c) => "<td>" + mark(c) + "</td>").join("") + "</tr>";
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        if (inTable) { html += "</table>"; inTable = false; }
        html += "<p>" + mark(line) + "</p>";
      }
    }
    if (inList) html += "</ul>";
    if (inTable) html += "</table>";
    return html;
  }

  /* ------------------------------------------------------------------ */
  /* Supabase                                                           */
  /* ------------------------------------------------------------------ */
  const configured = !!(window.supabase && C.SUPABASE_URL && /^https:\/\/.+\.supabase\.co$/.test(C.SUPABASE_URL) && C.SUPABASE_ANON_KEY && !/VOTRE/.test(C.SUPABASE_ANON_KEY));
  const sb = configured ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null;

  const IC = (d, w) => `<svg width="${w || 22}" height="${w || 22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    cap: '<path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
    star: '<path d="M12 2l3 6 6 .9-4.5 4.3 1 6.3L12 16.6 6.5 19.5l1-6.3L3 8.9 9 8z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
    home: '<path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    shield: '<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/>',
    flame: '<path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.4 1.2-4.2 2.5-5.5.3 1.6 1.1 2.7 2.3 3.3C11.6 8 11 5 12 2z"/>',
    next: '<path d="M9 18l6-6-6-6"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'
  };
  const icon = (k, w) => IC(ICONS[k], w);
  const EXAM_META = {
    DAP:  { icon: "book", tagline: "Prépare ton DAP avec méthode et efficacité." },
    DQEG: { icon: "cap", tagline: "Prépare ton DQEG avec méthode et efficacité." },
    CAT:  { icon: "star", tagline: "Prépare tes CAT-1/CAT-2 Infanterie avec méthode et efficacité." },
    BNSP: { icon: "flame", tagline: "Prépare tes CAT-1/CAT-2 BNSP (sapeurs-pompiers) avec méthode et efficacité." }
  };

  /* Service / corps du membre */
  const SERVICES = [["gendarmerie", "Gendarmerie"], ["armee", "Armée"], ["bnsp", "BNSP (Sapeurs-pompiers)"]];
  const serviceLabel = (v) => (SERVICES.find((s) => s[0] === v) || [])[1] || "";
  const serviceOptions = (cur) => `<option value="" ${cur ? "" : "selected"} disabled>Choisis ton service ou corps</option>` + SERVICES.map(([v, l]) => `<option value="${v}" ${cur === v ? "selected" : ""}>${l}</option>`).join("");
  const PROFILE_COLS = "id,first_name,last_name,phone,role,is_blocked,created_at";

  const S = {
    session: null, profile: null, exams: [], enr: {}, payments: [], attempts: {}, exam: null,
    data: {},          // data[exam] = { subjects:[], questions:[], bySubject:Map }
    authMode: "login", quiz: null, rev: null
  };
  const isAdmin = () => S.profile && S.profile.role === "admin" && !S.profile.is_blocked;
  const examByCode = (c) => S.exams.find((e) => e.code === c);
  const hasAccess = (c) => isAdmin() || (S.enr[c] && S.enr[c].status === "active" && !S.profile.is_blocked);

  /* ------------------------------------------------------------------ */
  /* Mode hors connexion : parcours activés gardés sur le téléphone      */
  /* ------------------------------------------------------------------ */
  const OFF_DAYS = 7;                       // délai max sans vérification de l'accès
  const idb = (() => {
    let p = null;
    const open = () => p || (p = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error("IndexedDB indisponible"));
      const r = indexedDB.open("lukos-offline", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const tx = (mode, fn) => open().then((db) => new Promise((res, rej) => {
      const t = db.transaction("kv", mode), r = fn(t.objectStore("kv"));
      t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }));
    const safe = (pr, dflt) => pr.catch(() => dflt);
    return {
      get: (k) => safe(tx("readonly", (s) => s.get(k)), undefined),
      set: (k, v) => safe(tx("readwrite", (s) => s.put(v, k)), undefined),
      del: (k) => safe(tx("readwrite", (s) => s.delete(k)), undefined),
      clear: () => safe(tx("readwrite", (s) => s.clear()), undefined)
    };
  })();
  const isNetErr = (e) => !navigator.onLine || /Failed to fetch|NetworkError|network|Load failed|fetch/i.test(String((e && (e.message || e.error_description)) || e || ""));
  const hasStoredSession = () => { try { return Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k)); } catch (e) { return false; } };
  S.offline = false; S.verifiedAt = 0; S.offMeta = {};
  const offFresh = () => Date.now() - (S.verifiedAt || 0) < OFF_DAYS * 86400000;

  async function saveAccountCache() {
    if (!S.session || !S.profile) return;
    const uid = S.session.user.id;
    const old = await idb.get("acct");
    if (old && old.uid !== uid) { await idb.clear(); S.offMeta = {}; }
    S.verifiedAt = Date.now();
    await idb.set("acct", { uid, profile: S.profile, enr: S.enr, exams: S.exams, payments: S.payments, verifiedAt: S.verifiedAt });
    // accès retiré ou suspendu : on efface le contenu gardé sur le téléphone
    S.offMeta = (await idb.get("offmeta")) || {};
    for (const code of Object.keys(S.offMeta)) if (!hasAccess(code)) { await idb.del("exam:" + code); delete S.offMeta[code]; }
    await idb.set("offmeta", S.offMeta);
  }
  async function enterOffline() {
    const acct = await idb.get("acct");
    if (!acct || !hasStoredSession()) return false;
    S.offline = true;
    S.session = { user: { id: acct.uid } };
    S.profile = acct.profile; S.enr = acct.enr || {}; S.exams = acct.exams || []; S.payments = acct.payments || [];
    S.verifiedAt = acct.verifiedAt || 0;
    S.offMeta = (await idb.get("offmeta")) || {};
    return true;
  }
  async function leaveOffline() {
    if (!S.offline || !navigator.onLine) return;
    try {
      await loadExams();
      const { data } = await sb.auth.getSession();
      S.offline = false;
      S.session = data.session || null;
      if (S.session) { await loadAccount(); S.data = {}; await flushPending(); toast("Connexion rétablie ✓", "ok"); }
      route(); prefetchOffline();
    } catch (e) { S.offline = true; }
  }
  window.addEventListener("online", () => setTimeout(leaveOffline, 1500));
  async function queuePending(row) {
    const list = (await idb.get("pending")) || [];
    list.push(row); await idb.set("pending", list);
  }
  async function flushPending() {
    if (S.offline || !S.session) return;
    const list = (await idb.get("pending")) || [];
    if (!list.length) return;
    const rest = []; let sent = 0;
    for (const r of list) {
      if (r.uid !== S.session.user.id) continue;
      try { const fn = r.rpc || "complete_quiz"; const { error } = await sb.rpc(fn, r.args); if (error) throw error; sent++; if (fn === "complete_quiz") delete S.attempts[r.args.p_exam]; }
      catch (e) { if (isNetErr(e)) rest.push(r); }
    }
    await idb.set("pending", rest);
    if (sent) toast(sent + (sent > 1 ? " résultats (quiz ou examens) faits hors connexion ont été envoyés." : " résultat (quiz ou examen) fait hors connexion a été envoyé."), "ok");
  }
  let prefetching = false;
  async function prefetchOffline() {
    // télécharge en arrière-plan les parcours activés absents ou anciens (> 24 h)
    if (prefetching || S.offline || !S.session || !S.profile || isAdmin()) return;
    prefetching = true;
    try {
      for (const e of S.exams) {
        if (!hasAccess(e.code)) continue;
        const m = S.offMeta[e.code];
        if (m && Date.now() - m < 86400000 && S.data[e.code]) continue;
        if (m && Date.now() - m < 86400000) continue;
        await loadExamData(e.code, true).catch(() => {});
      }
    } finally { prefetching = false; }
  }

  async function loadExams() {
    const { data, error } = await sb.from("exams").select("code,name,full_name,price_xof,position,is_open").order("position");
    if (error) throw error;
    S.exams = data || [];
  }
  async function loadAccount() {
    const uid = S.session.user.id;
    let p = await sb.from("profiles").select(PROFILE_COLS + ",service").eq("id", uid).maybeSingle();
    // si le script 05_examens.sql n'est pas encore exécuté, la colonne « service » n'existe pas
    if (p.error && /service/i.test(p.error.message || "")) p = await sb.from("profiles").select(PROFILE_COLS).eq("id", uid).maybeSingle();
    if (p.error) throw p.error;
    S.profile = p.data;
    const payQ = (extra) => sb.from("payments").select("id,exam_code,amount_xof,method,status,transaction_reference,admin_note,created_at,reviewed_at" + extra).eq("user_id", uid).order("created_at", { ascending: false });
    let [e, pay] = await Promise.all([
      sb.from("enrollments").select("exam_code,status,activated_at").eq("user_id", uid),
      payQ(",proof_path")
    ]);
    if (pay.error && /proof_path/i.test(pay.error.message || "")) pay = await payQ("");
    if (e.error) throw e.error;
    S.enr = {}; (e.data || []).forEach((r) => (S.enr[r.exam_code] = r));
    S.payments = pay.data || [];
    await saveAccountCache();
  }
  async function fetchExamRaw(code) {
    const subj = await sb.from("subjects").select("id,name,position").eq("exam_code", code).order("position");
    if (subj.error) throw subj.error;
    const questions = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("questions").select("id,subject_id,question,answer,position,is_active")
        .eq("exam_code", code).order("subject_id").order("position").range(from, from + 999);
      if (error) throw error;
      questions.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return { subjects: subj.data || [], questions };
  }
  async function loadExamData(code, force) {
    if (!force && S.data[code]) return S.data[code];
    let raw = null, savedAt = null, fromCache = false;
    if (!S.offline) {
      try {
        raw = await fetchExamRaw(code);
        savedAt = Date.now();
        if (hasAccess(code) && !isAdmin()) {
          await idb.set("exam:" + code, { uid: S.session.user.id, savedAt, subjects: raw.subjects, questions: raw.questions.filter((q) => q.is_active) });
          S.offMeta[code] = savedAt; await idb.set("offmeta", S.offMeta);
        }
      } catch (e) { if (!isNetErr(e)) throw e; }
    }
    if (!raw) {
      const c = await idb.get("exam:" + code);
      if (!c || c.uid !== S.session.user.id) throw new Error("Ce parcours n'est pas encore téléchargé sur ce téléphone. Ouvre-le une fois avec Internet pour pouvoir l'utiliser hors connexion.");
      if (!offFresh()) throw new Error("Connecte-toi à Internet pour vérifier ton accès (au moins une fois tous les " + OFF_DAYS + " jours).");
      raw = { subjects: c.subjects, questions: c.questions }; savedAt = c.savedAt; fromCache = true;
    }
    const subj = { data: raw.subjects }, questions = raw.questions;
    const active = questions.filter((q) => q.is_active);
    const bySubject = new Map();
    (subj.data || []).forEach((s) => bySubject.set(s.id, []));
    active.forEach((q) => { if (!bySubject.has(q.subject_id)) bySubject.set(q.subject_id, []); bySubject.get(q.subject_id).push(q); });
    S.data[code] = { subjects: (subj.data || []).filter((s) => (bySubject.get(s.id) || []).length), allSubjects: subj.data || [], questions: active, all: questions, bySubject, savedAt, fromCache };
    return S.data[code];
  }
  async function loadAttempts(code) {
    const pend = ((await idb.get("pending")) || []).filter((r) => r.uid === S.session.user.id && r.args.p_exam === code && (!r.rpc || r.rpc === "complete_quiz"))
      .map((r) => ({ id: "p" + r.at, subject_id: r.args.p_subject_id, mode: r.args.p_mode, total: r.args.p_total, correct: r.args.p_correct, created_at: new Date(r.at).toISOString(), pending: true }));
    let list;
    try {
      if (S.offline) throw new Error("Failed to fetch");
      const { data, error } = await sb.from("quiz_attempts").select("id,subject_id,mode,total,correct,created_at").eq("user_id", S.session.user.id).eq("exam_code", code).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      list = data || [];
      if (!isAdmin()) idb.set("att:" + code, { uid: S.session.user.id, list });
    } catch (e) {
      if (!isNetErr(e)) throw e;
      const c = await idb.get("att:" + code);
      list = c && c.uid === S.session.user.id ? c.list : [];
    }
    S.attempts[code] = pend.reverse().concat(list);
    return S.attempts[code];
  }

  /* ------------------------------------------------------------------ */
  /* Routage                                                            */
  /* ------------------------------------------------------------------ */
  const go = (h) => { if (location.hash === h) route(); else location.hash = h; };
  function parts() { return (location.hash.replace(/^#\/?/, "") || "").split("/").filter(Boolean).map(decodeURIComponent); }

  let routing = false;
  async function route() {
    if (routing) return; routing = true;
    try {
      document.body.className = "";
      document.documentElement.classList.remove("in-exam");
      offBanner();
      bottomnav.className = "bottomnav"; bottomnav.innerHTML = "";
      if (!configured) return renderNotConfigured();
      if (!S.session) { renderTopnav(); return renderAuth(); }
      if (!S.profile) { renderTopnav(); return renderNoProfile(); }
      renderTopnav();
      if (S.profile.is_blocked) return renderBlocked();
      const p = parts();
      if (S.offline && !offFresh()) return renderOfflineLocked();
      // examen en cours : impossible de quitter l'épreuve sans remettre sa copie
      if (exRunning() && !(p[0] === "p" && p[1] === S.exam.exam && p[2] === "examen")) { toast("Examen en cours : remets ta copie avant de quitter l'épreuve.", "err"); return go("#/p/" + S.exam.exam + "/examen"); }
      if (S.offline && p[0] === "admin") { app.innerHTML = `<div class="card center"><h2>Hors connexion</h2><p>L'administration nécessite une connexion Internet.</p><a class="btn btn-primary" href="#/">Retour</a></div>`; return; }
      if (p[0] === "p" && examByCode(p[1])) return await renderExam(p[1], p[2] || "accueil", p.slice(3));
      if (p[0] === "profil") return renderProfile();
      if (p[0] === "admin") return isAdmin() ? await renderAdmin(p[1] || "tableau") : go("#/");
      return renderHome();
    } catch (e) {
      app.innerHTML = `<div class="card center"><h2>⚠️ Erreur</h2><p>${esc(errText(e))}</p><button class="btn btn-primary" data-act="reload">Réessayer</button></div>`;
    } finally {
      routing = false;
      app.focus({ preventScroll: true });
      try { jRefresh(); } catch (e) { /* assistant facultatif */ }
    }
  }
  window.addEventListener("hashchange", () => { window.scrollTo(0, 0); route(); });

  let offBar = null;
  function offBanner() {
    const on = !!S.offline;
    document.documentElement.classList.toggle("is-offline", on);
    if (on && !offBar) {
      offBar = document.createElement("div"); offBar.className = "off-bar"; offBar.setAttribute("role", "status");
      document.getElementById("topbar").insertAdjacentElement("afterend", offBar);
    }
    if (offBar) {
      offBar.hidden = !on;
      if (on) offBar.innerHTML = `<b>📴 Mode hors connexion</b> — tes parcours téléchargés restent disponibles. <button type="button" data-act="retry-online">Réessayer</button>`;
    }
  }
  function renderOfflineLocked() {
    app.innerHTML = `<div class="card center" style="max-width:520px;margin:30px auto"><div class="e" style="font-size:2.4rem">🔒</div><h2>Vérification de ton accès nécessaire</h2>
      <p>Tu utilises LUKOS-REVISION hors connexion depuis plus de ${OFF_DAYS} jours. Connecte-toi à Internet quelques secondes pour vérifier que tes parcours sont toujours actifs, puis tu pourras de nouveau réviser hors connexion.</p>
      <button class="btn btn-primary" data-act="retry-online">J'ai de nouveau Internet</button></div>`;
  }
  function renderTopnav() {
    const p = parts()[0] || "";
    if (!S.session || !S.profile) { topnav.innerHTML = ""; return; }
    topnav.innerHTML =
      `<a href="#/" class="${p === "" ? "on" : ""}">Parcours</a>` +
      `<a href="#/profil" class="${p === "profil" ? "on" : ""}">Mon compte</a>` +
      (isAdmin() ? `<a href="#/admin" class="${p === "admin" ? "on" : ""}">Administration</a>` : "") +
      `<button class="out hide-m" data-act="logout">Déconnexion</button>`;
  }
  function setFooter() {
    document.getElementById("foot").textContent = "© " + new Date().getFullYear() + " LUKOS-REVISION — Conçu par " + (C.AUTHOR || "LUKOS") + " • Assistance : " + (C.CONTACT_DISPLAY || "");
  }

  /* ------------------------------------------------------------------ */
  /* Écrans hors connexion                                              */
  /* ------------------------------------------------------------------ */
  function renderNotConfigured() {
    app.innerHTML = `<div class="card" style="max-width:640px;margin:30px auto"><h2>Configuration requise</h2><p>Renseigne l'adresse et la clé de ton projet Supabase dans le fichier <b>config.js</b>, puis recharge la page.</p><p class="muted small">Voir le guide d'installation fourni avec l'application.</p></div>`;
  }
  function renderAuth() {
    const login = S.authMode === "login";
    app.innerHTML = `<div class="auth-wrap"><div class="auth">
      <div class="auth-head"><img class="big-logo" src="logo512.png" alt="Logo LUKOS-REVISION DAP / DQEG / CAT1-2" width="120" height="120"><h1>LUKOS-REVISION</h1><p class="muted">Ta plateforme de préparation aux examens</p>
      <div class="exam-tags"><span class="badge exam-DAP acc">DAP</span><span class="badge exam-DQEG acc">DQEG</span><span class="badge exam-CAT acc">CAT-1/CAT-2 INFANTERIE</span><span class="badge exam-BNSP acc">CAT-1/CAT-2 BNSP</span></div></div>
      <div class="card">
        <div class="seg" role="tablist"><button data-act="auth-mode" data-mode="login" class="${login ? "on" : ""}">Se connecter</button><button data-act="auth-mode" data-mode="signup" class="${!login ? "on" : ""}">Créer un compte</button></div>
        ${login ? `<form id="loginForm" autocomplete="on" novalidate>
          <label for="lPhone">Numéro de téléphone</label><input id="lPhone" inputmode="tel" autocomplete="username" placeholder="77 000 00 00" required>
          <label for="lPass">Mot de passe</label><input id="lPass" type="password" autocomplete="current-password" required minlength="8">
          <button class="btn btn-dark btn-block" style="margin-top:16px">Se connecter</button>
          <div class="msg" id="authMsg"></div></form>`
        : `<form id="signupForm" autocomplete="on" novalidate>
          <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px"><div><label for="sFirst">Prénom</label><input id="sFirst" autocomplete="given-name" required maxlength="60"></div><div><label for="sLast">Nom</label><input id="sLast" autocomplete="family-name" required maxlength="60"></div></div>
          <label for="sService">Service / Corps</label><select id="sService" required>${serviceOptions("")}</select>
          <label for="sPhone">Numéro de téléphone</label><input id="sPhone" inputmode="tel" autocomplete="tel" placeholder="77 000 00 00" required>
          <label for="sPass">Mot de passe (8 caractères minimum)</label><input id="sPass" type="password" autocomplete="new-password" required minlength="8">
          <label for="sPass2">Confirmer le mot de passe</label><input id="sPass2" type="password" autocomplete="new-password" required minlength="8">
          <label class="check"><input type="checkbox" id="sCgu" required> J'accepte que mes données (nom, téléphone) soient utilisées pour gérer mon accès.</label>
          <button class="btn btn-dark btn-block" style="margin-top:16px">Créer mon compte</button>
          <p class="hint">Numéro sénégalais commençant par 70, 75, 76, 77 ou 78. Ton numéro te servira d'identifiant.</p>
          <div class="msg" id="authMsg"></div></form>`}
      </div></div></div>`;
  }
  function renderNoProfile() {
    app.innerHTML = `<div class="card center" style="max-width:520px;margin:30px auto"><h2>Profil introuvable</h2><p>Ton compte existe mais son profil n'a pas pu être chargé. Contacte l'assistance.</p><button class="btn btn-ghost" data-act="logout">Déconnexion</button></div>`;
  }
  function renderBlocked() {
    app.innerHTML = `<div class="card center" style="max-width:520px;margin:30px auto"><h2>Compte bloqué</h2><p>Ton compte a été bloqué par l'administrateur. Contacte l'assistance au <b>${esc(C.CONTACT_DISPLAY)}</b>.</p><button class="btn btn-ghost" data-act="logout">Déconnexion</button></div>`;
  }

  let busy = false;
  async function doLogin(ev) {
    ev.preventDefault(); if (busy) return;
    const msg = document.getElementById("authMsg");
    const phone = phoneNormalize(document.getElementById("lPhone").value);
    const pass = document.getElementById("lPass").value;
    if (!phone) { msg.className = "msg err"; msg.textContent = "Numéro invalide (70, 75, 76, 77 ou 78 suivi de 7 chiffres)."; return; }
    busy = true; msg.className = "msg"; msg.textContent = "Connexion…";
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email: authEmail(phone), password: pass });
      if (error) { msg.className = "msg err"; msg.textContent = /rate|too many/i.test(error.message) ? "Trop de tentatives. Patiente quelques minutes." : "Numéro ou mot de passe incorrect."; return; }
      S.session = data.session; await afterLogin();
    } catch (e) { msg.className = "msg err"; msg.textContent = errText(e); }
    finally { busy = false; }
  }
  async function doSignup(ev) {
    ev.preventDefault(); if (busy) return;
    const msg = document.getElementById("authMsg"); msg.className = "msg err";
    const first = document.getElementById("sFirst").value.trim(), last = document.getElementById("sLast").value.trim();
    const phone = phoneNormalize(document.getElementById("sPhone").value);
    const p1 = document.getElementById("sPass").value, p2 = document.getElementById("sPass2").value;
    if (first.length < 2 || last.length < 2) return (msg.textContent = "Prénom et nom obligatoires.");
    const service = document.getElementById("sService").value;
    if (!SERVICES.some((s) => s[0] === service)) return (msg.textContent = "Choisis ton service ou corps (Gendarmerie, Armée ou BNSP).");
    if (!phone) return (msg.textContent = "Numéro sénégalais invalide.");
    if (p1.length < 8) return (msg.textContent = "Le mot de passe doit contenir au moins 8 caractères.");
    if (!/[A-Za-z]/.test(p1) || !/\d/.test(p1)) return (msg.textContent = "Le mot de passe doit contenir des lettres et des chiffres.");
    if (p1.replace(/\D/g, "").includes(phone.slice(4))) return (msg.textContent = "Le mot de passe ne doit pas contenir ton numéro.");
    if (p1 !== p2) return (msg.textContent = "Les mots de passe ne correspondent pas.");
    if (!document.getElementById("sCgu").checked) return (msg.textContent = "Coche la case d'acceptation pour continuer.");
    busy = true; msg.className = "msg"; msg.textContent = "Création du compte…";
    try {
      const { data, error } = await sb.auth.signUp({ email: authEmail(phone), password: p1, options: { data: { first_name: first, last_name: last, phone, service } } });
      if (error) { msg.className = "msg err"; msg.textContent = /already|registered|exists/i.test(error.message) ? "Ce numéro a déjà un compte. Connecte-toi." : /password/i.test(error.message) ? "Mot de passe trop faible. Choisis-en un plus solide." : "Création impossible. Réessaie."; return; }
      if (!data.session) { S.authMode = "login"; renderAuth(); toast("Compte créé. Connecte-toi maintenant.", "ok"); return; }
      S.session = data.session;
      try { await sb.rpc("set_my_service", { p_service: service }); } catch (e) { /* déjà repris depuis l'inscription */ }
      await afterLogin(); toast("Bienvenue sur LUKOS-REVISION !", "ok");
    } catch (e) { msg.className = "msg err"; msg.textContent = errText(e); }
    finally { busy = false; }
  }
  async function afterLogin() {
    await loadAccount();
    S.data = {}; S.attempts = {};
    go("#/");
    flushPending(); setTimeout(prefetchOffline, 2500);
  }
  let userLogout = false;
  async function logout() {
    userLogout = true;
    try { await sb.auth.signOut({ scope: "local" }); } catch (e) { /* ignore */ }
    try { Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k)).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* */ }
    await idb.clear(); S.offline = false; S.offMeta = {}; S.verifiedAt = 0;
    S.session = null; S.profile = null; S.enr = {}; S.data = {}; S.attempts = {}; S.payments = []; S.quiz = null; S.rev = null; S.exam = null; clearInterval(exTick);
    go("#/");
  }

  /* ------------------------------------------------------------------ */
  /* Accueil : choix du parcours                                        */
  /* ------------------------------------------------------------------ */
  function statusBadge(code) {
    if (isAdmin()) return `<span class="badge ok">ACCÈS ADMIN</span>`;
    const ex = examByCode(code);
    const e = S.enr[code];
    const pend = S.payments.find((p) => p.exam_code === code && p.status === "pending");
    if (e && e.status === "active") return `<span class="badge ok">✓ ACTIF</span>`;
    if (e && e.status === "suspended") return `<span class="badge bad">SUSPENDU</span>`;
    if (pend) return `<span class="badge warn">⏳ PAIEMENT EN VÉRIFICATION</span>`;
    if (e && e.status === "rejected") return `<span class="badge bad">PAIEMENT REFUSÉ</span>`;
    return ex && ex.is_open ? `<span class="badge fill">ACTIVER · ${esc(fmtXof(ex.price_xof))}</span>` : `<span class="badge">BIENTÔT</span>`;
  }
  function renderHome() {
    homeBottomNav("home");
    const name = esc(S.profile.first_name);
    app.innerHTML = `<section class="home-hero"><div class="home-hello">Bonjour ${name}</div><p>Choisis ton parcours de révision.</p></section>
      ${!isAdmin() && S.profile.service === null ? serviceCard() : ""}
      <div class="label-up">MES PARCOURS</div>
      <div class="exam-list">${S.exams.map((e) => `
        <button class="exam-row exam-${esc(e.code)}" data-act="open-exam" data-exam="${esc(e.code)}">
          <span class="exam-ico">${icon((EXAM_META[e.code] || {}).icon || "book", 28)}</span>
          <span class="exam-txt"><b>${esc(e.name)}</b><small>${esc(e.full_name)}</small><span class="exam-chips">${statusBadge(e.code)}${S.offMeta[e.code] && hasAccess(e.code) ? ` <span class="badge off">📥 HORS CONNEXION</span>` : ""}</span></span>
          <span class="exam-go">${icon("next", 22)}</span>
        </button>`).join("")}</div>
      <div class="tip">${icon("info", 22)}<span>Chaque parcours s'active séparément après validation de ton paiement Wave ou Orange Money. Une fois activé, il est téléchargé automatiquement pour être utilisable même sans Internet.</span></div>`;
  }
  function serviceCard() {
    return `<form class="card ex-service" id="serviceForm"><b>Complète ton profil</b><p class="small muted">Indique ton service ou corps pour que nous puissions mieux t'accompagner.</p>
      <div class="row"><select id="svcSel" style="flex:1;min-width:200px" aria-label="Service / Corps">${serviceOptions("")}</select><button class="btn btn-primary">Enregistrer</button></div></form>`;
  }
  async function saveService(ev) {
    ev.preventDefault();
    const v = document.getElementById("svcSel").value;
    if (!SERVICES.some((s) => s[0] === v)) return toast("Choisis ton service ou corps.", "err");
    const { error } = await sb.rpc("set_my_service", { p_service: v });
    if (error) return toast(errText(error), "err");
    await loadAccount(); toast("Profil complété ✓", "ok"); route();
  }
  function homeBottomNav(cur) {
    const items = [["home", "#/", "home", "Parcours"], ["profil", "#/profil", "user", "Mon compte"]].concat(isAdmin() ? [["admin", "#/admin", "shield", "Admin"]] : []);
    bottomnav.className = "bottomnav show home-nav n" + items.length;
    bottomnav.innerHTML = items.map(([k, h, ic, l]) => `<a href="${h}" class="bn bn-${k} ${cur === k ? "on" : ""}">${icon(ic, 20)}<span>${l}</span></a>`).join("");
  }

  /* ------------------------------------------------------------------ */
  /* Parcours                                                           */
  /* ------------------------------------------------------------------ */
  function examBottomNav(code, cur) {
    const items = [["accueil", "home", "Accueil"], ["matieres", "book", "Matières"], ["quiz", "target", "Quiz"], ["recherche", "search", "Recherche"], ["documents", "file", "Documents"]];
    bottomnav.className = "bottomnav show exam-" + code;
    bottomnav.innerHTML = items.map(([k, i, l]) => `<a href="#/p/${code}/${k}" class="bn bn-${k} ${cur === k ? "on" : ""}">${icon(i, 20)}<span>${l}</span></a>`).join("");
  }
  function hero(exam, title, sub, crumb) {
    const back = crumb ? "#/p/" + exam.code : "#/";
    return `<section class="hero"><div class="hero-top"><a class="icon-btn" href="${back}" aria-label="Retour">${icon("back", 22)}</a><div class="crumb"><a href="#/">Parcours</a> › ${crumb ? `<a href="#/p/${exam.code}">${esc(exam.name)}</a> › ${esc(crumb)}` : esc(exam.name)}</div></div><h1>${esc(title)}</h1><p>${esc(sub)}</p></section>`;
  }

  async function renderExam(code, page, rest) {
    const exam = examByCode(code);
    document.body.className = "exam-" + code;
    if (!hasAccess(code)) return renderActivation(exam);
    examBottomNav(code, page === "revision" ? "matieres" : page === "examen" ? "quiz" : page);
    app.innerHTML = `<div class="center-load"><div class="spinner"></div><p>Chargement du parcours ${esc(exam.name)}…</p></div>`;
    const d = await loadExamData(code);
    if (page === "matieres") return renderSubjects(exam, d);
    if (page === "revision") return renderRevision(exam, d, rest[0]);
    if (page === "quiz") return renderQuizSetup(exam, d);
    if (page === "examen") return await renderExamSim(exam, d);
    if (page === "recherche") return renderSearch(exam, d);
    if (page === "documents") return await renderDocuments(exam);
    return await renderExamHome(exam, d);
  }

  function offlineNote(exam, d) {
    if (isAdmin()) return "";
    if (S.offline) return `<div class="offnote">📴 Hors connexion — contenu téléchargé le ${esc(fmtDate(d.savedAt))}. Les résultats de tes quiz seront envoyés au retour d'Internet.</div>`;
    return d.savedAt ? `<div class="offnote ok">📥 Disponible hors connexion — à jour (${esc(fmtDate(d.savedAt))}).</div>` : "";
  }
  async function renderExamHome(exam, d) {
    const att = await loadAttempts(exam.code).catch(() => []);
    const done = att.length, totalQ = att.reduce((a, x) => a + x.total, 0), good = att.reduce((a, x) => a + x.correct, 0);
    const avg = totalQ ? Math.round((good / totalQ) * 100) : 0;
    const subjName = (id) => (d.allSubjects.find((s) => s.id === id) || {}).name || "Toutes les matières";
    app.innerHTML = hero(exam, exam.name, (EXAM_META[exam.code] || {}).tagline || exam.full_name).replace('class="hero"', 'class="hero hero-stats"') +
      `<div class="stats"><div class="stat"><b>${d.questions.length}</b><span>Questions</span></div><div class="stat"><b>${d.subjects.length}</b><span>Matières</span></div><div class="stat"><b>${done}</b><span>Quiz faits</span></div><div class="stat"><b>${avg} %</b><span>Réussite</span></div></div>
      ${offlineNote(exam, d)}
      <div class="actions">
        <a class="action a-blue" href="#/p/${exam.code}/matieres"><i>${icon("book", 24)}</i><b>Réviser</b><small>Fiches par matière</small></a>
        <a class="action a-orange" href="#/p/${exam.code}/quiz"><i>${icon("target", 24)}</i><b>Quiz</b><small>QCM ou auto-évaluation</small></a>
        <a class="action a-teal" href="#/p/${exam.code}/recherche"><i>${icon("search", 24)}</i><b>Rechercher</b><small>Une notion, un mot</small></a>
        <a class="action a-violet" href="#/p/${exam.code}/documents"><i>${icon("file", 24)}</i><b>Documents</b><small>PDF de référence</small></a>
      </div>
      <a class="ex-banner" href="#/p/${exam.code}/examen"><span class="ex-ico" aria-hidden="true">🎓</span><span><b>Simulateur d'examen</b><small>10 à 30 questions, réponses rédigées, chronométré, corrigé et noté sur 20</small></span><span class="ex-go" aria-hidden="true">${icon("next", 22)}</span></a>
      <div class="grid-2">
        <div><div class="section-title"><h2>Matières</h2><a href="#/p/${exam.code}/matieres" class="small">Tout voir →</a></div>
          <div class="subject-list">${d.subjects.slice(0, 6).map((s, i) => subjectRow(exam, d, s, i)).join("") || emptyBox("Aucune question n'a encore été publiée pour ce parcours.")}</div></div>
        <div><div class="section-title"><h2>Mes derniers quiz</h2></div>
          <div class="card">${att.length ? `<div class="table-wrap"><table class="t"><tr><th>Date</th><th>Matière</th><th>Score</th></tr>${att.slice(0, 8).map((a) => `<tr><td>${esc(fmtDate(a.created_at))}</td><td>${esc(subjName(a.subject_id))}</td><td><b>${a.correct}/${a.total}</b> <span class="muted small">(${Math.round(a.correct / a.total * 100)}%)</span>${a.pending ? ' <span class="badge warn">À ENVOYER</span>' : ""}</td></tr>`).join("")}</table></div>` : `<div class="empty"><div class="e e-ico">${icon("target", 30)}</div><p>Aucun quiz pour l'instant.</p><a class="btn btn-primary" href="#/p/${exam.code}/quiz">Lancer mon premier quiz</a></div>`}</div></div>
      </div>`;
  }
  function emptyBox(t) { return `<div class="card empty"><div class="e e-ico">${icon("info", 30)}</div><p>${esc(t)}</p></div>`; }
  function subjectRow(exam, d, s, i) {
    const n = (d.bySubject.get(s.id) || []).length;
    return `<div class="subject"><div class="num">${i + 1}</div><div class="info"><b>${esc(s.name)}</b><span>${n} question${n > 1 ? "s" : ""}</span></div><a class="btn btn-primary btn-sm" href="#/p/${exam.code}/revision/${s.id}">Réviser</a></div>`;
  }
  function renderSubjects(exam, d) {
    app.innerHTML = hero(exam, "Matières", d.questions.length + " questions réparties dans " + d.subjects.length + " matières.", "Matières") +
      `<div class="subject-list">${d.subjects.map((s, i) => subjectRow(exam, d, s, i)).join("") || emptyBox("Aucune question n'a encore été publiée pour ce parcours.")}</div>`;
  }

  /* ----- Révision (fiches) ----- */
  function watermark() {
    const t = (S.profile ? phonePretty(S.profile.phone) + " · LUKOS   " : "LUKOS   ").repeat(6);
    return `<div class="wm" aria-hidden="true">${esc((t + "\n").repeat(14))}</div>`;
  }
  function renderRevision(exam, d, sid) {
    const subject = d.subjects.find((s) => String(s.id) === String(sid));
    if (!subject) return go("#/p/" + exam.code + "/matieres");
    if (!S.rev || S.rev.key !== exam.code + ":" + sid) {
      S.rev = { key: exam.code + ":" + sid, list: (d.bySubject.get(subject.id) || []).slice(), i: 0, show: false, shuffled: false };
    }
    drawRevision(exam, subject);
  }
  function drawRevision(exam, subject) {
    const r = S.rev, q = r.list[r.i];
    app.innerHTML = hero(exam, subject.name, "Révision par fiches — question " + (r.i + 1) + " sur " + r.list.length, "Révision") +
      `<div class="study"><div class="bar" style="margin-bottom:14px"><i style="width:${((r.i + 1) / r.list.length) * 100}%"></i></div>
      <article class="qcard">${watermark()}
        <div class="qmeta"><span class="badge acc">${esc(subject.name)}</span><span class="muted small">${r.i + 1} / ${r.list.length}</span></div>
        <div class="qtext">${esc(q.question)}</div>
        ${r.show ? `<div class="answer">${formatAnswer(q.answer)}</div>` : ""}
        <div class="row" style="margin-top:14px;position:relative"><button class="btn ${r.show ? "btn-ghost" : "btn-primary"}" data-act="rev-toggle">${r.show ? "Masquer la réponse" : "Afficher la réponse"}</button>
        <button class="btn btn-ghost btn-sm" data-act="rev-shuffle">${r.shuffled ? "Ordre normal" : "Mélanger"}</button></div>
      </article>
      <div class="nav-q"><button class="btn btn-ghost" data-act="rev-prev" ${r.i === 0 ? "disabled" : ""}>← Précédente</button><button class="btn btn-primary" data-act="rev-next" ${r.i >= r.list.length - 1 ? "disabled" : ""}>Suivante →</button></div>
      <p class="hint center">Astuce : flèches ← → pour naviguer, barre d'espace pour afficher la réponse.</p></div>`;
  }
  function revAction(act) {
    const r = S.rev; if (!r) return;
    const p = parts(); const exam = examByCode(p[1]); const d = S.data[p[1]];
    const subject = d && d.subjects.find((s) => String(s.id) === String(p[3]));
    if (!exam || !subject) return;
    if (act === "rev-toggle") r.show = !r.show;
    if (act === "rev-next" && r.i < r.list.length - 1) { r.i++; r.show = false; }
    if (act === "rev-prev" && r.i > 0) { r.i--; r.show = false; }
    if (act === "rev-shuffle") { r.shuffled = !r.shuffled; r.list = r.shuffled ? shuffle(r.list) : (d.bySubject.get(subject.id) || []).slice(); r.i = 0; r.show = false; }
    drawRevision(exam, subject);
  }
  document.addEventListener("keydown", (e) => {
    if (!S.rev || parts()[2] !== "revision" || /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key === "ArrowRight") revAction("rev-next");
    else if (e.key === "ArrowLeft") revAction("rev-prev");
    else if (e.key === " ") { e.preventDefault(); revAction("rev-toggle"); }
  });

  /* ----- Quiz ----- */
  function renderQuizSetup(exam, d) {
    if (S.quiz && S.quiz.exam === exam.code && !S.quiz.finished) return drawQuiz();
    if (!d.questions.length) { app.innerHTML = hero(exam, "Quiz " + exam.name, "Entraîne-toi et mesure ta progression.", "Quiz") + emptyBox("Le quiz sera disponible dès que les questions de ce parcours seront publiées."); return; }
    app.innerHTML = hero(exam, "Quiz " + exam.name, "Entraîne-toi et mesure ta progression.", "Quiz") +
      `<div class="card study"><form id="quizForm">
        <label for="qzSub">Matière</label><select id="qzSub"><option value="">Toutes les matières (${d.questions.length} questions)</option>${d.subjects.map((s) => `<option value="${s.id}">${esc(s.name)} (${(d.bySubject.get(s.id) || []).length})</option>`).join("")}</select>
        <label for="qzNum">Nombre de questions</label><select id="qzNum"><option>10</option><option selected>20</option><option>30</option><option>50</option></select>
        <label>Type de quiz</label>
        <div class="radio-cards"><label><input type="radio" name="qzMode" value="qcm" checked> QCM — 4 propositions</label><label><input type="radio" name="qzMode" value="auto"> Auto-évaluation — je me note</label></div>
        <p class="hint">QCM : choisis la bonne réponse parmi 4. Auto-évaluation : lis la question, réponds de tête, puis vérifie et indique si tu savais.</p>
        <button class="btn btn-primary btn-block" style="margin-top:14px">Lancer le quiz</button></form></div>`;
  }
  function startQuiz(ev) {
    ev.preventDefault();
    const code = parts()[1], d = S.data[code];
    const sid = document.getElementById("qzSub").value;
    const n = Number(document.getElementById("qzNum").value) || 20;
    const mode = (document.querySelector('input[name="qzMode"]:checked') || {}).value === "auto" ? "auto" : "qcm";
    const pool = sid ? (d.bySubject.get(Number(sid)) || []) : d.questions;
    if (!pool.length) return toast("Aucune question disponible pour cette sélection.", "err");
    const items = shuffle(pool).slice(0, Math.min(n, pool.length)).map((q) => {
      let options = null;
      if (mode === "qcm") {
        const same = shuffle((d.bySubject.get(q.subject_id) || []).filter((x) => x.id !== q.id && x.answer !== q.answer));
        const others = same.length >= 3 ? same : same.concat(shuffle(d.questions.filter((x) => x.id !== q.id && x.answer !== q.answer && x.subject_id !== q.subject_id)));
        const picked = []; for (const o of others) { if (picked.length >= 3) break; if (!picked.includes(o.answer)) picked.push(o.answer); }
        options = shuffle([q.answer].concat(picked));
      }
      return { q, options, chosen: null, ok: null, shown: false };
    });
    S.quiz = { exam: code, subjectId: sid ? Number(sid) : null, mode, items, i: 0, finished: false, saved: false };
    drawQuiz();
  }
  function drawQuiz() {
    const z = S.quiz, exam = examByCode(z.exam), it = z.items[z.i], d = S.data[z.exam];
    try { jRefresh(); } catch (e) { /* */ }
    if (z.finished) return drawQuizEnd();
    const subj = (d.allSubjects.find((s) => s.id === it.q.subject_id) || {}).name || "";
    let body = "";
    if (z.mode === "qcm") {
      body = `<div class="choices">${it.options.map((o, k) => {
        let cls = "choice";
        if (it.chosen !== null) { if (o === it.q.answer) cls += " good"; else if (k === it.chosen) cls += " bad"; }
        return `<button class="${cls}" data-act="qz-pick" data-k="${k}" ${it.chosen !== null ? "disabled" : ""}><span class="letter">${"ABCD"[k]}</span><span class="ctext">${esc(o)}</span></button>`;
      }).join("")}</div>` +
      (it.chosen !== null ? `<div class="feedback ${it.ok ? "ok" : "bad"}">${it.ok ? "✓ Bonne réponse !" : "✗ Mauvaise réponse. La bonne réponse est :"}</div>${it.ok ? "" : `<div class="answer">${formatAnswer(it.q.answer)}</div>`}` : "");
    } else {
      body = it.shown ? `<div class="answer">${formatAnswer(it.q.answer)}</div>` + (it.ok === null ? `<div class="row" style="margin-top:14px;position:relative"><button class="btn btn-ok" data-act="qz-self" data-v="1">✓ Je savais</button><button class="btn btn-bad" data-act="qz-self" data-v="0">✗ À revoir</button></div>` : `<div class="feedback ${it.ok ? "ok" : "bad"}">${it.ok ? "✓ Notée comme sue" : "✗ Notée à revoir"}</div>`)
        : `<button class="btn btn-primary" style="margin-top:12px;position:relative" data-act="qz-show">Afficher la réponse</button>`;
    }
    const answered = z.mode === "qcm" ? it.chosen !== null : it.ok !== null;
    const score = z.items.filter((x) => x.ok).length;
    app.innerHTML = hero(exam, "Quiz " + exam.name, (z.mode === "qcm" ? "QCM" : "Auto-évaluation") + " — question " + (z.i + 1) + " sur " + z.items.length + " · score actuel " + score, "Quiz") +
      `<div class="study"><div class="bar" style="margin-bottom:14px"><i style="width:${((z.i + 1) / z.items.length) * 100}%"></i></div>
      <article class="qcard">${watermark()}<div class="qmeta"><span class="badge acc">${esc(subj)}</span><span class="muted small">${z.i + 1} / ${z.items.length}</span></div>
      <div class="qtext">${esc(it.q.question)}</div>${body}</article>
      <div class="nav-q"><button class="btn btn-ghost" data-act="qz-quit">Abandonner</button>${answered ? `<button class="btn btn-primary" data-act="qz-next">${z.i < z.items.length - 1 ? "Question suivante →" : "Voir mon résultat"}</button>` : ""}</div></div>`;
  }
  async function quizAction(act, el) {
    const z = S.quiz; if (!z) return;
    const it = z.items[z.i];
    if (act === "qz-pick" && it.chosen === null) { it.chosen = Number(el.dataset.k); it.ok = it.options[it.chosen] === it.q.answer; }
    if (act === "qz-show") it.shown = true;
    if (act === "qz-self" && it.ok === null) it.ok = el.dataset.v === "1";
    if (act === "qz-next") { if (z.i < z.items.length - 1) z.i++; else { z.finished = true; await saveQuiz(); } }
    if (act === "qz-quit") { if (!confirm("Abandonner ce quiz ? Il ne sera pas enregistré.")) return; S.quiz = null; return route(); }
    drawQuiz(); window.scrollTo(0, 0);
  }
  async function saveQuiz() {
    const z = S.quiz; if (z.saved) return;
    const correct = z.items.filter((x) => x.ok).length;
    const args = { p_exam: z.exam, p_subject_id: z.subjectId, p_mode: z.mode, p_total: z.items.length, p_correct: correct };
    try {
      if (S.offline) throw new Error("Failed to fetch");
      const { error } = await sb.rpc("complete_quiz", args);
      if (error) throw error;
      z.saved = true; delete S.attempts[z.exam];
    } catch (e) {
      if (isNetErr(e)) { await queuePending({ uid: S.session.user.id, at: Date.now(), args }); z.pending = true; delete S.attempts[z.exam]; }
      else toast("Résultat non enregistré : " + errText(e), "err");
    }
  }
  function drawQuizEnd() {
    const z = S.quiz, exam = examByCode(z.exam);
    try { jRefresh(); } catch (e) { /* */ }
    const correct = z.items.filter((x) => x.ok).length, pct = Math.round((correct / z.items.length) * 100);
    const wrong = z.items.filter((x) => !x.ok);
    const verdict = pct >= 80 ? "Excellent travail !" : pct >= 60 ? "Bon résultat, continue ainsi." : pct >= 40 ? "Des bases solides, mais il faut réviser." : "Reprends les fiches de révision puis réessaie.";
    app.innerHTML = hero(exam, "Résultat du quiz", verdict, "Quiz") +
      `<div class="study"><div class="card center"><div class="score-ring" style="--p:${pct}"><div>${pct}%</div></div><h2>${correct} / ${z.items.length} bonnes réponses</h2><p class="muted">${z.saved ? "Résultat enregistré dans ta progression." : z.pending ? "📴 Résultat gardé sur le téléphone : il sera ajouté à ta progression dès le retour d'Internet." : "Résultat non enregistré."}</p>
      <div class="row" style="justify-content:center"><button class="btn btn-primary" data-act="qz-again">Nouveau quiz</button><a class="btn btn-ghost" href="#/p/${exam.code}">Retour au parcours</a></div></div>
      ${wrong.length ? `<div class="card" style="margin-top:14px"><h3>À revoir (${wrong.length})</h3>${wrong.map((x) => `<div class="review-item"><b>${esc(x.q.question)}</b><div class="answer">${formatAnswer(x.q.answer)}</div></div>`).join("")}</div>` : ""}</div>`;
  }

  /* ----- Recherche ----- */
  function renderSearch(exam, d) {
    app.innerHTML = hero(exam, "Recherche", "Retrouve une question ou une notion dans tout le parcours " + exam.name + ".", "Recherche") +
      `<div class="study"><input id="searchBox" type="search" placeholder="Ex. réquisition, flagrant délit, LRAC…" autocomplete="off" aria-label="Rechercher"><div id="searchOut" style="margin-top:14px"><p class="muted center">Tape au moins 2 caractères.</p></div></div>`;
    const box = document.getElementById("searchBox"); box.focus();
    let t = null;
    box.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => doSearch(d, box.value), 180); });
  }
  function doSearch(d, raw) {
    const out = document.getElementById("searchOut"); if (!out) return;
    const q = norm(raw.trim());
    if (q.length < 2) { out.innerHTML = `<p class="muted center">Tape au moins 2 caractères.</p>`; return; }
    const words = q.split(/\s+/).filter(Boolean);
    const hits = d.questions.map((x) => { const qq = norm(x.question), aa = norm(x.answer); if (!words.every((w) => qq.includes(w) || aa.includes(w))) return null; return { x, s: words.reduce((a, w) => a + (qq.includes(w) ? 3 : 0) + (aa.includes(w) ? 1 : 0), 0) }; }).filter(Boolean).sort((a, b) => b.s - a.s).slice(0, 60);
    const sname = (id) => (d.allSubjects.find((s) => s.id === id) || {}).name || "";
    const hl = raw.trim().split(/\s+/)[0];
    out.innerHTML = hits.length ? `<p class="muted small">${hits.length === 60 ? "60 premiers résultats" : hits.length + " résultat" + (hits.length > 1 ? "s" : "")}</p>` + hits.map(({ x }) => `<details class="card" style="margin-bottom:10px"><summary style="cursor:pointer"><span class="badge acc">${esc(sname(x.subject_id))}</span><div style="font-weight:800;margin-top:6px">${esc(x.question)}</div></summary><div class="answer">${formatAnswer(x.answer, hl.length >= 3 ? hl : "")}</div></details>`).join("") : `<div class="empty"><div class="e">🔍</div><p>Aucun résultat pour « ${esc(raw.trim())} ».</p></div>`;
  }

  /* ----- Documents ----- */
  async function renderDocuments(exam) {
    app.innerHTML = hero(exam, "Documents", "Documents de référence du parcours " + exam.name + ".", "Documents") +
      (isAdmin() ? `<div class="card study upload-card"><h3>${icon("upload", 20)} Ajouter un document de référence (${esc(exam.name)})</h3><p class="small muted">PDF uniquement, 25 Mo maximum. Seuls les candidats actifs sur ce parcours pourront l'ouvrir.</p><input type="file" id="docFile" accept="application/pdf,.pdf"><input type="hidden" id="docExam" value="${esc(exam.code)}"><button class="btn btn-primary" data-act="ad-docup" style="margin-top:12px">Publier le document</button><div class="msg" id="docMsg"></div></div>` : "") +
      `<div id="docsOut" class="study"><div class="center-load"><div class="spinner"></div></div></div>`;
    const { data, error } = await sb.storage.from("lukos-docs").list(exam.code, { limit: 100, sortBy: { column: "name", order: "asc" } });
    const out = document.getElementById("docsOut"); if (!out) return;
    if (error) { out.innerHTML = emptyBox("Impossible de charger les documents : " + storageErr(error)); return; }
    const files = (data || []).filter((f) => /\.pdf$/i.test(f.name));
    out.innerHTML = files.length ? `<div class="subject-list">${files.map((f) => `<div class="subject"><div class="num pdf">PDF</div><div class="info"><b>${esc(f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "))}</b><span>${f.metadata && f.metadata.size ? Math.round(f.metadata.size / 1024) + " Ko" : ""}</span></div><button class="btn btn-primary btn-sm" data-act="open-doc" data-path="${esc(exam.code + "/" + f.name)}">Ouvrir</button>${isAdmin() ? `<button class="btn btn-bad btn-sm" data-act="ad-docdel" data-path="${esc(exam.code + "/" + f.name)}" aria-label="Supprimer">✕</button>` : ""}</div>`).join("")}</div><p class="hint center">Les liens d'ouverture sont personnels et expirent après 2 minutes.</p>` : emptyBox(isAdmin() ? "Aucun document pour ce parcours : ajoute le premier ci-dessus." : "Aucun document publié pour ce parcours pour le moment.");
  }
  function storageErr(e) {
    const m = String((e && e.message) || e || "");
    if (/bucket not found/i.test(m)) return "l'espace de stockage « lukos-docs » n'existe pas. Exécute le script 04_documents.sql dans Supabase.";
    if (/row-level security|policy|unauthorized|not authorized|403/i.test(m)) return "droits de stockage manquants. Exécute le script 04_documents.sql dans Supabase.";
    if (/mime|type/i.test(m)) return "seuls les fichiers PDF sont acceptés.";
    if (/size|too large|payload/i.test(m)) return "fichier trop lourd (25 Mo maximum).";
    return errText(e);
  }
  async function openDoc(path) {
    let w = null;
    try { w = window.open("", "_blank"); if (w) w.document.write('<p style="font-family:Arial;padding:20px">Ouverture du document…</p>'); } catch (e) { w = null; }
    const { data, error } = await sb.storage.from("lukos-docs").createSignedUrl(path, 120);
    if (error || !data) { if (w) w.close(); return toast("Document indisponible : " + errText(error), "err"); }
    if (w) w.location.href = data.signedUrl; else location.href = data.signedUrl;
  }

  /* ----- Activation / paiement ----- */
  const PROOF_BUCKET = "lukos-preuves";
  const PAY = { img: null, blob: null };
  const digits = (s) => String(s || "").replace(/\D/g, "");
  const initials = (u) => ((u.first_name || "?")[0] + (u.last_name || "")[0] || "").toUpperCase();
  function copyText(v, el) {
    const done = () => {
      toast((el && el.dataset.l ? el.dataset.l : "Texte") + " copié : colle-le dans ton application de paiement.", "ok");
      if (el) { const t = el.innerHTML; el.classList.add("copied"); el.innerHTML = "✓ Copié"; setTimeout(() => { el.classList.remove("copied"); el.innerHTML = t; }, 1600); }
    };
    const fallback = () => {
      const ta = document.createElement("textarea"); ta.value = v; ta.setAttribute("readonly", ""); ta.style.position = "absolute"; ta.style.left = "-9999px";
      document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove(); ok ? done() : toast("Copie impossible : note " + v + ".", "err");
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(v).then(done).catch(fallback); else fallback();
  }
  // réduit la capture sur le téléphone (≈ 200 Ko) avant l'envoi
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type || "image/")) return reject(new Error("Choisis une image (capture d'écran)."));
      if (file.size > 15 * 1024 * 1024) return reject(new Error("Image trop lourde (15 Mo maximum)."));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("Lecture de l'image impossible."));
      fr.onload = () => {
        const im = new Image();
        im.onerror = () => reject(new Error("Format d'image non reconnu. Fais une capture d'écran et réessaie."));
        im.onload = () => {
          const max = 1400, k = Math.min(1, max / Math.max(im.width, im.height));
          const c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
          const url = c.toDataURL("image/jpeg", 0.78);
          c.toBlob((b) => (b ? resolve({ blob: b, url }) : reject(new Error("Compression impossible."))), "image/jpeg", 0.78);
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function proofZone(label) {
    return `<label class="proof-drop ${PAY.img ? "has" : ""}" id="proofDrop">
        <input type="file" id="proofFile" accept="image/*" hidden>
        ${PAY.img ? `<img src="${PAY.img}" alt="Aperçu de ta capture"><span class="proof-change">✓ Capture ajoutée · toucher pour changer</span>`
        : `<span class="proof-ico" aria-hidden="true">📸</span><b>${esc(label || "Ajouter la capture du paiement")}</b><small>Choisis la capture d'écran dans ta galerie</small>`}
      </label>`;
  }
  function bindProofZone() {
    const f = document.getElementById("proofFile"); if (!f) return;
    f.addEventListener("change", async () => {
      const file = f.files && f.files[0]; if (!file) return;
      const drop = document.getElementById("proofDrop"); drop.classList.add("busy");
      try { const r = await compressImage(file); PAY.img = r.url; PAY.blob = r.blob; drop.outerHTML = proofZone(); bindProofZone(); }
      catch (e) { drop.classList.remove("busy"); toast(e.message, "err"); }
    });
  }
  async function uploadProof(payId) {
    const uid = S.session.user.id, path = uid + "/" + String(payId).replace(/[^\w-]/g, "") + "-" + Date.now() + ".jpg";
    const up = await sb.storage.from(PROOF_BUCKET).upload(path, PAY.blob, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" });
    if (up.error) throw up.error;
    const { error } = await sb.rpc("attach_payment_proof", { p_payment: String(payId), p_path: path });
    if (error) throw error;
    PAY.img = null; PAY.blob = null;
  }
  function payMethods(exam) {
    const m = (val, cls, logo, name, sub, num, checked) => `<label class="pm ${cls}">
        <input type="radio" name="payMethod" value="${val}" ${checked ? "checked" : ""}>
        <div class="pm-top"><span class="pm-logo">${logo}</span><span class="pm-name"><b>${name}</b><small>${sub}</small></span><span class="pm-check" aria-hidden="true">✓</span></div>
        <div class="pm-num">${esc(num)}</div>
        <button type="button" class="pm-copy" data-act="copy-txt" data-v="${esc(digits(num))}" data-l="Numéro ${name}">📋 Copier le numéro</button>
      </label>`;
    return `<div class="pay-methods">${m("wave", "pm-wave", "W", "Wave", "Application Wave", C.WAVE_NUMBER, true)}${m("orange_money", "pm-om", "OM", "Orange Money", "Max it ou Orange Money", C.ORANGE_MONEY_NUMBER, false)}</div>
      <div class="pay-amount"><span>Montant exact à envoyer</span><b>${esc(fmtXof(exam.price_xof))}</b><button type="button" class="pm-copy" data-act="copy-txt" data-v="${esc(String(exam.price_xof))}" data-l="Montant">📋 Copier le montant</button></div>`;
  }
  function renderActivation(exam) {
    homeBottomNav("home");
    if (PAY.code !== exam.code) { PAY.img = null; PAY.blob = null; PAY.code = exam.code; }
    const e = S.enr[exam.code];
    const pend = S.payments.find((p) => p.exam_code === exam.code && p.status === "pending");
    const lastRej = S.payments.find((p) => p.exam_code === exam.code && p.status === "rejected");
    const meta = EXAM_META[exam.code] || {};
    const top = `<section class="pay-hero exam-${esc(exam.code)}">
        <a class="pay-back" href="#/">${icon("back", 18)} Parcours</a>
        <div class="pay-hero-ic">${icon(meta.icon || "book", 30)}</div>
        <div class="pay-hero-t"><small>Accès complet</small><h1>${esc(exam.name)}</h1><p>${esc(exam.full_name || "")}</p></div>
        <div class="pay-price">${esc(fmtXof(exam.price_xof))}<small>paiement unique</small></div>
        <ul class="pay-perks"><li>📖 Fiches corrigées</li><li>🎯 Quiz illimités</li><li>🎓 Simulateur d'examen</li><li>🤖 Julien – IA</li><li>📴 Hors connexion</li></ul>
      </section>`;
    let body = "";
    if (e && e.status === "suspended") body = `<div class="feedback bad">Ton accès à ce parcours est suspendu. Contacte l'assistance au ${esc(C.CONTACT_DISPLAY)}.</div>`;
    else if (!exam.is_open) body = `<p class="feedback bad">Ce parcours n'est pas encore ouvert aux inscriptions.</p>`;
    else if (pend) body = `<div class="card pay-status">
        <h3>Paiement en cours de vérification</h3>
        <ol class="pay-track"><li class="done"><span>✓</span>Paiement déclaré<small>${esc(fmtDate(pend.created_at))} · ${pend.method === "wave" ? "Wave" : "Orange Money"}</small></li>
          <li class="${pend.proof_path ? "done" : "todo"}"><span>${pend.proof_path ? "✓" : "2"}</span>Capture du paiement<small>${pend.proof_path ? "Reçue" : "À envoyer ci-dessous"}</small></li>
          <li class="wait"><span>⏳</span>Validation par l'administrateur<small>Généralement dans la journée</small></li></ol>
        ${pend.proof_path ? "" : `<div class="pay-step-in">${proofZone("Ajouter ma capture")}<button class="btn btn-primary btn-block" data-act="pay-proof" data-id="${esc(pend.id)}">Envoyer ma capture</button></div>`}
        <div class="row" style="margin-top:12px;justify-content:center"><button class="btn btn-ghost btn-sm" data-act="refresh-account">↻ Vérifier l'activation</button><a class="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer" href="${esc(waLink(exam, pend.id))}">💬 Une question ? WhatsApp</a></div>
      </div>`;
    else body = `${lastRej ? `<div class="feedback bad" style="margin-bottom:12px">Ton dernier paiement a été refusé${lastRej.admin_note ? " : " + esc(lastRej.admin_note) : ""}. Tu peux en déclarer un nouveau.</div>` : ""}
      <form id="payForm" class="card pay-form" novalidate>
        <div class="pay-step"><span class="pay-n">1</span><div><h3>Envoie ${esc(fmtXof(exam.price_xof))}</h3><p>Choisis ton moyen de paiement, copie le numéro et le montant.</p></div></div>
        ${payMethods(exam)}
        <div class="pay-step"><span class="pay-n">2</span><div><h3>Ajoute ta capture</h3><p>La capture d'écran de la confirmation de paiement.</p></div></div>
        ${proofZone()}
        <details class="pay-more"><summary>Payé depuis un autre numéro ? <span>(facultatif)</span></summary>
          <label for="payPhone">Numéro qui a payé</label><input id="payPhone" inputmode="tel" placeholder="77 000 00 00" value="${esc(phonePretty(S.profile.phone))}">
          <label for="payRef">Référence de la transaction</label><input id="payRef" maxlength="80" placeholder="ID reçu par SMS">
        </details>
        <div class="pay-step"><span class="pay-n">3</span><div><h3>Envoie ta preuve</h3><p>L'administrateur valide ton accès, généralement dans la journée.</p></div></div>
        <button class="btn btn-primary btn-block pay-submit">Envoyer ma preuve de paiement</button><div class="msg" id="payMsg"></div>
        <p class="pay-help">Un souci pour envoyer la capture ? <a target="_blank" rel="noopener noreferrer" href="${esc(waLinkHelp(exam))}">Écris-nous sur WhatsApp</a></p>
      </form>`;
    app.innerHTML = `<div class="pay-wrap">${top}${body}</div>`;
    bindProofZone();
  }
  function waLink(exam, payId) {
    const t = `Bonjour LUKOS, j'ai payé ${fmtXof(exam.price_xof)} pour le parcours ${exam.name}.\nNom : ${S.profile.first_name} ${S.profile.last_name}\nTéléphone : ${S.profile.phone}\nRéférence LUKOS : ${payId}`;
    return "https://wa.me/" + encodeURIComponent(C.WHATSAPP_NUMBER || "") + "?text=" + encodeURIComponent(t);
  }
  function waLinkHelp(exam) {
    const t = `Bonjour LUKOS, je veux activer le parcours ${exam.name} (${fmtXof(exam.price_xof)}).\nNom : ${S.profile.first_name} ${S.profile.last_name}\nTéléphone : ${S.profile.phone}`;
    return "https://wa.me/" + encodeURIComponent(C.WHATSAPP_NUMBER || "") + "?text=" + encodeURIComponent(t);
  }
  async function submitPayment(ev) {
    ev.preventDefault(); if (busy) return;
    const code = parts()[1], exam = examByCode(code), msg = document.getElementById("payMsg");
    const method = (document.querySelector('input[name="payMethod"]:checked') || {}).value;
    if (!PAY.blob) { msg.className = "msg err"; msg.textContent = "Ajoute d'abord la capture de ton paiement (étape 2)."; document.getElementById("proofDrop").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const rawPhone = document.getElementById("payPhone").value.trim();
    const payer = rawPhone ? phoneNormalize(rawPhone) : null;
    if (rawPhone && !payer) { msg.className = "msg err"; msg.textContent = "Numéro payeur invalide."; return; }
    busy = true; msg.className = "msg"; msg.textContent = "Envoi de ta preuve…";
    const btn = document.querySelector(".pay-submit"); if (btn) btn.disabled = true;
    try {
      const { data, error } = await sb.rpc("submit_payment", { p_exam: code, p_method: method, p_sender_phone: payer, p_reference: document.getElementById("payRef").value.trim() || null });
      if (error) throw error;
      try { await uploadProof(data); toast("Preuve envoyée ✓ Ton paiement est en cours de vérification.", "ok"); }
      catch (e2) { toast("Paiement déclaré, mais la capture n'a pas pu être envoyée (" + storageErrProof(e2) + "). Réessaie depuis cette page ou envoie-la sur WhatsApp.", "err"); }
      await loadAccount(); route(); window.scrollTo(0, 0);
    } catch (e) { msg.className = "msg err"; msg.textContent = errText(e); }
    finally { busy = false; if (btn) btn.disabled = false; }
  }
  async function sendPendingProof(id) {
    if (busy) return;
    if (!PAY.blob) return toast("Ajoute d'abord la capture de ton paiement.", "err");
    busy = true;
    try { await uploadProof(id); toast("Capture envoyée ✓", "ok"); await loadAccount(); route(); }
    catch (e) { toast("Envoi impossible : " + storageErrProof(e), "err"); }
    finally { busy = false; }
  }
  function storageErrProof(e) {
    const m = String((e && e.message) || e || "");
    if (/bucket not found|attach_payment_proof|function .* does not exist|schema cache/i.test(m)) return "le script 06_preuves_paiement.sql n'est pas encore installé";
    if (/size|too large|payload/i.test(m)) return "image trop lourde";
    return isNetErr(e) ? "pas de connexion Internet" : errText(e);
  }

  /* ------------------------------------------------------------------ */
  /* Mon compte                                                         */
  /* ------------------------------------------------------------------ */
  function renderProfile() {
    homeBottomNav("profil");
    const p = S.profile;
    const stLabel = { pending: ["warn", "EN ATTENTE"], successful: ["ok", "VALIDÉ"], rejected: ["bad", "REFUSÉ"] };
    app.innerHTML = `<h1>Mon compte</h1><div class="grid-2">
      <div class="card"><h3>Mes informations</h3><form id="profileForm">
        <label for="pFirst">Prénom</label><input id="pFirst" value="${esc(p.first_name)}" maxlength="60" required>
        <label for="pLast">Nom</label><input id="pLast" value="${esc(p.last_name)}" maxlength="60" required>
        ${p.service !== undefined ? `<label for="pService">Service / Corps</label><select id="pService">${serviceOptions(p.service || "")}</select>` : ""}
        <label>Téléphone (identifiant)</label><input value="${esc(phonePretty(p.phone))}" disabled>
        <button class="btn btn-dark" style="margin-top:14px">Enregistrer</button><div class="msg" id="profMsg"></div></form>
        <div class="sep"></div><h3>Changer de mot de passe</h3><form id="passForm"><label for="np1">Nouveau mot de passe</label><input id="np1" type="password" autocomplete="new-password" minlength="8"><label for="np2">Confirmer</label><input id="np2" type="password" autocomplete="new-password" minlength="8"><button class="btn btn-ghost" style="margin-top:14px">Modifier le mot de passe</button><div class="msg" id="passMsg"></div></form></div>
      <div class="stack"><div class="card"><h3>Mes parcours</h3>${S.exams.map((e) => `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)"><b>${esc(e.name)}</b>${statusBadge(e.code)}</div>`).join("")}</div>
        <div class="card"><h3>Mes paiements</h3>${S.payments.length ? `<div class="table-wrap"><table class="t"><tr><th>Date</th><th>Parcours</th><th>Montant</th><th>État</th></tr>${S.payments.map((x) => `<tr><td>${esc(fmtDate(x.created_at))}</td><td>${esc((examByCode(x.exam_code) || {}).name || x.exam_code)}</td><td>${esc(fmtXof(x.amount_xof))}</td><td><span class="badge ${stLabel[x.status][0]}">${stLabel[x.status][1]}</span></td></tr>`).join("")}</table></div>` : `<p class="muted">Aucun paiement.</p>`}</div>
        <button class="btn btn-bad btn-block" data-act="logout">Se déconnecter</button></div></div>`;
  }
  async function saveProfile(ev) {
    ev.preventDefault();
    const msg = document.getElementById("profMsg");
    const f = document.getElementById("pFirst").value.trim(), l = document.getElementById("pLast").value.trim();
    if (f.length < 2 || l.length < 2) { msg.className = "msg err"; msg.textContent = "Prénom et nom obligatoires."; return; }
    const { error } = await sb.rpc("update_my_profile", { p_first_name: f, p_last_name: l });
    if (error) { msg.className = "msg err"; msg.textContent = errText(error); return; }
    const sv = document.getElementById("pService");
    if (sv && sv.value && sv.value !== S.profile.service) {
      const r = await sb.rpc("set_my_service", { p_service: sv.value });
      if (r.error) { msg.className = "msg err"; msg.textContent = errText(r.error); return; }
    }
    await loadAccount(); msg.className = "msg ok"; msg.textContent = "Informations enregistrées.";
  }
  async function changePass(ev) {
    ev.preventDefault();
    const msg = document.getElementById("passMsg");
    const a = document.getElementById("np1").value, b = document.getElementById("np2").value;
    if (a.length < 8 || !/[A-Za-z]/.test(a) || !/\d/.test(a)) { msg.className = "msg err"; msg.textContent = "8 caractères minimum, avec lettres et chiffres."; return; }
    if (a !== b) { msg.className = "msg err"; msg.textContent = "Les mots de passe ne correspondent pas."; return; }
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) { msg.className = "msg err"; msg.textContent = errText(error); return; }
    msg.className = "msg ok"; msg.textContent = "Mot de passe modifié."; ev.target.reset();
  }

  /* ------------------------------------------------------------------ */
  /* Administration                                                     */
  /* ------------------------------------------------------------------ */
  const AD = { payFilter: "pending", people: null, peopleQ: "", peopleFilter: "actifs", contentExam: "DAP", contentQ: "", importRows: null };
  const ADMIN_TABS = [["tableau", "Tableau de bord"], ["paiements", "Paiements"], ["candidats", "Candidats"], ["contenu", "Contenu"], ["documents", "Documents"], ["parcours", "Parcours & prix"], ["journal", "Journal"]];
  async function renderAdmin(tab) {
    homeBottomNav("admin");
    app.innerHTML = `<h1>Administration</h1><div class="admin-tabs">${ADMIN_TABS.map(([k, l]) => `<a href="#/admin/${k}" class="${tab === k ? "on" : ""}">${l}</a>`).join("")}</div><div id="adminBody"><div class="center-load"><div class="spinner"></div></div></div>`;
    const body = document.getElementById("adminBody");
    const fn = { tableau: adDash, paiements: adPayments, candidats: adPeople, contenu: adContent, documents: adDocs, parcours: adExams, journal: adLog }[tab] || adDash;
    await fn(body);
  }
  const examName = (c) => (examByCode(c) || {}).name || c;

  async function adDash(body) {
    const { data, error } = await sb.rpc("admin_dashboard");
    if (error) throw error;
    body.innerHTML = `<div class="kpis"><div class="kpi"><b>${data.candidates}</b><span>Candidats inscrits</span></div><div class="kpi"><b>${data.pending_payments}</b><span>Paiements à vérifier</span></div><div class="kpi"><b>${esc(fmtXof(data.revenue_xof))}</b><span>Encaissements validés</span></div><div class="kpi"><b>${data.quizzes}</b><span>Quiz réalisés</span></div><div class="kpi"><b>${data.blocked}</b><span>Comptes bloqués</span></div></div>
      <div class="grid">${S.exams.map((e) => { const x = (data.by_exam || {})[e.code] || {}; return `<div class="card exam-${e.code}"><div class="row between"><h3 style="margin:0">${esc(e.name)}</h3><span class="badge acc">${esc(fmtXof(e.price_xof))}</span></div><div class="sep"></div><p>👥 <b>${x.active || 0}</b> actifs · ⏳ <b>${x.pending || 0}</b> en attente</p><p>❓ <b>${x.questions || 0}</b> questions publiées</p><p>💰 <b>${esc(fmtXof(x.revenue || 0))}</b> encaissés</p></div>`; }).join("")}</div>
      ${data.pending_payments ? `<p style="margin-top:16px"><a class="btn btn-primary" href="#/admin/paiements">Traiter les ${data.pending_payments} paiement(s) en attente →</a></p>` : ""}`;
  }

  async function loadPeople() {
    const profQ = (cols) => sb.from("profiles").select(cols).order("created_at", { ascending: false });
    const payQ = (extra) => sb.from("payments").select("id,user_id,exam_code,amount_xof,method,sender_phone,transaction_reference,status,admin_note,created_at,reviewed_at" + extra).order("created_at", { ascending: false });
    let [p, e, pay] = await Promise.all([
      profQ(PROFILE_COLS + ",service"),
      sb.from("enrollments").select("user_id,exam_code,status,activated_at"),
      payQ(",proof_path")
    ]);
    if (p.error && /service/i.test(p.error.message || "")) p = await profQ(PROFILE_COLS);
    if (pay.error && /proof_path/i.test(pay.error.message || "")) pay = await payQ("");
    const err = p.error || e.error || pay.error; if (err) throw err;
    const byId = new Map((p.data || []).map((x) => [x.id, x]));
    AD.people = { profiles: p.data || [], enr: e.data || [], pay: pay.data || [], byId };
    return AD.people;
  }

  async function adPayments(body) {
    const P = await loadPeople();
    const list = P.pay.filter((x) => AD.payFilter === "all" || x.status === AD.payFilter);
    const lab = { pending: "En attente", successful: "Validés", rejected: "Refusés", all: "Tous" };
    const nPend = P.pay.filter((x) => x.status === "pending");
    const cash = P.pay.filter((x) => x.status === "successful").reduce((a, x) => a + Number(x.amount_xof || 0), 0);
    const month = new Date().toISOString().slice(0, 7);
    const cashMonth = P.pay.filter((x) => x.status === "successful" && String(x.reviewed_at || x.created_at).slice(0, 7) === month).reduce((a, x) => a + Number(x.amount_xof || 0), 0);
    body.innerHTML = `<div class="adpay-kpis">
        <div class="ak ak-warn"><span>⏳</span><b>${nPend.length}</b><small>À vérifier${nPend.some((x) => !x.proof_path) ? " · " + nPend.filter((x) => !x.proof_path).length + " sans capture" : ""}</small></div>
        <div class="ak ak-ok"><span>✅</span><b>${P.pay.filter((x) => x.status === "successful").length}</b><small>Paiements validés</small></div>
        <div class="ak ak-cash"><span>💰</span><b>${esc(fmtXof(cashMonth))}</b><small>Encaissé ce mois</small></div>
        <div class="ak ak-tot"><span>📈</span><b>${esc(fmtXof(cash))}</b><small>Encaissé au total</small></div></div>
      <div class="seg" style="max-width:560px;margin:14px 0">${Object.keys(lab).map((k) => `<button data-act="ad-payfilter" data-f="${k}" class="${AD.payFilter === k ? "on" : ""}">${lab[k]} (${k === "all" ? P.pay.length : P.pay.filter((x) => x.status === k).length})</button>`).join("")}</div>
      ${list.length ? `<div class="adpay-list">${list.map((x) => payCard(x, P)).join("")}</div>` : emptyBox("Aucun paiement dans cette catégorie.")}`;
    loadProofThumbs(body);
  }
  function payCard(x, P) {
    const u = P.byId.get(x.user_id) || {}, wave = x.method === "wave";
    const st = { pending: ["warn", "En attente"], successful: ["ok", "Validé"], rejected: ["bad", "Refusé"] }[x.status] || ["", x.status];
    const line = (k, v) => (v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : "");
    return `<article class="paycard st-${esc(x.status)} ${wave ? "m-wave" : "m-om"}">
      <header><span class="pay-av">${esc(initials(u))}</span><div class="pc-who"><b>${esc((u.first_name || "") + " " + (u.last_name || ""))}</b><small>${esc(phonePretty(u.phone))}${u.service ? " · " + esc(serviceLabel(u.service)) : ""}</small></div><span class="badge ${st[0]}">${esc(st[1]).toUpperCase()}</span></header>
      <div class="pc-body">
        <div class="pc-info">
          <div class="pc-amt">${esc(fmtXof(x.amount_xof))}</div>
          <div class="pc-chips"><span class="chip-m ${wave ? "wave" : "om"}">${wave ? "Wave" : "Orange Money"}</span><span class="chip-x">${esc(examName(x.exam_code))}</span></div>
          <dl>${line("Payeur", esc(phonePretty(x.sender_phone)))}${line("Réf. transaction", esc(x.transaction_reference || ""))}${line("Déclaré le", esc(fmtDate(x.created_at)))}${line("Traité le", x.reviewed_at ? esc(fmtDate(x.reviewed_at)) : "")}${line("Note", esc(x.admin_note || ""))}${line("Réf. LUKOS", `<span class="small">${esc(x.id)}</span>`)}</dl>
        </div>
        ${x.proof_path ? `<button class="pc-proof" data-act="ad-proof" data-proof="${esc(x.proof_path)}" aria-label="Agrandir la capture"><span class="pc-load">Chargement de la capture…</span></button>`
          : `<div class="pc-proof none"><span>📷</span><small>Pas de capture dans l'application${x.status === "pending" ? "<br>(vérifier WhatsApp)" : ""}</small></div>`}
      </div>
      <footer>${x.status === "pending" ? `<button class="btn btn-ok" data-act="ad-pay" data-id="${esc(x.id)}" data-d="approve">✓ Valider et activer</button><button class="btn btn-bad" data-act="ad-pay" data-id="${esc(x.id)}" data-d="reject">✕ Refuser</button>` : ""}${x.status === "successful" ? `<button class="btn btn-ghost btn-sm" data-act="ad-receipt" data-id="${esc(x.id)}">🧾 Reçu</button>` : ""}<a class="btn btn-ghost btn-sm" href="tel:${esc(u.phone || "")}">📞 Appeler</a></footer>
    </article>`;
  }
  const PROOF_CACHE = new Map();
  async function proofDataUrl(path) {
    if (PROOF_CACHE.has(path)) return PROOF_CACHE.get(path);
    const { data, error } = await sb.storage.from(PROOF_BUCKET).download(path);
    if (error || !data) throw error || new Error("Capture introuvable");
    const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(data); });
    PROOF_CACHE.set(path, url);
    return url;
  }
  async function loadProofThumbs(root) {
    const boxes = [...root.querySelectorAll(".pc-proof[data-proof]")];
    for (const b of boxes) {
      try { const url = await proofDataUrl(b.dataset.proof); b.innerHTML = `<img src="${url}" alt="Capture du paiement"><span class="pc-zoom">🔍 Agrandir</span>`; }
      catch (e) { b.innerHTML = `<span class="pc-load">Capture indisponible</span>`; }
    }
  }
  async function openProof(el) {
    let url;
    try { url = await proofDataUrl(el.dataset.proof); } catch (e) { return toast("Capture indisponible : " + errText(e), "err"); }
    const ov = document.createElement("div");
    ov.className = "proof-lightbox"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Capture du paiement");
    ov.innerHTML = `<img src="${url}" alt="Capture du paiement"><button class="btn btn-ghost" type="button">✕ Fermer</button>`;
    const close = () => { ov.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    ov.addEventListener("click", close); document.addEventListener("keydown", onKey);
    document.body.appendChild(ov);
  }
  async function reviewPayment(id, decision) {
    let note = null;
    if (decision === "reject") { note = prompt("Motif du refus (visible par le candidat) :", "Paiement introuvable"); if (note === null) return; }
    else if (!confirm("Valider ce paiement et activer le parcours du candidat ?")) return;
    const { error } = await sb.rpc("admin_review_payment", { p_payment: id, p_decision: decision, p_note: note });
    if (error) return toast(errText(error), "err");
    toast(decision === "approve" ? "Paiement validé, parcours activé." : "Paiement refusé.", "ok");
    route();
  }
  function openReceipt(id) {
    const x = AD.people && AD.people.pay.find((p) => p.id === id); if (!x) return;
    const u = AD.people.byId.get(x.user_id) || {};
    const w = window.open("", "_blank", "width=720,height=860"); if (!w) return toast("Autorise les fenêtres pour imprimer le reçu.", "err");
    const line = (a, b) => `<div style="display:flex;justify-content:space-between;border-bottom:1px solid #e5eaf0;padding:10px 0"><b>${esc(a)}</b><span>${esc(b)}</span></div>`;
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Reçu LUKOS-REVISION</title></head><body style="font-family:Arial;background:#f4f6fa;padding:24px;color:#14213a"><div style="max-width:620px;margin:auto;background:#fff;padding:28px;border-radius:16px"><h1 style="margin:0">LUKOS-REVISION</h1><p style="color:#5b6b82">Reçu de paiement</p>${line("Candidat", (u.first_name || "") + " " + (u.last_name || ""))}${line("Téléphone", u.phone || "—")}${line("Parcours", examName(x.exam_code))}${line("Mode", x.method === "wave" ? "Wave" : "Orange Money")}${line("Référence transaction", x.transaction_reference || "—")}${line("Référence LUKOS", x.id)}${line("Déclaré le", fmtDate(x.created_at))}${line("Validé le", fmtDate(x.reviewed_at))}<div style="display:flex;justify-content:space-between;padding:14px 0;font-size:22px;font-weight:900"><span>Montant</span><span>${esc(fmtXof(x.amount_xof))}</span></div><p style="text-align:center;color:#5b6b82;font-size:12px">${esc(C.AUTHOR || "")} • ${esc(C.CONTACT_DISPLAY || "")}</p></div></body></html>`);
    w.document.close(); setTimeout(() => { try { w.print(); } catch (e) { /* ignore */ } }, 300);
  }

  async function adPeople(body) {
    const P = AD.people || (await loadPeople());
    body.innerHTML = `<div class="seg" id="peopleSeg" style="max-width:720px;margin-bottom:12px"></div><div class="row" style="margin-bottom:12px"><input id="peopleSearch" placeholder="Rechercher par nom ou téléphone…" value="${esc(AD.peopleQ)}" style="flex:1;min-width:220px"><button class="btn btn-ghost" data-act="ad-reload-people">↻ Actualiser</button></div><div id="peopleList"></div>`;
    document.getElementById("peopleSearch").addEventListener("input", (e) => { AD.peopleQ = e.target.value; drawPeople(); });
    drawPeople(); void P;
  }
  function drawPeople() {
    const P = AD.people, out = document.getElementById("peopleList"); if (!out) return;
    const q = norm(AD.peopleQ).replace(/\s+/g, "");
    // catégorie de chaque compte : membre actif (paiement validé), paiement à vérifier, ou simple compte ouvert
    const cat = (u) => {
      if (P.enr.some((x) => x.user_id === u.id && x.status === "active")) return "actifs";
      if (P.pay.some((x) => x.user_id === u.id && x.status === "pending") || P.enr.some((x) => x.user_id === u.id && x.status === "pending")) return "attente";
      return "comptes";
    };
    const members = P.profiles.filter((u) => u.role !== "admin");
    const FL = { actifs: "✅ Membres actifs", attente: "⏳ Paiement à vérifier", comptes: "👤 Comptes sans paiement", tous: "Tous" };
    const seg = document.getElementById("peopleSeg");
    if (seg) seg.innerHTML = Object.keys(FL).map((k) => `<button data-act="ad-peoplefilter" data-f="${k}" class="${AD.peopleFilter === k ? "on" : ""}">${FL[k]} (${k === "tous" ? members.length : members.filter((u) => cat(u) === k).length})</button>`).join("");
    const rows = members.filter((u) => (AD.peopleFilter === "tous" || cat(u) === AD.peopleFilter) && (!q || norm(u.first_name + u.last_name + u.last_name + u.first_name + serviceLabel(u.service)).replace(/\s+/g, "").includes(q) || u.phone.replace(/\D/g, "").includes(q.replace(/\D/g, "") || "§")));
    const opts = { "": "Non inscrit", pending: "En attente", active: "Actif", suspended: "Suspendu", rejected: "Refusé" };
    const help = { actifs: "Comptes ayant au moins un parcours activé (paiement validé).", attente: "Comptes ayant déclaré un paiement qui n'a pas encore été vérifié.", comptes: "Comptes ouverts sans paiement validé ni paiement en attente.", tous: "Tous les comptes membres." }[AD.peopleFilter] || "";
    out.innerHTML = `<p class="muted small">${rows.length} compte(s) · ${help}</p>` + (rows.slice(0, 200).map((u) => {
      const en = (c) => (P.enr.find((x) => x.user_id === u.id && x.exam_code === c) || {}).status || "";
      const c = cat(u), tag = c === "actifs" ? '<span class="badge ok">ACTIF</span>' : c === "attente" ? '<span class="badge warn">PAIEMENT À VÉRIFIER</span>' : '<span class="badge">SANS PAIEMENT</span>';
      return `<div class="card person" style="margin-bottom:10px"><div class="row between"><div><b>${esc(u.first_name + " " + u.last_name)}</b> ${tag} ${u.is_blocked ? '<span class="badge bad">BLOQUÉ</span>' : ""}<div class="small muted">${esc(phonePretty(u.phone))}${u.service ? " · <b>" + esc(serviceLabel(u.service)) + "</b>" : ""} · inscrit le ${esc(fmtDate(u.created_at))}</div></div><div class="row"><a class="btn btn-ghost btn-sm" href="tel:${esc(u.phone)}">📞</a><button class="btn btn-ghost btn-sm" data-act="ad-block" data-id="${esc(u.id)}" data-v="${u.is_blocked ? "0" : "1"}">${u.is_blocked ? "Débloquer" : "Bloquer"}</button><button class="btn btn-bad btn-sm" data-act="ad-del" data-id="${esc(u.id)}">Supprimer</button></div></div>
        <div class="exams-line">${S.exams.map((e) => `<label class="small" style="margin:0;display:flex;align-items:center;gap:6px">${esc(e.name)} <select data-act="ad-enr" data-id="${esc(u.id)}" data-exam="${esc(e.code)}">${Object.keys(opts).map((k) => `<option value="${k}" ${en(e.code) === k ? "selected" : ""} ${k === "" ? "disabled" : ""}>${opts[k]}</option>`).join("")}</select></label>`).join("")}</div></div>`;
    }).join("") || emptyBox("Aucun compte dans cette catégorie."));
  }
  async function setEnrollment(el) {
    const { id, exam } = el.dataset, v = el.value;
    if (!confirm(`Passer ce candidat à « ${el.options[el.selectedIndex].text} » pour ${examName(exam)} ?`)) { drawPeople(); return; }
    const { error } = await sb.rpc("admin_set_enrollment", { p_user: id, p_exam: exam, p_status: v });
    if (error) { toast(errText(error), "err"); drawPeople(); return; }
    toast("Statut mis à jour.", "ok"); await loadPeople(); drawPeople();
  }

  async function adContent(body) {
    const code = AD.contentExam;
    const d = await loadExamData(code, true);
    body.innerHTML = `<div class="row" style="margin-bottom:14px"><label style="margin:0">Parcours</label><select id="contentExam" style="width:auto">${S.exams.map((e) => `<option value="${e.code}" ${e.code === code ? "selected" : ""}>${esc(e.name)}</option>`).join("")}</select><span class="muted small">${d.all.length} questions · ${d.allSubjects.length} matières</span></div>
      <div class="grid-2">
        <div class="card"><h3>📥 Importer des questions</h3><p class="small muted">Fichier <b>JSON</b> (liste de {"subject","question","answer"}) ou <b>CSV</b> (colonnes : matière ; question ; réponse).</p>
          <input type="file" id="importFile" accept=".json,.csv,.txt,application/json,text/csv"><label class="check"><input type="checkbox" id="importReplace"> Remplacer toutes les questions actuelles de ce parcours</label>
          <div id="importInfo" class="hint"></div><button class="btn btn-primary" data-act="ad-import" style="margin-top:10px">Importer</button></div>
        <div class="card"><h3>➕ Ajouter / modifier une question</h3><form id="qForm"><input type="hidden" id="qId">
          <label for="qSubj">Matière</label><input id="qSubj" list="subjList" required><datalist id="subjList">${d.allSubjects.map((s) => `<option value="${esc(s.name)}">`).join("")}</datalist>
          <label for="qQ">Question</label><textarea id="qQ" required style="min-height:70px"></textarea>
          <label for="qA">Réponse (une ligne commençant par « • » = puce)</label><textarea id="qA" required></textarea>
          <label class="check"><input type="checkbox" id="qActive" checked> Publiée</label>
          <div class="row" style="margin-top:10px"><button class="btn btn-dark">Enregistrer</button><button type="button" class="btn btn-ghost" data-act="ad-qreset">Vider</button></div></form></div></div>
      <div class="card" style="margin-top:14px"><h3>📚 Matières</h3>${d.allSubjects.map((s) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(s.name)} <span class="muted small">(${(d.all.filter((q) => q.subject_id === s.id)).length})</span></span><button class="btn btn-ghost btn-sm" data-act="ad-rename" data-id="${s.id}" data-name="${esc(s.name)}">Renommer</button></div>`).join("") || '<p class="muted">Aucune matière.</p>'}</div>
      <div class="card" style="margin-top:14px"><h3>❓ Questions</h3><input id="qSearch" placeholder="Rechercher une question ou une réponse…" value="${esc(AD.contentQ)}"><div id="qList" style="margin-top:12px;display:grid;gap:10px"></div></div>`;
    document.getElementById("contentExam").addEventListener("change", (e) => { AD.contentExam = e.target.value; route(); });
    document.getElementById("qSearch").addEventListener("input", (e) => { AD.contentQ = e.target.value; drawAdminQuestions(); });
    document.getElementById("importFile").addEventListener("change", readImportFile);
    drawAdminQuestions();
  }
  function drawAdminQuestions() {
    const d = S.data[AD.contentExam], out = document.getElementById("qList"); if (!d || !out) return;
    const q = norm(AD.contentQ);
    const sname = (id) => (d.allSubjects.find((s) => s.id === id) || {}).name || "";
    const rows = d.all.filter((x) => !q || norm(x.question + " " + x.answer + " " + sname(x.subject_id)).includes(q)).slice(0, 60);
    out.innerHTML = rows.map((x) => `<div class="qadmin"><div class="row between"><span class="badge acc">${esc(sname(x.subject_id))}</span>${x.is_active ? "" : '<span class="badge warn">NON PUBLIÉE</span>'}</div><p style="margin:8px 0 4px"><b>${esc(x.question)}</b></p><div class="a">${esc(x.answer)}</div><div class="row" style="margin-top:8px"><button class="btn btn-soft btn-sm" data-act="ad-qedit" data-id="${x.id}">Modifier</button><button class="btn btn-bad btn-sm" data-act="ad-qdel" data-id="${x.id}">Supprimer</button></div></div>`).join("") + (rows.length === 60 ? '<p class="muted small">60 premiers résultats — affine ta recherche.</p>' : "") || '<p class="muted">Aucune question.</p>';
  }
  function editQuestion(id) {
    const d = S.data[AD.contentExam], x = d.all.find((q) => String(q.id) === String(id)); if (!x) return;
    document.getElementById("qId").value = x.id;
    document.getElementById("qSubj").value = (d.allSubjects.find((s) => s.id === x.subject_id) || {}).name || "";
    document.getElementById("qQ").value = x.question; document.getElementById("qA").value = x.answer;
    document.getElementById("qActive").checked = !!x.is_active;
    document.getElementById("qForm").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  async function saveQuestion(ev) {
    ev.preventDefault();
    const id = document.getElementById("qId").value;
    const payload = { p_id: id ? Number(id) : null, p_exam: AD.contentExam, p_subject: document.getElementById("qSubj").value.trim(), p_question: document.getElementById("qQ").value.trim(), p_answer: document.getElementById("qA").value.trim(), p_active: document.getElementById("qActive").checked };
    if (payload.p_subject.length < 2 || payload.p_question.length < 3 || !payload.p_answer) return toast("Matière, question et réponse sont obligatoires.", "err");
    const { error } = await sb.rpc("admin_save_question", payload);
    if (error) return toast(errText(error), "err");
    toast(id ? "Question modifiée." : "Question ajoutée.", "ok"); delete S.data[AD.contentExam]; route();
  }
  async function deleteQuestion(id) {
    if (!confirm("Supprimer définitivement cette question ?")) return;
    const { error } = await sb.rpc("admin_delete_question", { p_id: Number(id) });
    if (error) return toast(errText(error), "err");
    toast("Question supprimée.", "ok"); delete S.data[AD.contentExam]; route();
  }
  function parseCsv(text) {
    const first = text.split(/\r?\n/)[0] || ""; const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ";" : ",";
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true; else if (c === sep) { row.push(cell); cell = ""; } else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else if (c !== "\r") cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    if (rows.length && /mati|subject/i.test(rows[0][0] || "")) rows.shift();
    return rows.filter((r) => r.length >= 3).map((r) => ({ subject: r[0].trim(), question: r[1].trim(), answer: r.slice(2).join(sep).trim() }));
  }
  async function readImportFile(ev) {
    const f = ev.target.files[0], info = document.getElementById("importInfo"); AD.importRows = null;
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { info.textContent = "Fichier trop lourd (15 Mo maximum)."; return; }
    const text = await f.text();
    try {
      let rows = /\.json$/i.test(f.name) || /^\s*[[{]/.test(text) ? JSON.parse(text) : parseCsv(text);
      if (!Array.isArray(rows)) rows = rows.questions || [];
      rows = rows.map((r) => ({ subject: String(r.subject || r.matiere || r["matière"] || "").trim(), question: String(r.question || "").trim(), answer: String(r.answer || r.reponse || r["réponse"] || "").trim() })).filter((r) => r.subject && r.question && r.answer);
      if (!rows.length) throw new Error("aucune ligne valide");
      AD.importRows = rows;
      const subs = new Set(rows.map((r) => r.subject.toUpperCase()));
      info.textContent = `✓ ${rows.length} questions prêtes à importer dans ${subs.size} matière(s).`;
    } catch (e) { info.textContent = "Fichier illisible : " + e.message; }
  }
  async function runImport() {
    const rows = AD.importRows; if (!rows) return toast("Choisis d'abord un fichier valide.", "err");
    const replace = document.getElementById("importReplace").checked;
    if (!confirm(`Importer ${rows.length} questions dans ${examName(AD.contentExam)}${replace ? " en REMPLAÇANT toutes les questions actuelles" : ""} ?`)) return;
    const info = document.getElementById("importInfo"); let done = 0;
    try {
      for (let i = 0; i < rows.length; i += 800) {
        const { data, error } = await sb.rpc("admin_import_questions", { p_exam: AD.contentExam, p_rows: rows.slice(i, i + 800), p_replace: replace && i === 0 });
        if (error) throw error; done += data; info.textContent = `Import en cours… ${done} / ${rows.length}`;
      }
      toast(`${done} questions importées.`, "ok"); AD.importRows = null; delete S.data[AD.contentExam]; route();
    } catch (e) { toast("Import interrompu après " + done + " questions : " + errText(e), "err"); }
  }

  async function adDocs(body) {
    const lists = await Promise.all(S.exams.map((e) => sb.storage.from("lukos-docs").list(e.code, { limit: 100 })));
    const lerr = lists.find((l) => l && l.error);
    body.innerHTML = (lerr ? `<div class="feedback bad" style="margin-bottom:14px">Stockage indisponible : ${esc(storageErr(lerr.error))}</div>` : "") + `<div class="card" style="margin-bottom:14px"><h3>Publier un document PDF</h3><div class="row"><select id="docExam" style="width:auto">${S.exams.map((e) => `<option value="${e.code}">${esc(e.name)}</option>`).join("")}</select><input type="file" id="docFile" accept="application/pdf,.pdf" style="flex:1;min-width:200px"><button class="btn btn-primary" data-act="ad-docup">Publier</button></div><div class="msg" id="docMsg"></div><p class="hint">PDF uniquement, 25 Mo maximum. Seuls les candidats actifs du parcours peuvent l'ouvrir.</p></div>
      <div class="grid">${S.exams.map((e, i) => { const files = ((lists[i] && lists[i].data) || []).filter((f) => /\.pdf$/i.test(f.name)); return `<div class="card exam-${e.code}"><h3>${esc(e.name)}</h3>${files.map((f) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="small">📄 ${esc(f.name)}</span><span class="row"><button class="btn btn-ghost btn-sm" data-act="open-doc" data-path="${esc(e.code + "/" + f.name)}">Ouvrir</button><button class="btn btn-bad btn-sm" data-act="ad-docdel" data-path="${esc(e.code + "/" + f.name)}">✕</button></span></div>`).join("") || '<p class="muted small">Aucun document.</p>'}</div>`; }).join("")}</div>`;
  }
  async function uploadDoc() {
    const exam = document.getElementById("docExam").value, input = document.getElementById("docFile"), f = input.files[0];
    const msg = document.getElementById("docMsg") || { set textContent(v) { toast(v, "err"); }, className: "" };
    const fail = (t) => { msg.className = "msg err"; msg.textContent = t; if (!document.getElementById("docMsg")) toast(t, "err"); };
    if (!f) return fail("Choisis d'abord un fichier PDF.");
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) return fail("Le fichier doit être un PDF.");
    if (f.size > 25 * 1024 * 1024) return fail("PDF trop lourd (25 Mo maximum).");
    const safe = f.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 100) || "document.pdf";
    msg.className = "msg"; msg.textContent = "Envoi du document en cours…";
    const btn = document.querySelector('[data-act="ad-docup"]'); if (btn) btn.disabled = true;
    try {
      const { error } = await sb.storage.from("lukos-docs").upload(exam + "/" + (/\.pdf$/i.test(safe) ? safe : safe + ".pdf"), f, { upsert: true, contentType: "application/pdf", cacheControl: "3600" });
      if (error) return fail("Publication impossible : " + storageErr(error));
      toast("Document publié pour " + examName(exam) + ".", "ok"); route();
    } catch (e) { fail("Publication impossible : " + storageErr(e)); }
    finally { if (btn) btn.disabled = false; }
  }
  async function deleteDoc(path) {
    if (!confirm("Supprimer définitivement « " + path + " » ?")) return;
    const { error } = await sb.storage.from("lukos-docs").remove([path]);
    if (error) return toast("Suppression impossible : " + storageErr(error), "err");
    toast("Document supprimé.", "ok"); route();
  }

  async function adExams(body) {
    await loadExams();
    body.innerHTML = `<div class="grid">${S.exams.map((e) => `<form class="card exam-${e.code}" data-exam-form="${e.code}"><h3>${esc(e.name)}</h3><p class="small muted">${esc(e.full_name)}</p><label>Prix (FCFA)</label><input type="number" min="0" max="1000000" step="100" name="price" value="${e.price_xof}"><label class="check"><input type="checkbox" name="open" ${e.is_open ? "checked" : ""}> Inscriptions ouvertes</label><button class="btn btn-dark" style="margin-top:12px">Enregistrer</button></form>`).join("")}</div>`;
  }
  async function saveExam(form) {
    const code = form.dataset.examForm, price = Math.round(Number(form.price.value));
    if (!(price >= 0 && price <= 1000000)) return toast("Prix invalide.", "err");
    const { error } = await sb.rpc("admin_update_exam", { p_code: code, p_price: price, p_is_open: form.open.checked });
    if (error) return toast(errText(error), "err");
    toast("Parcours mis à jour.", "ok"); await loadExams(); route();
  }

  async function adLog(body) {
    const { data, error } = await sb.from("audit_log").select("id,actor,action,target,details,created_at").order("id", { ascending: false }).limit(200);
    if (error) throw error;
    const P = AD.people || (await loadPeople().catch(() => null));
    const who = (id) => { const u = P && P.byId.get(id); return u ? u.first_name + " " + u.last_name : "—"; };
    body.innerHTML = `<div class="card"><div class="table-wrap"><table class="t"><tr><th>Date</th><th>Par</th><th>Action</th><th>Détails</th></tr>${(data || []).map((x) => `<tr><td>${esc(fmtDate(x.created_at))}</td><td>${esc(who(x.actor))}</td><td><b>${esc(x.action)}</b></td><td class="small muted">${esc(JSON.stringify(x.details))}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">Aucune action enregistrée.</td></tr>'}</table></div></div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Événements (délégation, aucun gestionnaire inline)                 */
  /* ------------------------------------------------------------------ */
  document.addEventListener("click", async (ev) => {
    const el = ev.target.closest("[data-act]"); if (!el || el.tagName === "SELECT") return;
    const act = el.dataset.act;
    try {
      if (act === "reload") return location.reload();
      if (act === "retry-online") { if (!navigator.onLine) return toast("Toujours pas de connexion Internet.", "err"); await leaveOffline(); if (S.offline) toast("Connexion impossible pour le moment.", "err"); return; }
      if (act === "logout") return logout();
      if (act === "auth-mode") { S.authMode = el.dataset.mode; return renderAuth(); }
      if (act === "open-exam") return go("#/p/" + el.dataset.exam);
      if (act === "refresh-account") { await loadAccount(); toast(hasAccess(parts()[1]) ? "Parcours activé !" : "Toujours en attente de validation.", hasAccess(parts()[1]) ? "ok" : ""); return route(); }
      if (act === "copy-txt") { ev.preventDefault(); const pm = el.closest(".pm"); if (pm) pm.querySelector("input").checked = true; return copyText(el.dataset.v, el); }
      if (act === "pay-proof") return sendPendingProof(el.dataset.id);
      if (act === "ad-proof") return openProof(el);
      if (act.startsWith("rev-")) return revAction(act);
      if (act === "qz-again") { S.quiz = null; return route(); }
      if (act === "ex-again") { if (exRunning()) return; S.exam = null; return route(); }
      if (act.startsWith("ex-")) return exAction(act, el);
      if (act.startsWith("qz-")) return quizAction(act, el);
      if (act === "open-doc") return openDoc(el.dataset.path);
      if (act === "ad-payfilter") { AD.payFilter = el.dataset.f; return route(); }
      if (act === "ad-peoplefilter") { AD.peopleFilter = el.dataset.f; return drawPeople(); }
      if (act === "ad-pay") return reviewPayment(el.dataset.id, el.dataset.d);
      if (act === "ad-receipt") return openReceipt(el.dataset.id);
      if (act === "ad-reload-people") { await loadPeople(); return drawPeople(); }
      if (act === "ad-block") { if (!confirm(el.dataset.v === "1" ? "Bloquer ce compte ? Il perdra tout accès." : "Débloquer ce compte ?")) return; const { error } = await sb.rpc("admin_set_blocked", { p_user: el.dataset.id, p_blocked: el.dataset.v === "1" }); if (error) throw error; toast("Compte mis à jour.", "ok"); await loadPeople(); return drawPeople(); }
      if (act === "ad-del") { if (!confirm("SUPPRESSION DÉFINITIVE du compte, de ses paiements et de sa progression. Continuer ?")) return; const { error } = await sb.rpc("admin_delete_user", { p_user: el.dataset.id }); if (error) throw error; toast("Compte supprimé.", "ok"); await loadPeople(); return drawPeople(); }
      if (act === "ad-import") return runImport();
      if (act === "ad-qedit") return editQuestion(el.dataset.id);
      if (act === "ad-qdel") return deleteQuestion(el.dataset.id);
      if (act === "ad-qreset") { document.getElementById("qForm").reset(); document.getElementById("qId").value = ""; return; }
      if (act === "ad-rename") { const n = prompt("Nouveau nom de la matière :", el.dataset.name); if (!n || !n.trim()) return; const { error } = await sb.rpc("admin_rename_subject", { p_id: Number(el.dataset.id), p_name: n.trim() }); if (error) throw error; toast("Matière renommée.", "ok"); delete S.data[AD.contentExam]; return route(); }
      if (act === "ad-docup") return uploadDoc();
      if (act === "ad-docdel") return deleteDoc(el.dataset.path);
    } catch (e) { toast(errText(e), "err"); }
  });
  document.addEventListener("change", (ev) => { const el = ev.target; if (el.matches && el.matches('select[data-act="ad-enr"]')) setEnrollment(el); });
  document.addEventListener("submit", (ev) => {
    const id = ev.target.id;
    const map = { loginForm: doLogin, signupForm: doSignup, quizForm: startQuiz, examForm: startExam, serviceForm: saveService, payForm: submitPayment, profileForm: saveProfile, passForm: changePass, qForm: saveQuestion };
    if (map[id]) return map[id](ev);
    if (ev.target.dataset.examForm) { ev.preventDefault(); saveExam(ev.target); }
  });

  /* ------------------------------------------------------------------ */
  /* Julien – IA : assistant de révision (recherche intelligente)        */
  /* ------------------------------------------------------------------ */
  const JIA = { open: false, msgs: [], ctx: "", index: {}, busy: false };
  const JIA_STOP = new Set("le la les l un une des du de d au aux a et ou en dans par pour sur sous avec sans que qu qui quoi quel quels quelle quelles est sont ce c cet cette ces se s son sa ses leur leurs il ils elle elles on y ne n pas plus tout tous toute toutes comment pourquoi quand combien donner donnez citer citez definir definissez definition expliquer expliquez dire dis moi me je j tu t peux peut veux voudrais savoir question reponse c'est qu'est qu'est-ce ce quoi faut doit etc svp stp merci".split(" "));
  const JIA_ABBR = {
    cat: "conduite a tenir", mgo: "marche generale operations", ari: "appareil respiratoire isolant", aricf: "appareil respiratoire isolant circuit ferme",
    arico: "appareil respiratoire isolant circuit ouvert", erp: "etablissement recevant public", igh: "immeuble grande hauteur", ps: "premier secours",
    psm: "premier secours", fpt: "fourgon pompe tonne", ldt: "lance devidoir tournant", gl: "grosse lance", pl: "petite lance", lm: "lance mousse",
    cos: "commandant operations secours", pls: "position laterale securite", rcp: "reanimation cardio pulmonaire", bi: "bouche incendie", pi: "poteau incendie",
    ria: "robinet incendie arme", ssi: "systeme securite incendie", mpe: "motopompe", co2: "anhydride carbonique", nrbc: "nucleaire radiologique biologique chimique",
    avp: "accident voie publique", sp: "sapeurs pompiers", ept: "etablissement", ers: "etablissement repertorie", orsec: "organisation reponse securite civile",
    dap: "dap", dqeg: "dqeg", gnsp: "groupement national sapeurs pompiers", bnsp: "brigade nationale sapeurs pompiers", lrac: "lance roquette antichar"
  };
  const jTok = (s) => norm(s).replace(/['’]/g, " ").split(/[^a-z0-9]+/).filter((w) => w && w.length > 1 && !JIA_STOP.has(w)).map((w) => (w.length > 3 && /[sx]$/.test(w) && !/(ss|us|is|as)$/.test(w) ? w.slice(0, -1) : w));
  function jExpand(words) {
    const out = [];
    words.forEach((w) => { out.push(w); if (JIA_ABBR[w] && JIA_ABBR[w] !== w) jTok(JIA_ABBR[w]).forEach((x) => out.push(x)); });
    return [...new Set(out)];
  }
  function jLev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let best = i;
      for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); best = Math.min(best, cur[j]); }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  function jMatch(w, set) {
    if (set.has(w)) return 1;
    let best = 0;
    for (const t of set) {
      if (w.length >= 4 && (t.startsWith(w) || (t.length >= 4 && w.startsWith(t)))) best = Math.max(best, 0.8);
      else if (w.length >= 5 && t.length >= 5 && jLev(w, t, w.length >= 8 ? 2 : 1) <= (w.length >= 8 ? 2 : 1)) best = Math.max(best, 0.7);
      if (best >= 0.8) break;
    }
    return best;
  }
  function jIndex(code) {
    const d = S.data[code]; if (!d) return [];
    if (JIA.index[code] && JIA.index[code].src === d) return JIA.index[code].items;
    const items = d.questions.map((x) => {
      const qt = jExpand(jTok(x.question));
      return { x, code, q: new Set(qt), a: new Set(jTok(x.answer)), qn: " " + jTok(x.question).join(" ") + " " };
    });
    JIA.index[code] = { src: d, items };
    return items;
  }
  function jSearch(raw, codes) {
    const words = jExpand(jTok(raw));
    if (!words.length) return [];
    const phrase = " " + jTok(raw).join(" ") + " ";
    const res = [];
    codes.forEach((code) => jIndex(code).forEach((it) => {
      let s = 0, hit = 0;
      words.forEach((w) => { const mq = jMatch(w, it.q), ma = mq < 1 ? jMatch(w, it.a) : 0; if (mq) { s += 3 * mq; hit++; } else if (ma) { s += ma; hit += 0.5; } });
      if (!hit) return;
      s = s * (hit / words.length) * (hit / words.length);
      if (phrase.trim().length > 4 && it.qn.includes(phrase)) s += 4;
      s -= Math.max(0, it.q.size - words.length) * 0.05;
      res.push({ s, it });
    }));
    return res.sort((a, b) => b.s - a.s).slice(0, 4).filter((r, i, arr) => r.s >= Math.max(1.2, arr[0].s * 0.35));
  }

  /* ----- Questions sur l'utilisation de l'application ----- */
  const JIA_FAQ = [
    { k: ["payer", "paiement", "wave", "orange", "money", "prix", "tarif", "combien coute", "fcfa", "acheter"], a: () => `Pour activer un parcours :\n• Ouvre le parcours souhaité puis « Activer ce parcours ».\n• Envoie le montant indiqué par Wave au ${C.WAVE_NUMBER || "numéro affiché"} ou par Orange Money au ${C.ORANGE_MONEY_NUMBER || "numéro affiché"}.\n• Saisis ton numéro et la référence de la transaction dans le formulaire.\n• L'administrateur valide ton paiement, puis le parcours s'ouvre.` },
    { k: ["active", "activation", "attente", "valide", "validation", "pas ouvert", "bloque", "acces"], a: () => `Après ton paiement, ton parcours reste « en attente » jusqu'à la validation par l'administrateur.\n• Touche « J'ai été validé ? Actualiser » sur la page du parcours.\n• Si c'est long, écris sur WhatsApp au ${C.WHATSAPP_DISPLAY || C.CONTACT_DISPLAY || "numéro de contact"} avec ta référence de transaction.` },
    { k: ["installer", "installation", "telecharger", "application", "ecran accueil", "playstore", "iphone", "android"], a: () => `Pour installer LUKOS-REVISION sur ton téléphone :\n• Android (Chrome) : touche « Installer » dans le message affiché, ou menu ⋮ › « Installer l'application ».\n• iPhone (Safari) : bouton Partager › « Sur l'écran d'accueil ».\nL'application s'ouvre ensuite comme une vraie application, en plein écran.` },
    { k: ["mot de passe", "passe", "oublie", "connexion", "connecter", "inscription", "inscrire", "compte"], a: () => `• Pour t'inscrire : écran d'accueil › « Créer un compte » (prénom, nom, téléphone, mot de passe).\n• Pour changer ton mot de passe : « Mon compte » › « Changer le mot de passe ».\n• Mot de passe oublié : contacte l'administrateur sur WhatsApp au ${C.WHATSAPP_DISPLAY || C.CONTACT_DISPLAY || "numéro de contact"}.` },
    { k: ["quiz", "qcm", "test", "evaluation", "score", "note"], a: () => `Dans un parcours, onglet « Quiz » :\n• Choisis une matière (ou toutes), le nombre de questions et le mode (QCM ou auto-évaluation).\n• À la fin, ton score est enregistré et les questions ratées sont affichées.\nPendant un quiz, je me mets en pause pour que l'évaluation reste honnête 😉` },
    { k: ["fiche", "revision", "reviser", "matiere", "cours"], a: () => `Onglet « Matières » : choisis une matière puis révise question par question avec « Afficher la réponse ». Le bouton « Mélanger » change l'ordre des fiches.` },
    { k: ["document", "pdf", "telecharger le recueil", "recueil"], a: () => `Onglet « Documents » du parcours : tu y trouves les documents de référence (PDF) déposés par l'administrateur.` },
    { k: ["contact", "whatsapp", "admin", "administrateur", "aide", "probleme", "bug"], a: () => `Tu peux joindre l'administrateur sur WhatsApp au ${C.WHATSAPP_DISPLAY || C.CONTACT_DISPLAY || "numéro de contact"}.` },
    { k: ["bonjour", "salut", "bonsoir", "hello", "salam", "cava", "ca va"], a: () => `Bonjour ${S.profile ? esc(S.profile.first_name) : ""} 👋 Pose-moi ta question, par exemple : « CAT devant une fracture du crâne » ou « c'est quoi la MGO ».` },
    { k: ["qui es tu", "qui est tu", "ton nom", "julien"], a: () => `Je suis Julien – IA, l'assistant de LUKOS-REVISION. Je retrouve en une seconde la réponse officielle de tes recueils, même si tu écris avec des fautes ou des abréviations.` }
  ];
  function jFaq(raw) {
    const n = " " + norm(raw).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ") + " ";
    let best = null, bs = 0;
    JIA_FAQ.forEach((f) => { const s = f.k.filter((k) => n.includes(" " + k) || n.includes(k + " ")).length; if (s > bs) { bs = s; best = f; } });
    return bs ? best.a() : null;
  }

  /* ----- Contexte de la page ----- */
  function jContext() {
    const p = parts();
    if (!S.session || !S.profile) return { mode: "guest", label: "Aide à l'inscription et à la connexion", codes: [] };
    if (exRunning()) return { mode: "quiz", label: "En pause pendant l'examen", codes: [] };
    if (p[0] === "p" && examByCode(p[1])) {
      const ex = examByCode(p[1]);
      if (p[2] === "quiz" && S.quiz && !S.quiz.finished) return { mode: "quiz", label: "En pause pendant le quiz", codes: [] };
      if (!hasAccess(p[1])) return { mode: "locked", label: "Activation du parcours " + ex.name, codes: [], exam: ex };
      return { mode: "exam", label: "Recherche dans " + ex.name, codes: [p[1]], exam: ex };
    }
    const codes = S.exams.filter((e) => hasAccess(e.code)).map((e) => e.code);
    return { mode: "home", label: codes.length ? "Recherche dans tes parcours activés" : "Aide et activation des parcours", codes };
  }
  function jGreeting(c) {
    const n = S.profile ? esc(S.profile.first_name) : "";
    if (c.mode === "guest") return `Bonjour 👋 Je suis <b>Julien – IA</b>. Je peux t'aider à créer ton compte, te connecter, installer l'application ou payer ton parcours.`;
    if (c.mode === "locked") return `Bonjour ${n} 👋 Le parcours <b>${esc(c.exam.name)}</b> n'est pas encore activé pour toi. Je peux t'expliquer comment le payer et l'activer.`;
    if (c.mode === "exam") return `Bonjour ${n} 👋 Je suis <b>Julien – IA</b>. Pose-moi n'importe quelle question du parcours <b>${esc(c.exam.name)}</b> : je trouve la réponse tout de suite, même avec des fautes ou des abréviations (CAT, MGO, ARI…).`;
    return c.codes.length ? `Bonjour ${n} 👋 Je suis <b>Julien – IA</b>. Je cherche dans tous tes parcours activés : ${c.codes.map((x) => "<b>" + esc((examByCode(x) || {}).name || x) + "</b>").join(", ")}.` : `Bonjour ${n} 👋 Je suis <b>Julien – IA</b>. Active un parcours pour que je puisse répondre à tes questions de révision. Je peux t'expliquer comment faire.`;
  }
  function jSuggest(c) {
    if (c.mode === "guest") return ["Comment m'inscrire ?", "Comment installer l'application ?", "Comment payer ?"];
    if (c.mode === "locked" || (c.mode === "home" && !c.codes.length)) return ["Comment payer ?", "Mon parcours n'est pas activé", "Contacter l'administrateur"];
    const ex = { DAP: ["Qu'est-ce que la réquisition ?", "Flagrant délit"], DQEG: ["Organisation de la gendarmerie", "Qu'est-ce que l'OPJ ?"], CAT: ["LRAC", "Marche en patrouille"], BNSP: ["CAT fracture du crâne", "C'est quoi la MGO ?", "Classes de feu"] };
    const code = c.codes[0];
    return (ex[code] || ["CAT devant une hémorragie", "Qu'est-ce que la MGO ?"]).concat(["Comment se passe le quiz ?"]);
  }

  /* ----- Interface ----- */
  const jFab = document.createElement("button");
  jFab.className = "jia-fab"; jFab.type = "button"; jFab.setAttribute("aria-label", "Ouvrir Julien – IA");
  jFab.innerHTML = `<img src="julien-ia.jpg" alt=""><span class="jia-fab-txt">Julien – IA</span><span class="jia-dot"></span>`;
  const jPanel = document.createElement("section");
  jPanel.className = "jia-panel"; jPanel.hidden = true; jPanel.setAttribute("aria-label", "Julien – IA");
  jPanel.innerHTML = `<header class="jia-head"><img src="julien-ia.jpg" alt=""><div><b>Julien – IA</b><small id="jiaCtx"></small></div><button type="button" class="jia-x" data-jia="close" aria-label="Fermer">✕</button></header>
    <div class="jia-body" id="jiaBody"></div><div class="jia-sugg" id="jiaSugg"></div>
    <form class="jia-form" id="jiaForm" autocomplete="off"><input id="jiaIn" type="text" maxlength="200" placeholder="Pose ta question…" aria-label="Ta question"><button type="submit" aria-label="Envoyer">➤</button></form>`;
  document.body.appendChild(jFab); document.body.appendChild(jPanel);
  const jBody = jPanel.querySelector("#jiaBody");

  function jPush(who, html, extra) { JIA.msgs.push({ who, html, extra }); jDraw(); }
  function jDraw() {
    jBody.innerHTML = JIA.msgs.map((m, i) => `<div class="jia-msg ${m.who}">${m.who === "bot" ? '<img src="julien-ia.jpg" alt="">' : ""}<div class="jia-bub">${m.html}${m.extra || ""}</div></div>`).join("");
    jBody.scrollTop = jBody.scrollHeight;
  }
  function jRefresh() {
    const c = jContext();
    const key = c.mode + ":" + c.codes.join(",") + ":" + (c.exam ? c.exam.code : "");
    jFab.hidden = c.mode === "quiz" || !configured;
    if (c.mode === "quiz" && JIA.open) jClose();
    document.getElementById("jiaCtx").textContent = c.label;
    if (key !== JIA.ctx) {
      JIA.ctx = key;
      const last = JIA.msgs[JIA.msgs.length - 1];
      if (last && last.g) JIA.msgs.pop();
      JIA.msgs.push({ who: "bot", html: jGreeting(c), g: true });
      if (JIA.msgs.length > 60) JIA.msgs.splice(0, JIA.msgs.length - 60);
      if (JIA.open) jDraw();
      document.getElementById("jiaSugg").innerHTML = jSuggest(c).map((s) => `<button type="button" data-jia="ask" data-q="${esc(s)}">${esc(s)}</button>`).join("");
    }
  }
  function jOpen() {
    // nouvelle discussion à chaque ouverture, avec le contexte de la page actuelle
    const c = jContext();
    JIA.msgs = [{ who: "bot", html: jGreeting(c), g: true }];
    document.getElementById("jiaSugg").innerHTML = jSuggest(c).map((s) => `<button type="button" data-jia="ask" data-q="${esc(s)}">${esc(s)}</button>`).join("");
    document.getElementById("jiaCtx").textContent = c.label;
    const inp = document.getElementById("jiaIn"); if (inp) inp.value = "";
    JIA.open = true; jPanel.hidden = false; jFab.classList.add("on"); document.documentElement.classList.add("jia-lock"); jDraw(); setTimeout(() => { const i = document.getElementById("jiaIn"); if (i && window.innerWidth > 700) i.focus(); }, 60); }
  function jClose() { JIA.open = false; jPanel.hidden = true; jFab.classList.remove("on"); document.documentElement.classList.remove("jia-lock"); }

  function jRender(r, alts, c) {
    const x = r.it.x, d = S.data[r.it.code];
    const sname = (d.allSubjects.find((s) => s.id === x.subject_id) || {}).name || "";
    const exName = (examByCode(r.it.code) || {}).name || r.it.code;
    const head = `<div class="jia-src">${c.codes.length > 1 ? esc(exName) + " · " : ""}${esc(sname)}</div><div class="jia-q">${esc(x.question)}</div>`;
    const more = alts.length ? `<div class="jia-alts"><small>Questions proches :</small>${alts.map((a) => `<button type="button" data-jia="show" data-code="${esc(a.it.code)}" data-id="${a.it.x.id}">${esc(a.it.x.question)}</button>`).join("")}</div>` : "";
    return { html: head + `<div class="answer">${formatAnswer(x.answer)}</div>`, extra: `<div class="jia-acts"><button type="button" data-jia="fiche" data-code="${esc(r.it.code)}" data-id="${x.id}">📖 Voir la fiche</button></div>` + more };
  }
  async function jAsk(raw) {
    raw = String(raw || "").trim(); if (!raw || JIA.busy) return;
    jPush("me", esc(raw));
    const c = jContext();
    JIA.busy = true;
    try {
      if (c.codes.length) {
        for (const code of c.codes) if (!S.data[code]) { jPush("bot", "Je charge les questions du parcours " + esc((examByCode(code) || {}).name || code) + "…"); await loadExamData(code); JIA.msgs.pop(); }
        const res = jSearch(raw, c.codes);
        const faq = jFaq(raw);
        if (res.length && !(faq && res[0].s < 3)) {
          const out = jRender(res[0], res.slice(1), c);
          return jPush("bot", out.html, out.extra);
        }
        if (faq) return jPush("bot", formatAnswer(faq));
        const others = S.exams.filter((e) => !hasAccess(e.code)).map((e) => e.name);
        return jPush("bot", `Je n'ai rien trouvé pour « ${esc(raw)} » dans ${c.codes.length > 1 ? "tes parcours" : "ce parcours"}. Essaie avec un mot-clé plus simple (ex. « fracture », « réquisition », « MGO »)${others.length && c.mode === "home" ? ", ou active un autre parcours (" + others.map(esc).join(", ") + ")" : ""}.`);
      }
      const faq = jFaq(raw);
      if (faq) return jPush("bot", formatAnswer(faq));
      if (c.mode === "locked" || c.mode === "home") return jPush("bot", formatAnswer(JIA_FAQ[0].a()) + `<p class="small muted" style="margin-top:8px">Dès que ton parcours sera activé, je pourrai répondre à toutes tes questions de révision.</p>`);
      return jPush("bot", "Je peux t'aider pour l'inscription, la connexion, l'installation et le paiement. Pour les questions de révision, connecte-toi d'abord 🙂");
    } catch (e) { jPush("bot", "Oups, je n'ai pas pu chercher : " + esc(errText(e))); }
    finally { JIA.busy = false; }
  }
  function jFind(code, id) { const d = S.data[code]; return d && d.questions.find((q) => String(q.id) === String(id)); }

  jFab.addEventListener("click", () => (JIA.open ? jClose() : jOpen()));
  jPanel.addEventListener("submit", (ev) => { ev.preventDefault(); const i = document.getElementById("jiaIn"); const v = i.value; i.value = ""; jAsk(v); });
  jPanel.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-jia]"); if (!el) return;
    const a = el.dataset.jia;
    if (a === "close") return jClose();
    if (a === "ask") return jAsk(el.dataset.q);
    if (a === "show") { const q = jFind(el.dataset.code, el.dataset.id); if (!q) return; const out = jRender({ it: { x: q, code: el.dataset.code } }, [], jContext()); jPush("me", esc(q.question)); return jPush("bot", out.html, out.extra); }
    if (a === "fiche") {
      const code = el.dataset.code, q = jFind(code, el.dataset.id); if (!q) return;
      const d = S.data[code], list = (d.bySubject.get(q.subject_id) || []).slice();
      S.rev = { key: code + ":" + q.subject_id, list, i: Math.max(0, list.findIndex((x) => x.id === q.id)), show: true, shuffled: false };
      jClose(); go("#/p/" + code + "/revision/" + q.subject_id);
    }
  });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && JIA.open) jClose(); });

  /* ------------------------------------------------------------------ */
  /* Simulateur d'examen : réponses rédigées, chronomètre, note sur 20   */
  /* ------------------------------------------------------------------ */
  const EX_MAX_LEAVES = 3;                          // sorties tolérées avant remise automatique
  const EX_SIZES = [10, 15, 20, 25, 30];
  const EX_PACE = [[60, "1 min"], [90, "1 min 30"], [120, "2 min"], [180, "3 min"]];
  const EX_MAXLEN = 1500;
  const EX_V = { ok: ["ok", "✓ Juste"], part: ["warn", "◐ Partiellement juste"], weak: ["warn", "◔ Insuffisante"], bad: ["bad", "✗ Fausse"], none: ["bad", "— Sans réponse"] };
  let exTick = null, exSaveT = null;
  const exRunning = () => !!(S.exam && !S.exam.done);
  const exSave = () => { const z = S.exam; if (z && !z.done) return idb.set("examrun", z); };
  const exSaveSoon = () => { clearTimeout(exSaveT); exSaveT = setTimeout(exSave, 400); };
  const fmtNote = (n) => Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  const fmtDur = (s) => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + " min " + String(s % 60).padStart(2, "0") + " s"; };
  const trunc = (t, n) => (t.length > (n || 140) ? t.slice(0, (n || 140) - 1) + "…" : t);
  function exMention(n) { return n >= 18 ? "Excellent" : n >= 16 ? "Très bien" : n >= 14 ? "Bien" : n >= 12 ? "Assez bien" : n >= 10 ? "Passable" : n >= 5 ? "Insuffisant" : "Très insuffisant"; }

  /* ----- Correcteur par notions clés ----- */
  const NUM_WORDS = { zero: "0", deux: "2", trois: "3", quatre: "4", cinq: "5", six: "6", sept: "7", huit: "8", neuf: "9", dix: "10", onze: "11", douze: "12", treize: "13", quatorze: "14", quinze: "15", seize: "16", vingt: "20", trente: "30", quarante: "40", cinquante: "50", soixante: "60", cent: "100", mille: "1000", premier: "1", premiere: "1", deuxieme: "2", troisieme: "3", quatrieme: "4", cinquieme: "5" };
  // sigles reconnus par le correcteur (ceux de Julien – IA + procédure)
  const G_ABBR = Object.assign({}, JIA_ABBR, { opj: "officier police judiciaire", apj: "agent police judiciaire", apja: "agent police judiciaire adjoint", pv: "proces verbal", gav: "garde vue", cpp: "code procedure penale" });
  const G_UNITS = { h: "heure", hr: "heure", mn: "minute", min: "minute", j: "jour", km: "kilometre", kg: "kilogramme", m: "metre", cm: "centimetre", mm: "millimetre", l: "litre", s: "seconde", sec: "seconde" };
  const G_STOP = new Set("lequel laquelle lesquels lesquelles duquel auquel dont etre etant ete ainsi aussi tres lors afin cela celui celle ceux celles cet".split(" "));
  function gTok(s) {
    return norm(s).replace(/['’]/g, " ").replace(/(\d)([a-z])/g, "$1 $2").replace(/([a-z])(\d)/g, "$1 $2").split(/[^a-z0-9]+/).filter(Boolean)
      .map((w, k, arr) => NUM_WORDS[w] || (G_UNITS[w] && k > 0 && /^\d+$/.test(arr[k - 1]) ? G_UNITS[w] : w))
      .filter((w) => /^\d+$/.test(w) || (w.length > 1 && !JIA_STOP.has(w) && !G_STOP.has(w)))
      .map((w) => (!/\d/.test(w) && w.length > 3 && /[sx]$/.test(w) && !/(ss|us|is|as)$/.test(w) ? w.slice(0, -1) : w))
      .reduce((out, w) => {                                       // « quarante huit » => 48
        const prev = out[out.length - 1];
        if (/^[1-9]$/.test(w) && /^[2-6]0$/.test(prev || "")) out[out.length - 1] = String(Number(prev) + Number(w)); else out.push(w);
        return out;
      }, []);
  }
  // découpe la réponse officielle en éléments attendus (lignes, puces, lignes de tableau, « ; »)
  function gPoints(answer) {
    let lines = String(answer || "").split(/\n/).map((l) => l.trim()).filter(Boolean);
    const intro = (l) => /:\s*$/.test(l);
    if (lines.length > 1 && lines.some((l) => !intro(l))) lines = lines.filter((l) => !intro(l));
    lines = lines.map((l) => l.replace(/^[•\-–*]\s*/, "").replace(/\s\|\s/g, " — "));
    if (lines.length === 1) {
      let segs = lines[0].split(/\s*;\s*/).filter((x) => gTok(x).length);
      if (segs.length < 2 && gTok(lines[0]).length > 8) { const c = lines[0].split(/\s*,\s*/).filter((x) => gTok(x).length >= 2); if (c.length >= 2) segs = c; }
      if (segs.length >= 2) lines = segs;
    }
    return lines.map((text) => ({ text, kw: [...new Set(gTok(text))] })).filter((p) => p.kw.length);
  }
  function gHit(w, C) {
    if (/\d/.test(w)) return C.has(w) ? 1 : 0;                 // les chiffres doivent être exacts
    if (C.has(w) || jMatch(w, C) >= 0.7) return 1;             // fautes, pluriels, débuts de mots
    const ab = G_ABBR[w];                                        // sigle attendu écrit en toutes lettres
    if (ab && ab !== w) { const t = gTok(ab); if (t.length && t.every((x) => C.has(x) || jMatch(x, C) >= 0.7)) return 1; }
    return 0;
  }
  function gWordMap(text) {
    const m = new Map();
    String(text).split(/[^A-Za-zÀ-ÿ0-9]+/).forEach((w) => { const t = gTok(w)[0]; if (t && !m.has(t)) m.set(t, w); });
    return m;
  }
  function gradeOne(it) {
    const resp = String(it.resp || "").trim();
    const points = gPoints(it.answer);
    if (!resp) return { credit: 0, verdict: "none", found: [], missing: [], missKw: [], single: points.length <= 1 };
    const C = new Set();
    gTok(resp).forEach((w) => { C.add(w); const ab = G_ABBR[w]; if (ab && ab !== w) gTok(ab).forEach((x) => C.add(x)); });
    if (!points.length) {
      const ok = norm(resp).replace(/[^a-z0-9]/g, "") === norm(it.answer).replace(/[^a-z0-9]/g, "");
      return { credit: ok ? 1 : 0, verdict: ok ? "ok" : "bad", found: [], missing: [], missKw: [], single: true };
    }
    let sum = 0; const found = [], missing = [], missKw = [];
    points.forEach((p) => {
      const hits = p.kw.map((w) => gHit(w, C));
      const ratio = hits.reduce((a, b) => a + b, 0) / p.kw.length;
      const nums = p.kw.map((w, k) => (/\d/.test(w) ? hits[k] : null)).filter((h) => h !== null);
      // un chiffre attendu (durée, nombre, article…) absent ou faux : l'élément ne rapporte rien
      const pc = nums.length && !nums.some(Boolean) ? 0 : ratio >= 0.85 ? 1 : ratio >= 0.6 ? 0.75 : ratio >= 0.34 ? 0.5 : ratio >= 0.2 ? 0.25 : 0;
      sum += pc;
      (pc >= 0.75 ? found : missing).push(p.text);
      if (pc < 1) { const wm = gWordMap(p.text); p.kw.forEach((w, k) => { if (!hits[k]) missKw.push(wm.get(w) || w); }); }
    });
    const r = sum / points.length;
    const credit = r >= 0.85 ? 1 : r >= 0.6 ? 0.75 : r >= 0.4 ? 0.5 : r >= 0.2 ? 0.25 : 0;
    const verdict = credit === 1 ? "ok" : credit >= 0.5 ? "part" : credit > 0 ? "weak" : "bad";
    return { credit, verdict, found, missing, missKw: [...new Set(missKw)].slice(0, 8), single: points.length === 1 };
  }

  /* ----- Écran de configuration ----- */
  async function loadExamAttempts(code) {
    const uid = S.session.user.id;
    const pend = ((await idb.get("pending")) || []).filter((r) => r.rpc === "complete_exam" && r.uid === uid && r.args.p_exam === code)
      .map((r) => ({ id: "p" + r.at, subject_id: r.args.p_subject_id, total: r.args.p_total, note20: r.args.p_note20, duration_s: r.args.p_duration_s, leaves: r.args.p_leaves, created_at: new Date(r.at).toISOString(), pending: true }));
    let list = [];
    try {
      if (S.offline) throw new Error("Failed to fetch");
      const { data, error } = await sb.from("exam_attempts").select("id,subject_id,total,note20,duration_s,leaves,created_at").eq("user_id", uid).eq("exam_code", code).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      list = data || [];
      idb.set("exatt:" + code, { uid, list });
    } catch (e) { const c = await idb.get("exatt:" + code); list = c && c.uid === uid ? c.list : []; }
    return pend.reverse().concat(list);
  }
  async function renderExamSim(exam, d) {
    const z = S.exam;
    if (z && z.uid === S.session.user.id) {
      if (!z.done && z.exam !== exam.code) return go("#/p/" + z.exam + "/examen");
      if (z.exam === exam.code) {
        if (z.done) return drawExamResult();
        if (Date.now() >= z.endsAt) return finishExam("time");
        if (z.leaves >= EX_MAX_LEAVES) return finishExam("leaves");
        return drawExamRun();
      }
    }
    const top = hero(exam, "Simulateur d'examen", "Mets-toi dans les conditions du jour J : réponses rédigées, chronomètre et note sur 20.", "Examen");
    if (!d.questions.length) { app.innerHTML = top + emptyBox("Le simulateur sera disponible dès que les questions de ce parcours seront publiées."); return; }
    const hist = await loadExamAttempts(exam.code).catch(() => []);
    const subjName = (id) => (d.allSubjects.find((s) => s.id === id) || {}).name || "Tout le parcours";
    const avg = hist.length ? hist.reduce((a, x) => a + Number(x.note20), 0) / hist.length : 0;
    app.innerHTML = top + `<div class="study stack"><div class="card"><form id="examForm">
        <label for="exSub">Épreuve</label><select id="exSub"><option value="">Tout le parcours ${esc(exam.name)} (${d.questions.length} questions, toutes matières)</option>${d.subjects.map((s) => `<option value="${s.id}">${esc(s.name)} (${(d.bySubject.get(s.id) || []).length})</option>`).join("")}</select>
        <label>Nombre de questions</label><div class="radio-cards ex-sizes">${EX_SIZES.map((n) => `<label><input type="radio" name="exNum" value="${n}" ${n === 20 ? "checked" : ""}> ${n}</label>`).join("")}</div>
        <label for="exPace">Temps par question</label><select id="exPace">${EX_PACE.map(([s, l]) => `<option value="${s}" ${s === 90 ? "selected" : ""}>${l}</option>`).join("")}</select>
        <p class="hint" id="exDur"></p>
        <div class="ex-rules"><b>📋 Règlement de l'épreuve</b><ul>
          <li>Les questions sont tirées au hasard. Tu rédiges chaque réponse avec tes propres mots.</li>
          <li>Pendant l'épreuve : pas de fiches, pas de recherche, pas de Julien – IA. Le copier-coller est désactivé.</li>
          <li>Chaque sortie de l'application est notée sur ta copie. À la ${EX_MAX_LEAVES}<sup>e</sup> sortie, la copie est remise automatiquement.</li>
          <li>À la fin du temps, la copie est remise automatiquement, telle quelle.</li>
          <li>Tu peux revenir sur une question tant que tu n'as pas remis ta copie.</li></ul></div>
        <label class="check"><input type="checkbox" id="exHonor"> Je m'engage sur l'honneur à composer seul(e), sans aucun document.</label>
        <button class="btn btn-primary btn-block" style="margin-top:14px">Commencer l'épreuve</button></form></div>
        ${hist.length ? `<div class="card"><h3>Mes derniers examens</h3><p class="small muted">${hist.length} examen${hist.length > 1 ? "s" : ""} · moyenne ${fmtNote(Math.round(avg * 4) / 4)}/20</p><div class="table-wrap"><table class="t"><tr><th>Date</th><th>Épreuve</th><th>Note</th><th>Durée</th></tr>${hist.slice(0, 10).map((a) => `<tr><td>${esc(fmtDate(a.created_at))}</td><td>${esc(subjName(a.subject_id))} <span class="muted small">(${a.total} q.)</span></td><td><b>${fmtNote(a.note20)}/20</b> <span class="muted small">${esc(exMention(Number(a.note20)))}</span>${a.pending ? ' <span class="badge warn">À ENVOYER</span>' : ""}</td><td class="small">${esc(fmtDur(a.duration_s))}</td></tr>`).join("")}</table></div></div>` : ""}
      </div>`;
    const upd = () => {
      const n = Number((document.querySelector('input[name="exNum"]:checked') || {}).value) || 20;
      const sid = document.getElementById("exSub").value, pool = sid ? (d.bySubject.get(Number(sid)) || []).length : d.questions.length;
      const real = Math.min(n, pool), pace = Number(document.getElementById("exPace").value) || 90;
      document.getElementById("exDur").textContent = "Durée de l'épreuve : " + fmtDur(real * pace).replace(" 00 s", "") + " pour " + real + " question" + (real > 1 ? "s" : "") + (real < n ? " (seulement " + pool + " disponible" + (pool > 1 ? "s" : "") + (sid ? " dans cette matière)" : " dans ce parcours)") : "") + ".";
    };
    document.getElementById("examForm").addEventListener("change", upd); upd();
  }
  function startExam(ev) {
    ev.preventDefault();
    const code = parts()[1], d = S.data[code]; if (!d || exRunning()) return;
    if (!document.getElementById("exHonor").checked) return toast("Coche l'engagement sur l'honneur pour commencer.", "err");
    const sid = document.getElementById("exSub").value;
    const n = Number((document.querySelector('input[name="exNum"]:checked') || {}).value) || 20;
    const pace = Number(document.getElementById("exPace").value) || 90;
    const pool = sid ? (d.bySubject.get(Number(sid)) || []) : d.questions;
    if (!pool.length) return toast("Aucune question disponible pour cette sélection.", "err");
    const sname = (id) => (d.allSubjects.find((s) => s.id === id) || {}).name || "";
    const want = Math.min(n, pool.length);
    let picked;
    if (sid) picked = shuffle(pool).slice(0, want);
    else {
      // tout le parcours : questions réparties équitablement entre les matières
      const groups = d.subjects.map((s) => shuffle(d.bySubject.get(s.id) || [])).filter((g) => g.length);
      picked = [];
      for (let k = 0; picked.length < want && groups.some((g) => g.length); k++) { const g = groups[k % groups.length]; if (g.length) picked.push(g.pop()); }
      picked = shuffle(picked);
    }
    const now = Date.now();
    S.exam = {
      uid: S.session.user.id, exam: code, subjectId: sid ? Number(sid) : null, scope: sid ? sname(Number(sid)) : "Tout le parcours",
      items: picked.map((q) => ({ id: q.id, subject_id: q.subject_id, sname: sname(q.subject_id), question: q.question, answer: q.answer, resp: "" })),
      i: 0, pace, startedAt: now, endsAt: now + picked.length * pace * 1000, leaves: 0, done: false
    };
    exSave(); drawExamRun(); window.scrollTo(0, 0);
  }

  /* ----- Épreuve ----- */
  function drawExamRun() {
    const z = S.exam, exam = examByCode(z.exam), it = z.items[z.i];
    document.documentElement.classList.add("in-exam");
    try { jRefresh(); } catch (e) { /* */ }
    const answered = () => z.items.filter((x) => x.resp.trim()).length;
    const last = z.i >= z.items.length - 1;
    app.innerHTML = `<div class="ex-run">
      <div class="ex-bar"><div><b>Examen ${esc(exam.name)}</b><small>${esc(z.scope)} · ${z.items.length} questions</small></div><div class="ex-timer" id="exTimer">--:--</div></div>
      <div class="bar" style="margin-bottom:12px"><i style="width:${((z.i + 1) / z.items.length) * 100}%"></i></div>
      ${z.leaves ? `<div class="ex-warn">⚠️ ${z.leaves} sortie${z.leaves > 1 ? "s" : ""} de l'application notée${z.leaves > 1 ? "s" : ""} sur ta copie. À la ${EX_MAX_LEAVES}<sup>e</sup>, ta copie sera remise automatiquement.</div>` : ""}
      <article class="qcard ex-q">${watermark()}
        <div class="qmeta"><span class="badge acc">${esc(it.sname)}</span><span class="muted small">Question ${z.i + 1} / ${z.items.length}</span></div>
        <div class="qtext">${esc(it.question)}</div>
        <textarea id="exResp" class="ex-resp" rows="6" maxlength="${EX_MAXLEN}" spellcheck="false" autocomplete="off" autocorrect="off" aria-label="Ta réponse" placeholder="Rédige ta réponse ici…">${esc(it.resp)}</textarea>
        <div class="ex-count small muted" id="exCount">${it.resp.length} / ${EX_MAXLEN}</div></article>
      <div class="nav-q"><button class="btn btn-ghost" data-act="ex-prev" ${z.i === 0 ? "disabled" : ""}>← Précédente</button>${last ? `<button class="btn btn-primary" data-act="ex-submit">Remettre ma copie</button>` : `<button class="btn btn-primary" data-act="ex-next">Suivante →</button>`}</div>
      <div class="ex-grid" aria-label="Aller à une question">${z.items.map((x, k) => `<button type="button" data-act="ex-go" data-k="${k}" class="${k === z.i ? "cur" : ""} ${x.resp.trim() ? "done" : ""}" aria-label="Question ${k + 1}">${k + 1}</button>`).join("")}</div>
      <div class="row between ex-foot"><span class="small muted" id="exAnsw">${answered()} / ${z.items.length} réponses rédigées</span>${last ? "" : `<button class="btn btn-bad btn-sm" data-act="ex-submit">Remettre ma copie</button>`}</div>
    </div>`;
    const ta = document.getElementById("exResp");
    ta.addEventListener("input", () => {
      it.resp = ta.value;
      document.getElementById("exCount").textContent = ta.value.length + " / " + EX_MAXLEN;
      const b = app.querySelector(`.ex-grid [data-k="${z.i}"]`); if (b) b.classList.toggle("done", !!ta.value.trim());
      document.getElementById("exAnsw").textContent = answered() + " / " + z.items.length + " réponses rédigées";
      exSaveSoon();
    });
    if (window.innerWidth > 700) ta.focus();
    exStartTick();
  }
  function exStartTick() {
    clearInterval(exTick);
    const upd = () => {
      const z = S.exam;
      if (!exRunning()) { clearInterval(exTick); return; }
      const left = Math.max(0, Math.round((z.endsAt - Date.now()) / 1000));
      const el = document.getElementById("exTimer");
      if (el) { el.textContent = String(Math.floor(left / 60)).padStart(2, "0") + ":" + String(left % 60).padStart(2, "0"); el.classList.toggle("low", left <= 60); }
      if (left <= 0) { clearInterval(exTick); finishExam("time"); }
    };
    upd(); exTick = setInterval(upd, 1000);
  }
  function exAction(act, el) {
    const z = S.exam; if (!exRunning()) return;
    const ta = document.getElementById("exResp"); if (ta) z.items[z.i].resp = ta.value;
    if (act === "ex-prev" && z.i > 0) z.i--;
    if (act === "ex-next" && z.i < z.items.length - 1) z.i++;
    if (act === "ex-go") z.i = Math.max(0, Math.min(z.items.length - 1, Number(el.dataset.k) || 0));
    if (act === "ex-submit") {
      const empty = z.items.filter((x) => !x.resp.trim()).length;
      if (!confirm(empty ? `Il reste ${empty} question${empty > 1 ? "s" : ""} sans réponse. Remettre quand même ta copie ? Tu ne pourras plus la modifier.` : "Remettre ta copie ? Tu ne pourras plus la modifier.")) return;
      return finishExam("user");
    }
    exSave(); drawExamRun(); window.scrollTo(0, 0);
  }
  async function finishExam(reason) {
    const z = S.exam; if (!z || z.done) return;
    const ta = document.getElementById("exResp"); if (ta && z.items[z.i]) z.items[z.i].resp = ta.value;
    clearInterval(exTick); clearTimeout(exSaveT);
    z.items.forEach((it) => { it.g = gradeOne(it); });
    z.score = z.items.reduce((a, x) => a + x.g.credit, 0);
    z.note20 = Math.round((z.score / z.items.length) * 80) / 4;      // arrondi au quart de point
    z.endedAt = Math.min(Date.now(), z.endsAt); z.reason = reason; z.done = true;
    await idb.del("examrun");
    document.documentElement.classList.remove("in-exam");
    await saveExam();
    const p = parts();
    if (!(p[0] === "p" && p[1] === z.exam && p[2] === "examen")) return go("#/p/" + z.exam + "/examen");
    drawExamResult(); window.scrollTo(0, 0);
  }
  async function saveExam() {
    const z = S.exam; if (z.saved || z.pending) return;
    const args = {
      p_exam: z.exam, p_subject_id: z.subjectId, p_total: z.items.length, p_score: z.score, p_note20: z.note20,
      p_duration_s: Math.round((z.endedAt - z.startedAt) / 1000), p_leaves: z.leaves,
      p_details: z.items.map((x) => ({ q: x.id, c: x.g.credit, r: x.resp.slice(0, 600) }))
    };
    try {
      if (S.offline) throw new Error("Failed to fetch");
      const { error } = await sb.rpc("complete_exam", args);
      if (error) throw error;
      z.saved = true;
    } catch (e) {
      if (isNetErr(e)) { await queuePending({ uid: S.session.user.id, at: Date.now(), rpc: "complete_exam", args }); z.pending = true; }
      else z.saveErr = errText(e);
    }
  }

  /* ----- Résultat et corrigé ----- */
  function exNotes(g) {
    if (g.single) return g.missKw.length ? `<p class="ex-miss">✗ Notions attendues absentes de ta réponse : <b>${g.missKw.map(esc).join(", ")}</b></p>` : "";
    return (g.found.length ? `<div class="ex-found"><small>✓ Éléments trouvés</small><ul>${g.found.map((t) => `<li>${esc(trunc(t))}</li>`).join("")}</ul></div>` : "") +
      (g.missing.length ? `<div class="ex-missl"><small>✗ Éléments manquants ou incomplets</small><ul>${g.missing.map((t) => `<li>${esc(trunc(t))}</li>`).join("")}</ul></div>` : "");
  }
  function exCorr(x, k) {
    const g = x.g, v = EX_V[g.verdict];
    return `<div class="ex-corr ${g.verdict}">
      <div class="row between"><span class="small muted">Question ${k + 1} · ${esc(x.sname)}</span><span class="badge ${v[0]}">${v[1]} · ${fmtNote(g.credit)}/1</span></div>
      <p class="ex-cq"><b>${esc(x.question)}</b></p>
      <div class="ex-mine"><small>Ta réponse</small>${x.resp.trim() ? `<p>${esc(x.resp.trim()).replace(/\n/g, "<br>")}</p>` : `<p class="muted"><i>Aucune réponse</i></p>`}</div>
      ${g.verdict !== "ok" && g.verdict !== "none" ? exNotes(g) : ""}
      <details ${g.verdict === "ok" ? "" : "open"}><summary>Corrigé officiel</summary><div class="answer">${formatAnswer(x.answer)}</div></details>
    </div>`;
  }
  function drawExamResult() {
    const z = S.exam, exam = examByCode(z.exam);
    document.documentElement.classList.remove("in-exam");
    try { jRefresh(); } catch (e) { /* */ }
    const pct = Math.round((z.note20 / 20) * 100);
    const cnt = (...v) => z.items.filter((x) => v.includes(x.g.verdict)).length;
    const bySub = new Map();
    z.items.forEach((x) => { const b = bySub.get(x.sname) || { n: 0, s: 0 }; b.n++; b.s += x.g.credit; bySub.set(x.sname, b); });
    const weak = [...bySub].filter(([, b]) => b.s / b.n < 0.5).map(([k]) => k);
    const reasonTxt = { time: "⏱️ Temps écoulé : ta copie a été remise automatiquement.", leaves: `🚫 Copie remise automatiquement après ${z.leaves} sorties de l'application.` }[z.reason] || "";
    const saveTxt = z.saved ? "Résultat enregistré dans ta progression." : z.pending ? "📴 Résultat gardé sur le téléphone : il sera envoyé dès le retour d'Internet." : "Résultat non enregistré" + (z.saveErr ? " : " + z.saveErr : ".");
    app.innerHTML = hero(exam, "Résultat de l'examen", exMention(z.note20) + " — " + z.scope, "Examen") + `<div class="study stack">
      <div class="card center ex-score">
        <div class="score-ring" style="--p:${pct}"><div>${fmtNote(z.note20)}<small>/20</small></div></div>
        <h2>${esc(exMention(z.note20))}</h2>
        <p class="muted">${z.note20 >= 10 ? "Moyenne atteinte ✓" : "En dessous de la moyenne : reprends les points ci-dessous puis retente l'épreuve."}</p>
        ${reasonTxt ? `<div class="ex-warn">${esc(reasonTxt)}</div>` : ""}
        <div class="ex-kpis"><div><b>${cnt("ok")}</b><span>Justes</span></div><div><b>${cnt("part", "weak")}</b><span>Partielles</span></div><div><b>${cnt("bad")}</b><span>Fausses</span></div><div><b>${cnt("none")}</b><span>Sans réponse</span></div></div>
        <p class="small muted">Points : <b>${fmtNote(z.score)} / ${z.items.length}</b> · Durée : ${esc(fmtDur((z.endedAt - z.startedAt) / 1000))} · Sorties détectées : ${z.leaves}</p>
        <p class="small muted">${esc(saveTxt)}</p>
        <div class="row" style="justify-content:center"><button class="btn btn-primary" data-act="ex-again">Nouvel examen</button><a class="btn btn-ghost" href="#/p/${exam.code}/matieres">Réviser les matières</a></div>
      </div>
      ${bySub.size > 1 ? `<div class="card"><h3>Bilan par matière</h3><div class="table-wrap"><table class="t"><tr><th>Matière</th><th>Questions</th><th>Note /20</th></tr>${[...bySub].map(([k, b]) => { const n = Math.round((b.s / b.n) * 80) / 4; return `<tr><td>${esc(k)}</td><td>${b.n}</td><td><b>${fmtNote(n)}</b> <span class="muted small">${esc(exMention(n))}</span></td></tr>`; }).join("")}</table></div>${weak.length ? `<p class="small" style="margin-top:10px">📌 À retravailler en priorité : <b>${weak.map(esc).join(", ")}</b></p>` : ""}</div>` : ""}
      <div class="card"><h3>Corrigé détaillé</h3>${z.items.map(exCorr).join("")}</div>
      <p class="hint center">Correction automatique par notions clés : chaque réponse est comparée aux éléments attendus du corrigé officiel (fautes d'orthographe, pluriels et sigles tolérés). En cas de doute, fie-toi au corrigé officiel.</p>
    </div>`;
  }

  /* ----- Surveillance de l'épreuve ----- */
  document.addEventListener("visibilitychange", () => {
    if (!exRunning() || !document.documentElement.classList.contains("in-exam")) return;
    if (document.hidden) { S.exam.leaves++; exSave(); return; }
    if (S.exam.leaves >= EX_MAX_LEAVES) return finishExam("leaves");
    if (Date.now() >= S.exam.endsAt) return finishExam("time");
    toast(`⚠️ Sortie de l'application détectée (${S.exam.leaves}/${EX_MAX_LEAVES}). Elle est notée sur ta copie.`, "err");
    drawExamRun();
  });
  ["copy", "cut", "paste", "drop", "contextmenu"].forEach((t) => document.addEventListener(t, (e) => {
    if (!exRunning() || !document.documentElement.classList.contains("in-exam")) return;
    e.preventDefault();
    if (t === "paste" || t === "drop") toast("Le collage est désactivé pendant l'examen.", "err");
  }));
  window.addEventListener("beforeunload", (e) => { if (exRunning()) { exSave(); e.preventDefault(); e.returnValue = ""; } });

  /* Déconnexion automatique après inactivité */
  let lastActive = Date.now();
  ["click", "keydown", "touchstart", "scroll"].forEach((t) => window.addEventListener(t, () => (lastActive = Date.now()), { passive: true }));
  // Le candidat reste connecté (même après une longue pause ou une mise en veille du téléphone).
  // Option facultative : déconnexion des administrateurs seulement, si INACTIVITY_LOGOUT_ADMIN_MINUTES est défini dans config.js.
  setInterval(() => {
    const mins = Number(C.INACTIVITY_LOGOUT_ADMIN_MINUTES || 0);
    if (mins > 0 && S.session && !S.offline && isAdmin() && Date.now() - lastActive > mins * 60000) { logout(); toast("Déconnexion automatique après inactivité."); }
  }, 60000);

  /* ------------------------------------------------------------------ */
  /* Démarrage                                                          */
  /* ------------------------------------------------------------------ */
  async function boot() {
    setFooter();
    if (!configured) return route();
    try {
      if (!navigator.onLine) throw new Error("Failed to fetch");
      await loadExams();
      const { data } = await sb.auth.getSession();
      S.session = data.session || null;
      if (S.session) await loadAccount();
    } catch (e) {
      if (isNetErr(e)) await enterOffline();
      /* sinon l'écran d'erreur est géré par route() */
    }
    // reprise d'un examen interrompu (rechargement, fermeture de l'application…) : le chronomètre a continué
    if (S.session && S.session.user) {
      const run = await idb.get("examrun");
      if (run && run.uid === S.session.user.id && !run.done) S.exam = run;
    }
    if (!S.offline && S.session) { flushPending(); setTimeout(prefetchOffline, 2500); }
    sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        if (!userLogout && hasStoredSession()) return;   // simple coupure réseau : on garde la session
        S.session = null; S.profile = null; route();
      }
      else if (session && !S.offline) S.session = session;
    });
    route();
  }
  boot();

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  /* ===== Installation de l'application (Android, iPhone, ordinateur) =====
     Tant que l'application n'est pas installée, un écran d'installation s'affiche
     à chaque ouverture sur téléphone, et un bandeau « Installer » reste visible. */
  (function installer() {
    const ua = navigator.userAgent || "";
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /android/i.test(ua);
    const isMobile = isIOS || isAndroid;
    const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|; wv\)/i.test(ua);
    const iosSafari = isIOS && /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
    let deferred = null;
    const installed = () => window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || navigator.standalone === true;
    if (installed()) return;

    const shareIco = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
    const dotsIco = '<b class="inst-k">⋮</b>';

    function steps() {
      if (inApp) return `<p class="inst-warn">Tu as ouvert le lien depuis une autre application. Pour installer, ouvre-le dans <b>${isIOS ? "Safari" : "Chrome"}</b> :</p>
        <ol class="inst-steps"><li>Touche ${dotsIco} ou ${shareIco} en haut ou en bas de l'écran ;</li><li>Choisis <b>« Ouvrir dans ${isIOS ? "Safari" : "Chrome"} »</b> (ou « Ouvrir dans le navigateur ») ;</li><li>L'écran d'installation apparaîtra.</li></ol>
        <button class="btn btn-ghost btn-block" data-inst="copy">Copier le lien</button>`;
      if (isIOS) return `${iosSafari ? "" : `<p class="inst-warn">Sur iPhone, le plus simple est d'utiliser <b>Safari</b>.</p>`}
        <ol class="inst-steps"><li>Touche le bouton <b>Partager</b> ${shareIco} ${iosSafari ? "en bas de l'écran" : "(en haut ou en bas)"} ;</li><li>Fais défiler et choisis <b>« Sur l'écran d'accueil »</b> ;</li><li>Touche <b>Ajouter</b> en haut à droite.</li></ol>`;
      if (deferred) return `<button class="btn btn-primary btn-block inst-go" data-inst="go">Installer maintenant</button>`;
      return `<ol class="inst-steps"><li>Touche le menu ${dotsIco} en haut à droite de Chrome ;</li><li>Choisis <b>« Installer l'application »</b> ou <b>« Ajouter à l'écran d'accueil »</b> ;</li><li>Confirme avec <b>Installer</b>.</li></ol>`;
    }

    let overlay = null;
    function showOverlay() {
      if (installed()) return;
      if (!overlay) { overlay = document.createElement("div"); overlay.className = "inst-overlay"; overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); document.body.appendChild(overlay); }
      overlay.innerHTML = `<div class="inst-box"><img src="logo512.png" alt="" width="84" height="84" class="inst-logo">
        <h2>Installe LUKOS-REVISION</h2><p class="muted">Installe l'application sur ton téléphone : elle s'ouvrira en plein écran, depuis son icône, comme une vraie application.</p>
        ${steps()}<button class="inst-later" data-inst="later">Continuer dans le navigateur pour l'instant</button></div>`;
      overlay.hidden = false; document.documentElement.classList.add("inst-lock");
    }
    function hideOverlay() { if (overlay) overlay.hidden = true; document.documentElement.classList.remove("inst-lock"); }

    let bar = null;
    function showBar() {
      if (installed() || (!isMobile && !deferred)) return;
      if (!bar) { bar = document.createElement("div"); bar.className = "inst-bar"; document.body.appendChild(bar); document.documentElement.classList.add("has-inst-bar"); }
      bar.innerHTML = `<img src="logo-header.png" alt="" width="30" height="30"><span><b>Application non installée</b><small>Installe-la pour un accès rapide</small></span><button class="btn btn-sm inst-btn" data-inst="${deferred ? "go" : "open"}">Installer</button>`;
    }
    function done() { hideOverlay(); if (bar) { bar.remove(); bar = null; } document.documentElement.classList.remove("has-inst-bar"); }

    async function promptInstall() {
      if (!deferred) return showOverlay();
      deferred.prompt();
      try { const r = await deferred.userChoice; if (r && r.outcome === "accepted") { deferred = null; done(); toast("Installation en cours… L'icône LUKOS-REVISION va apparaître sur ton écran d'accueil.", "ok"); return; } } catch (e) { /* ignoré */ }
      deferred = null; showBar();
    }

    window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; showBar(); if (overlay && !overlay.hidden) showOverlay(); });
    window.addEventListener("appinstalled", () => { deferred = null; done(); });
    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-inst]"); if (!t) return;
      const a = t.getAttribute("data-inst");
      if (a === "go") promptInstall();
      else if (a === "open") showOverlay();
      else if (a === "later") hideOverlay();
      else if (a === "copy") { const u = location.href.split("#")[0]; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast("Lien copié : colle-le dans " + (isIOS ? "Safari" : "Chrome") + ".", "ok")).catch(() => toast(u)); }
    });
    window.matchMedia("(display-mode: standalone)").addEventListener("change", (m) => { if (m.matches) done(); });

    showBar();
    if (isMobile) setTimeout(showOverlay, 900);
  })();
  void sleep;
})();
