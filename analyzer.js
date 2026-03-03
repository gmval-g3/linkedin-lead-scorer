/**
 * LinkedIn Lead Scorer - Analysis Engine
 * Parses LinkedIn message exports, scores contacts, and ranks leads.
 */

const TITLE_PATTERNS = [
  { pattern: 'chief executive officer', score: 20 },
  { pattern: 'chief technology officer', score: 20 },
  { pattern: 'chief financial officer', score: 20 },
  { pattern: 'chief operating officer', score: 20 },
  { pattern: 'chief information officer', score: 20 },
  { pattern: 'chief marketing officer', score: 20 },
  { pattern: 'chief revenue officer', score: 20 },
  { pattern: 'chief digital officer', score: 20 },
  { pattern: 'chief data officer', score: 20 },
  { pattern: 'chief people officer', score: 20 },
  { pattern: 'chief human resources', score: 20 },
  { pattern: 'ceo', score: 20 },
  { pattern: 'cto', score: 20 },
  { pattern: 'cfo', score: 20 },
  { pattern: 'coo', score: 20 },
  { pattern: 'cio', score: 20 },
  { pattern: 'cmo', score: 20 },
  { pattern: 'cro', score: 20 },
  { pattern: 'cdo', score: 20 },
  { pattern: 'founder', score: 20 },
  { pattern: 'co-founder', score: 20 },
  { pattern: 'cofounder', score: 20 },
  { pattern: 'owner', score: 18 },
  { pattern: 'president', score: 18 },
  { pattern: 'managing director', score: 18 },
  { pattern: 'executive vice president', score: 18 },
  { pattern: 'senior vice president', score: 18 },
  { pattern: 'vice president', score: 17 },
  { pattern: 'svp', score: 18 },
  { pattern: 'evp', score: 18 },
  { pattern: 'avp', score: 15 },
  { pattern: 'vp ', score: 17 },
  { pattern: 'managing partner', score: 16 },
  { pattern: 'partner', score: 16 },
  { pattern: 'principal', score: 15 },
  { pattern: 'senior director', score: 15 },
  { pattern: 'global director', score: 15 },
  { pattern: 'executive director', score: 16 },
  { pattern: 'director', score: 14 },
  { pattern: 'global head', score: 13 },
  { pattern: 'head of', score: 13 },
  { pattern: 'practice lead', score: 12 },
  { pattern: 'team lead', score: 10 },
  { pattern: 'senior manager', score: 10 },
  { pattern: 'general manager', score: 10 },
  { pattern: 'program director', score: 14 },
  { pattern: 'program manager', score: 9 },
  { pattern: 'project manager', score: 8 },
  { pattern: 'engagement manager', score: 9 },
  { pattern: 'manager', score: 8 },
  { pattern: 'senior consultant', score: 6 },
  { pattern: 'consultant', score: 5 },
  { pattern: 'senior advisor', score: 7 },
  { pattern: 'advisor', score: 6 },
  { pattern: 'strategist', score: 6 },
  { pattern: 'architect', score: 5 },
  { pattern: 'engineer', score: 4 },
  { pattern: 'senior analyst', score: 4 },
  { pattern: 'analyst', score: 3 },
];

const RELEVANCE_KEYWORDS = [
  { term: 'artificial intelligence', weight: 3 },
  { term: 'machine learning', weight: 3 },
  { term: 'operating model', weight: 4 },
  { term: 'digital transformation', weight: 3 },
  { term: 'change management', weight: 3 },
  { term: 'process improvement', weight: 3 },
  { term: 'organizational design', weight: 3 },
  { term: 'business transformation', weight: 3 },
  { term: 'operational excellence', weight: 3 },
  { term: 'automation', weight: 2 },
  { term: 'consulting', weight: 2 },
  { term: 'workflow', weight: 2 },
  { term: 'efficiency', weight: 1 },
  { term: 'innovation', weight: 1 },
  { term: 'implementation', weight: 1 },
  { term: 'integration', weight: 1 },
  { term: 'strategy', weight: 1 },
  { term: 'enterprise', weight: 1 },
  { term: 'operations', weight: 1 },
  { term: 'analytics', weight: 1 },
  { term: 'data', weight: 1 },
  { term: 'cloud', weight: 1 },
  { term: 'platform', weight: 1 },
  { term: 'infrastructure', weight: 1 },
  { term: 'systems', weight: 1 },
  { term: ' ai ', weight: 2 },
  { term: 'genai', weight: 3 },
  { term: 'gen ai', weight: 3 },
  { term: 'generative ai', weight: 3 },
  { term: 'llm', weight: 2 },
  { term: 'chatgpt', weight: 2 },
  { term: 'copilot', weight: 2 },
];

class LinkedInAnalyzer {
  constructor() {
    this.rawMessages = [];
    this.connections = new Map();
    this.owner = null;
    this.contacts = new Map();
    this.results = [];
  }

  normalizeColumns(headers) {
    const mapping = {};
    const normalizers = {
      from: ['from', 'sender', 'sender name'],
      to: ['to', 'recipient', 'recipients'],
      date: ['date', 'sent', 'sent date', 'timestamp', 'date sent'],
      content: ['content', 'message', 'body', 'text', 'message body'],
      subject: ['subject'],
      conversationId: ['conversation id', 'conversationid', 'conversation_id', 'thread id'],
      conversationTitle: ['conversation title', 'conversation_title', 'thread title'],
      senderUrl: ['sender profile url', 'sender_profile_url', 'profile url', 'sender url', 'linkedin url'],
      folder: ['folder'],
    };

    for (const header of headers) {
      const lower = header.toLowerCase().trim();
      for (const [standard, variants] of Object.entries(normalizers)) {
        if (variants.includes(lower)) {
          mapping[header] = standard;
          break;
        }
      }
    }
    return mapping;
  }

  parseMessages(csvText) {
    const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });

    if (!result.meta.fields || result.meta.fields.length === 0) {
      throw new Error('Could not parse CSV headers. Please check the file format.');
    }

    const colMap = this.normalizeColumns(result.meta.fields);

    // Verify we have minimum required columns
    const mappedFields = new Set(Object.values(colMap));
    if (!mappedFields.has('from') || !mappedFields.has('content')) {
      throw new Error(
        'CSV is missing required columns. Expected at least "FROM" and "CONTENT" columns. Found: ' +
        result.meta.fields.join(', ')
      );
    }

    this.rawMessages = result.data
      .map((row) => {
        const normalized = {};
        for (const [original, standard] of Object.entries(colMap)) {
          normalized[standard] = (row[original] || '').trim();
        }
        normalized.dateObj = normalized.date ? new Date(normalized.date) : null;
        if (normalized.dateObj && isNaN(normalized.dateObj.getTime())) {
          normalized.dateObj = null;
        }
        return normalized;
      })
      .filter((m) => m.from);

    return this.rawMessages.length;
  }

  parseConnections(csvText) {
    const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });

    for (const row of result.data) {
      const firstName = (row['First Name'] || '').trim();
      const lastName = (row['Last Name'] || '').trim();
      const name = `${firstName} ${lastName}`.trim();
      if (name) {
        this.connections.set(name.toLowerCase(), {
          name,
          title: (row['Position'] || row['Title'] || '').trim(),
          company: (row['Company'] || row['Organization'] || '').trim(),
          email: (row['Email Address'] || row['Email'] || '').trim(),
          url: (row['URL'] || row['Profile URL'] || '').trim(),
          connectedOn: row['Connected On'] || '',
        });
      }
    }
    return this.connections.size;
  }

  detectOwner() {
    // The owner appears in the most unique conversations
    const conversationCounts = new Map();

    for (const msg of this.rawMessages) {
      const convId = msg.conversationId || msg.conversationTitle || 'unknown';
      const name = msg.from;
      if (!conversationCounts.has(name)) {
        conversationCounts.set(name, new Set());
      }
      conversationCounts.get(name).add(convId);
    }

    let maxConvs = 0;
    let ownerName = '';
    for (const [name, convs] of conversationCounts) {
      if (convs.size > maxConvs) {
        maxConvs = convs.size;
        ownerName = name;
      }
    }

    this.owner = ownerName;
    return ownerName;
  }

  analyze() {
    this.detectOwner();
    this.groupByContact();
    this.enrichFromConnections();
    this.scoreAllContacts();
    this.rankContacts();
    return this.results;
  }

  groupByContact() {
    const ownerLower = this.owner.toLowerCase();

    for (const msg of this.rawMessages) {
      const fromName = msg.from;
      const fromLower = fromName.toLowerCase();

      if (fromLower === ownerLower) {
        // Message FROM owner TO contact(s)
        const recipients = this.parseRecipients(msg.to);
        for (const recipName of recipients) {
          if (recipName.toLowerCase() !== ownerLower) {
            this.addMessageToContact(recipName, msg, 'sent', null);
          }
        }
      } else {
        // Message FROM contact TO owner
        this.addMessageToContact(fromName, msg, 'received', msg.senderUrl);
      }
    }
  }

  parseRecipients(toField) {
    if (!toField) return [];
    return toField
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  addMessageToContact(name, msg, direction, profileUrl) {
    const key = name.toLowerCase();

    if (!this.contacts.has(key)) {
      this.contacts.set(key, {
        name: name,
        profileUrl: profileUrl || '',
        title: '',
        company: '',
        email: '',
        sentMessages: [],
        receivedMessages: [],
        allMessages: [],
        conversationIds: new Set(),
      });
    }

    const contact = this.contacts.get(key);

    if (profileUrl && !contact.profileUrl) {
      contact.profileUrl = profileUrl;
    }

    if (direction === 'sent') {
      contact.sentMessages.push(msg);
    } else {
      contact.receivedMessages.push(msg);
    }
    contact.allMessages.push(msg);
    if (msg.conversationId) {
      contact.conversationIds.add(msg.conversationId);
    }
  }

  enrichFromConnections() {
    for (const [key, contact] of this.contacts) {
      const connData = this.connections.get(key);
      if (connData) {
        contact.title = connData.title || contact.title;
        contact.company = connData.company || contact.company;
        contact.email = connData.email || contact.email;
        if (connData.url && !contact.profileUrl) {
          contact.profileUrl = connData.url;
        }
      }

      // Title/company only populated via Connections CSV enrichment
      // Message-based extraction disabled (too many false positives)
    }
  }

  extractTitleFromMessages(contact) {
    const allText = contact.receivedMessages
      .map((m) => m.content || '')
      .join(' ');

    const patterns = [
      /(?:I(?:'m| am) (?:a |the )?)((?:CEO|CTO|CFO|COO|VP|Director|Manager|Head|Partner|Founder|Principal|Consultant|Engineer|Analyst|Advisor|Strategist)[\w\s]*?)(?:\s+at\s+|\s+with\s+|\s+for\s+|[.,!])/i,
      /(?:my role (?:as|is) (?:a |the )?)([\w\s]+?)(?:\s+at\s+|\s+with\s+|[.,!])/i,
    ];

    for (const pattern of patterns) {
      const match = allText.match(pattern);
      if (match) return match[1].trim();
    }
    return '';
  }

  extractCompanyFromMessages(contact) {
    const allText = contact.receivedMessages
      .map((m) => m.content || '')
      .join(' ');

    const patterns = [
      /(?:at|with|from|work(?:ing)? (?:at|for)) ([A-Z][\w&.\- ]{1,40}?)(?:[.,!?\s]|$)/,
    ];

    for (const pattern of patterns) {
      const match = allText.match(pattern);
      if (match) return match[1].trim();
    }
    return '';
  }

  scoreAllContacts() {
    const now = new Date();

    for (const [key, contact] of this.contacts) {
      const scores = {
        engagement: this.calcEngagementScore(contact),
        recency: this.calcRecencyScore(contact, now),
        title: this.calcTitleScore(contact),
        relevance: this.calcRelevanceScore(contact),
        penalty: this.calcPenalty(contact),
      };

      const raw =
        scores.engagement +
        scores.recency +
        scores.title +
        scores.relevance +
        scores.penalty;
      const totalScore = Math.max(0, Math.min(100, raw));

      let tier;
      if (totalScore >= 70) tier = 'Hot';
      else if (totalScore >= 50) tier = 'Warm';
      else if (totalScore >= 30) tier = 'Cool';
      else tier = 'Cold';

      contact.scores = scores;
      contact.totalScore = Math.round(totalScore);
      contact.tier = tier;
      contact.totalMessages =
        contact.sentMessages.length + contact.receivedMessages.length;
      contact.lastMessageDate = this.getLastMessageDate(contact);
    }
  }

  calcEngagementScore(contact) {
    const sent = contact.sentMessages.length;
    const received = contact.receivedMessages.length;
    const total = sent + received;
    if (total === 0) return 0;

    const hasBidirectional = sent > 0 && received > 0;

    // Volume: log scale, max 15
    const volumeScore = Math.min(15, Math.log2(total + 1) * 3.5);

    // Balance: 50/50 split is ideal, max 10
    let balanceScore = 0;
    if (hasBidirectional) {
      const ratio = Math.min(sent, received) / Math.max(sent, received);
      balanceScore = ratio * 10;
    }

    // Conversation count bonus, max 8
    const convScore = Math.min(8, contact.conversationIds.size * 2.5);

    // Bidirectional depth bonus, max 7
    let depthScore = 0;
    if (hasBidirectional) {
      depthScore = Math.min(
        7,
        Math.log2(Math.min(sent, received) + 1) * 3
      );
    }

    return Math.min(40, volumeScore + balanceScore + convScore + depthScore);
  }

  calcRecencyScore(contact, now) {
    const lastDate = this.getLastMessageDate(contact);
    if (!lastDate) return 0;

    const daysSince = (now - lastDate) / (1000 * 60 * 60 * 24);

    if (daysSince <= 30) return 25;
    if (daysSince <= 60) return 22;
    if (daysSince <= 90) return 19;
    if (daysSince <= 180) return 14;
    if (daysSince <= 365) return 9;
    if (daysSince <= 730) return 5;
    return 2;
  }

  getLastMessageDate(contact) {
    const dates = contact.allMessages
      .map((m) => m.dateObj)
      .filter((d) => d && !isNaN(d.getTime()));
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates));
  }

  calcTitleScore(contact) {
    const title = (contact.title || '').toLowerCase();
    if (!title) return 2;

    for (const { pattern, score } of TITLE_PATTERNS) {
      if (title.includes(pattern)) {
        return score;
      }
    }

    return 2;
  }

  calcRelevanceScore(contact) {
    const allText = contact.allMessages
      .map((m) => (' ' + (m.content || '') + ' ').toLowerCase())
      .join(' ');
    if (!allText.trim()) return 0;

    let score = 0;
    for (const { term, weight } of RELEVANCE_KEYWORDS) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      const matches = (allText.match(regex) || []).length;
      if (matches > 0) {
        score += Math.min(weight * matches, weight * 3);
      }
    }

    return Math.min(15, score);
  }

  calcPenalty(contact) {
    const sent = contact.sentMessages.length;
    const received = contact.receivedMessages.length;

    // One-way inbound: likely spam / cold outreach
    if (received > 0 && sent === 0) {
      if (received >= 3) return -35;
      if (received >= 2) return -20;
      return -10;
    }

    // One-way outbound: no response from them
    if (sent > 0 && received === 0) {
      if (sent >= 3) return -15;
      return -5;
    }

    return 0;
  }

  rankContacts() {
    const EXCLUDED_NAMES = ['linkedin member', 'linkedin user', ''];
    this.results = Array.from(this.contacts.values())
      .filter((c) => c.totalScore > 0 && !EXCLUDED_NAMES.includes(c.name.toLowerCase().trim()))
      .sort((a, b) => b.totalScore - a.totalScore);
  }

  search(query) {
    const q = query.toLowerCase().trim();
    if (!q) return this.results;

    // Prefix searches
    if (q.startsWith('company:')) {
      const term = q.slice(8).trim();
      return this.results.filter(
        (c) =>
          (c.company || '').toLowerCase().includes(term) ||
          c.allMessages.some((m) =>
            (m.content || '').toLowerCase().includes(term)
          )
      );
    }
    if (q.startsWith('title:')) {
      const term = q.slice(6).trim();
      return this.results.filter((c) =>
        (c.title || '').toLowerCase().includes(term)
      );
    }
    if (q.startsWith('mentioned:') || q.startsWith('keyword:')) {
      const colonIdx = q.indexOf(':');
      const term = q.slice(colonIdx + 1).trim();
      return this.results.filter((c) =>
        c.allMessages.some((m) =>
          (m.content || '').toLowerCase().includes(term)
        )
      );
    }
    if (q.startsWith('tier:')) {
      const tier = q.slice(5).trim();
      return this.results.filter(
        (c) => c.tier.toLowerCase() === tier
      );
    }

    // Natural language patterns
    const nlPatterns = [
      {
        regex: /who (?:mentioned|talked about|discussed|said) (.+)\??/i,
        type: 'keyword',
      },
      {
        regex: /(?:find|show|list) (?:people|contacts|leads) (?:at|from|with) (.+)/i,
        type: 'company',
      },
      { regex: /show (\w+) leads?/i, type: 'tier' },
      { regex: /(\w+) leads?$/i, type: 'tier' },
    ];

    for (const { regex, type } of nlPatterns) {
      const match = q.match(regex);
      if (match) {
        const term = match[1].trim().toLowerCase();
        if (type === 'keyword') {
          return this.results.filter((c) =>
            c.allMessages.some((m) =>
              (m.content || '').toLowerCase().includes(term)
            )
          );
        }
        if (type === 'company') {
          return this.results.filter(
            (c) =>
              (c.company || '').toLowerCase().includes(term) ||
              (c.title || '').toLowerCase().includes(term) ||
              c.allMessages.some((m) =>
                (m.content || '').toLowerCase().includes(term)
              )
          );
        }
        if (type === 'tier') {
          const tierMap = { hot: 'Hot', warm: 'Warm', cool: 'Cool', cold: 'Cold' };
          if (tierMap[term]) {
            return this.results.filter((c) => c.tier === tierMap[term]);
          }
        }
      }
    }

    // Fallback: full-text search across all fields
    return this.results.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.title || '').toLowerCase().includes(q) ||
        (c.company || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        c.allMessages.some((m) =>
          (m.content || '').toLowerCase().includes(q)
        )
    );
  }

  exportCSV(contacts, tagsFn) {
    const data = contacts || this.results;
    const headers = [
      'Rank',
      'Name',
      'LinkedIn URL',
      'Title',
      'Company',
      'Email',
      'Score',
      'Tier',
      'Total Messages',
      'Messages Sent',
      'Messages Received',
      'Last Contact',
      'Conversations',
      'Tags',
    ];

    const rows = data.map((c, i) => [
      i + 1,
      c.name,
      c.profileUrl || '',
      c.title || '',
      c.company || '',
      c.email || '',
      c.totalScore,
      c.tier,
      c.totalMessages,
      c.sentMessages.length,
      c.receivedMessages.length,
      c.lastMessageDate
        ? c.lastMessageDate.toISOString().split('T')[0]
        : '',
      c.conversationIds.size,
      tagsFn ? (tagsFn(c.name.toLowerCase()) || []).join('; ') : '',
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const str = String(cell);
            return str.includes(',') ||
              str.includes('"') ||
              str.includes('\n')
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          })
          .join(',')
      )
      .join('\n');

    return csvContent;
  }
}
