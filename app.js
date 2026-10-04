(function () {
  'use strict';

  const STORAGE_KEY = 'hierarchyOrganizer.v1';

  const COLORS = {
    root: { fill: '#eaf0fd', stroke: '#3b6fd6' },
    platform: { fill: '#bfe0ff', stroke: '#4a90d9' },
    team: { fill: '#f3d9a8', stroke: '#c9932f' },
    member: { fill: '#ffffff', stroke: '#9aa2b1' },
  };
  const TEXT_COLOR = '#1c1f26';
  const MUTED_COLOR = '#6b7280';
  const LINK_COLOR = '#9aa2b1';
  const FONT_FAMILY = 'Arial, Helvetica, sans-serif';

  const NODE_W = { root: 170, platform: 190, team: 170, member: 150 };
  const NODE_H = { root: 40, platform: 50, team: 46, member: 36 };

  const SAMPLE_CSV =
    'Platform,Team,MemberFirst,MemberLast,Owner\n' +
    'Atlas,Payments,Grace,Hopper,Elena Cruz\n' +
    'Atlas,Payments,Alan,Turing,Elena Cruz\n' +
    'Atlas,Fraud,Ada,Lovelace,Elena Cruz\n' +
    'Atlas,Fraud,Linus,Torvalds,Elena Cruz\n' +
    'Nimbus,Platform Infra,Barbara,Liskov,Marcus Chen\n' +
    'Nimbus,Platform Infra,Donald,Knuth,Marcus Chen\n' +
    'Nimbus,Developer Tools,Margaret,Hamilton,Marcus Chen\n' +
    'Beacon,Growth,Katherine,Johnson,Priya Nair\n' +
    'Beacon,Growth,John,McCarthy,Priya Nair\n' +
    'Beacon,Analytics,Dennis,Ritchie,Priya Nair\n';

  let uidCounter = 0;
  function uid(prefix) {
    uidCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${uidCounter}`;
  }

  function escapeHTML(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // ---------------- State ----------------
  const state = {
    root: null,
    selectedId: null,
    searchMatched: null,
    searchAncestors: null,
  };

  let zoom = null;

  function createEmptyRoot() {
    return { id: 'root', type: 'root', name: 'Organization', children: [], collapsed: false };
  }

  function findNodeAndParent(id) {
    let result = null;
    function walk(node, parent) {
      if (node.id === id) { result = { node, parent }; return true; }
      if (node.children) {
        for (const c of node.children) {
          if (walk(c, node)) return true;
        }
      }
      return false;
    }
    walk(state.root, null);
    return result;
  }

  // ---------------- Persistence ----------------
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.root)); } catch (e) { /* ignore */ }
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { state.root = JSON.parse(raw); return true; }
    } catch (e) { /* ignore */ }
    return false;
  }

  // ---------------- CSV ----------------
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n') {
        row.push(field); rows.push(row); row = []; field = '';
      } else if (c === '\r') {
        // skip
      } else {
        field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  }

  function csvEscape(v) {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function importCSVText(text) {
    const rows = parseCSV(text);
    if (!rows.length) return 0;
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idx = {
      platform: header.indexOf('platform'),
      team: header.indexOf('team'),
      first: header.indexOf('memberfirst'),
      last: header.indexOf('memberlast'),
      owner: header.indexOf('owner'),
    };
    if (idx.platform === -1) {
      showToast('CSV must have a "Platform" column.');
      return 0;
    }
    let count = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const pName = (r[idx.platform] || '').trim();
      if (!pName) continue;
      const owner = idx.owner !== -1 ? (r[idx.owner] || '').trim() : '';
      const tName = idx.team !== -1 ? (r[idx.team] || '').trim() : '';
      const first = idx.first !== -1 ? (r[idx.first] || '').trim() : '';
      const last = idx.last !== -1 ? (r[idx.last] || '').trim() : '';

      let platform = state.root.children.find((p) => p.name.toLowerCase() === pName.toLowerCase());
      if (!platform) {
        platform = { id: uid('platform'), type: 'platform', name: pName, owner, children: [], collapsed: false };
        state.root.children.push(platform);
      } else if (owner && !platform.owner) {
        platform.owner = owner;
      }

      if (tName || first || last) {
        const teamName = tName || 'General';
        let team = platform.children.find((t) => t.name.toLowerCase() === teamName.toLowerCase());
        if (!team) {
          team = { id: uid('team'), type: 'team', name: teamName, children: [], collapsed: false };
          platform.children.push(team);
        }
        if (first || last) {
          team.children.push({ id: uid('member'), type: 'member', firstName: first, lastName: last });
        }
      }
      count++;
    }
    return count;
  }

  function exportCSV() {
    const rows = [['Platform', 'Team', 'MemberFirst', 'MemberLast', 'Owner']];
    state.root.children.forEach((p) => {
      if (!p.children.length) rows.push([p.name, '', '', '', p.owner || '']);
      p.children.forEach((t) => {
        if (!t.children.length) rows.push([p.name, t.name, '', '', p.owner || '']);
        t.children.forEach((m) => {
          rows.push([p.name, t.name, m.firstName || '', m.lastName || '', p.owner || '']);
        });
      });
    });
    const text = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
    downloadBlob(text, 'hierarchy_export.csv', 'text/csv');
    showToast('CSV exported.');
  }

  function loadSample() {
    const proceed = state.root.children.length === 0 || confirm('Add sample data to your current chart?');
    if (!proceed) return;
    const count = importCSVText(SAMPLE_CSV);
    fullRefresh({ refit: true });
    showToast(`Loaded sample data (${count} rows).`);
  }

  // ---------------- Mutations ----------------
  function addPlatform(name, owner) {
    name = (name || '').trim();
    if (!name) { showToast('Enter a platform name.'); return null; }
    const p = { id: uid('platform'), type: 'platform', name, owner: (owner || '').trim(), children: [], collapsed: false };
    state.root.children.push(p);
    state.root.collapsed = false;
    return p;
  }
  function addTeam(platform, name) {
    name = (name || '').trim();
    if (!name) { showToast('Enter a team name.'); return null; }
    const t = { id: uid('team'), type: 'team', name, children: [], collapsed: false };
    platform.children.push(t);
    platform.collapsed = false;
    return t;
  }
  function addMember(team, first, last) {
    first = (first || '').trim(); last = (last || '').trim();
    if (!first && !last) { showToast('Enter a member name.'); return null; }
    const m = { id: uid('member'), type: 'member', firstName: first, lastName: last };
    team.children.push(m);
    team.collapsed = false;
    return m;
  }
  function deleteNode(id) {
    const found = findNodeAndParent(id);
    if (!found || !found.parent) return;
    const { node, parent } = found;
    const label = nodeTitleText(node);
    if (!confirm(`Delete "${label}"${node.children && node.children.length ? ' and everything under it' : ''}?`)) return;
    parent.children = parent.children.filter((c) => c.id !== id);
    state.selectedId = parent.id;
    fullRefresh();
  }
  function toggleCollapse(id) {
    const found = findNodeAndParent(id);
    if (!found) return;
    found.node.collapsed = !found.node.collapsed;
    render();
    saveState();
  }

  // ---------------- Node text helpers ----------------
  function nodeTitleText(data) {
    if (data.type === 'member') return `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unnamed';
    return data.name;
  }
  function hasSubtitle(data) { return data.type !== 'member'; }
  function nodeSubtitleText(data) {
    const count = (data.children || []).length;
    if (data.type === 'root') return `${count} platform${count === 1 ? '' : 's'}`;
    if (data.type === 'platform') {
      return data.owner ? `Owner: ${data.owner}` : `${count} team${count === 1 ? '' : 's'}`;
    }
    if (data.type === 'team') return `${count} member${count === 1 ? '' : 's'}`;
    return '';
  }
  function nodeSearchText(node) {
    if (node.type === 'member') return `${node.firstName || ''} ${node.lastName || ''}`;
    if (node.type === 'platform') return `${node.name} ${node.owner || ''}`;
    return node.name;
  }
  function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
  }

  // ---------------- Chart rendering ----------------
  function linkPath(d) {
    const sx = d.source.y + NODE_W[d.source.data.type];
    const sy = d.source.x;
    const tx = d.target.y;
    const ty = d.target.x;
    const mx = (sx + tx) / 2;
    return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
  }

  function computeNodeClass(d) {
    let cls = `node ${d.data.type}`;
    if (d.data.id === state.selectedId) cls += ' selected';
    if (state.searchMatched) {
      if (state.searchMatched.has(d.data.id)) cls += ' match';
      else if (!state.searchAncestors.has(d.data.id)) cls += ' dimmed';
    }
    return cls;
  }

  function refreshNodeClasses() {
    d3.selectAll('#zoom-group g.node').attr('class', (d) => computeNodeClass(d));
  }

  function render() {
    const hasData = state.root.children.length > 0;
    document.getElementById('empty-state').style.visibility = hasData ? 'hidden' : 'visible';

    const g = d3.select('#zoom-group');
    if (!hasData) { g.selectAll('*').remove(); return; }

    const rootHierarchy = d3.hierarchy(state.root, (d) => (d.collapsed ? null : d.children));
    d3.tree().nodeSize([54, 230])(rootHierarchy);

    const nodes = rootHierarchy.descendants();
    const links = rootHierarchy.links();

    // Links
    const link = g.selectAll('path.link').data(links, (d) => d.target.data.id);
    link.exit().remove();
    link.enter().append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', LINK_COLOR)
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.6)
      .merge(link)
      .transition().duration(300)
      .attr('d', linkPath);

    // Nodes
    const node = g.selectAll('g.node').data(nodes, (d) => d.data.id);
    node.exit().remove();

    const nodeEnter = node.enter().append('g')
      .attr('transform', (d) => `translate(${d.y},${d.x})`);
    nodeEnter.append('rect');
    nodeEnter.append('text').attr('class', 'node-title');
    nodeEnter.append('text').attr('class', 'node-subtitle');
    nodeEnter.append('title');

    const nodeMerge = nodeEnter.merge(node);

    nodeMerge.attr('class', (d) => computeNodeClass(d));

    nodeMerge.transition().duration(300)
      .attr('transform', (d) => `translate(${d.y},${d.x})`);

    nodeMerge.select('rect')
      .attr('width', (d) => NODE_W[d.data.type])
      .attr('height', (d) => NODE_H[d.data.type])
      .attr('x', 0)
      .attr('y', (d) => -NODE_H[d.data.type] / 2)
      .attr('rx', 8)
      .attr('fill', (d) => COLORS[d.data.type].fill)
      .attr('stroke', (d) => COLORS[d.data.type].stroke)
      .attr('stroke-width', 1.5);

    nodeMerge.select('title').text((d) => {
      const t = nodeTitleText(d.data);
      const s = nodeSubtitleText(d.data);
      return s ? `${t} — ${s}` : t;
    });

    nodeMerge.select('text.node-title')
      .attr('x', 12)
      .attr('y', (d) => (hasSubtitle(d.data) ? -4 : 4))
      .attr('fill', TEXT_COLOR)
      .style('font-family', FONT_FAMILY)
      .style('font-size', '12px')
      .style('font-weight', 700)
      .text((d) => truncate(nodeTitleText(d.data), Math.floor(NODE_W[d.data.type] / 8)));

    nodeMerge.select('text.node-subtitle')
      .attr('x', 12)
      .attr('y', 14)
      .attr('fill', MUTED_COLOR)
      .style('font-family', FONT_FAMILY)
      .style('font-size', '10.5px')
      .text((d) => truncate(nodeSubtitleText(d.data), Math.floor(NODE_W[d.data.type] / 6)))
      .style('display', (d) => (nodeSubtitleText(d.data) ? null : 'none'));

    nodeMerge.selectAll('g.toggle-badge').remove();
    nodeMerge.filter((d) => d.data.children && d.data.children.length > 0)
      .append('g')
      .attr('class', 'toggle-badge')
      .attr('transform', (d) => `translate(${NODE_W[d.data.type]},0)`)
      .on('click', (event, d) => { event.stopPropagation(); toggleCollapse(d.data.id); })
      .each(function (d) {
        const sel = d3.select(this);
        sel.append('circle').attr('r', 9);
        sel.append('text')
          .style('font-family', FONT_FAMILY)
          .text(d.data.collapsed ? `+${d.data.children.length}` : '−');
      });

    nodeMerge.on('click', (event, d) => { event.stopPropagation(); selectNode(d.data.id); });
  }

  // ---------------- Zoom ----------------
  function setupZoom() {
    zoom = d3.zoom().scaleExtent([0.2, 2.5]).on('zoom', (event) => {
      d3.select('#zoom-group').attr('transform', event.transform);
    });
    d3.select('#chart-svg').call(zoom);
    d3.select('#chart-svg').on('click', () => selectNode(null));
  }

  function fitView() {
    const gEl = document.getElementById('zoom-group');
    const bbox = gEl.getBBox();
    if (!bbox.width || !bbox.height) return;
    const svgEl = document.getElementById('chart-svg');
    const cw = svgEl.clientWidth, ch = svgEl.clientHeight;
    const pad = 50;
    const scale = Math.min((cw - pad * 2) / bbox.width, (ch - pad * 2) / bbox.height, 1.1);
    const tx = pad - bbox.x * scale + Math.max(0, (cw - pad * 2 - bbox.width * scale)) / 2;
    const ty = pad - bbox.y * scale + Math.max(0, (ch - pad * 2 - bbox.height * scale)) / 2;
    const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
    d3.select('#chart-svg').transition().duration(400).call(zoom.transform, t);
  }

  // ---------------- Selection & side panel ----------------
  function selectNode(id) {
    state.selectedId = id;
    refreshNodeClasses();
    renderPanel();
  }

  function buildChildList(children, emptyLabel) {
    if (!children.length) return `<li class="empty-row">${escapeHTML(emptyLabel)}</li>`;
    return children.map((c) => `<li data-id="${c.id}"><span>${escapeHTML(nodeTitleText(c))}</span><button class="btn-x" data-delete="${c.id}" title="Delete">&times;</button></li>`).join('');
  }

  function buildPanelHTML(node, parent) {
    if (node.type === 'root') {
      return `
        <h3>${escapeHTML(node.name)}</h3>
        <div class="panel-kind">Organization root</div>
        <div class="add-child-block">
          <h4>Add Platform</h4>
          <div class="field"><input id="new-platform-name" placeholder="Platform name"></div>
          <div class="field"><input id="new-platform-owner" placeholder="Owner (optional)"></div>
          <div class="panel-actions"><button id="add-platform-submit" class="btn">Add Platform</button></div>
          <hr class="sep">
          <h4>Platforms (${node.children.length})</h4>
          <ul class="child-list">${buildChildList(node.children, 'No platforms yet.')}</ul>
        </div>`;
    }
    if (node.type === 'platform') {
      return `
        <h3>${escapeHTML(node.name)}</h3>
        <div class="panel-kind">Platform</div>
        <div class="field"><label>Name</label><input id="edit-name" value="${escapeHTML(node.name)}"></div>
        <div class="field"><label>Owner</label><input id="edit-owner" value="${escapeHTML(node.owner || '')}"></div>
        <div class="panel-actions"><button id="delete-node" class="btn btn-danger-ghost">Delete Platform</button></div>
        <hr class="sep">
        <div class="add-child-block">
          <h4>Add Team</h4>
          <div class="field"><input id="new-team-name" placeholder="Team name"></div>
          <div class="panel-actions"><button id="add-team-submit" class="btn">Add Team</button></div>
          <h4>Teams (${node.children.length})</h4>
          <ul class="child-list">${buildChildList(node.children, 'No teams yet.')}</ul>
        </div>`;
    }
    if (node.type === 'team') {
      return `
        <h3>${escapeHTML(node.name)}</h3>
        <div class="panel-kind">Team &middot; ${escapeHTML(parent ? parent.name : '')}</div>
        <div class="field"><label>Name</label><input id="edit-name" value="${escapeHTML(node.name)}"></div>
        <div class="panel-actions"><button id="delete-node" class="btn btn-danger-ghost">Delete Team</button></div>
        <hr class="sep">
        <div class="add-child-block">
          <h4>Add Member</h4>
          <div class="field-row">
            <div class="field"><input id="new-member-first" placeholder="First name"></div>
            <div class="field"><input id="new-member-last" placeholder="Last name"></div>
          </div>
          <div class="panel-actions"><button id="add-member-submit" class="btn">Add Member</button></div>
          <h4>Members (${node.children.length})</h4>
          <ul class="child-list">${buildChildList(node.children, 'No members yet.')}</ul>
        </div>`;
    }
    // member
    return `
      <h3>${escapeHTML(nodeTitleText(node))}</h3>
      <div class="panel-kind">Member &middot; ${escapeHTML(parent ? parent.name : '')}</div>
      <div class="field-row">
        <div class="field"><label>First name</label><input id="edit-first" value="${escapeHTML(node.firstName || '')}"></div>
        <div class="field"><label>Last name</label><input id="edit-last" value="${escapeHTML(node.lastName || '')}"></div>
      </div>
      <div class="panel-actions"><button id="delete-node" class="btn btn-danger-ghost">Delete Member</button></div>`;
  }

  function wireChildList(children) {
    document.querySelectorAll('.child-list li[data-id]').forEach((li) => {
      li.addEventListener('click', (e) => {
        if (e.target.closest('[data-delete]')) return;
        selectNode(li.dataset.id);
      });
    });
    document.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteNode(btn.dataset.delete);
      });
    });
  }

  function wirePanelEvents(node, parent) {
    if (node.type === 'root') {
      document.getElementById('add-platform-submit').addEventListener('click', () => {
        const nameEl = document.getElementById('new-platform-name');
        const ownerEl = document.getElementById('new-platform-owner');
        const p = addPlatform(nameEl.value, ownerEl.value);
        if (p) { state.selectedId = p.id; fullRefresh(); }
      });
    } else if (node.type === 'platform') {
      document.getElementById('edit-name').addEventListener('change', (e) => {
        node.name = e.target.value.trim() || node.name;
        fullRefresh();
      });
      document.getElementById('edit-owner').addEventListener('change', (e) => {
        node.owner = e.target.value.trim();
        fullRefresh();
      });
      document.getElementById('delete-node').addEventListener('click', () => deleteNode(node.id));
      document.getElementById('add-team-submit').addEventListener('click', () => {
        const nameEl = document.getElementById('new-team-name');
        const t = addTeam(node, nameEl.value);
        if (t) { state.selectedId = t.id; fullRefresh(); }
      });
    } else if (node.type === 'team') {
      document.getElementById('edit-name').addEventListener('change', (e) => {
        node.name = e.target.value.trim() || node.name;
        fullRefresh();
      });
      document.getElementById('delete-node').addEventListener('click', () => deleteNode(node.id));
      document.getElementById('add-member-submit').addEventListener('click', () => {
        const firstEl = document.getElementById('new-member-first');
        const lastEl = document.getElementById('new-member-last');
        const m = addMember(node, firstEl.value, lastEl.value);
        if (m) { state.selectedId = m.id; fullRefresh(); }
      });
    } else if (node.type === 'member') {
      document.getElementById('edit-first').addEventListener('change', (e) => {
        node.firstName = e.target.value.trim();
        fullRefresh();
      });
      document.getElementById('edit-last').addEventListener('change', (e) => {
        node.lastName = e.target.value.trim();
        fullRefresh();
      });
      document.getElementById('delete-node').addEventListener('click', () => deleteNode(node.id));
    }
    wireChildList(node.children || []);
  }

  function renderPanel() {
    const panelEmpty = document.getElementById('panel-empty');
    const panelContent = document.getElementById('panel-content');
    const sel = state.selectedId ? findNodeAndParent(state.selectedId) : null;
    if (!sel) {
      panelEmpty.hidden = false;
      panelContent.hidden = true;
      panelContent.innerHTML = '';
      return;
    }
    panelEmpty.hidden = true;
    panelContent.hidden = false;
    panelContent.innerHTML = buildPanelHTML(sel.node, sel.parent);
    wirePanelEvents(sel.node, sel.parent);
  }

  function fullRefresh(opts = {}) {
    render();
    renderPanel();
    saveState();
    if (opts.refit) fitView();
  }

  // ---------------- Search ----------------
  function computeSearchSets(term) {
    const matched = new Set();
    const ancestors = new Set();
    function walk(node, path) {
      const text = nodeSearchText(node).toLowerCase();
      if (text.includes(term)) {
        matched.add(node.id);
        path.forEach((a) => ancestors.add(a));
      }
      if (node.children) node.children.forEach((c) => walk(c, [...path, node.id]));
    }
    walk(state.root, []);
    return { matched, ancestors };
  }

  function expandAncestors(node, ancestors) {
    if (ancestors.has(node.id)) node.collapsed = false;
    if (node.children) node.children.forEach((c) => expandAncestors(c, ancestors));
  }

  // ---------------- PNG export ----------------
  function exportPNG() {
    const svgEl = document.getElementById('chart-svg');
    const gEl = document.getElementById('zoom-group');
    const bbox = gEl.getBBox();
    if (!bbox.width) { showToast('Nothing to export yet.'); return; }
    const pad = 30;
    const scale = 2;
    const w = bbox.width + pad * 2;
    const h = bbox.height + pad * 2;

    const clone = svgEl.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const cloneG = clone.querySelector('#zoom-group');
    cloneG.setAttribute('transform', `translate(${pad - bbox.x},${pad - bbox.y})`);

    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', '0'); bgRect.setAttribute('y', '0');
    bgRect.setAttribute('width', String(w)); bgRect.setAttribute('height', String(h));
    bgRect.setAttribute('fill', '#ffffff');
    clone.insertBefore(bgRect, clone.firstChild);

    const svgText = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'hierarchy_diagram.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('PNG exported.');
      }, 'image/png');
    };
    img.onerror = () => { showToast('PNG export failed.'); URL.revokeObjectURL(url); };
    img.src = url;
  }

  // ---------------- Toast ----------------
  let toastTimer;
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // ---------------- Toolbar wiring ----------------
  function wireToolbar() {
    document.getElementById('csv-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const count = importCSVText(reader.result);
        fullRefresh({ refit: true });
        showToast(`Imported ${count} row(s) from ${file.name}.`);
      };
      reader.onerror = () => showToast('Could not read file.');
      reader.readAsText(file);
      e.target.value = '';
    });

    document.getElementById('add-platform-btn').addEventListener('click', () => {
      selectNode('root');
      setTimeout(() => {
        const el = document.getElementById('new-platform-name');
        if (el) el.focus();
      }, 0);
    });

    document.getElementById('export-csv-btn').addEventListener('click', exportCSV);
    document.getElementById('export-png-btn').addEventListener('click', exportPNG);
    document.getElementById('load-sample-btn').addEventListener('click', loadSample);

    document.getElementById('clear-btn').addEventListener('click', () => {
      if (!confirm('Clear all data? This cannot be undone.')) return;
      state.root = createEmptyRoot();
      state.selectedId = null;
      fullRefresh();
      showToast('Cleared.');
    });

    document.getElementById('search-input').addEventListener('input', (e) => {
      const term = e.target.value.trim().toLowerCase();
      if (term) {
        const { matched, ancestors } = computeSearchSets(term);
        state.searchMatched = matched;
        state.searchAncestors = ancestors;
        expandAncestors(state.root, ancestors);
        render();
      } else {
        state.searchMatched = null;
        state.searchAncestors = null;
        refreshNodeClasses();
      }
    });

    document.getElementById('zoom-in').addEventListener('click', () => {
      d3.select('#chart-svg').transition().call(zoom.scaleBy, 1.25);
    });
    document.getElementById('zoom-out').addEventListener('click', () => {
      d3.select('#chart-svg').transition().call(zoom.scaleBy, 0.8);
    });
    document.getElementById('zoom-reset').addEventListener('click', fitView);

    window.addEventListener('resize', debounce(fitView, 300));
  }

  // ---------------- Init ----------------
  function init() {
    if (!loadState() || !state.root) {
      state.root = createEmptyRoot();
    }
    setupZoom();
    wireToolbar();
    render();
    renderPanel();
    requestAnimationFrame(fitView);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
