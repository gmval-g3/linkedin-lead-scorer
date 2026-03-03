/**
 * LinkedIn Lead Scorer - UI Logic
 */

let analyzer = null;
let currentResults = [];
let sortColumn = 'score';
let sortDirection = 'desc';
let messagesFile = null;
let connectionsFile = null;

document.addEventListener('DOMContentLoaded', () => {
  initUpload();
  initSearch();
  initTableSort();
  initModal();
  initHintChips();
});

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
    document.getElementById('messages-file-name').textContent = '';
    document.getElementById('connections-file-name').textContent = '';
    document.getElementById('messages-zone').classList.remove('has-file');
    document.getElementById('connections-zone').classList.remove('has-file');
    document.getElementById('analyze-btn').disabled = true;
    document.getElementById('search-input').value = '';
    document.getElementById('tier-filter').value = 'all';
    document.getElementById('upload-error').hidden = true;
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
  // Also allow clicking the zone itself (not just the button)
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

  // Reset stage classes
  const stages = document.querySelectorAll('.stage');
  stages.forEach((s) => s.classList.remove('active', 'completed'));

  try {
    analyzer = new LinkedInAnalyzer();

    // Stage 0: Parse messages
    await animateStage(stages[0], 400);
    const messagesText = await readFile(messagesFile);
    const msgCount = analyzer.parseMessages(messagesText);

    // Stage 1: Parse connections
    await animateStage(stages[1], 300);
    if (connectionsFile) {
      const connText = await readFile(connectionsFile);
      analyzer.parseConnections(connText);
    }

    // Stage 2: Identify contacts
    await animateStage(stages[2], 500);
    analyzer.detectOwner();

    // Stage 3: Analyze engagement
    await animateStage(stages[3], 800);
    analyzer.groupByContact();
    analyzer.enrichFromConnections();
    analyzer.scoreAllContacts();

    // Stage 4: Rank
    await animateStage(stages[4], 400);
    analyzer.rankContacts();

    currentResults = analyzer.results;
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

// ─── RESULTS RENDERING ───────────────────────────────────

function renderResults(contacts) {
  updateSummary();
  renderTable(contacts);
  document.getElementById('showing-count').textContent =
    `Showing ${contacts.length} of ${analyzer.results.length} leads`;
}

function updateSummary() {
  const all = analyzer.results;
  document.getElementById('total-count').textContent = all.length;
  document.getElementById('hot-count').textContent = all.filter(
    (c) => c.tier === 'Hot'
  ).length;
  document.getElementById('warm-count').textContent = all.filter(
    (c) => c.tier === 'Warm'
  ).length;
  document.getElementById('cool-count').textContent = all.filter(
    (c) => c.tier === 'Cool'
  ).length;
  document.getElementById('owner-name').textContent = analyzer.owner || '—';
}

function renderTable(contacts) {
  const sorted = sortContacts(contacts);
  const tbody = document.getElementById('results-body');

  tbody.innerHTML = sorted
    .map(
      (c, i) => `
    <tr class="lead-row" data-key="${esc(c.name.toLowerCase())}">
      <td>${i + 1}</td>
      <td>
        <div class="contact-name">
          ${
            c.profileUrl
              ? `<a href="${esc(c.profileUrl)}" target="_blank" rel="noopener">${esc(c.name)}</a>`
              : esc(c.name)
          }
        </div>
      </td>
      <td>${esc(c.title || '—')}</td>
      <td>${esc(c.company || '—')}</td>
      <td><span class="score-badge">${c.totalScore}</span></td>
      <td><span class="tier-badge tier-${c.tier.toLowerCase()}">${c.tier}</span></td>
      <td>${c.totalMessages}</td>
      <td>${c.lastMessageDate ? formatDate(c.lastMessageDate) : '—'}</td>
      <td><button class="view-btn">View</button></td>
    </tr>`
    )
    .join('');

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
        va = a.name.toLowerCase();
        vb = b.name.toLowerCase();
        break;
      case 'title':
        va = (a.title || '').toLowerCase();
        vb = (b.title || '').toLowerCase();
        break;
      case 'company':
        va = (a.company || '').toLowerCase();
        vb = (b.company || '').toLowerCase();
        break;
      case 'score':
        va = a.totalScore;
        vb = b.totalScore;
        break;
      case 'tier':
        const tierOrder = { Hot: 3, Warm: 2, Cool: 1, Cold: 0 };
        va = tierOrder[a.tier] || 0;
        vb = tierOrder[b.tier] || 0;
        break;
      case 'messages':
        va = a.totalMessages;
        vb = b.totalMessages;
        break;
      case 'lastContact':
        va = a.lastMessageDate ? a.lastMessageDate.getTime() : 0;
        vb = b.lastMessageDate ? b.lastMessageDate.getTime() : 0;
        break;
      default:
        va = a.totalScore;
        vb = b.totalScore;
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

      // Update header classes
      document.querySelectorAll('th.sortable').forEach((h) => {
        h.classList.remove('sorted-asc', 'sorted-desc');
      });
      th.classList.add(sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');

      renderTable(currentResults);
    });
  });
}

// ─── SEARCH & FILTER ──────────────────────────────────────

function initSearch() {
  const searchInput = document.getElementById('search-input');
  const tierFilter = document.getElementById('tier-filter');
  const downloadBtn = document.getElementById('download-btn');

  let debounceTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => applyFilters(), 200);
  });

  tierFilter.addEventListener('change', () => applyFilters());

  downloadBtn.addEventListener('click', downloadCSV);
}

function applyFilters() {
  if (!analyzer) return;

  const query = document.getElementById('search-input').value.trim();
  const tier = document.getElementById('tier-filter').value;

  let filtered = query ? analyzer.search(query) : analyzer.results;

  if (tier !== 'all') {
    filtered = filtered.filter((c) => c.tier === tier);
  }

  currentResults = filtered;
  renderTable(currentResults);
}

function initHintChips() {
  document.querySelectorAll('.hint-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const query = chip.dataset.query;
      const searchInput = document.getElementById('search-input');

      // Handle tier-based queries via the dropdown
      if (query.startsWith('tier:')) {
        const tier = query.split(':')[1];
        document.getElementById('tier-filter').value = tier;
        searchInput.value = '';
      } else {
        document.getElementById('tier-filter').value = 'all';
        searchInput.value = query;
      }
      applyFilters();
    });
  });
}

// ─── CSV DOWNLOAD ─────────────────────────────────────────

function downloadCSV() {
  if (!analyzer) return;

  const csv = analyzer.exportCSV(currentResults);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `linkedin-leads-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── DETAIL MODAL ─────────────────────────────────────────

function initModal() {
  const modal = document.getElementById('detail-modal');
  const closeBtn = document.getElementById('modal-close');

  closeBtn.addEventListener('click', () => {
    modal.hidden = true;
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) modal.hidden = true;
  });

  // Event delegation for View buttons
  document.getElementById('results-body').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-btn');
    if (!btn) return;
    const row = btn.closest('tr');
    const key = row.dataset.key;
    showDetail(key);
  });
}

function showDetail(contactKey) {
  const contact = analyzer.contacts.get(contactKey);
  if (!contact) return;

  const modal = document.getElementById('detail-modal');

  // Header
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

  // Score
  document.getElementById('detail-total-score').textContent = contact.totalScore;
  const tierBadge = document.getElementById('detail-tier');
  tierBadge.textContent = contact.tier;
  tierBadge.className = `tier-badge tier-${contact.tier.toLowerCase()}`;

  // Score bars
  const scores = contact.scores;
  setBar('bar-engagement', 'val-engagement', scores.engagement, 40);
  setBar('bar-recency', 'val-recency', scores.recency, 25);
  setBar('bar-title', 'val-title', scores.title, 20);
  setBar('bar-relevance', 'val-relevance', scores.relevance, 15);

  // Stats
  document.getElementById('detail-sent').textContent = contact.sentMessages.length;
  document.getElementById('detail-received').textContent = contact.receivedMessages.length;
  document.getElementById('detail-convos').textContent = contact.conversationIds.size;

  // Conversation history
  renderConversation(contact);

  modal.hidden = false;
}

function setBar(barId, valId, value, max) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const bar = document.getElementById(barId);
  const val = document.getElementById(valId);

  // Animate from 0
  bar.style.width = '0%';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      bar.style.width = pct + '%';
    });
  });

  val.textContent = `${Math.round(value)}/${max}`;
}

function renderConversation(contact) {
  const container = document.getElementById('conversation-list');
  const ownerLower = analyzer.owner.toLowerCase();

  // Sort messages chronologically
  const messages = [...contact.allMessages]
    .filter((m) => m.dateObj)
    .sort((a, b) => a.dateObj - b.dateObj);

  if (messages.length === 0) {
    container.innerHTML = '<p style="color:var(--text-secondary);font-size:13px;">No messages with timestamps found.</p>';
    return;
  }

  // Limit display to last 50 messages
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
        const displayContent = truncated
          ? content.substring(0, 300) + '...'
          : content;

        return `
        <div class="msg-bubble ${isSent ? 'sent' : 'received'}">
          <div class="msg-date">${m.dateObj ? formatDateTime(m.dateObj) : '—'} &middot; ${esc(m.from)}</div>
          <div class="msg-content">${esc(displayContent)}</div>
          ${truncated ? '<div class="msg-truncated" data-action="expand">Show more</div>' : ''}
        </div>`;
      })
      .join('');

  // Store full content and wire up expand buttons
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
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatDateTime(date) {
  if (!date || isNaN(date.getTime())) return '—';
  return formatDate(date) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
