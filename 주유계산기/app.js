const POLL_MS = 5000;
const SOON_SECONDS = 10;

const storage = {
  selectedMember: "wos_fuel_selected_member",
  localRallies: "wos_fuel_local_rallies",
  sound: "wos_fuel_sound_enabled",
  adminPassword: "wos_fuel_admin_password",
};

const state = {
  members: [],
  sharedRallies: [],
  localRallies: readLocalRallies(),
  selectedMemberId: localStorage.getItem(storage.selectedMember) || "",
  adminPassword: sessionStorage.getItem(storage.adminPassword) || "",
  soundEnabled: localStorage.getItem(storage.sound) === "true",
  notified: new Set(),
  lastError: "",
};

const els = {
  nowTime: document.querySelector("#nowTime"),
  syncStatus: document.querySelector("#syncStatus"),
  memberSelect: document.querySelector("#memberSelect"),
  myCards: document.querySelector("#myCards"),
  soundButton: document.querySelector("#soundButton"),
  localRallyForm: document.querySelector("#localRallyForm"),
  localRallyName: document.querySelector("#localRallyName"),
  localRallyRemaining: document.querySelector("#localRallyRemaining"),
  localEnemyMarch: document.querySelector("#localEnemyMarch"),
  allTables: document.querySelector("#allTables"),
  setupNotice: document.querySelector("#setupNotice"),
  adminPassword: document.querySelector("#adminPassword"),
  adminLoginButton: document.querySelector("#adminLoginButton"),
  adminLogin: document.querySelector("#adminLogin"),
  adminTools: document.querySelector("#adminTools"),
  memberForm: document.querySelector("#memberForm"),
  memberId: document.querySelector("#memberId"),
  memberName: document.querySelector("#memberName"),
  memberMarch: document.querySelector("#memberMarch"),
  memberSort: document.querySelector("#memberSort"),
  memberReset: document.querySelector("#memberReset"),
  memberAdminList: document.querySelector("#memberAdminList"),
  sharedRallyForm: document.querySelector("#sharedRallyForm"),
  sharedRallyId: document.querySelector("#sharedRallyId"),
  sharedRallyName: document.querySelector("#sharedRallyName"),
  sharedRallyRemaining: document.querySelector("#sharedRallyRemaining"),
  sharedEnemyMarch: document.querySelector("#sharedEnemyMarch"),
  sharedRallyReset: document.querySelector("#sharedRallyReset"),
  sharedRallyAdminList: document.querySelector("#sharedRallyAdminList"),
};

init();

function init() {
  els.adminPassword.value = state.adminPassword;
  els.adminTools.hidden = !state.adminPassword;
  els.adminLogin.hidden = Boolean(state.adminPassword);

  bindEvents();
  syncAll();
  render();
  setInterval(tick, 1000);
  setInterval(syncAll, POLL_MS);
}

function bindEvents() {
  els.memberSelect.addEventListener("change", () => {
    state.selectedMemberId = els.memberSelect.value;
    localStorage.setItem(storage.selectedMember, state.selectedMemberId);
    render();
  });

  els.soundButton.addEventListener("click", async () => {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem(storage.sound, String(state.soundEnabled));
    if (state.soundEnabled) beep(0.04);
    render();
  });

  els.localRallyForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const rallyRemaining = parseDuration(els.localRallyRemaining.value);
    const enemyMarch = parseDuration(els.localEnemyMarch.value);
    if (rallyRemaining === null || enemyMarch === null) {
      showNotice("개인 임시 집결의 시간을 확인해주세요. 예: 5:00, 1:30");
      return;
    }

    state.localRallies.unshift({
      id: crypto.randomUUID(),
      name: cleanName(els.localRallyName.value, "임시 집결"),
      rally_remaining_seconds: rallyRemaining,
      enemy_march_seconds: enemyMarch,
      created_at: new Date().toISOString(),
      local: true,
    });
    saveLocalRallies();
    els.localRallyForm.reset();
    render();
  });

  els.myCards.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-local]");
    if (!button) return;
    state.localRallies = state.localRallies.filter((rally) => rally.id !== button.dataset.deleteLocal);
    saveLocalRallies();
    render();
  });

  els.adminLoginButton.addEventListener("click", () => {
    state.adminPassword = els.adminPassword.value;
    sessionStorage.setItem(storage.adminPassword, state.adminPassword);
    els.adminTools.hidden = false;
    els.adminLogin.hidden = true;
    syncAll();
  });

  els.memberForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const marchSeconds = parseDuration(els.memberMarch.value);
    if (marchSeconds === null) {
      showNotice("멤버 행군시간을 확인해주세요. 예: 1:20");
      return;
    }

    const payload = {
      id: els.memberId.value || undefined,
      name: cleanName(els.memberName.value, "멤버"),
      march_seconds: marchSeconds,
      sort_order: Number(els.memberSort.value || 0),
    };

    await adminFetch("/api/members", {
      method: payload.id ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    resetMemberForm();
    await syncAll();
  });

  els.memberReset.addEventListener("click", resetMemberForm);

  els.sharedRallyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const rallyRemaining = parseDuration(els.sharedRallyRemaining.value);
    const enemyMarch = parseDuration(els.sharedEnemyMarch.value);
    if (rallyRemaining === null || enemyMarch === null) {
      showNotice("공통 집결 시간을 확인해주세요. 예: 5:00, 1:30");
      return;
    }

    const payload = {
      id: els.sharedRallyId.value || undefined,
      name: cleanName(els.sharedRallyName.value, "공통 집결"),
      rally_remaining_seconds: rallyRemaining,
      enemy_march_seconds: enemyMarch,
    };

    await adminFetch("/api/rallies", {
      method: payload.id ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    resetSharedRallyForm();
    await syncAll();
  });

  els.sharedRallyReset.addEventListener("click", resetSharedRallyForm);
}

function tick() {
  els.nowTime.textContent = formatClock(new Date());
  renderResults();
}

async function syncAll() {
  try {
    const [membersRes, ralliesRes] = await Promise.all([
      fetch("/api/members"),
      fetch("/api/rallies"),
    ]);
    const membersData = await membersRes.json();
    const ralliesData = await ralliesRes.json();

    if (!membersRes.ok) throw new Error(membersData.error || "멤버를 불러오지 못했습니다.");
    if (!ralliesRes.ok) throw new Error(ralliesData.error || "집결을 불러오지 못했습니다.");

    state.members = membersData.members || [];
    state.sharedRallies = ralliesData.rallies || [];
    state.lastError = "";
    els.syncStatus.textContent = `동기화 ${formatClock(new Date())} UTC`;
    showNotice("");
    render();
  } catch (error) {
    state.lastError = error.message;
    els.syncStatus.textContent = "동기화 확인 필요";
    showNotice(error.message);
    render();
  }
}

function render() {
  renderMemberSelect();
  renderSoundButton();
  renderResults();
  renderAdminLists();
}

function renderMemberSelect() {
  const current = state.selectedMemberId;
  const options = [
    `<option value="">닉네임 선택</option>`,
    ...state.members.map((member) => {
      const selected = member.id === current ? "selected" : "";
      return `<option value="${escapeHtml(member.id)}" ${selected}>${escapeHtml(member.name)} (${formatDuration(member.march_seconds)})</option>`;
    }),
  ];
  els.memberSelect.innerHTML = options.join("");
}

function renderSoundButton() {
  els.soundButton.textContent = state.soundEnabled ? "소리 알림 켜짐" : "소리 알림 켜기";
}

function renderResults() {
  els.nowTime.textContent = formatClock(new Date());
  const selectedMember = state.members.find((member) => member.id === state.selectedMemberId);
  const rallies = getActiveRallies();

  if (!selectedMember) {
    els.myCards.innerHTML = `<p class="empty">닉네임을 선택하면 내 주유 시간이 표시됩니다.</p>`;
  } else if (!rallies.length) {
    els.myCards.innerHTML = `<p class="empty">등록된 집결이 없습니다. 개인 임시 집결을 추가하거나 관리자가 공통 집결을 올리면 됩니다.</p>`;
  } else {
    els.myCards.innerHTML = rallies.map((rally) => renderMyCard(rally, selectedMember)).join("");
  }

  renderAllTables(rallies);
}

function renderMyCard(rally, member) {
  const result = calculateTiming(rally, member);
  maybeNotify(rally, member, result);
  const deleteButton = rally.local
    ? `<button class="small-button" type="button" data-delete-local="${escapeHtml(rally.id)}">임시 집결 삭제</button>`
    : "";

  return `
    <article class="rally-card ${result.className}">
      <h3>${escapeHtml(rally.name)}${rally.local ? " · 개인" : " · 공통"}</h3>
      <div class="countdown">${escapeHtml(result.mainText)}</div>
      <div class="meta">
        <span>${escapeHtml(result.statusText)}</span>
        <span>상대 도착 ${formatClock(result.arrivalAt)} UTC · 내 행군 ${formatDuration(member.march_seconds)}</span>
        <span>출발 시각 ${formatClock(result.departAt)} UTC</span>
      </div>
      ${deleteButton}
    </article>
  `;
}

function renderAllTables(rallies) {
  if (!rallies.length || !state.members.length) {
    els.allTables.innerHTML = `<p class="empty">표시할 집결이나 멤버가 없습니다.</p>`;
    return;
  }

  els.allTables.innerHTML = rallies.map((rally) => {
    const rows = state.members.map((member) => {
      const result = calculateTiming(rally, member);
      return `
        <tr>
          <td>${escapeHtml(member.name)}</td>
          <td>${formatDuration(member.march_seconds)}</td>
          <td>${escapeHtml(result.mainText)}</td>
          <td>${formatClock(result.departAt)}</td>
          <td>${escapeHtml(result.statusText)}</td>
        </tr>
      `;
    }).join("");

    return `
      <section>
        <h2>${escapeHtml(rally.name)}${rally.local ? " · 개인" : " · 공통"}</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>닉네임</th>
                <th>행군시간</th>
                <th>출발까지</th>
                <th>출발 시각</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
    `;
  }).join("");
}

function renderAdminLists() {
  els.memberAdminList.innerHTML = state.members.length ? state.members.map((member) => `
    <div class="admin-row">
      <span><strong>${escapeHtml(member.name)}</strong><br>${formatDuration(member.march_seconds)} · 정렬 ${member.sort_order}</span>
      <button class="ghost-button" type="button" data-edit-member="${escapeHtml(member.id)}">수정</button>
      <button class="ghost-button" type="button" data-delete-member="${escapeHtml(member.id)}">삭제</button>
    </div>
  `).join("") : `<p class="empty">등록된 멤버가 없습니다.</p>`;

  els.sharedRallyAdminList.innerHTML = state.sharedRallies.length ? state.sharedRallies.map((rally) => `
    <div class="admin-row">
      <span><strong>${escapeHtml(rally.name)}</strong><br>집결 ${formatDuration(rally.rally_remaining_seconds)} + 행군 ${formatDuration(rally.enemy_march_seconds)}</span>
      <button class="ghost-button" type="button" data-edit-rally="${escapeHtml(rally.id)}">수정</button>
      <button class="ghost-button" type="button" data-delete-rally="${escapeHtml(rally.id)}">삭제</button>
    </div>
  `).join("") : `<p class="empty">등록된 공통 집결이 없습니다.</p>`;

  bindAdminListButtons();
}

function bindAdminListButtons() {
  document.querySelectorAll("[data-edit-member]").forEach((button) => {
    button.addEventListener("click", () => {
      const member = state.members.find((item) => item.id === button.dataset.editMember);
      if (!member) return;
      els.memberId.value = member.id;
      els.memberName.value = member.name;
      els.memberMarch.value = formatDuration(member.march_seconds);
      els.memberSort.value = member.sort_order;
    });
  });

  document.querySelectorAll("[data-delete-member]").forEach((button) => {
    button.addEventListener("click", async () => {
      await adminFetch(`/api/members?id=${encodeURIComponent(button.dataset.deleteMember)}`, { method: "DELETE" });
      await syncAll();
    });
  });

  document.querySelectorAll("[data-edit-rally]").forEach((button) => {
    button.addEventListener("click", () => {
      const rally = state.sharedRallies.find((item) => item.id === button.dataset.editRally);
      if (!rally) return;
      els.sharedRallyId.value = rally.id;
      els.sharedRallyName.value = rally.name;
      els.sharedRallyRemaining.value = formatDuration(rally.rally_remaining_seconds);
      els.sharedEnemyMarch.value = formatDuration(rally.enemy_march_seconds);
    });
  });

  document.querySelectorAll("[data-delete-rally]").forEach((button) => {
    button.addEventListener("click", async () => {
      await adminFetch(`/api/rallies?id=${encodeURIComponent(button.dataset.deleteRally)}`, { method: "DELETE" });
      await syncAll();
    });
  });
}

async function adminFetch(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "content-type": "application/json",
        "x-admin-password": state.adminPassword,
        ...(options.headers || {}),
      },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "관리자 요청에 실패했습니다.");
    showNotice("");
    return data;
  } catch (error) {
    showNotice(error.message);
    throw error;
  }
}

function calculateTiming(rally, member) {
  const arrivalAt = new Date(new Date(rally.created_at).getTime() + (rally.rally_remaining_seconds + rally.enemy_march_seconds) * 1000);
  const departAt = new Date(arrivalAt.getTime() - member.march_seconds * 1000);
  const secondsUntilDepart = Math.ceil((departAt.getTime() - Date.now()) / 1000);

  if (secondsUntilDepart < 0) {
    return {
      arrivalAt,
      departAt,
      secondsUntilDepart,
      mainText: "이미 출발 필요",
      statusText: `${formatDuration(Math.abs(secondsUntilDepart))} 지남`,
      className: "status-late",
    };
  }

  if (secondsUntilDepart === 0) {
    return {
      arrivalAt,
      departAt,
      secondsUntilDepart,
      mainText: "지금 출발",
      statusText: "바로 주유하세요",
      className: "status-now",
    };
  }

  return {
    arrivalAt,
    departAt,
    secondsUntilDepart,
    mainText: formatDuration(secondsUntilDepart),
    statusText: secondsUntilDepart <= SOON_SECONDS ? "출발 임박" : "대기",
    className: secondsUntilDepart <= SOON_SECONDS ? "status-soon" : "status-ready",
  };
}

function maybeNotify(rally, member, result) {
  if (!state.soundEnabled || result.secondsUntilDepart < 0 || result.secondsUntilDepart > SOON_SECONDS) return;
  const key = `${rally.id}:${member.id}`;
  if (state.notified.has(key)) return;
  state.notified.add(key);
  beep(0.2);
}

function beep(duration = 0.12) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.value = 0.08;
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + duration);
}

function getActiveRallies() {
  return [...state.sharedRallies, ...state.localRallies]
    .filter((rally) => {
      const arrivalAt = new Date(new Date(rally.created_at).getTime() + (rally.rally_remaining_seconds + rally.enemy_march_seconds) * 1000);
      return Date.now() - arrivalAt.getTime() < 10 * 60 * 1000;
    })
    .sort((a, b) => {
      const aArrival = new Date(a.created_at).getTime() + (a.rally_remaining_seconds + a.enemy_march_seconds) * 1000;
      const bArrival = new Date(b.created_at).getTime() + (b.rally_remaining_seconds + b.enemy_march_seconds) * 1000;
      return aArrival - bArrival;
    });
}

function parseDuration(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);

  const parts = text.split(":").map((part) => part.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;

  const numbers = parts.map(Number);
  if (numbers.some((number) => !Number.isFinite(number) || number < 0)) return null;

  if (numbers.length === 2) return numbers[0] * 60 + numbers[1];
  return numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

function formatClock(date) {
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function cleanName(value, fallback) {
  return String(value || "").trim() || fallback;
}

function resetMemberForm() {
  els.memberId.value = "";
  els.memberForm.reset();
}

function resetSharedRallyForm() {
  els.sharedRallyId.value = "";
  els.sharedRallyForm.reset();
}

function readLocalRallies() {
  try {
    return JSON.parse(localStorage.getItem(storage.localRallies) || "[]");
  } catch {
    return [];
  }
}

function saveLocalRallies() {
  localStorage.setItem(storage.localRallies, JSON.stringify(state.localRallies));
}

function showNotice(message) {
  if (!message) {
    els.setupNotice.hidden = true;
    els.setupNotice.textContent = "";
    return;
  }
  els.setupNotice.hidden = false;
  els.setupNotice.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
