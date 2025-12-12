// script-extensions.js - VERSÃO SIMPLIFICADA
// Adiciona recursos de ZIP e links sem modificar renderItems original

console.log('🔌 Carregando extensões...');

// ============================================
// SELEÇÃO MÚLTIPLA DE ARQUIVOS
// ============================================
let selectedFiles = new Set();

window.toggleFileSelection = function(fileId, event) {
    event.stopPropagation();
    
    if (selectedFiles.has(fileId)) {
        selectedFiles.delete(fileId);
    } else {
        selectedFiles.add(fileId);
    }
    
    updateSelectionUI();
    updateZipButton();
};

function updateSelectionUI() {
    document.querySelectorAll('.file-item').forEach(item => {
        const checkbox = item.querySelector('.file-checkbox');
        if (!checkbox) return;
        
        const fileId = checkbox.dataset.fileId;
        if (selectedFiles.has(fileId)) {
            item.style.background = 'rgba(0, 123, 255, 0.1)';
            item.style.borderLeft = '3px solid var(--btn-primary)';
            checkbox.checked = true;
        } else {
            item.style.background = '';
            item.style.borderLeft = '';
            checkbox.checked = false;
        }
    });
}

function updateZipButton() {
    const zipBtn = document.getElementById('zipSelectedBtn');
    if (!zipBtn) return;
    
    if (selectedFiles.size > 0) {
        zipBtn.style.display = 'flex';
        const badge = zipBtn.querySelector('.badge');
        if (badge) badge.textContent = selectedFiles.size;
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
window.zipSelectedFiles = async function() {
    if (selectedFiles.size === 0) {
        alert('Selecione arquivos para zipar');
        return;
    }
    
    const zipName = prompt('Nome do arquivo ZIP:', 'arquivos.zip');
    if (!zipName) return;
    
    try {
        console.log(`📦 Criando ZIP com ${selectedFiles.size} arquivos...`);
        
        const API_URL = window.location.origin + '/api';
        const sessionToken = sessionStorage.getItem('documentosSession');
        
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
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipName.endsWith('.zip') ? zipName : `${zipName}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        console.log('✅ ZIP criado!');
        clearSelection();
        
    } catch (error) {
        console.error('❌ Erro ao criar ZIP:', error);
        alert('Erro ao criar ZIP: ' + error.message);
    }
};

// ============================================
// CRIAR ZIP DE PASTA
// ============================================
window.zipFolder = async function(folderId, folderName) {
    if (!confirm(`Deseja zipar toda a pasta "${folderName}"?`)) return;
    
    try {
        console.log(`📦 Criando ZIP da pasta ${folderName}...`);
        
        const API_URL = window.location.origin + '/api';
        const sessionToken = sessionStorage.getItem('documentosSession');
        
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
        
        console.log('✅ ZIP da pasta criado!');
        
    } catch (error) {
        console.error('❌ Erro ao criar ZIP:', error);
        alert('Erro ao criar ZIP da pasta: ' + error.message);
    }
};

// ============================================
// COPIAR LINK DIRETO
// ============================================
window.copyDirectLink = function(link, event) {
    event.stopPropagation();
    
    navigator.clipboard.writeText(link).then(() => {
        console.log('✅ Link copiado!');
        
        // Feedback visual
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '✓ Copiado';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    }).catch(() => {
        alert('Erro ao copiar link');
    });
};

// ============================================
// ADICIONAR CHECKBOXES E BOTÕES AOS ARQUIVOS
// ============================================
function addCheckboxesAndButtons() {
    const fileItems = document.querySelectorAll('.file-item[data-type="file"]');
    
    fileItems.forEach(item => {
        // Verificar se já tem checkbox
        if (item.querySelector('.file-checkbox')) return;
        
        const fileId = item.dataset.fileId;
        const directLink = item.dataset.directLink;
        
        if (!fileId) return;
        
        // Criar checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'file-checkbox';
        checkbox.dataset.fileId = fileId;
        checkbox.style.cssText = 'margin-right: 12px; width: 18px; height: 18px; cursor: pointer; accent-color: var(--btn-primary);';
        checkbox.onclick = (e) => {
            e.stopPropagation();
            toggleFileSelection(fileId, e);
        };
        
        // Inserir checkbox no início
        item.insertBefore(checkbox, item.firstChild);
        
        // Adicionar botão de link se tiver directLink
        if (directLink) {
            const linkBtn = document.createElement('button');
            linkBtn.textContent = '🔗 Link';
            linkBtn.title = 'Copiar link direto';
            linkBtn.style.cssText = 'padding: 6px 12px; background: var(--btn-primary); border: none; border-radius: 4px; color: white; cursor: pointer; margin-left: auto;';
            linkBtn.onclick = (e) => copyDirectLink(directLink, e);
            
            item.appendChild(linkBtn);
        }
    });
    
    // Adicionar botão ZIP nas pastas
    const folderItems = document.querySelectorAll('.file-item[data-type="folder"]');
    
    folderItems.forEach(item => {
        if (item.querySelector('.zip-folder-btn')) return;
        
        const folderPath = item.dataset.path || '';
        const folderName = item.dataset.fileName || '';
        
        // Tentar obter folderId do google_drive_id
        const folderId = item.dataset.googleDriveId || '';
        
        if (!folderId) return;
        
        const zipBtn = document.createElement('button');
        zipBtn.className = 'zip-folder-btn';
        zipBtn.textContent = '📦 ZIP';
        zipBtn.title = 'Zipar pasta';
        zipBtn.style.cssText = 'padding: 6px 12px; background: var(--btn-primary); border: none; border-radius: 4px; color: white; cursor: pointer; margin-left: auto;';
        zipBtn.onclick = (e) => {
            e.stopPropagation();
            zipFolder(folderId, folderName);
        };
        
        item.appendChild(zipBtn);
    });
}

// ============================================
// ADICIONAR BOTÕES AO HEADER
// ============================================
function addZipButtonToHeader() {
    const header = document.querySelector('.header-content');
    if (!header || document.getElementById('zipSelectedBtn')) return;
    
    // Botão ZIP (inicialmente oculto)
    const zipBtn = document.createElement('button');
    zipBtn.id = 'zipSelectedBtn';
    zipBtn.className = 'btn-icon';
    zipBtn.style.cssText = 'display: none; position: relative; margin-left: 12px;';
    zipBtn.innerHTML = `
        📦 Zipar <span class="badge" style="position: absolute; top: -5px; right: -5px; background: #e74c3c; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 11px;">0</span>
    `;
    zipBtn.onclick = zipSelectedFiles;
    
    header.appendChild(zipBtn);
    
    // Botão Limpar
    const clearBtn = document.createElement('button');
    clearBtn.id = 'clearSelectionBtn';
    clearBtn.className = 'btn-icon';
    clearBtn.textContent = '✖';
    clearBtn.title = 'Limpar seleção';
    clearBtn.style.cssText = 'display: none; margin-left: 8px;';
    clearBtn.onclick = clearSelection;
    
    header.appendChild(clearBtn);
}

// ============================================
// OBSERVAR MUDANÇAS NO DOM
// ============================================
const observer = new MutationObserver(() => {
    addCheckboxesAndButtons();
});

function startObserving() {
    const fileList = document.getElementById('fileList');
    if (fileList) {
        observer.observe(fileList, { 
            childList: true, 
            subtree: true 
        });
        
        // Aplicar imediatamente
        addCheckboxesAndButtons();
    }
}

// ============================================
// INICIALIZAR
// ============================================
function init() {
    console.log('✅ Extensões de ZIP e Links inicializadas!');
    addZipButtonToHeader();
    startObserving();
    addCheckboxesAndButtons();
}

// Aguardar DOM carregar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    // DOM já carregado
    setTimeout(init, 100);
}

// CSS adicional
const style = document.createElement('style');
style.textContent = `
    .file-checkbox {
        flex-shrink: 0;
    }
    
    .badge {
        animation: pulse 1s infinite;
    }
    
    @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
    }
    
    .file-item button:hover {
        opacity: 0.8;
        transform: translateY(-2px);
        transition: all 0.2s;
    }
`;
document.head.appendChild(style);
