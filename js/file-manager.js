/**
 * file-manager.js — GitHub 网页文件管理器
 * 在博客侧边栏像文件资源管理器一样浏览、创建、重命名、删除仓库文件
 * 需要 GitHub Personal Access Token（repo 权限）
 */

(function() {
  'use strict';

  const CONFIG = {
    owner: 'YoisakiFuyushimi',
    repo: 'YoisakiFuyushimi.github.io',
    branch: 'main',
    STORAGE_KEY: 'gh_fm_token'
  };

  const API_BASE = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}`;

  const FM = {
    token: localStorage.getItem(CONFIG.STORAGE_KEY) || '',
    treeData: null,
    expandedFolders: new Set(),

    get headers() {
      return this.token
        ? { 'Authorization': `token ${this.token}`, 'Accept': 'application/vnd.github.v3+json' }
        : { 'Accept': 'application/vnd.github.v3+json' };
    },

    // ====== 初始化 ======
    init() {
      const container = document.getElementById('fm-container');
      if (!container) return;
      this.buildUI(container);
      if (this.token) this.loadTree();
    },

    // ====== UI 构建 ======
    buildUI(container) {
      container.innerHTML = `
        <div class="fm-header" onclick="FM.toggleBody()">
          <i class="fa fa-archive"></i>
          <span class="fm-title">文件管理器</span>
          <i class="fa fa-chevron-down fm-chevron" id="fm-chevron"></i>
          <span id="fm-status" class="fm-status"></span>
        </div>
        <div class="fm-body" id="fm-body">
          <div class="fm-toolbar" id="fm-toolbar">
            <button class="fm-btn" onclick="FM.command('newfile')" title="新建文件">📄 文件</button>
            <button class="fm-btn" onclick="FM.command('newfolder')" title="新建文件夹">📁 文件夹</button>
            <span class="fm-toolbar-spacer"></span>
            <button class="fm-btn fm-btn-token" onclick="FM.command('token')" title="设置 Token">🔑</button>
            <button class="fm-btn fm-btn-refresh" onclick="FM.command('refresh')" title="刷新">🔄</button>
          </div>
          <div class="fm-tree" id="fm-tree">
            <div class="fm-placeholder">${this.token
              ? '<span style="color:#999">🔄 点击刷新加载目录</span>'
              : '<span style="color:#e74c3c">⚠️ 未设置 Token<br><small>点击 🔑 配置</small></span>'}
            </div>
          </div>
        </div>
      `;
    },

    // ====== API 请求 ======
    async api(method, url, body) {
      const res = await fetch(url, {
        method,
        headers: { ...this.headers, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      if (res.status === 204 || res.status === 201) {
        try { return await res.json(); } catch { return null; }
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      return data;
    },

    // ====== 读取仓库目录树 ======
    async loadTree() {
      this.setStatus('📂 加载中...');
      try {
        const data = await this.api('GET', `${API_BASE}/git/trees/${CONFIG.branch}?recursive=1`);
        this.treeData = this._buildTree(data.tree || []);
        this.setStatus('');
        this.renderTree();
      } catch (e) {
        if (e.message.includes('401') || e.message.includes('Bad credentials')) {
          this.setStatus('❌ Token 无效');
          this.token = '';
          localStorage.removeItem(CONFIG.STORAGE_KEY);
        } else {
          this.setStatus('❌ ' + e.message);
        }
      }
    },

    _buildTree(items) {
      const root = { name: '', children: {}, isDir: true };
      const ignore = /^(\.git\/|\.github\/)$/;
      items = items.filter(i => !ignore.test(i.path) && !/\/\.git\//.test(i.path));
      items.forEach(item => {
        if (item.path === '.gitkeep') return;
        const parts = item.path.split('/');
        let node = root;
        parts.forEach((part, i) => {
          if (!node.children[part]) {
            node.children[part] = {
              name: part,
              isDir: i < parts.length - 1 || item.type === 'tree',
              children: {},
              sha: item.sha,
              path: item.path,
              size: item.size
            };
          }
          node = node.children[part];
        });
      });
      return this._sortTree(root);
    },

    _sortTree(node) {
      const entries = Object.entries(node.children).sort((a, b) => {
        if (a[1].isDir !== b[1].isDir) return a[1].isDir ? -1 : 1;
        return a[1].name.localeCompare(b[1].name);
      });
      node.children = Object.fromEntries(entries);
      Object.values(node.children).forEach(c => { if (c.isDir) this._sortTree(c); });
      return node;
    },

    // ====== 渲染树 ======
    renderTree() {
      const treeEl = document.getElementById('fm-tree');
      if (!treeEl) return;
      treeEl.innerHTML = '';
      if (!this.treeData || Object.keys(this.treeData.children).length === 0) {
        treeEl.innerHTML = '<div class="fm-placeholder">📭 空目录</div>';
        return;
      }
      this._renderNodes(this.treeData, treeEl, 0);
    },

    _renderNodes(node, container, depth) {
      Object.values(node.children).forEach(child => {
        const item = document.createElement('div');
        item.className = 'fm-item' + (child.isDir ? ' fm-folder' : '');
        item.dataset.path = child.path || child.name;

        const icon = child.isDir
          ? (this.expandedFolders.has(child.path) ? 'fa-folder-open' : 'fa-folder')
          : 'fa-file-text-o';
        const indent = 12 + depth * 16;

        item.innerHTML = `
          <span class="fm-item-icon" style="padding-left:${indent}px">
            <i class="fa ${icon}"></i>
          </span>
          <span class="fm-item-name" title="${this._escape(child.path || child.name)}">${this._escape(child.name)}</span>
          <span class="fm-item-actions">
            ${child.isDir ? '<button class="fm-act" data-act="newfile" title="新建文件">📄</button>' : ''}
            ${child.isDir ? '<button class="fm-act" data-act="newfolder" title="新建子文件夹">📁</button>' : ''}
            <button class="fm-act" data-act="rename" title="重命名">✏️</button>
            <button class="fm-act" data-act="delete" title="删除">🗑️</button>
          </span>
        `;

        // 文件夹点击 = 折叠/展开
        if (child.isDir) {
          item.addEventListener('click', e => {
            if (e.target.closest('.fm-item-actions')) return;
            const childrenEl = item.nextElementSibling;
            if (!childrenEl || !childrenEl.classList.contains('fm-children')) return;
            const isHidden = childrenEl.style.display === 'none';
            childrenEl.style.display = isHidden ? '' : 'none';
            const iconEl = item.querySelector('.fm-item-icon .fa');
            if (iconEl) iconEl.className = 'fa ' + (isHidden ? 'fa-folder-open' : 'fa-folder');
            if (isHidden) this.expandedFolders.add(child.path);
            else this.expandedFolders.delete(child.path);
          });
        } else {
          // 文件点击 = 在新标签页打开
          item.addEventListener('click', e => {
            if (e.target.closest('.fm-item-actions')) return;
            window.open(`https://github.com/${CONFIG.owner}/${CONFIG.repo}/blob/${CONFIG.branch}/${child.path}`, '_blank');
          });
        }

        // 操作按钮绑定
        item.querySelectorAll('.fm-act').forEach(btn => {
          btn.addEventListener('click', e => {
            e.stopPropagation();
            const act = btn.dataset.act;
            const p = child.path || child.name;
            if (act === 'newfile') this._promptNewFile(p);
            else if (act === 'newfolder') this._promptNewFolder(p);
            else if (act === 'rename') this._promptRename(p, child.isDir);
            else if (act === 'delete') this._promptDelete(p, child.isDir);
          });
        });

        container.appendChild(item);

        // 子节点
        if (child.isDir && Object.keys(child.children).length > 0) {
          const wrapper = document.createElement('div');
          wrapper.className = 'fm-children';
          if (!this.expandedFolders.has(child.path)) wrapper.style.display = 'none';
          container.appendChild(wrapper);
          this._renderNodes(child, wrapper, depth + 1);
        }
      });
    },

    // ====== 获取文件 SHA ======
    async _getSha(path) {
      try {
        const data = await this.api('GET', `${API_BASE}/contents/${encodeURIComponent(path)}?ref=${CONFIG.branch}`);
        return data.sha;
      } catch { return null; }
    },

    async _getFileContent(path) {
      try {
        return await this.api('GET', `${API_BASE}/contents/${encodeURIComponent(path)}?ref=${CONFIG.branch}`);
      } catch { return null; }
    },

    async _putFile(path, content, message) {
      const sha = await this._getSha(path);
      return await this.api('PUT', `${API_BASE}/contents/${encodeURIComponent(path)}`, {
        message, content: btoa(unescape(encodeURIComponent(content))), sha: sha || undefined, branch: CONFIG.branch
      });
    },

    // ====== 操作方法 ======
    _promptNewFile(parentPath) {
      const name = prompt(`输入文件名 (在 ${parentPath}/ 下):`);
      if (!name) return;
      const path = parentPath + '/' + name;
      const template = `---\ntitle: ${name.replace(/\.(md|html|txt)$/,'')}\ndate: ${new Date().toISOString().slice(0,10)}\n---\n\n`;
      this.setStatus('📤 创建中...');
      this._putFile(path, template, `Create ${path}`)
        .then(() => { this.setStatus('✅ 已创建'); this.loadTree(); })
        .catch(e => this.setStatus('❌ ' + e.message));
    },

    _promptNewFolder(parentPath) {
      const name = prompt(`输入文件夹名 (在 ${parentPath}/ 下):`);
      if (!name) return;
      const path = parentPath + '/' + name;
      this.setStatus('📤 创建中...');
      this._putFile(path + '/.gitkeep', '', `Create folder ${path}`)
        .then(() => { this.setStatus('✅ 已创建'); this.loadTree(); })
        .catch(e => this.setStatus('❌ ' + e.message));
    },

    async _promptRename(path, isDir) {
      const parts = path.split('/');
      const oldName = parts[parts.length - 1];
      const newName = prompt('新名称:', oldName);
      if (!newName || newName === oldName) return;

      const newPath = [...parts.slice(0, -1), newName].join('/');
      this.setStatus('📤 重命名中...');
      try {
        const content = await this._getFileContent(path);
        if (!content) { this.setStatus('❌ 无法读取文件'); return; }
        // 创建新文件
        await this.api('PUT', `${API_BASE}/contents/${encodeURIComponent(newPath)}`, {
          message: `Rename ${path} → ${newPath}`, content: content.content, branch: CONFIG.branch
        });
        // 删除旧文件
        await this.api('DELETE', `${API_BASE}/contents/${encodeURIComponent(path)}`, {
          message: `Delete ${path}`, sha: content.sha, branch: CONFIG.branch
        });
        this.setStatus('✅ 已重命名');
        this.loadTree();
      } catch (e) {
        this.setStatus('❌ ' + e.message);
      }
    },

    async _promptDelete(path, isDir) {
      if (isDir) {
        alert('⚠️ GitHub API 不能直接删除文件夹。\n请手动去 GitHub 仓库或逐个删除内部文件。');
        return;
      }
      if (!confirm(`确定删除 "${path}" 吗？`)) return;
      this.setStatus('📤 删除中...');
      try {
        const sha = await this._getSha(path);
        if (!sha) { this.setStatus('❌ 无法获取文件信息'); return; }
        await this.api('DELETE', `${API_BASE}/contents/${encodeURIComponent(path)}`, {
          message: `Delete ${path}`, sha, branch: CONFIG.branch
        });
        this.setStatus('✅ 已删除');
        this.loadTree();
      } catch (e) {
        this.setStatus('❌ ' + e.message);
      }
    },

    // ====== 全局命令入口 ======
    command(cmd) {
      if (!this.token && cmd !== 'token') {
        alert('请先设置 GitHub Token');
        this.command('token');
        return;
      }
      switch (cmd) {
        case 'newfile': {
          const name = prompt('输入文件名 (如 my-post.md):');
          if (!name) return;
          const template = `---\ntitle: ${name.replace(/\.(md|html|txt)$/,'')}\ndate: ${new Date().toISOString().slice(0,10)}\n---\n\n`;
          this.setStatus('📤 创建中...');
          this._putFile(name, template, `Create ${name}`)
            .then(() => { this.setStatus('✅ 已创建'); this.loadTree(); })
            .catch(e => this.setStatus('❌ ' + e.message));
          break;
        }
        case 'newfolder': {
          const name = prompt('输入文件夹名:');
          if (!name) return;
          this.setStatus('📤 创建中...');
          this._putFile(name + '/.gitkeep', '', `Create folder ${name}`)
            .then(() => { this.setStatus('✅ 已创建'); this.loadTree(); })
            .catch(e => this.setStatus('❌ ' + e.message));
          break;
        }
        case 'token': {
          const t = prompt('输入 GitHub Personal Access Token (需要 repo 权限):\n创建地址: https://github.com/settings/tokens');
          if (!t) return;
          this.token = t;
          localStorage.setItem(CONFIG.STORAGE_KEY, t);
          this.setStatus('🔑 已设置 Token');
          this.loadTree();
          break;
        }
        case 'refresh':
          this.loadTree();
          break;
      }
    },

    // ====== 折叠/展开 ======
    toggleBody() {
      const body = document.getElementById('fm-body');
      const chevron = document.getElementById('fm-chevron');
      if (!body) return;
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? '' : 'none';
      if (chevron) chevron.className = 'fa ' + (isHidden ? 'fa-chevron-down' : 'fa-chevron-right');
    },

    // ====== 工具 ======
    setStatus(msg) {
      const el = document.getElementById('fm-status');
      if (el) el.textContent = msg;
    },

    _escape(str) {
      const d = document.createElement('div');
      d.textContent = str;
      return d.innerHTML;
    }
  };

  // 暴露全局
  window.FM = FM;

  // 自动初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => FM.init());
  } else {
    FM.init();
  }
})();
