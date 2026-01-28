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
const filterStatus = document.getElementById('filter-status');

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
    userDisplayEl.textContent = currentProfile.display_name || currentUser.email;
    userRoleEl.textContent = getRoleLabel(currentProfile.role);

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

    const existing = allReactions.find(r => r.thread_id === threadId && r.profile_id === currentUser.id && r.emoji === emoji);
    if (existing) {
        await supabaseClient.from('reactions').delete().eq('id', existing.id);
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
    const newStatus = thread.status === 'completed' ? 'pending' : 'completed';
    await supabaseClient.from('threads').update({ status: newStatus }).eq('id', threadId);
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
    const filter = filterStatus.value;

    // 中央フィード用のデータ（時系列：古い順）
    const feedThreads = [...threads].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .filter(t => (filter === 'all' || t.status === filter));

    // サイドバー用のデータ（未完了のみ、新しい順）
    const pendingThreads = threads.filter(t => t.status === 'pending')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    threadListEl.innerHTML = '';
    sidebarListEl.innerHTML = '';
    taskCountEl.textContent = feedThreads.length;

    // 中央フィードの描画
    feedThreads.forEach(thread => {
        const card = document.createElement('div');
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
            <div class="task-header">
                <div class="user-info">
                    <div class="avatar">${thread.author[0].toUpperCase()}</div>
                    <div style="flex: 1;">
                        <div style="font-weight: bold; font-size: 1.1rem;">${thread.title}</div>
                        <div class="username">${thread.author} | ${new Date(thread.created_at).toLocaleString()}</div>
                    </div>
                </div>
            </div>
            <div class="task-content" style="white-space: pre-wrap;">${highlightMentions(thread.content)}</div>
            
            <div class="reaction-bar">
                ${reactionsHtml}
                <div class="reaction-selector">
                    <span onclick="addReaction('${thread.id}', '👍')">👍</span>
                    <span onclick="addReaction('${thread.id}', '✅')">✅</span>
                    <span onclick="addReaction('${thread.id}', '👀')">👀</span>
                    <span onclick="addReaction('${thread.id}', '🙏')">🙏</span>
                </div>
            </div>

            <div class="reply-section">${repliesHtml}
                ${currentProfile.role !== 'Viewer' ? `
                <div class="reply-form">
                    <input type="text" id="reply-input-${thread.id}" class="input-field btn-sm" placeholder="返信...">
                    <button class="btn btn-primary btn-sm" onclick="addReply('${thread.id}')">返信</button>
                </div>` : ''}
            </div>
            <div class="task-footer"><div class="actions">
                ${currentProfile.role !== 'Viewer' ? `
                <button class="btn btn-sm" onclick="toggleStatus('${thread.id}')">${thread.status === 'completed' ? '戻す' : '完了'}</button>
                <button class="btn btn-sm" onclick="togglePin('${thread.id}')">${thread.is_pinned ? '解除' : '重要'}</button>
                ` : ''}
                ${canDelete ? `<button class="btn btn-sm" style="background: var(--danger);" onclick="deleteThread('${thread.id}')">削除</button>` : ''}
            </div></div>
        `;
        threadListEl.appendChild(card);
    });

    // サイドバーの描画
    pendingThreads.forEach(thread => {
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        item.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px;">${thread.title}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; justify-content: space-between;">
                <span>${thread.author}</span>
                <span>${new Date(thread.created_at).toLocaleDateString()}</span>
            </div>
        `;
        item.onclick = () => {
            // クリックしたら該当のフィードにスクロール等（オプション）
        };
        sidebarListEl.appendChild(item);
    });
}

function highlightMentions(text) {
    return text.replace(/@\S+/g, match => `<span style="color: var(--accent-light); font-weight: bold; cursor: pointer;">${match}</span>`);
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

newContentInp.addEventListener('input', (e) => {
    const text = e.target.value;
    const cursor = e.target.selectionStart;
    const lastAt = text.lastIndexOf('@', cursor - 1);

    if (lastAt !== -1 && !text.slice(lastAt, cursor).includes(' ')) {
        const query = text.slice(lastAt + 1, cursor).toLowerCase();
        const candidates = [
            ...allProfiles.map(p => p.display_name || p.email),
            ...allTags.map(t => t.name)
        ].filter(n => n.toLowerCase().includes(query)).slice(0, 5);

        if (candidates.length > 0) {
            mentionListEl.innerHTML = candidates.map(c => `<div class="mention-item" onclick="insertMention('${c}', ${lastAt}, ${cursor})">@${c}</div>`).join('');
            mentionListEl.style.display = 'block';
        } else {
            mentionListEl.style.display = 'none';
        }
    } else {
        mentionListEl.style.display = 'none';
    }
});

window.insertMention = (name, start, end) => {
    const text = newContentInp.value;
    newContentInp.value = text.slice(0, start) + '@' + name + ' ' + text.slice(end);
    mentionListEl.style.display = 'none';
    newContentInp.focus();
};

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
    const { error } = await supabaseClient.from('profiles').update({
        notification_preference: pref,
        display_name: display
    }).eq('id', currentUser.id);
    if (!error) {
        currentProfile.notification_preference = pref;
        currentProfile.display_name = display;
        modalOverlay.style.display = 'none';
        handleAuthState();
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
