/**
 * LinkedIn Lead Scorer - UI Logic
 */

let analyzer = null;
let currentResults = [];
let sortColumn = 'score';
let sortDirection = 'desc';
let messagesFile = null;
let connectionsFile = null;
const selectedKeys = new Set();
let currentDetailKey = null;

const TAGS_STORAGE_KEY = 'li-lead-scorer-tags';

document.addEventListener('DOMContentLoaded', () => {
  initUpload();
  initSearch();
  initTableSort();
  initModal();
  initMethodology();
  initHintChips();
  initSelection();
  initTierToggles();
  initAdvancedFilters();
  initTagEditor();
});

// ─── TAGS (localStorage) ──────────────────────────────────

function loadAllTags() {
  try {
    return JSON.parse(localStorage.getItem(TAGS_STORAGE_KEY)) || {};
  } catch { return {}; }
}

function saveAllTags(tags) {
  localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(tags));
}

function getContactTags(key) {
  return loadAllTags()[key] || [];
}

function addContactTag(key, tag) {
  const tags = loadAllTags();
  if (!tags[key]) tags[key] = [];
  const normalized = tag.trim();
  if (normalized && !tags[key].includes(normalized)) {
    tags[key].push(normalized);
    saveAllTags(tags);
  }
}

function removeContactTag(key, tag) {
  const tags = loadAllTags();
  if (!tags[key]) return;
  tags[key] = tags[key].filter(t => t !== tag);
  if (tags[key].length === 0) delete tags[key];
  saveAllTags(tags);
}

// ─── UPLOAD ───────────────────────────────────────────────

function initUpload() {
  const messagesZone = document.getElementById('messages-zone');
  const connectionsZone = document.getElementById('connections-zone');
  const messagesInput = document.getElementById('messages-input');
  const connectionsInput = document.getElementById('connections-input');
  const analyzeBtn = document.getElementById('analyze-btn');

  setupDropZone(messagesZone, messagesInput, (file) => {
    messagesFile = file;
    document.getElementById('messages-file-name').textContent = file.name;
    messagesZone.classList.add('has-file');
    analyzeBtn.disabled = false;
  });

  setupDropZone(connectionsZone, connectionsInput, (file) => {
    connectionsFile = file;
    document.getElementById('connections-file-name').textContent = file.name;
    connectionsZone.classList.add('has-file');
  });

  analyzeBtn.addEventListener('click', runAnalysis);

  document.getElementById('reset-btn').addEventListener('click', () => {
    messagesFile = null;
    connectionsFile = null;
    analyzer = null;
    currentResults = [];
    selectedKeys.clear();
    document.getElementById('messages-file-name').textContent = '';
    document.getElementById('connections-file-name').textContent = '';
    document.getElementById('messages-zone').classList.remove('has-file');
    document.getElementById('connections-zone').classList.remove('has-file');
    document.getElementById('analyze-btn').disabled = true;
    document.getElementById('search-input').value = '';
    document.getElementById('min-messages').value = '0';
    document.getElementById('date-from').value = '';
    document.getElementById('upload-error').hidden = true;
    document.querySelectorAll('.tier-toggle').forEach(t => t.classList.add('active'));
    showView('upload');
  });
}

function setupDropZone(zone, input, onFile) {
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => {
    zone.classList.remove('drag-over');
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith('.csv')) {
      onFile(file);
    }
  });
  zone.addEventListener('click', (e) => {
    if (e.target === zone || e.target.closest('.upload-icon') || e.target.tagName === 'H3' || e.target.tagName === 'P') {
      input.click();
    }
  });
  input.addEventListener('change', () => {
    if (input.files[0]) onFile(input.files[0]);
  });
}

// ─── VIEWS ────────────────────────────────────────────────

function showView(name) {
  document.getElementById('upload-view').hidden = name !== 'upload';
  document.getElementById('loading-view').hidden = name !== 'loading';
  document.getElementById('results-view').hidden = name !== 'results';
}

// ─── ANALYSIS ─────────────────────────────────────────────

async function runAnalysis() {
  const errorEl = document.getElementById('upload-error');
  errorEl.hidden = true;
  showView('loading');

  const stages = document.querySelectorAll('.stage');
  stages.forEach((s) => s.classList.remove('active', 'completed'));

  try {
    analyzer = new LinkedInAnalyzer();

    await animateStage(stages[0], 400);
    const messagesText = await readFile(messagesFile);
    analyzer.parseMessages(messagesText);

    await animateStage(stages[1], 300);
    if (connectionsFile) {
      const connText = await readFile(connectionsFile);
      analyzer.parseConnections(connText);
    }

    await animateStage(stages[2], 500);
    analyzer.detectOwner();

    await animateStage(stages[3], 800);
    analyzer.groupByContact();
    analyzer.enrichFromConnections();
    analyzer.scoreAllContacts();

    await animateStage(stages[4], 400);
    analyzer.rankContacts();

    currentResults = analyzer.results;
    selectedKeys.clear();
    renderResults(currentResults);
    showView('results');
  } catch (err) {
    console.error(err);
    showView('upload');
    errorEl.textContent = err.message || 'Failed to analyze CSV. Check the file format.';
    errorEl.hidden = false;
  }
}

async function animateStage(el, duration) {
  el.classList.add('active');
  await delay(duration);
  el.classList.remove('active');
  el.classList.add('completed');
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// ─── TIER TOGGLES ─────────────────────────────────────────

function initTierToggles() {
  document.querySelectorAll('.tier-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      applyFilters();
    });
  });

  // Clickable stat cards toggle individual tiers
  document.querySelectorAll('.clickable-stat').forEach(card => {
    card.addEventListener('click', () => {
      const tier = card.dataset.tier;
      // Set only this tier active
      document.querySelectorAll('.tier-toggle').forEach(t => {
        t.classList.toggle('active', t.dataset.tier === tier);
      });
      applyFilters();
    });
  });
}

// ─── ADVANCED FILTERS ─────────────────────────────────────

function initAdvancedFilters() {
  document.getElementById('min-messages').addEventListener('change', () => applyFilters());
  document.getElementById('date-from').addEventListener('change', () => applyFilters());
}

// ─── RESULTS RENDERING ───────────────────────────────────

function renderResults(contacts) {
  updateSummary();
  renderTable(contacts);
}

function updateSummary() {
  const all = analyzer.results;
  document.getElementById('total-count').textContent = all.length;
  document.getElementById('hot-count').textContent = all.filter(c => c.tier === 'Hot').length;
  document.getElementById('warm-count').textContent = all.filter(c => c.tier === 'Warm').length;
  document.getElementById('cool-count').textContent = all.filter(c => c.tier === 'Cool').length;
  document.getElementById('owner-name').textContent = analyzer.owner || '—';
}

function renderTable(contacts) {
  const sorted = sortContacts(contacts);
  const tbody = document.getElementById('results-body');
  const allTags = loadAllTags();

  tbody.innerHTML = sorted
    .map((c, i) => {
      const key = c.name.toLowerCase();
      const checked = selectedKeys.has(key) ? 'checked' : '';
      const contactTags = allTags[key] || [];
      const tagChips = contactTags.map(t =>
        `<span class="tag-chip">${esc(t)}</span>`
      ).join('');

      return `
    <tr class="lead-row" data-key="${esc(key)}">
      <td class="check-col"><input type="checkbox" class="lead-check" ${checked}></td>
      <td>${i + 1}</td>
      <td>
        <div class="contact-name">
          ${c.profileUrl
            ? `<a href="${esc(c.profileUrl)}" target="_blank" rel="noopener">${esc(c.name)}</a>`
            : esc(c.name)}
        </div>
      </td>
      <td>${esc(c.title || '—')}</td>
      <td>${esc(c.company || '—')}</td>
      <td><span class="score-badge">${c.totalScore}</span></td>
      <td><span class="tier-badge tier-${c.tier.toLowerCase()}">${c.tier}</span></td>
      <td>${c.totalMessages}</td>
      <td>${c.lastMessageDate ? formatDate(c.lastMessageDate) : '—'}</td>
      <td class="tags-cell">${tagChips || '<span class="no-tags">—</span>'}</td>
      <td><button class="view-btn">View</button></td>
    </tr>`;
    })
    .join('');

  updateFooter(contacts);
  updateSelectionBar();
}

function updateFooter(contacts) {
  document.getElementById('showing-count').textContent =
    `Showing ${contacts.length} of ${analyzer.results.length} leads`;
}

function sortContacts(contacts) {
  const col = sortColumn;
  const dir = sortDirection === 'asc' ? 1 : -1;

  return [...contacts].sort((a, b) => {
    let va, vb;
    switch (col) {
      case 'name':
        va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break;
      case 'title':
        va = (a.title || '').toLowerCase(); vb = (b.title || '').toLowerCase(); break;
      case 'company':
        va = (a.company || '').toLowerCase(); vb = (b.company || '').toLowerCase(); break;
      case 'score':
        va = a.totalScore; vb = b.totalScore; break;
      case 'tier':
        const tierOrder = { Hot: 3, Warm: 2, Cool: 1, Cold: 0 };
        va = tierOrder[a.tier] || 0; vb = tierOrder[b.tier] || 0; break;
      case 'messages':
        va = a.totalMessages; vb = b.totalMessages; break;
      case 'lastContact':
        va = a.lastMessageDate ? a.lastMessageDate.getTime() : 0;
        vb = b.lastMessageDate ? b.lastMessageDate.getTime() : 0; break;
      default:
        va = a.totalScore; vb = b.totalScore;
    }
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

// ─── TABLE SORT ───────────────────────────────────────────

function initTableSort() {
  document.querySelectorAll('th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortColumn === col) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortColumn = col;
        sortDirection = col === 'name' || col === 'title' || col === 'company' ? 'asc' : 'desc';
      }
      document.querySelectorAll('th.sortable').forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
      th.classList.add(sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
      renderTable(currentResults);
    });
  });
}

// ─── SELECTION ────────────────────────────────────────────

function initSelection() {
  // Select all checkbox
  document.getElementById('select-all').addEventListener('change', (e) => {
    const checked = e.target.checked;
    document.querySelectorAll('.lead-check').forEach(cb => {
      cb.checked = checked;
      const key = cb.closest('tr').dataset.key;
      if (checked) selectedKeys.add(key); else selectedKeys.delete(key);
    });
    updateSelectionBar();
  });

  // Individual checkbox delegation
  document.getElementById('results-body').addEventListener('change', (e) => {
    if (!e.target.classList.contains('lead-check')) return;
    const key = e.target.closest('tr').dataset.key;
    if (e.target.checked) selectedKeys.add(key); else selectedKeys.delete(key);
    updateSelectionBar();
  });

  // Download selected
  document.getElementById('download-selected-btn').addEventListener('click', () => {
    downloadCSV(true);
  });

  // Clear selection
  document.getElementById('clear-selection-btn').addEventListener('click', () => {
    selectedKeys.clear();
    document.querySelectorAll('.lead-check').forEach(cb => cb.checked = false);
    document.getElementById('select-all').checked = false;
    updateSelectionBar();
  });
}

function updateSelectionBar() {
  const bar = document.getElementById('selection-bar');
  const count = selectedKeys.size;
  if (count > 0) {
    bar.hidden = false;
    document.getElementById('selection-count').textContent = `${count} selected`;
  } else {
    bar.hidden = true;
  }
  // Update main download button text
  const dlBtn = document.getElementById('download-btn');
  dlBtn.textContent = count > 0 ? `Download All (${analyzer ? analyzer.results.length : 0})` : 'Download CSV';
}

// ─── SEARCH & FILTER ──────────────────────────────────────

function initSearch() {
  const searchInput = document.getElementById('search-input');
  const downloadBtn = document.getElementById('download-btn');

  let debounceTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => applyFilters(), 200);
  });

  downloadBtn.addEventListener('click', () => downloadCSV(false));
}

function getActiveTiers() {
  const tiers = [];
  document.querySelectorAll('.tier-toggle.active').forEach(t => tiers.push(t.dataset.tier));
  return tiers;
}

function applyFilters() {
  if (!analyzer) return;

  const query = document.getElementById('search-input').value.trim();
  const activeTiers = getActiveTiers();
  const minMessages = parseInt(document.getElementById('min-messages').value) || 0;
  const dateFrom = document.getElementById('date-from').value;
  const dateFromObj = dateFrom ? new Date(dateFrom) : null;

  // Handle tag: prefix in search
  let filtered;
  if (query.startsWith('tag:')) {
    const tagTerm = query.slice(4).trim().toLowerCase();
    const allTags = loadAllTags();
    filtered = analyzer.results.filter(c => {
      const tags = allTags[c.name.toLowerCase()] || [];
      return tags.some(t => t.toLowerCase().includes(tagTerm));
    });
  } else {
    filtered = query ? analyzer.search(query) : analyzer.results;
  }

  // Tier filter
  if (activeTiers.length > 0 && activeTiers.length < 3) {
    filtered = filtered.filter(c => activeTiers.includes(c.tier));
  } else if (activeTiers.length === 0) {
    filtered = [];
  }

  // Min messages filter
  if (minMessages > 0) {
    filtered = filtered.filter(c => c.totalMessages >= minMessages);
  }

  // Date filter
  if (dateFromObj) {
    filtered = filtered.filter(c => c.lastMessageDate && c.lastMessageDate >= dateFromObj);
  }

  currentResults = filtered;
  renderTable(currentResults);
}

function initHintChips() {
  document.querySelectorAll('.hint-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('search-input').value = chip.dataset.query;
      applyFilters();
    });
  });
}

// ─── CSV DOWNLOAD ─────────────────────────────────────────

function downloadCSV(selectedOnly) {
  if (!analyzer) return;

  let data;
  if (selectedOnly && selectedKeys.size > 0) {
    data = currentResults.filter(c => selectedKeys.has(c.name.toLowerCase()));
  } else {
    data = currentResults;
  }

  const csv = analyzer.exportCSV(data, getContactTags);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `linkedin-leads-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── METHODOLOGY MODAL ───────────────────────────────────

function initMethodology() {
  const modal = document.getElementById('methodology-modal');
  document.getElementById('info-btn').addEventListener('click', () => {
    modal.hidden = false;
  });
  document.getElementById('methodology-close').addEventListener('click', () => {
    modal.hidden = true;
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });
}

// ─── TAG EDITOR (in detail modal) ─────────────────────────

function initTagEditor() {
  document.getElementById('detail-tag-add-btn').addEventListener('click', addTagFromInput);
  document.getElementById('detail-tag-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTagFromInput();
  });

  // Delegation for removing tags
  document.getElementById('detail-tags-list').addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.tag-remove');
    if (!removeBtn || !currentDetailKey) return;
    const tag = removeBtn.dataset.tag;
    removeContactTag(currentDetailKey, tag);
    renderDetailTags(currentDetailKey);
    renderTable(currentResults); // Refresh table tags
  });
}

function addTagFromInput() {
  if (!currentDetailKey) return;
  const input = document.getElementById('detail-tag-input');
  const tag = input.value.trim();
  if (!tag) return;
  addContactTag(currentDetailKey, tag);
  input.value = '';
  renderDetailTags(currentDetailKey);
  renderTable(currentResults);
}

function renderDetailTags(key) {
  const tags = getContactTags(key);
  const container = document.getElementById('detail-tags-list');
  container.innerHTML = tags.map(t =>
    `<span class="tag-chip editable">${esc(t)}<button class="tag-remove" data-tag="${esc(t)}">&times;</button></span>`
  ).join('') || '<span class="no-tags-msg">No tags yet</span>';
}

// ─── DETAIL MODAL ─────────────────────────────────────────

function initModal() {
  const modal = document.getElementById('detail-modal');
  const closeBtn = document.getElementById('modal-close');

  closeBtn.addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('detail-modal').hidden = true;
      document.getElementById('methodology-modal').hidden = true;
    }
  });

  // Event delegation for View buttons
  document.getElementById('results-body').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-btn');
    if (!btn) return;
    const row = btn.closest('tr');
    showDetail(row.dataset.key);
  });
}

function showDetail(contactKey) {
  const contact = analyzer.contacts.get(contactKey);
  if (!contact) return;
  currentDetailKey = contactKey;

  const modal = document.getElementById('detail-modal');

  document.getElementById('detail-name').textContent = contact.name;
  document.getElementById('detail-title').textContent = contact.title || '';
  document.getElementById('detail-company').textContent = contact.company || '';

  const linkedinLink = document.getElementById('detail-linkedin');
  if (contact.profileUrl) {
    linkedinLink.href = contact.profileUrl;
    linkedinLink.hidden = false;
  } else {
    linkedinLink.hidden = true;
  }

  // Tags
  renderDetailTags(contactKey);

  // Score
  document.getElementById('detail-total-score').textContent = contact.totalScore;
  const tierBadge = document.getElementById('detail-tier');
  tierBadge.textContent = contact.tier;
  tierBadge.className = `tier-badge tier-${contact.tier.toLowerCase()}`;

  const scores = contact.scores;
  setBar('bar-engagement', 'val-engagement', scores.engagement, 40);
  setBar('bar-recency', 'val-recency', scores.recency, 25);
  setBar('bar-title', 'val-title', scores.title, 20);
  setBar('bar-relevance', 'val-relevance', scores.relevance, 15);

  document.getElementById('detail-sent').textContent = contact.sentMessages.length;
  document.getElementById('detail-received').textContent = contact.receivedMessages.length;
  document.getElementById('detail-convos').textContent = contact.conversationIds.size;

  renderConversation(contact);
  modal.hidden = false;
}

function setBar(barId, valId, value, max) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const bar = document.getElementById(barId);
  const val = document.getElementById(valId);
  bar.style.width = '0%';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { bar.style.width = pct + '%'; });
  });
  val.textContent = `${Math.round(value)}/${max}`;
}

function renderConversation(contact) {
  const container = document.getElementById('conversation-list');
  const ownerLower = analyzer.owner.toLowerCase();

  const messages = [...contact.allMessages]
    .filter((m) => m.dateObj)
    .sort((a, b) => a.dateObj - b.dateObj);

  if (messages.length === 0) {
    container.innerHTML = '<p style="color:var(--text-secondary);font-size:13px;">No messages with timestamps found.</p>';
    return;
  }

  const displayMessages = messages.slice(-50);
  const skipped = messages.length - displayMessages.length;

  container.innerHTML =
    (skipped > 0
      ? `<p style="color:var(--text-secondary);font-size:12px;margin-bottom:8px;">${skipped} older messages not shown</p>`
      : '') +
    displayMessages
      .map((m) => {
        const isSent = m.from.toLowerCase() === ownerLower;
        const content = m.content || '';
        const truncated = content.length > 300;
        const displayContent = truncated ? content.substring(0, 300) + '...' : content;

        return `
        <div class="msg-bubble ${isSent ? 'sent' : 'received'}">
          <div class="msg-date">${m.dateObj ? formatDateTime(m.dateObj) : '—'} &middot; ${esc(m.from)}</div>
          <div class="msg-content">${esc(displayContent)}</div>
          ${truncated ? '<div class="msg-truncated" data-action="expand">Show more</div>' : ''}
        </div>`;
      })
      .join('');

  const bubbles = container.querySelectorAll('.msg-bubble');
  displayMessages.forEach((m, i) => {
    if (!bubbles[i]) return;
    const expandBtn = bubbles[i].querySelector('.msg-truncated');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        bubbles[i].querySelector('.msg-content').textContent = m.content || '';
        expandBtn.remove();
      });
    }
  });
}

// ─── UTILITIES ────────────────────────────────────────────

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function formatDate(date) {
  if (!date || isNaN(date.getTime())) return '—';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatDateTime(date) {
  if (!date || isNaN(date.getTime())) return '—';
  return formatDate(date) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
