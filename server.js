// server.js - Sistema Híbrido OneDrive + Supabase
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Módulos OneDrive
const OneDriveAuth = require('./onedrive-auth');
const OneDriveClient = require('./onedrive-client');
const SyncManager = require('./sync-manager');

const app = express();
const PORT = process.env.PORT || 3001;

// ==========================================
// CONFIGURAÇÃO
// ==========================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const portalUrl = process.env.PORTAL_URL;

const microsoftClientId = process.env.MICROSOFT_CLIENT_ID;
const microsoftClientSecret = process.env.MICROSOFT_CLIENT_SECRET;
const microsoftRedirectUri = process.env.MICROSOFT_REDIRECT_URI;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERRO: Supabase não configurado');
    process.exit(1);
}

if (!microsoftClientId || !microsoftClientSecret || !microsoftRedirectUri) {
    console.error('❌ ERRO: Microsoft OneDrive não configurado');
    console.error('Configure as variáveis no .env:');
    console.error('  MICROSOFT_CLIENT_ID');
    console.error('  MICROSOFT_CLIENT_SECRET');
    console.error('  MICROSOFT_REDIRECT_URI');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase configurado');

// Inicializar OneDrive
const onedriveAuth = new OneDriveAuth(
    microsoftClientId,
    microsoftClientSecret,
    microsoftRedirectUri,
    supabase
);

let onedriveClient = null;
let syncManager = null;

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Log
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.path}`);
    next();
});

// ==========================================
// AUTENTICAÇÃO PORTAL
// ==========================================
async function verificarAutenticacao(req, res, next) {
    const publicPaths = ['/', '/health', '/app', '/auth/onedrive', '/auth/onedrive/callback', '/auth/onedrive/status'];
    if (publicPaths.includes(req.path)) {
        return next();
    }

    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken || req.query.token;

    if (!sessionToken) {
        return res.status(401).json({
            error: 'Não autenticado',
            message: 'Token de sessão não encontrado'
        });
    }

    try {
        const verifyResponse = await fetch(`${portalUrl}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        if (!verifyResponse.ok) {
            return res.status(401).json({
                error: 'Sessão inválida'
            });
        }

        const sessionData = await verifyResponse.json();
        req.user = sessionData.session;
        next();
    } catch (error) {
        console.error('❌ Erro ao verificar autenticação:', error);
        res.status(500).json({ error: 'Erro interno' });
    }
}

// ==========================================
// ROTAS DE AUTENTICAÇÃO ONEDRIVE
// ==========================================

// Iniciar autenticação OneDrive
app.get('/auth/onedrive', (req, res) => {
    try {
        const authUrl = onedriveAuth.getAuthUrl();
        res.redirect(authUrl);
    } catch (error) {
        console.error('❌ Erro ao gerar URL de autenticação:', error);
        res.status(500).send('Erro ao iniciar autenticação');
    }
});

// Callback da autenticação
app.get('/auth/onedrive/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
        return res.status(400).send('Código de autenticação não recebido');
    }
    
    try {
        console.log('🔐 Autenticando com OneDrive...');
        
        // Trocar código por token
        await onedriveAuth.getTokenFromCode(code);
        
        // Inicializar cliente OneDrive
        onedriveClient = new OneDriveClient(onedriveAuth);
        
        // Inicializar sincronização
        syncManager = new SyncManager(onedriveClient, supabase);
        syncManager.startAutoSync(parseInt(process.env.SYNC_INTERVAL_MS) || 300000);
        
        console.log('✅ Autenticação OneDrive concluída!');
        console.log('✅ Sincronização automática iniciada!');
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Autenticação Concluída</title>
                <style>
                    body {
                        font-family: 'Segoe UI', system-ui, sans-serif;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        margin: 0;
                        background: #000;
                        color: #fff;
                    }
                    .container {
                        text-align: center;
                        padding: 2rem;
                    }
                    h1 {
                        color: #00cc77;
                        margin-bottom: 1rem;
                    }
                    p {
                        color: #A0A0A0;
                        margin-bottom: 2rem;
                    }
                    a {
                        background: #0077c7;
                        color: white;
                        padding: 12px 24px;
                        border-radius: 8px;
                        text-decoration: none;
                        font-weight: 600;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>✅ Autenticação Concluída!</h1>
                    <p>OneDrive conectado com sucesso!<br>Sincronização automática iniciada.</p>
                    <a href="/">Ir para Documentos</a>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('❌ Erro na autenticação:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Erro na Autenticação</title>
                <style>
                    body {
                        font-family: 'Segoe UI', system-ui, sans-serif;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        margin: 0;
                        background: #000;
                        color: #fff;
                    }
                    .container {
                        text-align: center;
                        padding: 2rem;
                    }
                    h1 {
                        color: #e70000;
                        margin-bottom: 1rem;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>❌ Erro na Autenticação</h1>
                    <p>${error.message}</p>
                    <a href="/auth/onedrive">Tentar Novamente</a>
                </div>
            </body>
            </html>
        `);
    }
});

// Status da autenticação OneDrive
app.get('/auth/onedrive/status', async (req, res) => {
    try {
        const isAuth = await onedriveAuth.isAuthenticated();
        const syncStatus = syncManager ? syncManager.getStatus() : null;
        
        res.json({
            authenticated: isAuth,
            sync: syncStatus
        });
    } catch (error) {
        res.json({
            authenticated: false,
            error: error.message
        });
    }
});

// Continuação do arquivo...
// (Este arquivo será continuado na Parte 2)

// ==========================================
// HEALTH CHECK
// ==========================================
app.get('/health', async (req, res) => {
    try {
        const onedriveAuth = await onedriveAuth.isAuthenticated();
        const syncStatus = syncManager ? syncManager.getStatus() : null;
        
        res.json({
            status: 'healthy',
            onedrive: onedriveAuth ? 'connected' : 'disconnected',
            supabase: 'connected',
            sync: syncStatus
        });
    } catch (error) {
        res.json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

// ==========================================
// API - COM AUTENTICAÇÃO
// ==========================================
app.use('/api', verificarAutenticacao);

// Listar conteúdo de uma pasta
app.get('/api/folders', async (req, res) => {
    try {
        const folderPath = req.query.path || 'Documentos/';
        console.log('📂 Listando:', folderPath);
        
        // Buscar do Supabase (sincronizado com OneDrive)
        const { data, error } = await supabase
            .from('documents')
            .select('*')
            .eq('folder_path', folderPath)
            .order('is_folder', { ascending: false })
            .order('name');
        
        if (error) throw error;
        
        const folders = data.filter(item => item.is_folder).map(item => ({
            name: item.name,
            type: 'folder',
            path: item.folder_path + item.name + '/',
            created_at: item.onedrive_created_at,
            updated_at: item.onedrive_modified_at
        }));
        
        const files = data.filter(item => !item.is_folder).map(item => ({
            name: item.name,
            type: 'file',
            path: item.folder_path + item.name,
            size: item.size,
            mimetype: item.mimetype,
            created_at: item.onedrive_created_at,
            updated_at: item.onedrive_modified_at,
            onedrive_id: item.onedrive_id
        }));
        
        res.json({
            currentPath: folderPath,
            folders,
            files,
            total: data.length
        });
    } catch (error) {
        console.error('❌ Erro ao listar pasta:', error);
        res.status(500).json({ error: 'Erro ao listar pasta' });
    }
});

// Busca global
app.get('/api/search', async (req, res) => {
    try {
        const searchTerm = req.query.q?.toLowerCase() || '';
        
        if (searchTerm.length < 2) {
            return res.json({ results: [] });
        }
        
        const { data, error } = await supabase
            .from('documents')
            .select('*')
            .ilike('name', `%${searchTerm}%`)
            .order('is_folder', { ascending: false })
            .order('name')
            .limit(50);
        
        if (error) throw error;
        
        const results = data.map(item => ({
            name: item.name,
            type: item.is_folder ? 'folder' : 'file',
            path: item.folder_path + item.name + (item.is_folder ? '/' : ''),
            folder: item.folder_path,
            size: item.size,
            mimetype: item.mimetype,
            created_at: item.onedrive_created_at,
            updated_at: item.onedrive_modified_at
        }));
        
        res.json({ results });
    } catch (error) {
        console.error('❌ Erro na busca:', error);
        res.status(500).json({ error: 'Erro ao buscar' });
    }
});

// Criar pasta
app.post('/api/folders', async (req, res) => {
    try {
        const { path: parentPath, name } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Nome obrigatório' });
        }
        
        const folderPath = (parentPath || 'Documentos/').replace('Documentos/', '') + '/' + name;
        
        // Criar no OneDrive
        const onedriveFolder = await onedriveClient.createFolder(folderPath);
        
        // Adicionar ao Supabase
        await supabase.from('documents').insert({
            name: name,
            folder_path: parentPath || 'Documentos/',
            onedrive_id: onedriveFolder.id,
            onedrive_path: folderPath,
            parent_id: onedriveFolder.parentReference?.id,
            is_folder: true,
            onedrive_created_at: onedriveFolder.createdDateTime,
            onedrive_modified_at: onedriveFolder.lastModifiedDateTime
        });
        
        res.status(201).json({ message: 'Pasta criada', name });
    } catch (error) {
        console.error('❌ Erro ao criar pasta:', error);
        if (error.message?.includes('already exists') || error.statusCode === 409) {
            return res.status(409).json({ error: 'Pasta já existe' });
        }
        res.status(500).json({ error: 'Erro ao criar pasta' });
    }
});

// Upload de arquivo
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Arquivo não enviado' });
        }
        
        const folderPath = (req.body.path || 'Documentos/').replace('Documentos/', '');
        
        // Upload no OneDrive
        const onedriveFile = await onedriveClient.uploadFile(
            folderPath,
            req.file.originalname,
            req.file.buffer
        );
        
        // Criar links
        const shareLink = await onedriveClient.createShareLink(onedriveFile.id);
        const downloadLink = await onedriveClient.getDownloadUrl(onedriveFile.id);
        
        // Adicionar ao Supabase
        await supabase.from('documents').insert({
            name: req.file.originalname,
            folder_path: req.body.path || 'Documentos/',
            onedrive_id: onedriveFile.id,
            onedrive_path: folderPath + '/' + req.file.originalname,
            parent_id: onedriveFile.parentReference?.id,
            share_link: shareLink,
            download_link: downloadLink,
            size: req.file.size,
            mimetype: req.file.mimetype,
            is_folder: false,
            onedrive_created_at: onedriveFile.createdDateTime,
            onedrive_modified_at: onedriveFile.lastModifiedDateTime
        });
        
        res.status(201).json({ message: 'Arquivo enviado', file: { name: req.file.originalname } });
    } catch (error) {
        console.error('❌ Erro no upload:', error);
        if (error.message?.includes('already exists') || error.statusCode === 409) {
            return res.status(409).json({ error: 'Arquivo já existe' });
        }
        res.status(500).json({ error: 'Erro ao enviar arquivo' });
    }
});

// Download de arquivo
app.get('/api/download', async (req, res) => {
    try {
        const filePath = req.query.path;
        
        if (!filePath) {
            return res.status(400).json({ error: 'Caminho não fornecido' });
        }
        
        // Buscar info do arquivo no Supabase
        const { data: fileInfo, error } = await supabase
            .from('documents')
            .select('*')
            .eq('folder_path', filePath.substring(0, filePath.lastIndexOf('/') + 1))
            .eq('name', filePath.substring(filePath.lastIndexOf('/') + 1))
            .single();
        
        if (error || !fileInfo) {
            return res.status(404).json({ error: 'Arquivo não encontrado' });
        }
        
        // Obter stream do OneDrive
        const stream = await onedriveClient.downloadFile(fileInfo.onedrive_id);
        
        // Configurar headers
        const fileName = fileInfo.name;
        const ext = fileName.split('.').pop().toLowerCase();
        const inline = ['pdf', 'xml', 'txt', 'jpg', 'jpeg', 'png'].includes(ext);
        
        res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${fileName}"`);
        res.setHeader('Content-Type', fileInfo.mimetype || 'application/octet-stream');
        
        stream.pipe(res);
    } catch (error) {
        console.error('❌ Erro no download:', error);
        res.status(500).json({ error: 'Erro ao baixar arquivo' });
    }
});

// Deletar
app.delete('/api/delete', async (req, res) => {
    try {
        const { path: itemPath, type } = req.query;
        
        // Buscar no Supabase
        const { data: item, error: findError } = await supabase
            .from('documents')
            .select('*')
            .eq('folder_path', itemPath.substring(0, itemPath.lastIndexOf('/') + 1))
            .eq('name', itemPath.substring(itemPath.lastIndexOf('/') + 1).replace('/', ''))
            .single();
        
        if (findError || !item) {
            return res.status(404).json({ error: 'Item não encontrado' });
        }
        
        // Deletar do OneDrive
        await onedriveClient.deleteItem(item.onedrive_id);
        
        // Deletar do Supabase
        await supabase
            .from('documents')
            .delete()
            .eq('onedrive_id', item.onedrive_id);
        
        res.json({ message: 'Item deletado' });
    } catch (error) {
        console.error('❌ Erro ao deletar:', error);
        res.status(500).json({ error: 'Erro ao deletar' });
    }
});

// Renomear
app.put('/api/rename', async (req, res) => {
    try {
        const { oldPath, newName, type } = req.body;
        
        // Buscar no Supabase
        const { data: item, error: findError } = await supabase
            .from('documents')
            .select('*')
            .eq('folder_path', oldPath.substring(0, oldPath.lastIndexOf('/') + 1))
            .eq('name', oldPath.substring(oldPath.lastIndexOf('/') + 1).replace('/', ''))
            .single();
        
        if (findError || !item) {
            return res.status(404).json({ error: 'Item não encontrado' });
        }
        
        // Renomear no OneDrive
        await onedriveClient.renameItem(item.onedrive_id, newName);
        
        // Atualizar no Supabase
        await supabase
            .from('documents')
            .update({ name: newName })
            .eq('onedrive_id', item.onedrive_id);
        
        res.json({ message: 'Item renomeado' });
    } catch (error) {
        console.error('❌ Erro ao renomear:', error);
        res.status(500).json({ error: 'Erro ao renomear' });
    }
});

// Sincronizar manualmente
app.post('/api/sync', async (req, res) => {
    try {
        if (!syncManager) {
            return res.status(503).json({ error: 'Sincronização não disponível' });
        }
        
        const result = await syncManager.syncNow();
        res.json({ message: 'Sincronização concluída', result });
    } catch (error) {
        console.error('❌ Erro na sincronização:', error);
        res.status(500).json({ error: 'Erro na sincronização' });
    }
});

// ==========================================
// ROTAS PRINCIPAIS
// ==========================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================
app.listen(PORT, '0.0.0.0', async () => {
    console.log('\n🚀 ================================');
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`💾 Storage: OneDrive + Supabase`);
    console.log(`🔗 Supabase: ${supabaseUrl}`);
    console.log(`🔐 Portal: ${portalUrl}`);
    
    // Tentar restaurar autenticação OneDrive
    try {
        const isAuth = await onedriveAuth.isAuthenticated();
        if (isAuth) {
            console.log('✅ OneDrive: Autenticado');
            onedriveClient = new OneDriveClient(onedriveAuth);
            syncManager = new SyncManager(onedriveClient, supabase);
            syncManager.startAutoSync(parseInt(process.env.SYNC_INTERVAL_MS) || 300000);
            console.log('✅ Sincronização automática iniciada');
        } else {
            console.log('⚠️  OneDrive: NÃO autenticado');
            console.log(`🔗 Autentique em: http://localhost:${PORT}/auth/onedrive`);
        }
    } catch (error) {
        console.log('⚠️  OneDrive: Erro ao verificar autenticação');
        console.log(`🔗 Autentique em: http://localhost:${PORT}/auth/onedrive`);
    }
    
    console.log('🚀 ================================\n');
});
