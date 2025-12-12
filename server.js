// server.js - Sistema Híbrido Google Drive + Supabase OTIMIZADO
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Módulos Google Drive
const GoogleAuth = require('./google-auth');
const GoogleDriveClient = require('./google-drive-client');
const SyncManager = require('./sync-manager');
const RealtimeSync = require('./realtime-sync');
const DownloadOptimizer = require('./download-optimizer');
const ZipManager = require('./zip-manager');

const app = express();
const PORT = process.env.PORT || 3001;

// ==========================================
// CONFIGURAÇÃO
// ==========================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const portalUrl = process.env.PORTAL_URL;

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERRO: Supabase não configurado');
    process.exit(1);
}

if (!googleClientId || !googleClientSecret || !googleRedirectUri) {
    console.error('❌ ERRO: Google Drive não configurado');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase configurado');

// Inicializar módulos
const googleAuth = new GoogleAuth(googleClientId, googleClientSecret, googleRedirectUri, supabase);

let driveClient = null;
let syncManager = null;
let realtimeSync = null;
let downloadOptimizer = new DownloadOptimizer();
let zipManager = null;

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
});

app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.path}`);
    next();
});

// ==========================================
// AUTENTICAÇÃO PORTAL
// ==========================================
async function verificarAutenticacao(req, res, next) {
    const publicPaths = ['/', '/health', '/app', '/auth/google', '/auth/google/callback', '/auth/google/status', '/webhook/drive'];
    if (publicPaths.includes(req.path)) {
        return next();
    }

    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken || req.query.token;

    if (!sessionToken) {
        return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
        const verifyResponse = await fetch(`${portalUrl}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        if (!verifyResponse.ok) {
            return res.status(401).json({ error: 'Sessão inválida' });
        }

        const sessionData = await verifyResponse.json();
        req.user = sessionData.session;
        next();
    } catch (error) {
        console.error('❌ Erro ao verificar autenticação:', error);
        res.status(500).json({ error: 'Erro interno' });
    }
}

function verificarGoogleDrive(req, res, next) {
    if (!driveClient) {
        return res.status(503).json({ 
            error: 'Google Drive não conectado',
            message: 'Faça login no Google Drive primeiro',
            redirectTo: '/auth/google'
        });
    }
    next();
}

// ==========================================
// ROTAS PÚBLICAS (ANTES DO MIDDLEWARE)
// ==========================================

// HEALTH CHECK
app.get('/health', async (req, res) => {
    try {
        const isGoogleAuth = await googleAuth.isAuthenticated();
        const syncStatus = syncManager ? syncManager.getStatus() : null;
        
        res.json({
            status: 'healthy',
            google_drive: isGoogleAuth ? 'connected' : 'disconnected',
            supabase: 'connected',
            sync: syncStatus,
            realtime: realtimeSync ? 'enabled' : 'disabled'
        });
    } catch (error) {
        res.json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

// WEBHOOK GOOGLE DRIVE (Sync em Tempo Real)
app.post('/webhook/drive', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        if (realtimeSync) {
            await realtimeSync.handleNotification(req.headers);
        }
        res.status(200).send('OK');
    } catch (error) {
        console.error('❌ Erro no webhook:', error);
        res.status(200).send('OK');
    }
});

// ROTAS DE AUTENTICAÇÃO GOOGLE
app.get('/auth/google', (req, res) => {
    try {
        const authUrl = googleAuth.getAuthUrl();
        res.redirect(authUrl);
    } catch (error) {
        console.error('❌ Erro ao gerar URL:', error);
        res.status(500).send('Erro ao iniciar autenticação');
    }
});

app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
        return res.status(400).send('Código não recebido');
    }
    
    try {
        console.log('🔐 Autenticando com Google Drive...');
        
        await googleAuth.getTokenFromCode(code);
        
        driveClient = new GoogleDriveClient(
            googleAuth.getClient(),
            process.env.GOOGLE_DRIVE_FOLDER_NAME || 'Documentos'
        );
        
        await driveClient.initRootFolder();
        
        syncManager = new SyncManager(driveClient, supabase);
        syncManager.startAutoSync(parseInt(process.env.SYNC_INTERVAL_MS) || 300000);
        
        zipManager = new ZipManager(driveClient);
        
        const webhookUrl = process.env.WEBHOOK_URL || `${googleRedirectUri.split('/auth')[0]}/webhook/drive`;
        realtimeSync = new RealtimeSync(driveClient, supabase, syncManager);
        await realtimeSync.setupPushNotifications(webhookUrl);
        
        console.log('✅ Autenticação concluída!');
        console.log('✅ Sincronização em tempo real ativada!');
        
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
                    .feature {
                        color: #00cc77;
                        margin: 0.5rem 0;
                    }
                    a {
                        background: #0077c7;
                        color: white;
                        padding: 12px 24px;
                        border-radius: 8px;
                        text-decoration: none;
                        font-weight: 600;
                        display: inline-block;
                        margin-top: 1rem;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>✅ Autenticação Concluída!</h1>
                    <p>Google Drive conectado com sucesso!</p>
                    <div class="feature">⚡ Sincronização em tempo real ativada</div>
                    <div class="feature">🚀 Downloads otimizados</div>
                    <div class="feature">📦 ZIP de arquivos disponível</div>
                    <a href="/">Ir para Documentos</a>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('❌ Erro na autenticação:', error);
        res.status(500).send('Erro na autenticação: ' + error.message);
    }
});

app.get('/auth/google/status', async (req, res) => {
    try {
        const isAuth = await googleAuth.isAuthenticated();
        const syncStatus = syncManager ? syncManager.getStatus() : null;
        const realtimeStatus = realtimeSync ? {
            enabled: true,
            channelId: realtimeSync.channelId,
            expiration: realtimeSync.expiration
        } : { enabled: false };
        
        res.json({
            authenticated: isAuth,
            sync: syncStatus,
            realtime: realtimeStatus
        });
    } catch (error) {
        res.json({
            authenticated: false,
            error: error.message
        });
    }
});

// ==========================================
// MIDDLEWARE DE AUTENTICAÇÃO (APLICAR AQUI)
// ==========================================
app.use('/api', verificarAutenticacao);

// ==========================================
// ROTAS DA API
// ==========================================

// Listar pasta (GET) - SEM verificarGoogleDrive
app.get('/api/folders', async (req, res) => {
    try {
        const folderPath = req.query.path || 'Documentos/';
        console.log('📂 Listando:', folderPath);
        
        const { data, error } = await supabase
            .from('documents')
            .select('*')
            .eq('folder_path', folderPath)
            .order('is_folder', { ascending: false })
            .order('name');
        
        if (error) throw error;
        
        const optimizedData = downloadOptimizer ? 
            downloadOptimizer.generateOptimizedLinks(data) : data;
        
        const folders = optimizedData.filter(item => item.is_folder).map(item => ({
            name: item.name,
            type: 'folder',
            path: item.folder_path + item.name + '/',
            created_at: item.google_created_at,
            updated_at: item.google_modified_at
        }));
        
        const files = optimizedData.filter(item => !item.is_folder).map(item => ({
            name: item.name,
            type: 'file',
            path: item.folder_path + item.name,
            size: item.size,
            mimetype: item.mimetype,
            created_at: item.google_created_at,
            updated_at: item.google_modified_at,
            google_drive_id: item.google_drive_id,
            directDownloadLink: item.directDownloadLink,
            previewLink: item.previewLink,
            thumbnailLink: item.thumbnailLink
        }));
        
        res.json({
            currentPath: folderPath,
            folders,
            files,
            total: data.length
        });
    } catch (error) {
        console.error('❌ Erro ao listar:', error);
        res.status(500).json({ error: 'Erro ao listar pasta', message: error.message });
    }
});

// Busca
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
        
        const optimizedData = downloadOptimizer ? 
            downloadOptimizer.generateOptimizedLinks(data) : data;
        
        const results = optimizedData.map(item => ({
            name: item.name,
            type: item.is_folder ? 'folder' : 'file',
            path: item.folder_path + item.name + (item.is_folder ? '/' : ''),
            folder: item.folder_path,
            size: item.size,
            mimetype: item.mimetype,
            created_at: item.google_created_at,
            updated_at: item.google_modified_at,
            google_drive_id: item.google_drive_id,
            directDownloadLink: item.directDownloadLink,
            previewLink: item.previewLink
        }));
        
        res.json({ results });
    } catch (error) {
        console.error('❌ Erro na busca:', error);
        res.status(500).json({ error: 'Erro ao buscar' });
    }
});

// Criar pasta (POST) - COM verificarGoogleDrive
app.post('/api/folders', verificarGoogleDrive, async (req, res) => {
    try {
        const { path: parentPath, name } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Nome obrigatório' });
        }
        
        const folder = await driveClient.createFolder(parentPath || 'Documentos/', name);
        
        await supabase.from('documents').insert({
            name: name,
            folder_path: parentPath || 'Documentos/',
            google_drive_id: folder.id,
            parent_id: folder.parents ? folder.parents[0] : null,
            web_view_link: folder.webViewLink,
            is_folder: true,
            google_created_at: folder.createdTime,
            google_modified_at: folder.modifiedTime
        });
        
        res.status(201).json({ message: 'Pasta criada', name });
    } catch (error) {
        console.error('❌ Erro ao criar pasta:', error);
        res.status(500).json({ error: 'Erro ao criar pasta', message: error.message });
    }
});

// Upload (POST) - COM verificarGoogleDrive
app.post('/api/upload', verificarGoogleDrive, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Arquivo não enviado' });
        }
        
        const folderPath = req.body.path || 'Documentos/';
        
        const file = await driveClient.uploadFile(
            folderPath,
            req.file.originalname,
            req.file.buffer,
            req.file.mimetype
        );
        
        await supabase.from('documents').insert({
            name: req.file.originalname,
            folder_path: folderPath,
            google_drive_id: file.id,
            parent_id: file.parents ? file.parents[0] : null,
            web_view_link: file.webViewLink,
            web_content_link: file.webContentLink,
            thumbnail_link: file.thumbnailLink,
            size: req.file.size,
            mimetype: req.file.mimetype,
            is_folder: false,
            google_created_at: file.createdTime,
            google_modified_at: file.modifiedTime
        });
        
        res.status(201).json({ message: 'Arquivo enviado' });
    } catch (error) {
        console.error('❌ Erro no upload:', error);
        res.status(500).json({ error: 'Erro ao enviar arquivo' });
    }
});

// Download - SEM verificarGoogleDrive
app.get('/api/download', async (req, res) => {
    try {
        const filePath = req.query.path;
        
        if (!filePath) {
            return res.status(400).json({ error: 'Caminho não fornecido' });
        }
        
        const { data: fileInfo, error } = await supabase
            .from('documents')
            .select('*')
            .eq('folder_path', filePath.substring(0, filePath.lastIndexOf('/') + 1))
            .eq('name', filePath.substring(filePath.lastIndexOf('/') + 1))
            .single();
        
        if (error || !fileInfo) {
            return res.status(404).json({ error: 'Arquivo não encontrado' });
        }
        
        if (downloadOptimizer) {
            const directLink = downloadOptimizer.getDirectDownloadLink(fileInfo.google_drive_id);
            return res.redirect(directLink);
        }
        
        if (fileInfo.web_content_link) {
            return res.redirect(fileInfo.web_content_link);
        }
        
        return res.status(404).json({ error: 'Link de download não disponível' });
        
    } catch (error) {
        console.error('❌ Erro no download:', error);
        res.status(500).json({ error: 'Erro ao baixar arquivo' });
    }
});

// Deletar - COM verificarGoogleDrive
app.delete('/api/delete', verificarGoogleDrive, async (req, res) => {
    try {
        const { path: itemPath, type } = req.query;
        
        const { data: item, error: findError } = await supabase
            .from('documents')
            .select('*')
            .eq('folder_path', itemPath.substring(0, itemPath.lastIndexOf('/') + 1))
            .eq('name', itemPath.substring(itemPath.lastIndexOf('/') + 1).replace('/', ''))
            .single();
        
        if (findError || !item) {
            return res.status(404).json({ error: 'Item não encontrado' });
        }
        
        await driveClient.deleteItem(item.google_drive_id);
        
        await supabase
            .from('documents')
            .delete()
            .eq('google_drive_id', item.google_drive_id);
        
        res.json({ message: 'Item deletado' });
    } catch (error) {
        console.error('❌ Erro ao deletar:', error);
        res.status(500).json({ error: 'Erro ao deletar' });
    }
});

// Renomear - COM verificarGoogleDrive
app.put('/api/rename', verificarGoogleDrive, async (req, res) => {
    try {
        const { oldPath, newName, type } = req.body;
        
        const { data: item, error: findError } = await supabase
            .from('documents')
            .select('*')
            .eq('folder_path', oldPath.substring(0, oldPath.lastIndexOf('/') + 1))
            .eq('name', oldPath.substring(oldPath.lastIndexOf('/') + 1).replace('/', ''))
            .single();
        
        if (findError || !item) {
            return res.status(404).json({ error: 'Item não encontrado' });
        }
        
        await driveClient.renameItem(item.google_drive_id, newName);
        
        await supabase
            .from('documents')
            .update({ name: newName })
            .eq('google_drive_id', item.google_drive_id);
        
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

// ZIP de múltiplos arquivos - COM verificarGoogleDrive
app.post('/api/zip/files', verificarGoogleDrive, express.json(), async (req, res) => {
    try {
        const { fileIds, zipName } = req.body;
        
        if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
            return res.status(400).json({ error: 'IDs de arquivos não fornecidos' });
        }
        
        console.log(`📦 Criando ZIP com ${fileIds.length} arquivos...`);
        
        const zipBuffer = await zipManager.createZip(fileIds, zipName || 'arquivos.zip');
        
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipName || 'arquivos.zip'}"`);
        res.send(zipBuffer);
        
    } catch (error) {
        console.error('❌ Erro ao criar ZIP:', error);
        res.status(500).json({ error: 'Erro ao criar ZIP' });
    }
});

// ZIP de pasta - COM verificarGoogleDrive
app.post('/api/zip/folder', verificarGoogleDrive, express.json(), async (req, res) => {
    try {
        const { folderId, folderName } = req.body;
        
        if (!folderId) {
            return res.status(400).json({ error: 'ID da pasta não fornecido' });
        }
        
        console.log(`📦 Criando ZIP da pasta ${folderName}...`);
        
        const zipBuffer = await zipManager.createFolderZip(folderId, folderName);
        
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${folderName || 'pasta'}.zip"`);
        res.send(zipBuffer);
        
    } catch (error) {
        console.error('❌ Erro ao criar ZIP:', error);
        res.status(500).json({ error: 'Erro ao criar ZIP da pasta' });
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
    console.log(`🚀 Servidor OTIMIZADO na porta ${PORT}`);
    console.log(`💾 Storage: Google Drive + Supabase`);
    console.log(`⚡ Sincronização em tempo real`);
    console.log(`🚀 Downloads otimizados`);
    console.log(`📦 ZIP de arquivos disponível`);
    console.log(`🔗 Supabase: ${supabaseUrl}`);
    console.log(`🔐 Portal: ${portalUrl}`);
    
    try {
        const isAuth = await googleAuth.isAuthenticated();
        if (isAuth) {
            console.log('✅ Google Drive: Autenticado');
            driveClient = new GoogleDriveClient(
                googleAuth.getClient(),
                process.env.GOOGLE_DRIVE_FOLDER_NAME || 'Documentos'
            );
            await driveClient.initRootFolder();
            
            syncManager = new SyncManager(driveClient, supabase);
            syncManager.startAutoSync(parseInt(process.env.SYNC_INTERVAL_MS) || 300000);
            
            zipManager = new ZipManager(driveClient);
            
            const webhookUrl = process.env.WEBHOOK_URL || `${googleRedirectUri.split('/auth')[0]}/webhook/drive`;
            realtimeSync = new RealtimeSync(driveClient, supabase, syncManager);
            await realtimeSync.setupPushNotifications(webhookUrl);
            
            console.log('✅ Sincronização automática iniciada');
            console.log('✅ Sincronização em tempo real ativada');
        } else {
            console.log('⚠️  Google Drive: NÃO autenticado');
            console.log(`🔗 Autentique em: http://localhost:${PORT}/auth/google`);
        }
    } catch (error) {
        console.log('⚠️  Google Drive: Erro ao verificar autenticação');
        console.log(`🔗 Autentique em: http://localhost:${PORT}/auth/google`);
    }
    
    console.log('🚀 ================================\n');
});
