// script-extensions.js - Extensões para ZIP e Links Otimizados
// ADICIONE ESTE CÓDIGO AO FINAL DO SEU script.js EXISTENTE

// ============================================
// SELEÇÃO MÚLTIPLA DE ARQUIVOS
// ============================================
let selectedFiles = new Set();

function toggleFileSelection(fileId, event) {
    event.stopPropagation();
    
    if (selectedFiles.has(fileId)) {
        selectedFiles.delete(fileId);
    } else {
        selectedFiles.add(fileId);
    }
    
    updateSelectionUI();
    updateZipButton();
}

function updateSelectionUI() {
    document.querySelectorAll('.file-item').forEach(item => {
        const fileId = item.dataset.fileId;
        if (selectedFiles.has(fileId)) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

function updateZipButton() {
    const zipBtn = document.getElementById('zipSelectedBtn');
    if (!zipBtn) return;
    
    if (selectedFiles.size > 0) {
        zipBtn.style.display = 'flex';
        zipBtn.querySelector('.badge').textContent = selectedFiles.size;
    } else {
        zipBtn.style.display = 'none';
    }
}

function clearSelection() {
    selectedFiles.clear();
    updateSelectionUI();
    updateZipButton();
}

// ============================================
// CRIAR ZIP DE ARQUIVOS SELECIONADOS
// ============================================
async function zipSelectedFiles() {
    if (selectedFiles.size === 0) {
        mostrarNotificacao('Selecione arquivos para zipar', 'warning');
        return;
    }
    
    const zipName = prompt('Nome do arquivo ZIP:', 'arquivos.zip');
    if (!zipName) return;
    
    try {
        mostrarNotificacao(`Criando ZIP com ${selectedFiles.size} arquivos...`, 'info');
        
        const response = await fetch(`${API_URL}/zip/files`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken
            },
            body: JSON.stringify({
                fileIds: Array.from(selectedFiles),
                zipName: zipName.endsWith('.zip') ? zipName : `${zipName}.zip`
            })
        });
        
        if (!response.ok) throw new Error('Erro ao criar ZIP');
        
        // Download do ZIP
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipName.endsWith('.zip') ? zipName : `${zipName}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        mostrarNotificacao('ZIP criado com sucesso!', 'success');
        clearSelection();
        
    } catch (error) {
        console.error('Erro ao criar ZIP:', error);
        mostrarNotificacao('Erro ao criar ZIP', 'error');
    }
}

// ============================================
// CRIAR ZIP DE PASTA
// ============================================
async function zipFolder(folderId, folderName) {
    if (!confirm(`Deseja zipar toda a pasta "${folderName}"?`)) return;
    
    try {
        mostrarNotificacao(`Criando ZIP da pasta ${folderName}...`, 'info');
        
        const response = await fetch(`${API_URL}/zip/folder`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken
            },
            body: JSON.stringify({
                folderId: folderId,
                folderName: folderName
            })
        });
        
        if (!response.ok) throw new Error('Erro ao criar ZIP');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${folderName}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        mostrarNotificacao('ZIP da pasta criado com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao criar ZIP:', error);
        mostrarNotificacao('Erro ao criar ZIP da pasta', 'error');
    }
}

// ============================================
// COPIAR LINK DIRETO
// ============================================
function copyDirectLink(link, event) {
    event.stopPropagation();
    
    navigator.clipboard.writeText(link).then(() => {
        mostrarNotificacao('Link copiado!', 'success');
    }).catch(() => {
        mostrarNotificacao('Erro ao copiar link', 'error');
    });
}

// ============================================
// DRAG & DROP MELHORADO
// ============================================
function setupEnhancedDragAndDrop() {
    const items = document.querySelectorAll('.file-item[data-type="file"]');
    
    items.forEach(item => {
        const directLink = item.dataset.directLink;
        
        if (!directLink) return;
        
        item.setAttribute('draggable', 'true');
        
        item.addEventListener('dragstart', (e) => {
            // Configurar dados para drag & drop
            e.dataTransfer.effectAllowed = 'copy';
            
            // Link direto
            e.dataTransfer.setData('text/uri-list', directLink);
            e.dataTransfer.setData('text/plain', directLink);
            
            // Nome do arquivo
            const fileName = item.dataset.fileName;
            e.dataTransfer.setData('DownloadURL', `application/octet-stream:${fileName}:${directLink}`);
            
            item.style.opacity = '0.5';
        });
        
        item.addEventListener('dragend', (e) => {
            item.style.opacity = '1';
        });
    });
}

// ============================================
// ATUALIZAR renderItems PARA INCLUIR NOVOS RECURSOS
// ============================================
function renderItemsEnhanced(items) {
    const container = document.getElementById('fileList');
    
    if (!items || items.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 4rem; color: var(--text-secondary);">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📁</div>
                <p>Nenhum item nesta pasta</p>
            </div>
        `;
        return;
    }
    
    const fragment = document.createDocumentFragment();
    
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.dataset.type = item.type;
        div.dataset.fileName = item.name;
        
        if (item.type === 'file') {
            div.dataset.fileId = item.google_drive_id;
            div.dataset.directLink = item.directDownloadLink || '';
            
            // Checkbox para seleção
            const checkbox = `
                <input type="checkbox" 
                       class="file-checkbox" 
                       onclick="toggleFileSelection('${item.google_drive_id}', event)"
                       style="margin-right: 12px; width: 18px; height: 18px; cursor: pointer;">
            `;
            
            // Botões de ação
            const actions = `
                <div class="file-actions" style="display: flex; gap: 8px;">
                    ${item.directDownloadLink ? `
                        <button onclick="copyDirectLink('${item.directDownloadLink}', event)" 
                                title="Copiar link direto"
                                style="padding: 6px 12px; background: var(--btn-primary); border: none; border-radius: 4px; color: white; cursor: pointer;">
                            🔗 Link
                        </button>
                    ` : ''}
                    <button onclick="downloadFile('${item.path}')" 
                            title="Baixar"
                            style="padding: 6px 12px; background: var(--btn-secondary); border: none; border-radius: 4px; color: white; cursor: pointer;">
                            ⬇️ Baixar
                    </button>
                </div>
            `;
            
            div.innerHTML = `
                ${checkbox}
                <div class="file-icon">${getFileIcon(item.mimetype)}</div>
                <div class="file-info">
                    <div class="file-name">${escapeHtml(item.name)}</div>
                    <div class="file-meta">
                        <span class="file-size">${formatFileSize(item.size)}</span>
                        <span class="file-date">${formatDate(item.updated_at)}</span>
                    </div>
                </div>
                ${actions}
            `;
        } else {
            // Pasta
            div.innerHTML = `
                <div class="file-icon">📁</div>
                <div class="file-info">
                    <div class="file-name">${escapeHtml(item.name)}</div>
                    <div class="file-meta">
                        <span class="file-type">PASTA</span>
                        <span class="file-date">${formatDate(item.updated_at)}</span>
                    </div>
                </div>
                <button onclick="zipFolder('${item.google_drive_id}', '${escapeHtml(item.name)}')" 
                        title="Zipar pasta"
                        style="padding: 6px 12px; background: var(--btn-primary); border: none; border-radius: 4px; color: white; cursor: pointer;">
                    📦 ZIP
                </button>
            `;
            
            div.onclick = () => openFolder(item.path);
        }
        
        fragment.appendChild(div);
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
    
    // Configurar drag & drop melhorado
    setupEnhancedDragAndDrop();
}

// ============================================
// ADICIONAR BOTÕES AO HEADER
// ============================================
function addZipButtonToHeader() {
    const header = document.querySelector('.header-content');
    if (!header) return;
    
    // Botão ZIP (inicialmente oculto)
    const zipBtn = document.createElement('button');
    zipBtn.id = 'zipSelectedBtn';
    zipBtn.className = 'btn-icon';
    zipBtn.style.display = 'none';
    zipBtn.style.position = 'relative';
    zipBtn.innerHTML = `
        📦 Zipar Selecionados
        <span class="badge" style="position: absolute; top: -5px; right: -5px; background: #e74c3c; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 11px;">0</span>
    `;
    zipBtn.onclick = zipSelectedFiles;
    
    header.appendChild(zipBtn);
    
    // Botão Limpar Seleção
    const clearBtn = document.createElement('button');
    clearBtn.id = 'clearSelectionBtn';
    clearBtn.className = 'btn-icon';
    clearBtn.style.display = 'none';
    clearBtn.textContent = '❌ Limpar';
    clearBtn.onclick = clearSelection;
    
    header.appendChild(clearBtn);
}

// ============================================
// INICIALIZAR EXTENSÕES
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    addZipButtonToHeader();
    
    // Substituir renderItems original
    const originalRenderItems = window.renderItems;
    window.renderItems = function(items) {
        renderItemsEnhanced(items);
    };
});

// ============================================
// CSS ADICIONAL PARA SELEÇÃO
// ============================================
const style = document.createElement('style');
style.textContent = `
    .file-item.selected {
        background: rgba(0, 123, 255, 0.1);
        border-left: 3px solid var(--btn-primary);
    }
    
    .file-checkbox {
        accent-color: var(--btn-primary);
    }
    
    .file-actions button:hover {
        opacity: 0.8;
        transform: translateY(-2px);
    }
    
    .badge {
        animation: pulse 1s infinite;
    }
    
    @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
    }
`;
document.head.appendChild(style);

console.log('✅ Extensões de ZIP e Links carregadas!');
