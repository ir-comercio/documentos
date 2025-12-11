// ============================================
// CONFIGURAÇÃO
// ============================================
const API_URL = window.location.origin + '/api';
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';

let currentPath = 'Documentos/';
let allItems = [];
let isOnline = false;
let sessionToken = null;

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
    setInterval(checkServerStatus, 15000);
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
    const statusText = document.getElementById('statusText');
    if (statusElement) {
        statusElement.className = isOnline ? 'connection-status online' : 'connection-status offline';
        if (statusText) {
            statusText.textContent = isOnline ? 'Online' : 'Offline';
        }
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

    // Atualizar botão voltar
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
    if (parts.length <= 1) return; // Já está em Documentos/
    
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

    const container = document.getElementById('filesContainer');
    container.innerHTML = '<div class="loading">Carregando...</div>';

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
        
        updateBreadcrumb();
        renderItems(allItems);
    } catch (error) {
        console.error('Erro ao carregar pasta:', error);
        showMessage('Erro ao carregar pasta', 'error');
        container.innerHTML = '<div class="empty-state">Erro ao carregar conteúdo</div>';
    }
}

// ============================================
// RENDERIZAR ITENS
// ============================================
function renderItems(items) {
    const container = document.getElementById('filesContainer');
    
    if (!items || items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <p>Pasta vazia</p>
                <p style="font-size: 0.9rem;">Crie uma pasta ou faça upload de arquivos</p>
            </div>
        `;
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'files-grid';

    items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = item.type === 'folder' ? 'folder-item' : 'file-item';
        
        if (item.type === 'folder') {
            itemDiv.innerHTML = `
                <div class="item-icon" onclick="navigateTo('${item.path}')">📁</div>
                <div class="item-name">${item.name}</div>
                <div class="item-actions">
                    <button class="view small" onclick="navigateTo('${item.path}')">Abrir</button>
                    <button class="edit small" onclick="showRenameModal('${item.path}', '${item.name}', 'folder')">Renomear</button>
                    <button class="delete small" onclick="deleteItem('${item.path}', 'folder')">Excluir</button>
                </div>
            `;
        } else {
            const fileExtension = item.name.split('.').pop().toUpperCase();
            const fileIcon = getFileIcon(fileExtension);
            const fileSize = formatFileSize(item.size);
            
            itemDiv.innerHTML = `
                <div class="item-icon">${fileIcon}</div>
                <div class="item-name">${item.name}</div>
                <div class="item-info">${fileExtension} • ${fileSize}</div>
                <div class="item-actions">
                    <button class="view small" onclick="downloadFile('${item.path}', '${item.name}')">Baixar</button>
                    <button class="edit small" onclick="showRenameModal('${item.path}', '${item.name}', 'file')">Renomear</button>
                    <button class="delete small" onclick="deleteItem('${item.path}', 'file')">Excluir</button>
                </div>
            `;
        }
        
        grid.appendChild(itemDiv);
    });

    container.innerHTML = '';
    container.appendChild(grid);
}

function getFileIcon(extension) {
    const icons = {
        'PDF': '📄',
        'DOC': '📝',
        'DOCX': '📝',
        'XML': '🔖'
    };
    return icons[extension] || '📄';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// ============================================
// FILTRAR ITENS
// ============================================
function filterItems() {
    const searchTerm = document.getElementById('search')?.value.toLowerCase() || '';
    
    if (!searchTerm) {
        renderItems(allItems);
        return;
    }

    const filtered = allItems.filter(item => 
        item.name.toLowerCase().includes(searchTerm)
    );

    renderItems(filtered);
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
    event.target.value = ''; // Limpar input
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
        const allowedTypes = ['application/pdf', 'application/msword', 
                             'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                             'text/xml', 'application/xml'];

        for (const file of files) {
            if (allowedTypes.includes(file.type)) {
                await uploadFile(file);
            } else {
                showMessage(`Arquivo ${file.name} não é permitido. Use PDF, Word ou XML.`, 'error');
            }
        }
    });
}

// ============================================
// DOWNLOAD DE ARQUIVO
// ============================================
window.downloadFile = async function(filePath, fileName) {
    try {
        showMessage('Baixando arquivo...', 'success');

        const response = await fetch(`${API_URL}/download?path=${encodeURIComponent(filePath)}`, {
            method: 'GET',
            headers: {
                'X-Session-Token': sessionToken
            }
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
    
    // Selecionar nome sem extensão
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
    const confirmed = await showConfirm(
        `Tem certeza que deseja excluir este ${type === 'folder' ? 'pasta e todo seu conteúdo' : 'arquivo'}?`,
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
            headers: {
                'X-Session-Token': sessionToken
            }
        });

        if (!response.ok) {
            throw new Error('Erro ao deletar');
        }

        showMessage('Item excluído com sucesso!', 'success');
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
