// ============================================
// CONFIGURAÇÃO
// ============================================
const API_URL = window.location.origin + '/api';
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';

let currentPath = 'Documentos/';
let allItems = [];
let isOnline = true; // COMEÇA COMO ONLINE
let sessionToken = null;

// Cache para melhorar performance
const folderCache = new Map();
const CACHE_DURATION = 60000; // 1 minuto

console.log('🚀 Sistema de Documentos iniciado');

document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
    setupDragAndDrop();
});

// ============================================
// AUTENTICAÇÃO
// ============================================
function verificarAutenticacao() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('sessionToken');

    if (tokenFromUrl) {
        sessionToken = tokenFromUrl;
        sessionStorage.setItem('documentosSession', tokenFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        sessionToken = sessionStorage.getItem('documentosSession');
    }

    if (!sessionToken) {
        mostrarTelaAcessoNegado();
        return;
    }

    inicializarApp();
}

function mostrarTelaAcessoNegado(mensagem = 'NÃO AUTORIZADO') {
    document.body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: var(--bg-primary); color: var(--text-primary); text-align: center; padding: 2rem;">
            <h1 style="font-size: 2.2rem; margin-bottom: 1rem;">${mensagem}</h1>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">Somente usuários autenticados podem acessar esta área.</p>
            <a href="${PORTAL_URL}" style="display: inline-block; background: var(--btn-register); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ir para o Portal</a>
        </div>
    `;
}

function inicializarApp() {
    checkServerStatus();
    setInterval(checkServerStatus, 30000); // 30s em vez de 15s
    loadCurrentFolder();
}

// ============================================
// STATUS DE CONEXÃO
// ============================================
async function checkServerStatus() {
    try {
        const response = await fetch(`${API_URL}/folders?path=${encodeURIComponent(currentPath)}`, {
            method: 'GET',
            headers: { 
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            }
        });

        if (response.status === 401) {
            sessionStorage.removeItem('documentosSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return false;
        }

        const wasOffline = !isOnline;
        isOnline = response.ok;
        
        if (wasOffline && isOnline) {
            console.log('✅ SERVIDOR ONLINE');
            loadCurrentFolder();
        }
        
        updateConnectionStatus();
        return isOnline;
    } catch (error) {
        isOnline = false;
        updateConnectionStatus();
        return false;
    }
}

function updateConnectionStatus() {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
        statusElement.className = isOnline ? 'connection-status online' : 'connection-status offline';
    }
}

// ============================================
// NAVEGAÇÃO
// ============================================
function updateBreadcrumb() {
    const breadcrumb = document.getElementById('breadcrumb');
    if (!breadcrumb) return;

    const parts = currentPath.split('/').filter(Boolean);
    let path = '';
    
    breadcrumb.innerHTML = parts.map((part, index) => {
        path += part + '/';
        const isLast = index === parts.length - 1;
        
        return `
            <span class="breadcrumb-item ${isLast ? 'active' : ''}" 
                  onclick="${isLast ? '' : `navigateTo('${path}')`}">
                ${part}
            </span>
            ${!isLast ? '<span class="breadcrumb-separator">›</span>' : ''}
        `;
    }).join('');

    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.disabled = currentPath === 'Documentos/';
    }
}

window.navigateTo = function(path) {
    currentPath = path;
    loadCurrentFolder();
};

window.goBack = function() {
    const parts = currentPath.split('/').filter(Boolean);
    if (parts.length <= 1) return;
    
    parts.pop();
    currentPath = parts.join('/') + '/';
    loadCurrentFolder();
};

// ============================================
// CARREGAR PASTA
// ============================================
async function loadCurrentFolder() {
    if (!isOnline) {
        showMessage('Sistema offline', 'error');
        return;
    }

    const tbody = document.getElementById('filesContainer');
    
    // Verificar cache primeiro
    const cached = folderCache.get(currentPath);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        allItems = cached.items;
        updateBreadcrumb();
        renderItems(allItems);
        return;
    }

    tbody.innerHTML = '<tr><td colspan="5" class="loading">Carregando...</td></tr>';

    try {
        const response = await fetch(`${API_URL}/folders?path=${encodeURIComponent(currentPath)}`, {
            method: 'GET',
            headers: { 
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            }
        });

        if (response.status === 401) {
            sessionStorage.removeItem('documentosSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            throw new Error('Erro ao carregar pasta');
        }

        const data = await response.json();
        allItems = [...data.folders, ...data.files];
        
        // Salvar no cache
        folderCache.set(currentPath, {
            items: allItems,
            timestamp: Date.now()
        });
        
        updateBreadcrumb();
        renderItems(allItems);
    } catch (error) {
        console.error('Erro ao carregar pasta:', error);
        showMessage('Erro ao carregar pasta', 'error');
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Erro ao carregar conteúdo</td></tr>';
    }
}

// ============================================
// RENDERIZAR ITENS (TABELA)
// ============================================
function renderItems(items) {
    const tbody = document.getElementById('filesContainer');
    
    if (!items || items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <p>Pasta vazia</p>
                    <p style="font-size: 0.9rem;">Crie uma pasta ou faça upload de arquivos</p>
                </td>
            </tr>
        `;
        return;
    }

    // OTIMIZAÇÃO: Usar DocumentFragment para renderização mais rápida
    const fragment = document.createDocumentFragment();

    items.forEach(item => {
        const row = document.createElement('tr');
        row.className = item.type === 'folder' ? 'folder-row' : 'file-row';
        
        if (item.type === 'folder') {
            row.innerHTML = `
                <td>
                    <div class="file-icon-cell">
                        <svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span class="file-name">${item.name}</span>
                    </div>
                </td>
                <td class="file-date">${formatDate(item.updated_at || item.created_at)}</td>
                <td class="file-type">Pasta de arquivos</td>
                <td class="file-size">—</td>
                <td></td>
            `;
            
            row.addEventListener('click', (e) => {
                if (e.button === 0) navigateTo(item.path);
            });
            
            row.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showContextMenu(e, item.path, item.name, 'folder');
            });
        } else {
            const fileExtension = item.name.split('.').pop().toUpperCase();
            const fileSize = formatFileSize(item.size);
            const mimeType = getMimeTypeDescription(item.mimetype);
            
            // Ícone SVG baseado no tipo
            let svgIcon = `<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
            </svg>`;
            
            row.innerHTML = `
                <td>
                    <div class="file-icon-cell">
                        ${svgIcon}
                        <span class="file-name">${item.name}</span>
                    </div>
                </td>
                <td class="file-date">${formatDate(item.updated_at || item.created_at)}</td>
                <td class="file-type">${mimeType}</td>
                <td class="file-size">${fileSize}</td>
                <td></td>
            `;
            
            row.draggable = true;
            row.dataset.filepath = item.path;
            row.dataset.filename = item.name;
            
            row.addEventListener('dragstart', async (e) => {
                e.dataTransfer.effectAllowed = 'copy';
                row.style.opacity = '0.5';
                
                try {
                    // Buscar arquivo do servidor
                    const response = await fetch(`${API_URL}/download?path=${encodeURIComponent(item.path)}`, {
                        headers: { 'X-Session-Token': sessionToken }
                    });
                    
                    if (response.ok) {
                        const blob = await response.blob();
                        
                        // Detectar MIME type correto
                        let mimeType = blob.type || 'application/octet-stream';
                        const ext = item.name.split('.').pop().toUpperCase();
                        
                        if (ext === 'PDF') mimeType = 'application/pdf';
                        else if (ext === 'XML') mimeType = 'text/xml';
                        else if (ext === 'DOCX') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                        else if (ext === 'DOC') mimeType = 'application/msword';
                        else if (ext === 'XLSX') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                        else if (ext === 'XLS') mimeType = 'application/vnd.ms-excel';
                        
                        // Criar File com nome e tipo corretos
                        const file = new File([blob], item.name, { 
                            type: mimeType,
                            lastModified: new Date(item.updated_at || item.created_at).getTime()
                        });
                        
                        // Adicionar aos dados de transferência
                        e.dataTransfer.items.add(file);
                        
                        // Adicionar como URL também (para navegadores)
                        const url = window.URL.createObjectURL(blob);
                        e.dataTransfer.setData('text/uri-list', url);
                        e.dataTransfer.setData('text/plain', item.name);
                        
                        // Liberar URL após drag
                        setTimeout(() => window.URL.revokeObjectURL(url), 5000);
                    }
                } catch (error) {
                    console.error('Erro ao preparar arquivo:', error);
                }
            });
            
            row.addEventListener('dragend', () => {
                row.style.opacity = '1';
            });
            
            row.addEventListener('click', (e) => {
                if (e.button === 0) viewFile(item.path, item.name);
            });
            
            row.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showContextMenu(e, item.path, item.name, 'file');
            });
        }
        
        fragment.appendChild(row);
    });

    // OTIMIZAÇÃO: Uma única operação DOM
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}

function getFileIcon(extension) {
    // Retorna vazio - ícone será via CSS ou sem ícone
    return '';
}

function getMimeTypeDescription(mimetype) {
    const types = {
        'application/pdf': 'Documento PDF',
        'application/msword': 'Documento Word',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Documento Word',
        'text/xml': 'Documento XML',
        'application/xml': 'Documento XML',
        'image/jpeg': 'Imagem JPEG',
        'image/png': 'Imagem PNG',
        'text/plain': 'Arquivo de Texto'
    };
    return types[mimetype] || 'Arquivo';
}

function formatDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
        return 'Hoje ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
        return 'Ontem';
    } else if (days < 7) {
        return days + ' dias atrás';
    } else {
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// ============================================
// FILTRAR ITENS (BUSCA GLOBAL)
// ============================================
let searchTimeout;

async function filterItems() {
    const searchTerm = document.getElementById('search')?.value.toLowerCase() || '';
    
    if (searchTimeout) clearTimeout(searchTimeout);
    
    // Busca local imediata para feedback rápido
    if (!searchTerm) {
        renderItems(allItems);
        return;
    }

    const localFiltered = allItems.filter(item => 
        item.name.toLowerCase().includes(searchTerm)
    );
    
    // Renderização imediata
    renderItems(localFiltered);

    // Busca global apenas com 3+ caracteres e após 300ms (era 800ms)
    if (searchTerm.length >= 3) {
        searchTimeout = setTimeout(async () => {
            try {
                const response = await fetch(`${API_URL}/search?q=${encodeURIComponent(searchTerm)}`, {
                    headers: { 
                        'X-Session-Token': sessionToken,
                        'Accept': 'application/json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    
                    if (data.results && data.results.length > 0) {
                        const resultsWithPath = data.results.map(item => ({
                            ...item,
                            displayPath: item.folder.replace('Documentos/', '')
                        }));
                        
                        renderSearchResults(resultsWithPath);
                    }
                }
            } catch (error) {
                console.error('Erro na busca global:', error);
            }
        }, 300); // 300ms em vez de 800ms - MUITO MAIS RÁPIDO
    }
}

function renderSearchResults(results) {
    const tbody = document.getElementById('filesContainer');
    
    if (!results || results.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                    <p>Nenhum resultado encontrado</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';

    results.forEach(item => {
        const row = document.createElement('tr');
        row.className = item.type === 'folder' ? 'folder-row' : 'file-row';
        
        if (item.type === 'folder') {
            row.innerHTML = `
                <td>
                    <div class="file-icon-cell">
                        <svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <div>
                            <div class="file-name">${item.name}</div>
                            <div class="file-date" style="font-size: 0.75rem;">${item.displayPath || '/'}</div>
                        </div>
                    </div>
                </td>
                <td class="file-date">${formatDate(item.updated_at || item.created_at)}</td>
                <td class="file-type">Pasta de arquivos</td>
                <td class="file-size">—</td>
                <td></td>
            `;
            
            row.addEventListener('click', () => navigateTo(item.path));
            row.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showContextMenu(e, item.path, item.name, 'folder');
            });
        } else {
            const fileExtension = item.name.split('.').pop().toUpperCase();
            const fileSize = formatFileSize(item.size);
            const mimeType = getMimeTypeDescription(item.mimetype);
            
            let svgIcon = `<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
            </svg>`;
            
            row.innerHTML = `
                <td>
                    <div class="file-icon-cell">
                        ${svgIcon}
                        <div>
                            <div class="file-name">${item.name}</div>
                            <div class="file-date" style="font-size: 0.75rem;">${item.displayPath || '/'}</div>
                        </div>
                    </div>
                </td>
                <td class="file-date">${formatDate(item.updated_at || item.created_at)}</td>
                <td class="file-type">${mimeType}</td>
                <td class="file-size">${fileSize}</td>
                <td></td>
            `;
            
            row.draggable = true;
            row.dataset.filepath = item.path;
            row.dataset.filename = item.name;
            
            row.addEventListener('dragstart', async (e) => {
                e.dataTransfer.effectAllowed = 'copy';
                row.style.opacity = '0.5';
                try {
                    const response = await fetch(`${API_URL}/download?path=${encodeURIComponent(item.path)}`, {
                        headers: { 'X-Session-Token': sessionToken }
                    });
                    if (response.ok) {
                        const blob = await response.blob();
                        
                        let mimeType = blob.type || 'application/octet-stream';
                        const ext = item.name.split('.').pop().toUpperCase();
                        
                        if (ext === 'PDF') mimeType = 'application/pdf';
                        else if (ext === 'XML') mimeType = 'text/xml';
                        else if (ext === 'DOCX') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                        else if (ext === 'DOC') mimeType = 'application/msword';
                        else if (ext === 'XLSX') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                        else if (ext === 'XLS') mimeType = 'application/vnd.ms-excel';
                        
                        const file = new File([blob], item.name, { 
                            type: mimeType,
                            lastModified: new Date(item.updated_at || item.created_at).getTime()
                        });
                        
                        e.dataTransfer.items.add(file);
                        
                        const url = window.URL.createObjectURL(blob);
                        e.dataTransfer.setData('text/uri-list', url);
                        e.dataTransfer.setData('text/plain', item.name);
                        
                        setTimeout(() => window.URL.revokeObjectURL(url), 5000);
                    }
                } catch (error) {
                    console.error('Erro:', error);
                }
            });
            
            row.addEventListener('dragend', () => { row.style.opacity = '1'; });
            row.addEventListener('click', () => viewFile(item.path, item.name));
            row.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showContextMenu(e, item.path, item.name, 'file');
            });
        }
        
        tbody.appendChild(row);
    });
}

// ============================================
// CRIAR PASTA
// ============================================
window.showNewFolderModal = function() {
    const modalHTML = `
        <div class="modal-overlay" id="newFolderModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Nova Pasta</h3>
                </div>
                <form onsubmit="createFolder(event)">
                    <div class="form-group">
                        <label for="folderName">Nome da Pasta:</label>
                        <input type="text" id="folderName" required autofocus>
                    </div>
                    <div class="modal-actions">
                        <button type="submit" class="save">Criar</button>
                        <button type="button" class="secondary" onclick="closeModal('newFolderModal')">Cancelar</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
};

async function createFolder(event) {
    event.preventDefault();
    
    const folderName = document.getElementById('folderName').value.trim();
    
    if (!folderName) {
        showMessage('Nome da pasta é obrigatório', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/folders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken
            },
            body: JSON.stringify({
                path: currentPath,
                name: folderName
            })
        });

        if (response.status === 409) {
            showMessage('Pasta já existe', 'error');
            return;
        }

        if (!response.ok) {
            throw new Error('Erro ao criar pasta');
        }

        showMessage('Pasta criada com sucesso!', 'success');
        closeModal('newFolderModal');
        
        // Invalidar cache
        folderCache.delete(currentPath);
        
        loadCurrentFolder();
    } catch (error) {
        console.error('Erro:', error);
        showMessage('Erro ao criar pasta', 'error');
    }
}

// ============================================
// UPLOAD DE ARQUIVO
// ============================================
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    await uploadFile(file);
    event.target.value = '';
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', currentPath);

    try {
        showMessage('Enviando arquivo...', 'success');

        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: {
                'X-Session-Token': sessionToken
            },
            body: formData
        });

        if (response.status === 409) {
            showMessage('Arquivo já existe', 'error');
            return;
        }

        if (!response.ok) {
            throw new Error('Erro no upload');
        }

        showMessage('Arquivo enviado com sucesso!', 'success');
        
        // Invalidar cache
        folderCache.delete(currentPath);
        
        loadCurrentFolder();
    } catch (error) {
        console.error('Erro:', error);
        showMessage('Erro ao enviar arquivo', 'error');
    }
}

// ============================================
// DRAG AND DROP
// ============================================
function setupDragAndDrop() {
    const dropZone = document.getElementById('dropZone');
    let dragCounter = 0;

    document.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        if (dragCounter === 1) {
            dropZone.classList.remove('hidden');
            dropZone.classList.add('active');
        }
    });

    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) {
            dropZone.classList.remove('active');
            setTimeout(() => dropZone.classList.add('hidden'), 300);
        }
    });

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    document.addEventListener('drop', async (e) => {
        e.preventDefault();
        dragCounter = 0;
        dropZone.classList.remove('active');
        setTimeout(() => dropZone.classList.add('hidden'), 300);

        const files = Array.from(e.dataTransfer.files);

        for (const file of files) {
            await uploadFile(file);
        }
    });
}

// ============================================
// MENU DE CONTEXTO
// ============================================
function showContextMenu(event, itemPath, itemName, type) {
    const oldMenu = document.getElementById('contextMenu');
    if (oldMenu) oldMenu.remove();

    const menu = document.createElement('div');
    menu.id = 'contextMenu';
    menu.className = 'context-menu';
    
    if (type === 'folder') {
        menu.innerHTML = `
            <div class="context-menu-item" onclick="navigateTo('${itemPath}')">
                <span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                </span> Abrir
            </div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item" onclick="showRenameModal('${itemPath}', '${itemName}', 'folder')">
                <span>✏️</span> Renomear
            </div>
            <div class="context-menu-item danger" onclick="deleteItem('${itemPath}', 'folder')">
                <span>🗑️</span> Excluir
            </div>
        `;
    } else {
        menu.innerHTML = `
            <div class="context-menu-item" onclick="viewFile('${itemPath}', '${itemName}')">
                <span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </span> Visualizar
            </div>
            <div class="context-menu-item" onclick="downloadFile('${itemPath}', '${itemName}')">
                <span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                </span> Baixar
            </div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item" onclick="showRenameModal('${itemPath}', '${itemName}', 'file')">
                <span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </span> Renomear
            </div>
            <div class="context-menu-item danger" onclick="deleteItem('${itemPath}', 'file')">
                <span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </span> Excluir
            </div>
        `;
    }

    document.body.appendChild(menu);

    const x = event.clientX;
    const y = event.clientY;
    const menuWidth = 200;
    const menuHeight = menu.offsetHeight;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const posX = (x + menuWidth > windowWidth) ? windowWidth - menuWidth - 10 : x;
    const posY = (y + menuHeight > windowHeight) ? windowHeight - menuHeight - 10 : y;

    menu.style.left = posX + 'px';
    menu.style.top = posY + 'px';
    menu.style.display = 'block';

    setTimeout(() => {
        document.addEventListener('click', closeContextMenu);
    }, 10);
}

function closeContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (menu) {
        menu.remove();
        document.removeEventListener('click', closeContextMenu);
    }
}

// ============================================
// VISUALIZAR ARQUIVO
// ============================================
window.viewFile = async function(filePath, fileName) {
    closeContextMenu();
    
    try {
        const fileExtension = fileName.split('.').pop().toUpperCase();
        
        // PDFs e XMLs: abrir em nova aba diretamente
        if (['PDF', 'XML', 'TXT', 'JPG', 'JPEG', 'PNG'].includes(fileExtension)) {
            const response = await fetch(`${API_URL}/download?path=${encodeURIComponent(filePath)}`, {
                method: 'GET',
                headers: { 'X-Session-Token': sessionToken }
            });

            if (!response.ok) {
                throw new Error('Erro ao visualizar arquivo');
            }

            const blob = await response.blob();
            
            // Criar blob com tipo correto
            let mimeType = 'application/octet-stream';
            if (fileExtension === 'PDF') mimeType = 'application/pdf';
            else if (fileExtension === 'XML') mimeType = 'text/xml';
            else if (fileExtension === 'TXT') mimeType = 'text/plain';
            else if (['JPG', 'JPEG'].includes(fileExtension)) mimeType = 'image/jpeg';
            else if (fileExtension === 'PNG') mimeType = 'image/png';
            
            const typedBlob = new Blob([blob], { type: mimeType });
            const url = window.URL.createObjectURL(typedBlob);
            
            // Abrir em nova aba
            window.open(url, '_blank');
            
            // Liberar URL após um tempo
            setTimeout(() => window.URL.revokeObjectURL(url), 60000);
        } 
        // Word, Excel: baixar automaticamente
        else {
            downloadFile(filePath, fileName);
        }
        
    } catch (error) {
        console.error('Erro:', error);
        showMessage('Erro ao visualizar arquivo', 'error');
    }
};

// ============================================
// DOWNLOAD DE ARQUIVO
// ============================================
window.downloadFile = async function(filePath, fileName) {
    closeContextMenu();
    
    try {
        showMessage('Baixando arquivo...', 'success');

        const response = await fetch(`${API_URL}/download?path=${encodeURIComponent(filePath)}`, {
            method: 'GET',
            headers: { 'X-Session-Token': sessionToken }
        });

        if (!response.ok) {
            throw new Error('Erro ao baixar arquivo');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showMessage('Arquivo baixado!', 'success');
    } catch (error) {
        console.error('Erro:', error);
        showMessage('Erro ao baixar arquivo', 'error');
    }
};

// ============================================
// RENOMEAR
// ============================================
window.showRenameModal = function(itemPath, currentName, type) {
    closeContextMenu();
    
    const modalHTML = `
        <div class="modal-overlay" id="renameModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Renomear ${type === 'folder' ? 'Pasta' : 'Arquivo'}</h3>
                </div>
                <form onsubmit="renameItem(event, '${itemPath}', '${type}')">
                    <div class="form-group">
                        <label for="newName">Novo Nome:</label>
                        <input type="text" id="newName" value="${currentName}" required autofocus>
                    </div>
                    <div class="modal-actions">
                        <button type="submit" class="save">Renomear</button>
                        <button type="button" class="secondary" onclick="closeModal('renameModal')">Cancelar</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    setTimeout(() => {
        const input = document.getElementById('newName');
        const lastDot = currentName.lastIndexOf('.');
        if (lastDot > 0 && type === 'file') {
            input.setSelectionRange(0, lastDot);
        } else {
            input.select();
        }
    }, 100);
};

async function renameItem(event, oldPath, type) {
    event.preventDefault();
    
    const newName = document.getElementById('newName').value.trim();
    
    if (!newName) {
        showMessage('Nome não pode estar vazio', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/rename`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken
            },
            body: JSON.stringify({
                oldPath: oldPath,
                newName: newName,
                type: type
            })
        });

        if (!response.ok) {
            throw new Error('Erro ao renomear');
        }

        showMessage('Item renomeado com sucesso!', 'success');
        closeModal('renameModal');
        
        // Invalidar cache
        folderCache.delete(currentPath);
        
        loadCurrentFolder();
    } catch (error) {
        console.error('Erro:', error);
        showMessage('Erro ao renomear item', 'error');
    }
}

// ============================================
// DELETAR
// ============================================
window.deleteItem = async function(itemPath, type) {
    closeContextMenu();
    
    const confirmed = await showConfirm(
        `Tem certeza que deseja excluir ${type === 'folder' ? 'esta pasta e todo seu conteúdo' : 'este arquivo'}?`,
        {
            title: 'Confirmar Exclusão',
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            type: 'warning'
        }
    );

    if (!confirmed) return;

    try {
        const response = await fetch(`${API_URL}/delete?path=${encodeURIComponent(itemPath)}&type=${type}`, {
            method: 'DELETE',
            headers: { 'X-Session-Token': sessionToken }
        });

        if (!response.ok) {
            throw new Error('Erro ao deletar');
        }

        showMessage('Item excluído com sucesso!', 'success');
        
        // Invalidar cache
        folderCache.delete(currentPath);
        
        loadCurrentFolder();
    } catch (error) {
        console.error('Erro:', error);
        showMessage('Erro ao excluir item', 'error');
    }
};

// ============================================
// MODAL DE CONFIRMAÇÃO
// ============================================
function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const { title = 'Confirmação', confirmText = 'Confirmar', cancelText = 'Cancelar', type = 'warning' } = options;

        const modalHTML = `
            <div class="modal-overlay" id="confirmModal" style="z-index: 10001;">
                <div class="modal-content" style="max-width: 450px;">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                    </div>
                    <p style="margin: 1.5rem 0; color: var(--text-primary); font-size: 1rem; line-height: 1.6;">${message}</p>
                    <div class="modal-actions">
                        <button class="secondary" id="modalCancelBtn">${cancelText}</button>
                        <button class="${type === 'warning' ? 'danger' : 'success'}" id="modalConfirmBtn">${confirmText}</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modal = document.getElementById('confirmModal');
        const confirmBtn = document.getElementById('modalConfirmBtn');
        const cancelBtn = document.getElementById('modalCancelBtn');

        const closeModal = (result) => {
            modal.style.animation = 'fadeOut 0.2s ease forwards';
            setTimeout(() => { 
                modal.remove(); 
                resolve(result); 
            }, 200);
        };

        confirmBtn.addEventListener('click', () => closeModal(true));
        cancelBtn.addEventListener('click', () => closeModal(false));
    });
}

// ============================================
// UTILITÁRIOS
// ============================================
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
}

function showMessage(message, type) {
    const oldMessages = document.querySelectorAll('.floating-message');
    oldMessages.forEach(msg => msg.remove());
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `floating-message ${type}`;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => messageDiv.remove(), 300);
    }, 3000);
}
