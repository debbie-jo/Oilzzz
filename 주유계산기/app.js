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
  saveTimers: new Map(),
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
  memberReset: document.querySelector("#memberReset"),
  memberAdminList: document.querySelector("#memberAdminList"),
  sharedRallyForm: document.querySelector("#sharedRallyForm"),
  sharedRallyId: document.querySelector("#sharedRallyId"),
  sharedRallyName: document.querySelector("#sharedRallyName"),
  sharedRallyRemaining: document.querySelector("#sharedRallyRemaining"),
  sharedEnemyMarch: document.querySelector("#sharedEnemyMarch"),
  sharedRallyReset: document.querySelector("#sharedRallyReset"),
  karelRallyForm: document.querySelector("#karelRallyForm"),
  karelRallyName: document.querySelector("#karelRallyName"),
  karelPopTime: document.querySelector("#karelPopTime"),
  karelPopMarch: document.querySelector("#karelPopMarch"),
  bulkRallies: document.querySelector("#bulkRallies"),
  bulkRallyAdd: document.querySelector("#bulkRallyAdd"),
  clearSharedRallies: document.querySelector("#clearSharedRallies"),
  sharedRallyAdminList: document.querySelector("#sharedRallyAdminList"),
};

init();

function init() {
  els.adminPassword.value = state.adminPassword;
  els.adminTools.hidden = !state.adminPassword;
  els.adminLogin.hidden = Boolean(state.adminPassword);
  bindEvents();
  bindTimeInputs();
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

  els.soundButton.addEventListener("click", () => {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem(storage.sound, String(state.soundEnabled));
    if (state.soundEnabled) beep(0.04);
    renderSoundButton();
  });

  els.localRallyForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const rallyRemaining = parseDuration(els.localRallyRemaining.value);
    const enemyMarch = parseDuration(els.localEnemyMarch.value);
    if (rallyRemaining === null || enemyMarch === null) {
      showNotice("내 임시 집결 시간을 확인해주세요. 예: 5:00, 1:30");
      return;
    }
    state.localRallies.unshift({
      id: crypto.randomUUID(),
      name: cleanName(els.localRallyName.value, "데비 임시"),
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

  els.allTables.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy-rally]");
    if (!button) return;
    const rally = getActiveRallies().find((item) => item.id === button.dataset.copyRally);
    if (!rally) return;
    await copyText(buildRallyCopyText(rally));
    button.textContent = "복사됨";
    setTimeout(() => {
      button.textContent = "연맹 채팅 복사";
    }, 1200);
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
    await adminFetch("/api/members", {
      method: els.memberId.value ? "PUT" : "POST",
      body: JSON.stringify({
        id: els.memberId.value || undefined,
        name: cleanName(els.memberName.value, "데비"),
        march_seconds: marchSeconds,
        sort_order: getNextSortOrder(),
      }),
    });
    resetMemberForm();
    await syncAll();
    renderAdminLists();
  });

  els.memberReset.addEventListener("click", resetMemberForm);

  els.sharedRallyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const rallyRemaining = parseDuration(els.sharedRallyRemaining.value);
    const enemyMarch = parseDuration(els.sharedEnemyMarch.value);
    if (rallyRemaining === null || enemyMarch === null) {
      showNotice("솔라 집결 시간을 확인해주세요. 예: 5:00, 1:30");
      return;
    }
    await adminFetch("/api/rallies", {
      method: els.sharedRallyId.value ? "PUT" : "POST",
      body: JSON.stringify({
        id: els.sharedRallyId.value || undefined,
        name: withTypePrefix(cleanName(els.sharedRallyName.value, "데비 솔라"), "솔라"),
        rally_remaining_seconds: rallyRemaining,
        enemy_march_seconds: enemyMarch,
      }),
    });
    resetSharedRallyForm();
    await syncAll();
    renderAdminLists();
    els.sharedRallyName.focus();
  });

  els.sharedRallyReset.addEventListener("click", resetSharedRallyForm);

  els.karelRallyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const popSeconds = parseDuration(els.karelPopTime.value);
    const popMarchSeconds = parseDuration(els.karelPopMarch.value);
    if (popSeconds === null || popMarchSeconds === null) {
      showNotice("카랠 POP 집결시간과 POP 행군시간을 확인해주세요. 예: 5:00, 1:30");
      return;
    }
    await adminFetch("/api/rallies", {
      method: "POST",
      body: JSON.stringify({
        name: withTypePrefix(cleanName(els.karelRallyName.value, "데비 카랠"), "카랠"),
        rally_remaining_seconds: popSeconds,
        enemy_march_seconds: popMarchSeconds + 10,
      }),
    });
    resetKarelRallyForm();
    await syncAll();
    renderAdminLists();
    els.karelRallyName.focus();
  });

  els.bulkRallyAdd.addEventListener("click", async () => {
    const rallies = parseBulkRallies(els.bulkRallies.value);
    if (!rallies.length) {
      showNotice("여러 집결 입력을 확인해주세요. 예: 데비솔라 5:00 1:30");
      return;
    }
    for (const rally of rallies) {
      await adminFetch("/api/rallies", { method: "POST", body: JSON.stringify(rally) });
    }
    els.bulkRallies.value = "";
    await syncAll();
    renderAdminLists();
  });

  els.clearSharedRallies.addEventListener("click", async () => {
    if (!state.sharedRallies.length) return;
    if (!window.confirm("집결을 전부 삭제할까요?")) return;
    for (const rally of state.sharedRallies) {
      await adminFetch(`/api/rallies?id=${encodeURIComponent(rally.id)}`, { method: "DELETE" });
    }
    resetSharedRallyForm();
    await syncAll();
    renderAdminLists();
  });
}

function tick() {
  els.nowTime.textContent = formatClock(new Date());
  renderResults();
}

async function syncAll() {
  try {
    const [membersRes, ralliesRes] = await Promise.all([fetch("/api/members"), fetch("/api/rallies")]);
    const membersData = await membersRes.json();
    const ralliesData = await ralliesRes.json();
    if (!membersRes.ok) throw new Error(membersData.error || "멤버를 불러오지 못했습니다.");
    if (!ralliesRes.ok) throw new Error(ralliesData.error || "집결을 불러오지 못했습니다.");
    state.members = membersData.members || [];
    state.sharedRallies = ralliesData.rallies || [];
    els.syncStatus.textContent = `동기화 ${formatClock(new Date())} UTC`;
    showNotice("");
    render();
  } catch (error) {
    els.syncStatus.textContent = "동기화 확인 필요";
    showNotice(error.message);
    render();
  }
}

function render() {
  renderMemberSelect();
  renderSoundButton();
  renderResults();
  if (!isEditingAdmin()) renderAdminLists();
}

function renderMemberSelect() {
  const current = state.selectedMemberId;
  els.memberSelect.innerHTML = [
    `<option value="">닉네임 선택</option>`,
    ...state.members.map((member) => {
      const selected = member.id === current ? "selected" : "";
      return `<option value="${escapeHtml(member.id)}" ${selected}>${escapeHtml(member.name)} (${formatDuration(member.march_seconds)})</option>`;
    }),
  ].join("");
}

function renderSoundButton() {
  els.soundButton.textContent = state.soundEnabled ? "소리 알림 켜짐" : "소리 알림 켜기";
}

function renderResults() {
  els.nowTime.textContent = formatClock(new Date());
  const selectedMember = state.members.find((member) => member.id === state.selectedMemberId);
  const rallies = getActiveRallies();
  if (!selectedMember) {
    els.myCards.innerHTML = `<p class="empty">닉네임을 선택하세요.</p>`;
  } else if (!rallies.length) {
    els.myCards.innerHTML = `<p class="empty">집결을 추가하면 바로 계산됩니다.</p>`;
  } else {
    els.myCards.innerHTML = rallies.map((rally) => renderMyCard(rally, selectedMember)).join("");
  }
  if (!isEditingAdmin()) renderAllTables(rallies);
}

function renderMyCard(rally, member) {
  const result = calculateTiming(rally, member);
  maybeNotify(rally, member, result);
  const deleteButton = rally.local
    ? `<button class="small-button" type="button" data-delete-local="${escapeHtml(rally.id)}">임시 집결 삭제</button>`
    : "";
  return `
    <article class="rally-card ${result.className}">
      <h3>${escapeHtml(rally.name)}${rally.local ? " · 내 집결" : ""}</h3>
      <div class="countdown">${escapeHtml(result.mainText)}</div>
      <div class="meta">
        <span>${escapeHtml(result.statusText)}</span>
        <span>도착 ${formatClock(result.arrivalAt)} UTC · 내 행군 ${formatDuration(member.march_seconds)}</span>
        <span>출발 시각 ${formatClock(result.departAt)} UTC</span>
      </div>
      ${deleteButton}
    </article>`;
}

function renderAllTables(rallies) {
  if (!rallies.length || !state.members.length) {
    els.allTables.innerHTML = `<p class="empty">표시할 집결이나 멤버가 없습니다.</p>`;
    return;
  }
  els.allTables.innerHTML = rallies.map((rally) => {
    const rows = state.members.map((member) => {
      const result = calculateTiming(rally, member);
      return `<tr>
        <td>${escapeHtml(member.name)}</td>
        <td>${formatDuration(member.march_seconds)}</td>
        <td>${escapeHtml(result.mainText)}</td>
        <td>${formatClock(result.departAt)}</td>
        <td>${escapeHtml(result.statusText)}</td>
      </tr>`;
    }).join("");
    return `<section>
      <div class="rally-table-head">
        <h2>${escapeHtml(rally.name)}${rally.local ? " · 내 집결" : ""}</h2>
        <button class="ghost-button copy-button" type="button" data-copy-rally="${escapeHtml(rally.id)}">연맹 채팅 복사</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>닉네임</th><th>행군시간</th><th>출발까지</th><th>출발 시각</th><th>상태</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
  }).join("");
}

function renderAdminLists() {
  els.memberAdminList.innerHTML = state.members.length ? state.members.map((member) => `
    <div class="admin-row inline-edit-row">
      <input aria-label="닉네임" value="${escapeHtml(member.name)}" data-member-name="${escapeHtml(member.id)}" />
      <input aria-label="행군시간" value="${formatDuration(member.march_seconds)}" data-member-march="${escapeHtml(member.id)}" inputmode="numeric" />
      <button class="ghost-button" type="button" data-delete-member="${escapeHtml(member.id)}">삭제</button>
    </div>`).join("") : `<p class="empty">등록된 멤버가 없습니다.</p>`;

  els.sharedRallyAdminList.innerHTML = state.sharedRallies.length ? state.sharedRallies.map((rally) => `
    <div class="admin-row inline-edit-row rally-edit-row">
      <input aria-label="집결 이름" value="${escapeHtml(rally.name)}" data-rally-name="${escapeHtml(rally.id)}" />
      <input aria-label="집결 남은시간" value="${formatDuration(rally.rally_remaining_seconds)}" data-rally-remaining="${escapeHtml(rally.id)}" inputmode="numeric" />
      <input aria-label="행군시간" value="${formatDuration(rally.enemy_march_seconds)}" data-rally-enemy="${escapeHtml(rally.id)}" inputmode="numeric" />
      <button class="ghost-button" type="button" data-delete-rally="${escapeHtml(rally.id)}">삭제</button>
    </div>`).join("") : `<p class="empty">등록된 집결이 없습니다.</p>`;
  bindAdminListButtons();
}

function bindAdminListButtons() {
  document.querySelectorAll("[data-member-name], [data-member-march]").forEach((input) => {
    input.addEventListener("input", () => {
      if (input.dataset.memberMarch !== undefined) input.value = input.value.replace(/[^\d:]/g, "");
      scheduleMemberSave(input.dataset.memberName || input.dataset.memberMarch);
    });
    input.addEventListener("blur", () => {
      if (input.dataset.memberMarch !== undefined) input.value = autoFormatDuration(input.value) || input.value;
      scheduleMemberSave(input.dataset.memberName || input.dataset.memberMarch, 0);
    });
  });

  document.querySelectorAll("[data-delete-member]").forEach((button) => {
    button.addEventListener("click", async () => {
      await adminFetch(`/api/members?id=${encodeURIComponent(button.dataset.deleteMember)}`, { method: "DELETE" });
      await syncAll();
      renderAdminLists();
    });
  });

  document.querySelectorAll("[data-rally-name], [data-rally-remaining], [data-rally-enemy]").forEach((input) => {
    input.addEventListener("input", () => {
      if (input.dataset.rallyRemaining !== undefined || input.dataset.rallyEnemy !== undefined) {
        input.value = input.value.replace(/[^\d:]/g, "");
      }
      scheduleRallySave(input.dataset.rallyName || input.dataset.rallyRemaining || input.dataset.rallyEnemy);
    });
    input.addEventListener("blur", () => {
      if (input.dataset.rallyRemaining !== undefined || input.dataset.rallyEnemy !== undefined) {
        input.value = autoFormatDuration(input.value) || input.value;
      }
      scheduleRallySave(input.dataset.rallyName || input.dataset.rallyRemaining || input.dataset.rallyEnemy, 0);
    });
  });

  document.querySelectorAll("[data-delete-rally]").forEach((button) => {
    button.addEventListener("click", async () => {
      await adminFetch(`/api/rallies?id=${encodeURIComponent(button.dataset.deleteRally)}`, { method: "DELETE" });
      await syncAll();
      renderAdminLists();
    });
  });
}

function isEditingAdmin() {
  return Boolean(document.activeElement?.closest("#adminTools"));
}

function scheduleMemberSave(id, delay = 700) {
  clearTimeout(state.saveTimers.get(`member:${id}`));
  state.saveTimers.set(`member:${id}`, setTimeout(async () => {
    const nameInput = document.querySelector(`[data-member-name="${CSS.escape(id)}"]`);
    const marchInput = document.querySelector(`[data-member-march="${CSS.escape(id)}"]`);
    const original = state.members.find((member) => member.id === id);
    if (!nameInput || !marchInput || !original) return;
    const marchSeconds = parseDuration(marchInput.value);
    if (marchSeconds === null) return;
    await adminFetch("/api/members", {
      method: "PUT",
      body: JSON.stringify({
        id,
        name: cleanName(nameInput.value, "데비"),
        march_seconds: marchSeconds,
        sort_order: original.sort_order || 0,
      }),
    });
    original.name = cleanName(nameInput.value, "데비");
    original.march_seconds = marchSeconds;
    renderMemberSelect();
    renderResults();
  }, delay));
}

function scheduleRallySave(id, delay = 700) {
  clearTimeout(state.saveTimers.get(`rally:${id}`));
  state.saveTimers.set(`rally:${id}`, setTimeout(async () => {
    const nameInput = document.querySelector(`[data-rally-name="${CSS.escape(id)}"]`);
    const remainingInput = document.querySelector(`[data-rally-remaining="${CSS.escape(id)}"]`);
    const enemyInput = document.querySelector(`[data-rally-enemy="${CSS.escape(id)}"]`);
    const original = state.sharedRallies.find((rally) => rally.id === id);
    if (!nameInput || !remainingInput || !enemyInput || !original) return;
    const rallyRemaining = parseDuration(remainingInput.value);
    const enemyMarch = parseDuration(enemyInput.value);
    if (rallyRemaining === null || enemyMarch === null) return;
    await adminFetch("/api/rallies", {
      method: "PUT",
      body: JSON.stringify({
        id,
        name: cleanName(nameInput.value, "데비 집결"),
        rally_remaining_seconds: rallyRemaining,
        enemy_march_seconds: enemyMarch,
      }),
    });
    original.name = cleanName(nameInput.value, "데비 집결");
    original.rally_remaining_seconds = rallyRemaining;
    original.enemy_march_seconds = enemyMarch;
    original.created_at = new Date().toISOString();
    renderResults();
  }, delay));
}

async function adminFetch(url, options = {}) {
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
}

function calculateTiming(rally, member) {
  const arrivalAt = new Date(new Date(rally.created_at).getTime() + (rally.rally_remaining_seconds + rally.enemy_march_seconds) * 1000);
  const departAt = new Date(arrivalAt.getTime() - member.march_seconds * 1000);
  const secondsUntilDepart = Math.ceil((departAt.getTime() - Date.now()) / 1000);
  if (secondsUntilDepart < 0) {
    return { arrivalAt, departAt, secondsUntilDepart, mainText: "이미 출발 필요", statusText: `${formatDuration(Math.abs(secondsUntilDepart))} 지남`, className: "status-late" };
  }
  if (secondsUntilDepart === 0) {
    return { arrivalAt, departAt, secondsUntilDepart, mainText: "지금 출발", statusText: "바로 주유하세요", className: "status-now" };
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
  if (!state.soundEnabled || result.secondsUntilDepart < 0 || result.secondsUntilDepart > 5) return;
  const key = `${rally.id}:${member.id}:${result.secondsUntilDepart}`;
  if (state.notified.has(key)) return;
  state.notified.add(key);
  speakCountdown(result.secondsUntilDepart);
}

function beep(duration = 0.1) {
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

function speakCountdown(seconds) {
  if ("speechSynthesis" in window && seconds > 0) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(seconds));
    utterance.lang = "ko-KR";
    utterance.rate = 1.1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
    return;
  }
  beep(0.14);
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
  if (/^\d{3,6}$/.test(text)) {
    const padded = text.padStart(text.length <= 4 ? 4 : 6, "0");
    if (padded.length === 4) return Number(padded.slice(0, 2)) * 60 + Number(padded.slice(2));
    return Number(padded.slice(0, 2)) * 3600 + Number(padded.slice(2, 4)) * 60 + Number(padded.slice(4));
  }
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

function withTypePrefix(name, type) {
  const clean = name.replace(/^\[(솔라|카랠)\]\s*/, "");
  return `[${type}] ${clean}`;
}

function bindTimeInputs() {
  document.querySelectorAll(".time-input, #localRallyRemaining, #localEnemyMarch, #memberMarch, #sharedRallyRemaining, #sharedEnemyMarch, #karelPopTime, #karelPopMarch").forEach((input) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/[^\d:]/g, "");
    });
    input.addEventListener("blur", () => {
      const formatted = autoFormatDuration(input.value);
      if (formatted) input.value = formatted;
    });
  });
}

function autoFormatDuration(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.includes(":")) {
    const seconds = parseDuration(text);
    return seconds === null ? text : formatDuration(seconds);
  }
  if (!/^\d+$/.test(text)) return text;
  if (text.length <= 2) return formatDuration(Number(text));
  const padded = text.padStart(text.length <= 4 ? 4 : 6, "0");
  if (padded.length === 4) return `${Number(padded.slice(0, 2))}:${pad(Number(padded.slice(2)))}`;
  return `${Number(padded.slice(0, 2))}:${pad(Number(padded.slice(2, 4)))}:${pad(Number(padded.slice(4)))}`;
}

function parseBulkRallies(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      if (parts.length < 3) return null;
      const enemyMarchText = parts.pop();
      const rallyRemainingText = parts.pop();
      const name = withTypePrefix(parts.join(" "), "솔라");
      const rallyRemaining = parseDuration(rallyRemainingText);
      const enemyMarch = parseDuration(enemyMarchText);
      if (!name || rallyRemaining === null || enemyMarch === null) return null;
      return { name, rally_remaining_seconds: rallyRemaining, enemy_march_seconds: enemyMarch };
    })
    .filter(Boolean);
}

function buildRallyCopyText(rally) {
  const lines = [`[${rally.name}] 출발시간 UTC`];
  state.members.forEach((member) => {
    const result = calculateTiming(rally, member);
    lines.push(`${member.name} ${formatDepartureForChat(result)}`);
  });
  return lines.join("\n");
}

function formatDepartureForChat(result) {
  if (result.secondsUntilDepart < 0) return "이미 출발";
  return `${formatClock(result.departAt)} UTC`;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function getNextSortOrder() {
  const currentId = els.memberId.value;
  const existing = state.members.find((member) => member.id === currentId);
  if (existing) return existing.sort_order || 0;
  return state.members.length ? Math.max(...state.members.map((member) => member.sort_order || 0)) + 1 : 0;
}

function resetMemberForm() {
  els.memberId.value = "";
  els.memberName.value = "";
  els.memberMarch.value = "";
}

function resetSharedRallyForm() {
  els.sharedRallyId.value = "";
  els.sharedRallyName.value = "";
  els.sharedRallyRemaining.value = "";
  els.sharedEnemyMarch.value = "";
}

function resetKarelRallyForm() {
  els.karelRallyName.value = "";
  els.karelPopTime.value = "";
  els.karelPopMarch.value = "";
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
