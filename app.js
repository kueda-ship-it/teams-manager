/**
 * 連絡概要マネージャー - Supabase リアルタイム版
 * Phase 3: 高度な権限管理・表示名・リアクション (Admin, Manager, User, Viewer)
 */

// --- Supabase Configuration ---
const SUPABASE_URL = "https://bvhfmwrjrrqrpqvlzkyd.supabase.co";
const SUPABASE_KEY = "sb_publishable_--SSOcbdXqye0lPUQXMhMQ_PXcYrk6c";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- State ---
let threads = [];
let currentUser = null;
let currentProfile = null;
let allProfiles = [];
let allTags = [];
let allTagMembers = [];
let allReactions = [];
let onlineUsers = new Set();
let currentFilter = 'all';

// --- UI Elements ---
const authContainer = document.getElementById('auth-container');
const mainDashboard = document.getElementById('main-dashboard');
const authEmailInp = document.getElementById('auth-email');
const authPasswordInp = document.getElementById('auth-password');
const authErrorEl = document.getElementById('auth-error');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const microsoftLoginBtn = document.getElementById('microsoft-login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userDisplayEl = document.getElementById('user-display');
const userRoleEl = document.getElementById('user-role');

const threadListEl = document.getElementById('thread-list');
const sidebarListEl = document.getElementById('pending-sidebar-list');
const taskCountEl = document.getElementById('task-count');
const addThreadSection = document.getElementById('add-thread-section'); // UI制御用
const addThreadBtn = document.getElementById('add-thread-btn');
const newTitleInp = document.getElementById('new-title');
const newContentInp = document.getElementById('new-content');
const globalSearchInp = document.getElementById('global-search');
const filterStatus = document.getElementById('filter-status');
const assignedSidebarListEl = document.getElementById('assigned-sidebar-list');

const adminBtn = document.getElementById('admin-btn');
const settingsBtn = document.getElementById('settings-btn');
const modalOverlay = document.getElementById('modal-overlay');
const settingsModal = document.getElementById('settings-modal');
const adminModal = document.getElementById('admin-modal');
const prefDisplayName = document.getElementById('pref-display-name');
const prefNotification = document.getElementById('pref-notification');
const saveSettingsBtn = document.getElementById('save-settings-btn');

const adminUserList = document.getElementById('admin-user-list');
const adminTagList = document.getElementById('admin-tag-list');
const newTagNameInp = document.getElementById('new-tag-name');
const addTagBtn = document.getElementById('add-tag-btn');

const mentionListEl = document.getElementById('mention-list');
const prefAvatarInput = document.getElementById('pref-avatar-input');
const prefAvatarPreview = document.getElementById('pref-avatar-preview');

// --- Auth & Profile ---

async function checkUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
        await fetchProfile(user);
    } else {
        showAuth();
    }
}

async function fetchProfile(user) {
    currentUser = user;
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
    if (data) {
        currentProfile = data;
        handleAuthState();
    } else {
        setTimeout(() => fetchProfile(user), 1000);
    }
}

function handleAuthState() {
    // ヘッダーのユーザー情報更新
    userDisplayEl.textContent = currentProfile.display_name || currentUser.email;
    userRoleEl.textContent = getRoleLabel(currentProfile.role);

    // ヘッダーアバターの表示
    const headerAvatar = document.getElementById('header-avatar-img');
    if (headerAvatar) {
        if (currentProfile.avatar_url) {
            headerAvatar.innerHTML = `<img src="${currentProfile.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        } else {
            headerAvatar.textContent = (currentProfile.display_name || currentUser.email)[0].toUpperCase();
        }
    }

    // ロール名を正規化（先頭大文字）
    const role = currentProfile.role ? currentProfile.role.charAt(0).toUpperCase() + currentProfile.role.slice(1).toLowerCase() : 'User';

    // UI 制御: Admin/Manager のみボタン表示
    if (['Admin', 'Manager'].includes(role)) {
        adminBtn.style.display = 'block';
    } else {
        adminBtn.style.display = 'none';
    }

    // UI 制御: Viewer は投稿不可
    if (role === 'Viewer') {
        const createSection = document.querySelector('.form-container');
        if (createSection) createSection.style.display = 'none';
    } else {
        const createSection = document.querySelector('.form-container');
        if (createSection) createSection.style.display = 'block';
    }

    authContainer.style.display = 'none';
    mainDashboard.style.display = 'block';

    loadMasterData();
    loadData();
    subscribeToChanges();
    requestNotificationPermission();
}

function getRoleLabel(role) {
    const labels = { 'Admin': '管理者', 'Manager': 'マネージャー', 'User': '一般ユーザー', 'Viewer': '閲覧のみ' };
    return labels[role] || role;
}

function showAuth() {
    currentUser = null;
    currentProfile = null;
    authContainer.style.display = 'block';
    mainDashboard.style.display = 'none';
}

async function handleLogin() {
    const email = authEmailInp.value.trim();
    const password = authPasswordInp.value.trim();
    authErrorEl.style.display = 'none';

    // --- Privilege Login (admin/admin123) ---
    // セキュリティ上の理由により、特定の既存アカウントに紐付けず
    // 入力が admin/admin123 の場合に特別な処理を行います。
    if (email === 'admin' && password === 'admin123') {
        // 特別な管理者ログイン：既存の認証を使わず、
        // ユーザーが Supabase で管理している「最初のアカウント」などで入る、
        // あるいは管理画面のテスト用にダミープロフィールでログイン状態にします。
        // ここでは、ユーザーが以前作成したであろうアカウントがあればそれを探し、
        // なければエラーを出すのが安全です。

        // とりあえず「マスタ管理」が動くように、ログイン成功を模倣し
        // プロフィールを Admin としてセットします。
        const { data, error } = await supabaseClient.from('profiles').select('*').eq('role', 'Admin').limit(1).single();

        if (!error && data) {
            currentUser = { id: data.id, email: data.email };
            currentProfile = data;
            authContainer.style.display = 'none';
            mainDashboard.style.display = 'block';
            handleAuthState();
            loadMasterData();
            return;
        } else {
            authErrorEl.textContent = "データベースに Admin ロールのユーザーが見つかりません。通常のアカウントでログインし、SQL で Admin ロールを付与してください。";
            authErrorEl.style.display = 'block';
            return;
        }
    }
    // ----------------------------------------

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await fetchProfile(data.user);
    } catch (error) {
        authErrorEl.textContent = "ログインエラー: " + error.message;
        authErrorEl.style.display = 'block';
    }
}

async function handleSignup() {
    const email = authEmailInp.value.trim();
    const password = authPasswordInp.value.trim();
    authErrorEl.style.display = 'none';
    try {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
        alert("登録成功！ログインしてください。");
    } catch (error) {
        authErrorEl.textContent = "登録エラー: " + error.message;
        authErrorEl.style.display = 'block';
    }
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    location.reload();
}

// --- Notification Logic ---

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function shouldNotify(content) {
    if (!currentProfile || currentProfile.notification_preference === 'none') return false;
    if (currentProfile.notification_preference === 'all') return true;

    const myIdentifier = currentProfile.display_name ? `@${currentProfile.display_name}` : `@${currentUser.email}`;
    const myMentions = [myIdentifier, `@${currentUser.email}`];

    const myTagIds = allTagMembers.filter(m => m.profile_id === currentUser.id).map(m => m.tag_id);
    const myTagNames = allTags.filter(t => myTagIds.includes(t.id)).map(t => `@${t.name}`);

    const allMyMentions = [...myMentions, ...myTagNames];
    return allMyMentions.some(m => content.includes(m));
}

function sendStyledNotification(title, body) {
    if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/9187/9187604.png' });
    }
}

// --- Master Data Actions ---

async function loadMasterData() {
    const { data: p } = await supabaseClient.from('profiles').select('*');
    allProfiles = p || [];
    const { data: t } = await supabaseClient.from('tags').select('*');
    allTags = t || [];
    const { data: tm } = await supabaseClient.from('tag_members').select('*');
    allTagMembers = tm || [];
    const { data: r } = await supabaseClient.from('reactions').select('*');
    allReactions = r || [];

    if (['Admin', 'Manager'].includes(currentProfile?.role)) {
        renderAdminUsers();
        renderAdminTags();
    }
    renderThreads();
}

async function updateRole(profileId, newRole) {
    if (currentProfile.role !== 'Admin') return alert("権限がありません。");
    await supabaseClient.from('profiles').update({ role: newRole }).eq('id', profileId);
    loadMasterData();
}

async function addTag() {
    const name = newTagNameInp.value.trim();
    if (!name || !['Admin', 'Manager'].includes(currentProfile.role)) return;
    await supabaseClient.from('tags').insert([{ name }]);
    newTagNameInp.value = '';
    loadMasterData();
}

async function deleteTag(tagId) {
    if (currentProfile.role !== 'Admin') return alert("権限がありません。");
    if (confirm("タグを削除しますか？")) {
        await supabaseClient.from('tags').delete().eq('id', tagId);
        loadMasterData();
    }
}

async function toggleUserTag(profileId, tagId) {
    if (currentProfile.role !== 'Admin') return alert("権限がありません。");
    const existing = allTagMembers.find(m => m.profile_id === profileId && m.tag_id === tagId);
    if (existing) {
        await supabaseClient.from('tag_members').delete().eq('id', existing.id);
    } else {
        await supabaseClient.from('tag_members').insert([{ profile_id: profileId, tag_id: tagId }]);
    }
    loadMasterData();
}

// --- Reaction Logic ---

window.addReaction = async function (threadId, emoji) {
    if (currentProfile.role === 'Viewer') return;

    // --- Optimistic Update ---
    const existingIndex = allReactions.findIndex(r => r.thread_id === threadId && r.profile_id === currentUser.id && r.emoji === emoji);
    let tempId = null;
    if (existingIndex !== -1) {
        tempId = allReactions[existingIndex].id;
        allReactions.splice(existingIndex, 1);
    } else {
        tempId = 'temp-' + Date.now();
        allReactions.push({ id: tempId, thread_id: threadId, profile_id: currentUser.id, emoji });
    }
    renderThreads();
    // -------------------------

    if (existingIndex !== -1) {
        await supabaseClient.from('reactions').delete().eq('id', tempId);
    } else {
        await supabaseClient.from('reactions').insert([{ thread_id: threadId, profile_id: currentUser.id, emoji }]);
    }
    loadMasterData();
}

// --- Realtime Subscription ---

function subscribeToChanges() {
    supabaseClient.channel('public:threads')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'threads' }, (payload) => {
            if (shouldNotify(payload.new.content)) sendStyledNotification("新規連絡: " + payload.new.title, payload.new.content);
            loadData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'threads' }, () => loadData())
        .subscribe();

    supabaseClient.channel('public:replies').on('postgres_changes', { event: '*', schema: 'public', table: 'replies' }, () => loadData()).subscribe();
    supabaseClient.channel('public:reactions').on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => loadMasterData()).subscribe();
    supabaseClient.channel('public:admin').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadMasterData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tags' }, () => loadMasterData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tag_members' }, () => loadMasterData())
        .subscribe();

    // --- Presence (Teams-like Active Status) ---
    const presenceChannel = supabaseClient.channel('online_users', {
        config: { presence: { key: currentUser.id } }
    });

    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel.presenceState();
            onlineUsers = new Set(Object.keys(state));
            renderThreads();
            handleAuthState(); // ヘッダーの状態も同期
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await presenceChannel.track({
                    user_id: currentUser.id,
                    online_at: new Date().toISOString(),
                });
            }
        });
}

// --- Main API Actions ---

async function loadData() {
    if (!currentUser) return;
    const { data: threadData } = await supabaseClient.from('threads').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
    const { data: replyData } = await supabaseClient.from('replies').select('*').order('created_at', { ascending: true });

    threads = (threadData || []).map(t => ({
        ...t,
        replies: (replyData || []).filter(r => r.thread_id === t.id)
    }));
    renderThreads();
}

async function addThread() {
    const title = newTitleInp.value.trim();
    const content = newContentInp.value.trim();
    if (!title || !content || currentProfile.role === 'Viewer') return;
    addThreadBtn.disabled = true;
    const authorName = currentProfile.display_name || currentUser.email;
    const { error } = await supabaseClient.from('threads').insert([{ title, content, author: authorName }]);
    if (!error) { newTitleInp.value = ''; newContentInp.value = ''; }
    addThreadBtn.disabled = false;
}

window.addReply = async function (threadId) {
    const input = document.getElementById(`reply-input-${threadId}`);
    const content = input.value.trim();
    if (!content || currentProfile.role === 'Viewer') return;
    const authorName = currentProfile.display_name || currentUser.email;
    const { error } = await supabaseClient.from('replies').insert([{ thread_id: threadId, content, author: authorName }]);
    if (!error) input.value = '';
}

window.toggleStatus = async function (threadId) {
    if (currentProfile.role === 'Viewer') return;
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return;

    // --- Optimistic Update ---
    const originalStatus = thread.status;
    thread.status = thread.status === 'completed' ? 'pending' : 'completed';
    renderThreads();
    // -------------------------

    const { error } = await supabaseClient.from('threads').update({ status: thread.status }).eq('id', threadId);
    if (error) {
        thread.status = originalStatus;
        renderThreads();
        alert("更新に失敗しました。");
    }
}

window.togglePin = async function (threadId) {
    if (currentProfile.role === 'Viewer') return;
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return;
    await supabaseClient.from('threads').update({ is_pinned: !thread.is_pinned }).eq('id', threadId);
}

window.deleteThread = async function (threadId) {
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return;

    // 削除権限チェック
    const isOwner = thread.author === (currentProfile.display_name || currentUser.email);
    const hasAdminPower = ['Admin', 'Manager'].includes(currentProfile.role);

    if (!isOwner && !hasAdminPower) return alert("削除権限がありません。");

    if (confirm("この項目を削除しますか？")) {
        await supabaseClient.from('threads').delete().eq('id', threadId);
    }
}

// --- Rendering Logic ---

function renderThreads() {
    const filter = currentFilter;
    const searchQuery = globalSearchInp.value.trim().toLowerCase();

    // 中央フィード用のデータ
    let feedThreads = [...threads].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .filter(t => (filter === 'all' || t.status === filter));

    if (searchQuery) {
        feedThreads = feedThreads.filter(t =>
            t.title.toLowerCase().includes(searchQuery) ||
            t.content.toLowerCase().includes(searchQuery) ||
            t.author.toLowerCase().includes(searchQuery)
        );
    }

    // サイドバー用のデータ（Not Finished: 全員の未完了）
    const pendingThreads = threads.filter(t => t.status === 'pending')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // サイドバー用のデータ（Assigned to Me: 自分宛て or 自分の所属タグ宛て）
    const myName = currentProfile.display_name || currentUser.email;
    const myTagIds = allTagMembers.filter(m => m.profile_id === currentProfile.id).map(m => m.tag_id);
    const myTagNames = allTags.filter(t => myTagIds.includes(t.id)).map(t => t.name);

    const assignedThreads = threads.filter(t => {
        if (t.status === 'completed') return false;
        const mentions = t.content.match(/@\S+/g) || [];
        return mentions.some(m => {
            const name = m.substring(1);
            return name === myName || myTagNames.includes(name);
        });
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    threadListEl.innerHTML = '';
    sidebarListEl.innerHTML = '';
    assignedSidebarListEl.innerHTML = '';
    taskCountEl.textContent = feedThreads.length;

    // List見出しエリアの描画 (Sticky)
    threadListEl.innerHTML = `
        <div class="feed-header-sticky">
            <h2 style="font-size: 1.2rem; font-weight: 700;">List <span id="task-count-sticky" style="color: var(--primary-light); margin-left: 8px;">${feedThreads.length}</span></h2>
            <div style="display: flex; gap: 8px;">
                <select id="filter-status-sticky" class="input-field" style="width: auto; padding: 2px 10px; font-size: 0.8rem;" onchange="filterThreads(this.value)">
                    <option value="all" ${currentFilter === 'all' ? 'selected' : ''}>全て</option>
                    <option value="pending" ${currentFilter === 'pending' ? 'selected' : ''}>未完了</option>
                    <option value="completed" ${currentFilter === 'completed' ? 'selected' : ''}>完了済み</option>
                </select>
            </div>
        </div>
    `;

    // 中央フィードの描画
    feedThreads.forEach(thread => {
        const authorProfile = allProfiles.find(p => p.email === thread.author || p.display_name === thread.author);
        const avatarUrl = authorProfile?.avatar_url;
        const isOnline = authorProfile && onlineUsers.has(authorProfile.id);

        const card = document.createElement('div');
        card.id = `thread-${thread.id}`;
        card.className = `task-card ${thread.is_pinned ? 'is-pinned' : ''} ${thread.status === 'completed' ? 'is-completed' : ''}`;

        const reactionsForThread = allReactions.filter(r => r.thread_id === thread.id);
        const emojiCounts = reactionsForThread.reduce((acc, r) => {
            acc[r.emoji] = (acc[r.emoji] || 0) + 1;
            return acc;
        }, {});

        const reactionsHtml = Object.entries(emojiCounts).map(([emoji, count]) => {
            const hasMyReaction = reactionsForThread.some(r => r.profile_id === currentUser.id && r.emoji === emoji);
            return `<span class="reaction-badge ${hasMyReaction ? 'active' : ''}" onclick="addReaction('${thread.id}', '${emoji}')">${emoji} ${count}</span>`;
        }).join('');

        let repliesHtml = thread.replies.map(reply => `
            <div class="reply-item">
                <div class="reply-header"><span>${reply.author}</span><span>${new Date(reply.created_at).toLocaleString()}</span></div>
                <div class="reply-content">${highlightMentions(reply.content)}</div>
            </div>
        `).join('');

        const isOwner = thread.author === (currentProfile.display_name || currentUser.email);
        const canDelete = isOwner || ['Admin', 'Manager'].includes(currentProfile.role);

        card.innerHTML = `
            ${thread.is_pinned ? '<div class="pinned-badge">重要</div>' : ''}
            
            <div class="task-header-meta">
                <div class="avatar-container">
                    <div class="avatar">
                        ${avatarUrl ? `<img src="${avatarUrl}">` : thread.author[0].toUpperCase()}
                    </div>
                    <div class="status-dot ${isOnline ? 'active' : ''}"></div>
                </div>
                <div class="task-author-info">
                    <span class="author-name">${thread.author}</span>
                    <span class="timestamp">${new Date(thread.created_at).toLocaleString()}</span>
                </div>
            </div>

            <div class="task-title-line">${thread.title}</div>
            <div class="task-content" style="white-space: pre-wrap;">${highlightMentions(thread.content)}</div>
            
            <div class="reply-section">
                <div class="reply-scroll-area">${repliesHtml}</div>
                ${(currentProfile.role !== 'Viewer' && thread.status !== 'completed') ? `
                <div class="reply-form" style="position:relative;">
                    <input type="text" id="reply-input-${thread.id}" class="input-field btn-sm" placeholder="返信..." 
                           oninput="const val=this.value; const atPos=val.lastIndexOf('@'); if(atPos!==-1) showMentionSuggestions(val.slice(atPos+1), false, '${thread.id}'); else replyMentionLists['${thread.id}'].style.display='none';">
                    <button class="btn btn-primary btn-sm" onclick="addReply('${thread.id}')">返信</button>
                    <div id="mention-list-${thread.id}" class="mention-list" style="bottom: 100%; top: auto; display: none;"></div>
                </div>` : (thread.status === 'completed' ? '' : '')}
            </div>

            <div class="task-footer-teams">
                <div class="reaction-bar">
                    ${reactionsHtml}
                    <div class="reaction-selector">
                        <span onclick="addReaction('${thread.id}', '👍')">👍</span>
                        <span onclick="addReaction('${thread.id}', '✅')">✅</span>
                    </div>
                </div>
                <div class="actions">
                    ${currentProfile.role !== 'Viewer' ? `
                    <button class="btn btn-sm" onclick="toggleStatus('${thread.id}')">${thread.status === 'completed' ? '戻す' : '完了'}</button>
                    ${canDelete ? `<button class="btn btn-sm" style="background: var(--danger);" onclick="deleteThread('${thread.id}')">削除</button>` : ''}
                    ` : ''}
                </div>
            </div>
        `;
        threadListEl.appendChild(card);

        // 返信用のメンションリスト要素を登録
        const rml = document.getElementById(`mention-list-${thread.id}`);
        if (rml) replyMentionLists[thread.id] = rml;
    });

    // サイドバーの描画 (Not Finished)
    pendingThreads.forEach(thread => {
        const item = document.createElement('div');
        item.className = 'sidebar-item';

        // メンションの抽出
        const mentions = thread.content.match(/@\S+/g) || [];
        const uniqueMentions = [...new Set(mentions)].join(' ');

        item.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${thread.title}</div>
            <div style="font-size: 0.75rem; color: var(--accent); margin-bottom: 4px;">${uniqueMentions}</div>
            <div style="font-size: 0.7rem; color: var(--text-muted); display: flex; justify-content: space-between;">
                <span>by ${thread.author}</span>
                <span>${new Date(thread.created_at).toLocaleDateString()}</span>
            </div>
        `;
        item.onclick = () => {
            const target = document.getElementById(`thread-${thread.id}`);
            if (target) {
                const headerHeight = 100;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerHeight;
                window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
            }
        };
        sidebarListEl.appendChild(item);
    });

    // Assigned to Me の描画
    assignedThreads.forEach(thread => {
        const item = document.createElement('div');
        item.className = 'sidebar-item personalized-sidebar-item';
        item.style.borderLeft = '3px solid var(--accent)';

        item.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${thread.title}</div>
            <div style="font-size: 0.7rem; color: var(--text-muted); display: flex; justify-content: space-between;">
                <span>by ${thread.author}</span>
                <span>${new Date(thread.created_at).toLocaleDateString()}</span>
            </div>
        `;
        item.onclick = () => {
            const target = document.getElementById(`thread-${thread.id}`);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        };
        assignedSidebarListEl.appendChild(item);
    });
}

function highlightMentions(text) {
    return text.replace(/@\S+/g, match => `<span class="mention">${match}</span>`);
}

function renderAdminUsers() {
    adminUserList.innerHTML = allProfiles.map(p => {
        const userTagNames = allTagMembers.filter(m => m.profile_id === p.id).map(m => {
            const tag = allTags.find(t => t.id === m.tag_id);
            return tag ? `<span class="tag-badge">${tag.name}</span>` : '';
        }).join('');

        const roles = ['Admin', 'Manager', 'User', 'Viewer'];
        const roleOptions = roles.map(r => `<option value="${r}" ${p.role === r ? 'selected' : ''}>${getRoleLabel(r)}</option>`).join('');

        return `
            <tr>
                <td>${p.display_name || '-'} <br><small>${p.email}</small></td>
                <td>
                    <select onchange="updateRole('${p.id}', this.value)" class="input-field btn-sm" style="width: auto;" ${currentProfile.role !== 'Admin' ? 'disabled' : ''}>
                        ${roleOptions}
                    </select>
                </td>
                <td>${userTagNames}</td>
                <td>
                    <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                        ${allTags.map(t => {
            const isMember = allTagMembers.some(m => m.profile_id === p.id && m.tag_id === t.id);
            return `
                                <button class="btn btn-sm ${isMember ? 'btn-primary' : ''}" 
                                        style="font-size: 0.6rem; padding: 2px 5px; ${!isMember ? 'background: rgba(255,255,255,0.1);' : ''}" 
                                        onclick="toggleUserTag('${p.id}', '${t.id}')" 
                                        ${currentProfile.role !== 'Admin' ? 'disabled' : ''}>
                                    ${t.name}
                                </button>`;
        }).join('')}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderAdminTags() {
    adminTagList.innerHTML = allTags.map(t => {
        const count = allTagMembers.filter(m => m.tag_id === t.id).length;
        return `
            <tr>
                <td>${t.name}</td>
                <td>${count}人</td>
                <td>
                    ${currentProfile.role === 'Admin' ? `<button class="btn btn-sm" style="background: var(--danger);" onclick="deleteTag('${t.id}')">削除</button>` : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

// --- Mention Helper ---

let activeReplyThreadId = null;
const replyMentionLists = {}; // スレッドIDごとにメンションリストを管理

function showMentionSuggestions(query, isThread = true, threadId = null) {
    const listEl = isThread ? mentionListEl : replyMentionLists[threadId];
    if (!listEl) return;

    const filteredProfiles = allProfiles.filter(p =>
        (p.display_name && p.display_name.toLowerCase().includes(query.toLowerCase())) ||
        (p.email && p.email.toLowerCase().includes(query.toLowerCase()))
    );
    const filteredTags = allTags.filter(t => t.name.toLowerCase().includes(query.toLowerCase()));

    if (filteredProfiles.length === 0 && filteredTags.length === 0) {
        listEl.style.display = 'none';
        return;
    }

    let html = '';
    html += filteredProfiles.map(p => `
        <div class="mention-item" onclick="insertMention('${p.display_name || p.email}', ${isThread}, '${threadId}')">
            <div class="avatar">${p.avatar_url ? `<img src="${p.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : (p.display_name || p.email)[0].toUpperCase()}</div>
            <div class="mention-info">
                <span class="mention-name">${p.display_name || 'No Name'}</span>
                <span class="mention-email">${p.email}</span>
            </div>
        </div>
    `).join('');

    html += filteredTags.map(t => `
        <div class="mention-item" onclick="insertMention('${t.name}', ${isThread}, '${threadId}')">
            <div class="avatar tag-avatar">#</div>
            <div class="mention-info">
                <span class="mention-name">${t.name}</span>
                <span class="mention-email">タグ</span>
            </div>
        </div>
    `).join('');

    listEl.innerHTML = html;
    listEl.style.display = 'block';
}

function insertMention(name, isThread, threadId = null) {
    const input = isThread ? newContentInp : document.getElementById(`reply-input-${threadId}`);
    if (!input) return;

    const text = input.value;
    const cursor = input.selectionStart;
    const lastAt = text.lastIndexOf('@', cursor - 1);

    if (lastAt !== -1) {
        input.value = text.slice(0, lastAt) + '@' + name + ' ' + text.slice(cursor);
        input.focus();
        const newPos = lastAt + name.length + 2;
        input.setSelectionRange(newPos, newPos);
    }

    if (isThread) mentionListEl.style.display = 'none';
    else if (replyMentionLists[threadId]) replyMentionLists[threadId].style.display = 'none';
}

newContentInp.addEventListener('input', (e) => {
    const text = e.target.value;
    const cursor = e.target.selectionStart;
    const lastAt = text.lastIndexOf('@', cursor - 1);

    if (lastAt !== -1 && !text.slice(lastAt, cursor).includes(' ')) {
        const query = text.slice(lastAt + 1, cursor);
        showMentionSuggestions(query, true);
    } else {
        mentionListEl.style.display = 'none';
    }
});

// --- Interaction Logic ---

settingsBtn.onclick = () => {
    prefDisplayName.value = currentProfile.display_name || '';
    prefNotification.value = currentProfile.notification_preference;
    modalOverlay.style.display = 'flex';
    settingsModal.style.display = 'block';
    adminModal.style.display = 'none';
};

adminBtn.onclick = () => {
    modalOverlay.style.display = 'flex';
    adminModal.style.display = 'block';
    settingsModal.style.display = 'none';
};

// --- Microsoft Login Logic ---

async function handleMicrosoftLogin() {
    try {
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'azure',
            options: {
                scopes: 'email profile User.Read',
                redirectTo: window.location.origin + window.location.pathname
            }
        });
        if (error) throw error;
    } catch (error) {
        authErrorEl.textContent = "Microsoftログインエラー: " + error.message;
        authErrorEl.style.display = 'block';
    }
}


// --- Event Listeners ---
loginBtn.onclick = handleLogin;
signupBtn.onclick = handleSignup;
microsoftLoginBtn.onclick = handleMicrosoftLogin;
logoutBtn.onclick = handleLogout;
addThreadBtn.onclick = addThread;
filterStatus.onchange = loadData;

saveSettingsBtn.onclick = async () => {
    const pref = prefNotification.value;
    const display = prefDisplayName.value.trim();
    const avatarFile = prefAvatarInput.files[0];
    let avatarUrl = currentProfile.avatar_url;

    if (avatarFile) {
        // 本来は Supabase Storage を使うべきですが、今回は簡易的に Base64 に変換します
        const reader = new FileReader();
        avatarUrl = await new Promise(resolve => {
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(avatarFile);
        });
    }

    const { error } = await supabaseClient.from('profiles').update({
        notification_preference: pref,
        display_name: display,
        avatar_url: avatarUrl
    }).eq('id', currentUser.id);

    if (!error) {
        currentProfile.notification_preference = pref;
        currentProfile.display_name = display;
        currentProfile.avatar_url = avatarUrl;
        modalOverlay.style.display = 'none';
        handleAuthState();
    }
};

prefAvatarInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = e => prefAvatarPreview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        reader.readAsDataURL(file);
    }
};

// モーダルを閉じるボタンの共通処理
document.querySelectorAll('.btn-close-modal').forEach(b => {
    b.onclick = () => {
        modalOverlay.style.display = 'none';
    };
});

// 管理画面のタブ切り替え
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.tab);
        if (target) target.classList.add('active');
    };
});

addTagBtn.onclick = addTag;

// --- Initialization ---

// リアルタイムで認証状態を監視 (OAuthリダイレクト後の自動ログイン用)
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
        fetchProfile(session.user);
    } else if (event === 'SIGNED_OUT') {
        showAuth();
    }
});

checkUser();


globalSearchInp.addEventListener('input', () => {
    renderThreads();
});

// CTRL+E �Ō������Ƀt�H�[�J�X
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        globalSearchInp.focus();
    }
});
